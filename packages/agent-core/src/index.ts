import { createHash } from "node:crypto";
import { basename } from "node:path";
import { LocalMemoryStore, memoryContextForPrompt } from "@ccli/memory";
import { forcingQuestions, specialistPrompt, sprintPlanLabels } from "@ccli/methodology";
import { ProductRenderer, type ProductEvent } from "@ccli/product-ui";
import { collectText, type CcliConfig, type ModelProvider, type ProviderRegistry } from "@ccli/providers";
import { ReviewerAgent, type ReviewResult } from "@ccli/review";
import { AuditSession, updateState } from "@ccli/session";
import { FileTool, GitHubTool, GitTool, ProjectTool } from "@ccli/tools";

export interface ProductPlan {
  goal: string;
  outcome: string;
  steps: string[];
  acceptanceCriteria: string[];
}

export interface BuildResult {
  summary: string;
  changedFiles: string[];
  usedModel: boolean;
}

export interface WorkflowOptions {
  cwd: string;
  requirement: string;
  expert?: boolean;
  yes?: boolean;
  withPr?: boolean;
  config?: CcliConfig;
  registry?: ProviderRegistry;
  onEvent?: (event: ProductEvent, rendered: string) => void | Promise<void>;
}

export interface WorkflowResult {
  branch?: string;
  summary: string;
  build: BuildResult;
  review: ReviewResult;
  prUrl?: string;
}

interface RoleSelection {
  provider: ModelProvider;
  model: string;
}

export class PlannerAgent {
  async plan(requirement: string, selection?: RoleSelection, memoryContext = "没有找到相关历史记忆。"): Promise<ProductPlan> {
    if (selection) {
      const parsed = await collectText(selection.provider, {
        model: selection.model,
        temperature: 0.2,
        maxTokens: 1200,
        messages: [
          {
            role: "system",
            content:
              `你是中文产品规划代理。只输出 JSON，不要使用 Markdown。字段：goal,outcome,steps,acceptanceCriteria。面向普通用户，不写代码和技术术语。\n${specialistPrompt()}`
          },
          { role: "user", content: JSON.stringify({ requirement, memoryContext, forcingQuestions: forcingQuestions(requirement) }) }
        ]
      })
        .then((text) => parseJsonObject<Partial<ProductPlan>>(text))
        .catch(() => undefined);

      if (parsed?.goal && parsed?.outcome) {
        return normalizePlan(requirement, parsed);
      }
    }

    return {
      goal: requirement,
      outcome: "把用户描述的目标转成可交付的产品改进。",
      steps: sprintPlanLabels(),
      acceptanceCriteria: ["用户目标被清晰记录", "改动可以被保存和审查", "风险会用中文说明"]
    };
  }
}

export class BuilderAgent {
  private readonly fileTool = new FileTool();

  async build(input: {
    cwd: string;
    requirement: string;
    plan: ProductPlan;
    audit: AuditSession;
    confirmed?: boolean;
    selection?: RoleSelection;
  }): Promise<BuildResult> {
    if (input.selection) {
      const modelResult = await this.buildWithModel({ ...input, selection: input.selection }).catch(async (error: unknown) => {
        await input.audit.record("builder.model.error", "开发模型没有返回可安全应用的结果", serializeError(error));
        return undefined;
      });
      if (modelResult) {
        return modelResult;
      }
    }

    const fileName = "PRODUCT_REQUEST.md";
    const content = [
      "# 产品需求记录",
      "",
      `项目：${basename(input.cwd)}`,
      `目标：${input.requirement}`,
      "",
      "计划：",
      ...input.plan.steps.map((step, index) => `${index + 1}. ${step}`),
      "",
      "说明：当前还没有可用的开发模型配置，因此 ccli 先保存了需求草稿。配置模型后可以继续自动开发。"
    ].join("\n");

    await this.fileTool.write(fileName, `${content}\n`, { cwd: input.cwd, audit: input.audit, confirmed: true });
    return {
      summary: "还没有配置可用开发模型，已先保存产品需求草稿，方便后续继续推进。",
      changedFiles: [fileName],
      usedModel: false
    };
  }

  private async buildWithModel(input: {
    cwd: string;
    requirement: string;
    plan: ProductPlan;
    audit: AuditSession;
    confirmed?: boolean;
    selection: RoleSelection;
  }): Promise<BuildResult | undefined> {
    const projectFiles = (await this.fileTool.list({ cwd: input.cwd, audit: input.audit })).slice(0, 80);
    const packageJson = await this.fileTool.read("package.json", { cwd: input.cwd, audit: input.audit }).catch(() => "");
    const appTsx = await this.fileTool.read("src/App.tsx", { cwd: input.cwd, audit: input.audit }).catch(() => "");
    const designContract = await this.fileTool.read("DESIGN.md", { cwd: input.cwd, audit: input.audit }).catch(() => "");
    const officeHours = await this.fileTool
      .read(".ccli/skills/office-hours.md", { cwd: input.cwd, audit: input.audit })
      .catch(() => "");
    const frontendDesign = await this.fileTool
      .read(".ccli/skills/frontend-design.md", { cwd: input.cwd, audit: input.audit })
      .catch(() => "");

    const text = await collectText(input.selection.provider, {
      model: input.selection.model,
      temperature: 0.1,
      maxTokens: 8000,
      messages: [
        {
          role: "system",
          content:
            "你是开发代理。只输出 JSON，不要 Markdown。JSON 字段：summary 字符串，changes 数组。每个 change 包含 path、action、content。action 只能是 write。只做必要改动，不要删除文件，不要写密钥，不要展示解释。"
        },
        {
          role: "user",
          content: JSON.stringify({
            requirement: input.requirement,
            plan: input.plan,
            designContract,
            officeHours,
            frontendDesign,
            projectFiles,
            packageJson,
            appTsx
          })
        }
      ]
    });

    const parsed = parseJsonObject<{
      summary?: string;
      changes?: Array<{ path?: string; action?: "write"; content?: string }>;
    }>(text);

    if (!parsed?.changes?.length) {
      return undefined;
    }

    const changedFiles: string[] = [];
    for (const change of parsed.changes) {
      if (change.action !== "write" || !change.path || typeof change.content !== "string") {
        continue;
      }
      await this.fileTool.write(change.path, change.content, {
        cwd: input.cwd,
        audit: input.audit,
        confirmed: input.confirmed
      });
      changedFiles.push(change.path);
    }

    if (!changedFiles.length) {
      return undefined;
    }

    await input.audit.record("builder.model.apply", "开发模型变更已应用", {
      summary: parsed.summary,
      changedFiles
    });

    return {
      summary: parsed.summary ?? "开发模型已完成必要改动。",
      changedFiles,
      usedModel: true
    };
  }
}

export class TaskOrchestrator {
  private readonly planner = new PlannerAgent();
  private readonly builder = new BuilderAgent();
  private readonly reviewer = new ReviewerAgent();
  private readonly git = new GitTool();
  private readonly github = new GitHubTool();
  private readonly project = new ProjectTool();

  async run(options: WorkflowOptions): Promise<WorkflowResult> {
    const renderer = new ProductRenderer({ expert: options.expert });
    const audit = await AuditSession.create({ cwd: options.cwd, task: options.requirement });
    const memory = new LocalMemoryStore(options.cwd);
    const emit = async (event: ProductEvent) => {
      await audit.recordEvent(event);
      await options.onEvent?.(event, renderer.render(event));
    };

    await updateState(options.cwd, {
      currentTask: options.requirement,
      status: "running",
      summary: "正在处理你的需求。",
      auditFile: audit.auditFile,
      steps: []
    });

    try {
      await emit({ type: "inspect", message: "正在了解当前项目。" });
      await this.git.init({ cwd: options.cwd, audit, confirmed: true });
      const branch = await this.git.createTaskBranch(slugFor(options.requirement), {
        cwd: options.cwd,
        audit,
        confirmed: true
      });

      await emit({ type: "plan", message: "正在整理实现方案。" });
      const memoryHits = await memory.search(options.requirement, { limit: 5 });
      await audit.record("memory.search", "已检索本地项目记忆", {
        hits: memoryHits.map((hit) => ({
          wing: hit.entry.wing,
          room: hit.entry.room,
          drawer: hit.entry.drawer,
          score: hit.score
        }))
      });
      const plan = await this.planner.plan(
        options.requirement,
        roleSelection("planner", options),
        memoryContextForPrompt(memoryHits)
      );
      await audit.record("planner.result", "实现方案已生成", plan);

      await emit({ type: "edit", message: "正在实现功能。" });
      const build = await this.builder.build({
        cwd: options.cwd,
        requirement: options.requirement,
        plan,
        audit,
        confirmed: options.yes,
        selection: roleSelection("builder", options)
      });

      await emit({ type: "validate", message: "正在验证是否正常。" });
      await this.project.runValidation({ cwd: options.cwd, audit, confirmed: true }).catch(async (error: unknown) => {
        await audit.record("workflow.validation.error", "自动验证没有全部完成", serializeError(error));
      });

      await emit({ type: "review", message: "正在进行独立审查。" });
      const review = await this.reviewer.review({
        cwd: options.cwd,
        requirement: options.requirement,
        audit,
        reviewer: roleSelection("reviewer", options)
      });

      await emit({ type: "save", message: "正在保存本次成果。" });
      const committed = await this.git.commitAll(commitMessage(options.requirement), {
        cwd: options.cwd,
        audit,
        confirmed: true
      });

      let prUrl: string | undefined;
      if (options.withPr) {
        if (!options.yes) {
          await emit({
            type: "risk",
            message: "创建团队审查入口前需要确认。请重新执行时加入确认参数，或单独运行交付命令。",
            severity: "warning"
          });
        } else {
          await this.git.pushCurrent({ cwd: options.cwd, audit, confirmed: true });
          const pr = await this.github.createDraftPr(
            { cwd: options.cwd, audit, confirmed: true },
            {
              title: commitMessage(options.requirement),
              body: prBody(options.requirement, build, review),
              confirmed: true
            }
          );
          prUrl = pr.url;
          await emit({ type: "pr", message: pr.message, severity: pr.created ? "success" : "warning" });
        }
      }

      const summary = committed
        ? "本次成果已保存，可以继续审查或交付。"
        : "本次没有发现需要保存的新成果。";

      await updateState(options.cwd, {
        currentTask: options.requirement,
        status: "done",
        summary,
        branch,
        auditFile: audit.auditFile,
        steps: [
          { name: "理解需求", status: "done", message: "已完成" },
          { name: "实现功能", status: "done", message: build.summary },
          { name: "独立审查", status: "done", message: review.summary },
          { name: "保存成果", status: committed ? "done" : "skipped", message: summary }
        ]
      });

      await memory.remember({
        wing: "项目",
        room: "任务",
        drawer: branch,
        kind: "task",
        text: `需求：${options.requirement}\n结果：${summary}\n开发：${build.summary}\n审查：${review.summary}`,
        metadata: {
          branch,
          usedModel: build.usedModel,
          validation: review.validation,
          risks: review.risks
        }
      });

      await emit({ type: "done", message: summary, severity: "success" });
      return { branch, summary, build, review, prUrl };
    } catch (error) {
      await audit.record("workflow.error", "任务流程失败", serializeError(error));
      await updateState(options.cwd, {
        currentTask: options.requirement,
        status: "failed",
        summary: "任务遇到问题，技术细节已记录到审计日志。",
        auditFile: audit.auditFile
      });
      await emit({ type: "error", message: "任务遇到问题，技术细节已记录到审计日志。", raw: error });
      throw error;
    }
  }
}

function roleSelection(role: "planner" | "builder" | "reviewer", options: WorkflowOptions): RoleSelection | undefined {
  if (!options.registry || !options.config) {
    return undefined;
  }
  return options.registry.forRole(role, options.config);
}

function normalizePlan(requirement: string, parsed: Partial<ProductPlan>): ProductPlan {
  return {
    goal: parsed.goal ?? requirement,
    outcome: parsed.outcome ?? "完成用户期望的产品改进。",
    steps: parsed.steps?.length ? parsed.steps : ["了解当前项目", "完成必要改动", "验证结果", "进行独立审查"],
    acceptanceCriteria: parsed.acceptanceCriteria?.length
      ? parsed.acceptanceCriteria
      : ["用户目标被实现", "结果可以验证", "风险被说明"]
  };
}

function parseJsonObject<T>(text: string): T | undefined {
  const direct = tryParse<T>(text);
  if (direct) {
    return direct;
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    return tryParse<T>(fenced);
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return tryParse<T>(text.slice(start, end + 1));
  }
  return undefined;
}

function tryParse<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function slugFor(requirement: string): string {
  const ascii = requirement
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  const hash = createHash("sha1").update(requirement).digest("hex").slice(0, 8);
  return ascii ? `${ascii}-${hash}` : `task-${hash}`;
}

function commitMessage(requirement: string): string {
  const compact = requirement.replace(/\s+/g, " ").trim().slice(0, 48);
  return `ccli: ${compact || "更新产品能力"}`;
}

function prBody(requirement: string, build: BuildResult, review: ReviewResult): string {
  return [
    "## 用户需求",
    requirement,
    "",
    "## 完成内容",
    build.summary,
    "",
    "## 验证结果",
    review.validation === "passed" ? "自动验证已通过。" : "自动验证未完整通过或未配置。",
    "",
    "## 独立审查",
    review.summary,
    "",
    "## 风险",
    review.risks.length ? review.risks.map((risk) => `- ${risk}`).join("\n") : "未发现明显风险。"
  ].join("\n");
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

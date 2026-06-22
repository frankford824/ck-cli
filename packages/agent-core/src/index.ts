import { createHash } from "node:crypto";
import { basename } from "node:path";
import {
  evaluateHarnessHooks,
  HarnessHookBlockedError,
  harnessPrompt,
  loadHarnessContext,
  progressSnapshot,
  recordHarnessLesson,
  writeHarnessProgress,
  type HarnessContext,
  type HarnessHookEvaluationInput
} from "@ccli/harness";
import { LocalMemoryStore, memoryContextForPrompt } from "@ccli/memory";
import { forcingQuestions, specialistPrompt, sprintPlanLabels } from "@ccli/methodology";
import { ProductRenderer, type ProductEvent } from "@ccli/product-ui";
import { collectText, type CcliConfig, type ModelProvider, type ProviderRegistry } from "@ccli/providers";
import { ReviewerAgent, type ReviewResult } from "@ccli/review";
import { AuditSession, updateState } from "@ccli/session";
import { FileTool, GitHubTool, GitTool, ProjectTool, type CommandResult } from "@ccli/tools";

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
  async plan(
    requirement: string,
    selection?: RoleSelection,
    memoryContext = "没有找到相关历史记忆。",
    harnessContext?: HarnessContext
  ): Promise<ProductPlan> {
    if (selection) {
      const parsed = await collectText(selection.provider, {
        model: selection.model,
        temperature: 0.2,
        maxTokens: 1200,
        messages: [
          {
            role: "system",
            content:
              `你是中文产品规划代理。只输出 JSON，不要使用 Markdown。字段：goal,outcome,steps,acceptanceCriteria。面向普通用户，不写代码和技术术语。\n${specialistPrompt()}\n${harnessContext ? harnessPrompt(harnessContext, "plan") : ""}`
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
    harnessContext?: HarnessContext;
    repairFeedback?: string;
    allowFallback?: boolean;
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

    if (input.allowFallback === false) {
      return {
        summary: "验证反馈已记录，但当前没有得到可安全应用的自动修复结果。",
        changedFiles: [],
        usedModel: false
      };
    }

    const requestFile = "PRODUCT_REQUEST.md";
    const requestContent = [
      "# 产品需求记录",
      "",
      `项目：${basename(input.cwd)}`,
      `目标：${input.requirement}`,
      "",
      "计划：",
      ...input.plan.steps.map((step, index) => `${index + 1}. ${step}`),
      "",
      "说明：当前还没有可用的开发模型配置，因此 ccli 已先生成一个可运行的中文首版页面，并保存了需求草稿。配置模型后可以继续自动开发。"
    ].join("\n");

    await this.fileTool.write(requestFile, `${requestContent}\n`, {
      cwd: input.cwd,
      audit: input.audit,
      confirmed: true,
      harness: input.harnessContext
    });

    const changedFiles = [requestFile];
    const hasAppTemplate = await this.fileTool
      .read("src/App.tsx", { cwd: input.cwd, audit: input.audit, harness: input.harnessContext })
      .then(
        () => true,
        () => false
      );
    if (hasAppTemplate) {
      const starter = starterAppFor(input.requirement, input.plan);
      await this.fileTool.write("src/App.tsx", starter.appTsx, {
        cwd: input.cwd,
        audit: input.audit,
        confirmed: true,
        harness: input.harnessContext
      });
      await this.fileTool.write("src/styles.css", starter.stylesCss, {
        cwd: input.cwd,
        audit: input.audit,
        confirmed: true,
        harness: input.harnessContext
      });
      changedFiles.push("src/App.tsx", "src/styles.css");
      await input.audit.record("builder.fallback.starter", "已生成无模型首版业务页面", {
        title: starter.title,
        changedFiles
      });
    }

    return {
      summary: hasAppTemplate
        ? "还没有配置可用开发模型，已先生成可运行的中文首版页面，并保存需求草稿。"
        : "还没有配置可用开发模型，已先保存产品需求草稿，方便后续继续推进。",
      changedFiles,
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
    harnessContext?: HarnessContext;
    repairFeedback?: string;
  }): Promise<BuildResult | undefined> {
    const toolContext = { cwd: input.cwd, audit: input.audit, harness: input.harnessContext };
    const projectFiles = (await this.fileTool.list(toolContext)).slice(0, 80);
    const packageJson = await this.fileTool.read("package.json", toolContext).catch(() => "");
    const appTsx = await this.fileTool.read("src/App.tsx", toolContext).catch(() => "");
    const designContract = await this.fileTool.read("DESIGN.md", toolContext).catch(() => "");
    const officeHours = await this.fileTool
      .read(".ccli/skills/office-hours.md", toolContext)
      .catch(() => "");
    const frontendDesign = await this.fileTool
      .read(".ccli/skills/frontend-design.md", toolContext)
      .catch(() => "");

    const text = await collectText(input.selection.provider, {
      model: input.selection.model,
      temperature: 0.1,
      maxTokens: 8000,
      messages: [
        {
          role: "system",
          content:
            `你是开发代理。只输出 JSON，不要 Markdown。JSON 字段：summary 字符串，changes 数组。每个 change 包含 path、action、content。action 只能是 write。只做必要改动，不要删除文件，不要写密钥，不要展示解释。\n${input.harnessContext ? harnessPrompt(input.harnessContext, "build") : ""}`
        },
        {
          role: "user",
          content: JSON.stringify({
            requirement: input.requirement,
            plan: input.plan,
            repairFeedback: input.repairFeedback,
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
        confirmed: input.confirmed,
        harness: input.harnessContext
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
    const harnessContext = await loadHarnessContext(options.cwd);
    const emit = async (event: ProductEvent) => {
      await audit.recordEvent(event);
      await options.onEvent?.(event, renderer.render(event));
    };
    await audit.record("harness.context", "Harness 上下文已加载", {
      standingFacts: harnessContext.standingFacts.map((document) => document.path),
      rules: harnessContext.rules.map((document) => document.path),
      skills: harnessContext.skills.map((document) => document.path),
      artifacts: harnessContext.artifacts.map((document) => document.path),
      memory: Boolean(harnessContext.memory)
    });

    await updateState(options.cwd, {
      currentTask: options.requirement,
      status: "running",
      summary: "正在处理你的需求。",
      auditFile: audit.auditFile,
      steps: []
    });

    try {
      await emit({ type: "inspect", message: "正在了解当前项目。" });
      await saveProgress(options.cwd, audit, {
        task: options.requirement,
        currentStage: "inspect",
        summary: "正在了解当前项目。",
        facts: harnessContext.standingFacts.map((document) => document.title),
        nextAction: "整理中文产品方案。"
      });
      await this.git.init({ cwd: options.cwd, audit, confirmed: true, harness: harnessContext });
      const branch = await this.git.createTaskBranch(slugFor(options.requirement), {
        cwd: options.cwd,
        audit,
        confirmed: true,
        harness: harnessContext
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
        memoryContextForPrompt(memoryHits),
        harnessContext
      );
      await audit.record("planner.result", "实现方案已生成", plan);
      await saveProgress(options.cwd, audit, {
        task: options.requirement,
        currentStage: "plan",
        summary: "中文产品方案已生成。",
        facts: [plan.goal, plan.outcome],
        nextAction: "按方案实现必要改动。"
      });

      await emit({ type: "edit", message: "正在实现功能。" });
      const builderSelection = roleSelection("builder", options);
      let build = await this.builder.build({
        cwd: options.cwd,
        requirement: options.requirement,
        plan,
        audit,
        confirmed: options.yes,
        selection: builderSelection,
        harnessContext
      });
      await saveProgress(options.cwd, audit, {
        task: options.requirement,
        currentStage: "build",
        summary: build.summary,
        facts: build.changedFiles.length ? [`已更新 ${build.changedFiles.length} 处内容。`] : ["本次主要沉淀了需求。"],
        nextAction: "验证是否正常。"
      });

      await emit({ type: "validate", message: "正在验证是否正常。" });
      let validationOutcome = await runWorkflowValidation(this.project, {
        cwd: options.cwd,
        audit,
        confirmed: true,
        harness: harnessContext
      });
      await saveProgress(options.cwd, audit, {
        task: options.requirement,
        currentStage: "validate",
        summary: validationSummary(validationOutcome.validation),
        facts: validationOutcome.facts,
        nextAction: validationOutcome.validation === "failed" ? "把验证反馈交给开发代理修复。" : "进入独立审查。",
        validation: validationOutcome.validation
      });

      if (validationOutcome.validation === "failed" && builderSelection && build.usedModel) {
        await rememberHarnessLesson(options.cwd, audit, {
          task: options.requirement,
          stage: "validate",
          symptom: "自动验证没有通过",
          impact: validationOutcome.facts.join(" ") || "本次任务需要先修复再继续交付。",
          prevention: "完成同类改动后必须先运行自动验证；如果失败，只做最小必要修复，并再次验证后再保存成果。",
          source: "自动验证反馈闭环"
        });
        await emit({ type: "edit", message: "自动验证发现问题，正在修正。" });
        await audit.record("harness.backpressure.start", "验证失败反馈已交给开发代理", {
          feedback: validationOutcome.feedback
        });
        const repair = await this.builder.build({
          cwd: options.cwd,
          requirement: options.requirement,
          plan,
          audit,
          confirmed: options.yes,
          selection: builderSelection,
          harnessContext,
          repairFeedback: validationOutcome.feedback,
          allowFallback: false
        });
        build = mergeBuildResults(build, repair);
        validationOutcome = await runWorkflowValidation(this.project, {
          cwd: options.cwd,
          audit,
          confirmed: true,
          harness: harnessContext
        });
        await saveProgress(options.cwd, audit, {
          task: options.requirement,
          currentStage: "validate",
          summary: validationSummary(validationOutcome.validation),
          facts: validationOutcome.facts,
          nextAction: "进入独立审查。",
          validation: validationOutcome.validation
        });
      }

      await emit({ type: "review", message: "正在进行独立审查。" });
      const review = await this.reviewer.review({
        cwd: options.cwd,
        requirement: options.requirement,
        audit,
        reviewer: roleSelection("reviewer", options)
      });
      await saveProgress(options.cwd, audit, {
        task: options.requirement,
        currentStage: "review",
        summary: review.summary,
        facts: review.risks.length ? review.risks : ["独立审查未发现明显风险。"],
        nextAction: "保存本次成果。",
        validation: review.validation
      });

      await emit({ type: "save", message: "正在保存本次成果。" });
      const committed = await this.git.commitAll(commitMessage(options.requirement), {
        cwd: options.cwd,
        audit,
        confirmed: true,
        harness: harnessContext
      });
      await saveProgress(options.cwd, audit, {
        task: options.requirement,
        currentStage: "save",
        summary: committed ? "本次成果已保存。" : "本次没有发现需要保存的新成果。",
        facts: [`当前分支：${branch}`],
        nextAction: options.withPr ? "准备团队审查入口。" : "等待下一次需求。"
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
          await recordHarnessHookEvaluation(audit, harnessContext, {
            when: "after-validation",
            action: "ship",
            validation: validationOutcome.validation
          });
          await this.git.pushCurrent({ cwd: options.cwd, audit, confirmed: true, harness: harnessContext });
          const pr = await this.github.createDraftPr(
            { cwd: options.cwd, audit, confirmed: true, harness: harnessContext },
            {
              title: commitMessage(options.requirement),
              body: prBody(options.requirement, build, review),
              confirmed: true
            }
          );
          prUrl = pr.url;
          await emit({ type: "pr", message: pr.message, severity: pr.created ? "success" : "warning" });
          await saveProgress(options.cwd, audit, {
            task: options.requirement,
            currentStage: "ship",
            summary: pr.message,
            facts: pr.url ? ["团队审查入口已准备好。"] : ["还不能自动创建团队审查入口。"],
            nextAction: "等待团队审查或继续迭代。"
          });
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
          { name: "自动验证", status: validationOutcome.validation === "passed" ? "done" : validationOutcome.validation, message: validationSummary(validationOutcome.validation) },
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
          harnessValidation: validationOutcome.validation,
          validation: review.validation,
          risks: review.risks
        }
      });

      await saveProgress(options.cwd, audit, {
        task: options.requirement,
        currentStage: options.withPr ? "ship" : "save",
        summary,
        facts: [build.summary, review.summary],
        nextAction: "可以继续输入下一个中文需求。",
        validation: review.validation
      });
      await emit({ type: "done", message: summary, severity: "success" });
      return { branch, summary, build, review, prUrl };
    } catch (error) {
      await audit.record("workflow.error", "任务流程失败", serializeError(error));
      await rememberHarnessLesson(options.cwd, audit, {
        task: options.requirement,
        stage: "review",
        symptom: "任务流程中断",
        impact: "本次任务没有顺利完成，需要查看审计摘要或修复环境后重试。",
        prevention: "遇到同类流程问题时，先读取最近进度和审计摘要，再继续处理，不从头猜测项目状态。",
        source: "工作流错误处理"
      });
      await saveProgress(options.cwd, audit, {
        task: options.requirement,
        currentStage: "review",
        summary: "任务遇到问题，技术细节已记录到审计日志。",
        facts: ["用户界面只展示影响说明。"],
        nextAction: "查看审计摘要或修复环境后重试。"
      });
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

interface StarterApp {
  title: string;
  appTsx: string;
  stylesCss: string;
}

type StarterDomain = "crm" | "booking" | "inventory" | "orders" | "finance" | "content" | "general";

interface StarterDomainConfig {
  heroAction: string;
  metricLabels: string[];
  metricValues: string[];
  workflow: string[];
  records: Array<{ name: string; next: string; owner: string; status: string }>;
  quickActions: string[];
  insight: string;
}

function starterAppFor(requirement: string, plan: ProductPlan): StarterApp {
  const domain = inferStarterDomain(requirement);
  const config = starterConfigFor(domain);
  const title = titleForRequirement(requirement);
  const planSteps = plan.steps.slice(0, 4);

  return {
    title,
    appTsx: `const metrics = ${JSON.stringify(config.metricLabels.map((label, index) => ({ label, value: config.metricValues[index] })), null, 2)};
const workflow = ${JSON.stringify(config.workflow, null, 2)};
const records = ${JSON.stringify(config.records, null, 2)};
const quickActions = ${JSON.stringify(config.quickActions, null, 2)};
const plan = ${JSON.stringify(planSteps, null, 2)};

export function App() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">首版业务工作台</p>
        <h1>${escapeTsxText(title)}</h1>
        <p className="summary">${escapeTsxText(plan.outcome)}</p>
        <div className="actions">
          <button>${escapeTsxText(config.heroAction)}</button>
          <span>已按你的中文目标生成，可继续让 ccli 细化。</span>
        </div>
      </section>

      <section className="metrics" aria-label="关键指标">
        {metrics.map((metric) => (
          <article className="metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <div className="panel highlight">
          <h2>老板先看</h2>
          <p>${escapeTsxText(config.insight)}</p>
          <div className="quick-actions">
            {quickActions.map((action) => (
              <button key={action} type="button">{action}</button>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>当前流程</h2>
          <ol>
            {workflow.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>

        <div className="panel">
          <h2>重点记录</h2>
          <div className="records">
            {records.map((record) => (
              <article className="record" key={record.name}>
                <strong>{record.name}</strong>
                <span>{record.next}</span>
                <small>{record.owner}</small>
                <em>{record.status}</em>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>下一步</h2>
          <ul>
            {plan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
`,
    stylesCss: `:root {
  color: #17212b;
  background: #f5f7fa;
  font-family:
    Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

button {
  border: 0;
  border-radius: 8px;
  background: #0f7a5f;
  color: #ffffff;
  padding: 12px 18px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.page {
  min-height: 100vh;
  display: grid;
  gap: 24px;
  padding: 48px;
  box-sizing: border-box;
}

.hero {
  max-width: 920px;
}

.eyebrow {
  margin: 0 0 12px;
  color: #0f7a5f;
  font-weight: 800;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 46px;
  line-height: 1.1;
}

h2 {
  font-size: 20px;
}

.summary {
  margin-top: 16px;
  max-width: 780px;
  color: #4b5b68;
  font-size: 18px;
  line-height: 1.7;
}

.actions {
  margin-top: 22px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  color: #647282;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.metric,
.panel {
  border: 1px solid #d9e2ea;
  border-radius: 8px;
  background: #ffffff;
}

.metric {
  min-height: 104px;
  display: grid;
  align-content: center;
  gap: 10px;
  padding: 18px;
}

.metric span {
  color: #607080;
}

.metric strong {
  font-size: 34px;
}

.workspace {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.panel {
  padding: 20px;
}

.highlight {
  background: #10251f;
  color: #ffffff;
}

.highlight p {
  margin-top: 14px;
  color: #d7e8e1;
  line-height: 1.7;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.quick-actions button {
  background: #ffffff;
  color: #0f7a5f;
  padding: 10px 14px;
}

ol,
ul {
  margin: 16px 0 0;
  padding-left: 22px;
  color: #465461;
  line-height: 1.9;
}

.records {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.record {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(120px, 1fr) minmax(72px, 0.6fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px solid #e5ebf0;
  border-radius: 8px;
  padding: 12px;
}

.record span {
  color: #5c6c7a;
}

.record small {
  color: #6d7b88;
  font-size: 14px;
}

.record em {
  border-radius: 999px;
  background: #eef7f3;
  color: #0f7a5f;
  padding: 6px 10px;
  font-style: normal;
  font-weight: 700;
}

@media (max-width: 820px) {
  .page {
    padding: 28px;
  }

  h1 {
    font-size: 34px;
  }

  .metrics,
  .workspace {
    grid-template-columns: 1fr;
  }

  .record {
    grid-template-columns: 1fr;
  }
}
`
  };
}

function inferStarterDomain(requirement: string): StarterDomain {
  if (/库存|仓库|补货|入库|出库|sku|SKU|商品|存货|进销存|收银|收银台|台账/i.test(requirement)) {
    return "inventory";
  }
  if (/订单|发货|物流|售后|退款|履约|电商/i.test(requirement)) {
    return "orders";
  }
  if (/财务|收支|利润|成本|报销|账单|回款|应收|应付|报表|BI|bi|数据看板/i.test(requirement)) {
    return "finance";
  }
  if (/官网|内容|文章|发布|素材|品牌|营销|咨询公司/i.test(requirement)) {
    return "content";
  }
  if (/客户|销售|跟进|线索|成交|crm/i.test(requirement)) {
    return "crm";
  }
  if (/预约|门店|到店|排班|时间|预订/i.test(requirement)) {
    return "booking";
  }
  return "general";
}

function starterConfigFor(domain: StarterDomain): StarterDomainConfig {
  const configs: Record<StarterDomain, StarterDomainConfig> = {
    crm: {
      heroAction: "查看客户跟进",
      metricLabels: ["活跃客户", "待跟进", "本周成交"],
      metricValues: ["128", "17", "9"],
      workflow: ["录入客户", "安排跟进", "推进成交"],
      records: [
        { name: "恒星贸易", next: "报价后跟进", owner: "销售一组", status: "高意向" },
        { name: "青木门店", next: "下周演示", owner: "张经理", status: "推进中" },
        { name: "瑞启科技", next: "合同确认", owner: "李经理", status: "待回复" }
      ],
      quickActions: ["新增客户", "安排回访", "查看成交预测"],
      insight: "今天优先跟进高意向客户，先处理待回复合同，再安排下周演示。"
    },
    booking: {
      heroAction: "查看今日预约",
      metricLabels: ["今日预约", "待确认", "空闲时段"],
      metricValues: ["24", "8", "5"],
      workflow: ["客户提交预约", "老板确认时间", "系统提醒到店"],
      records: [
        { name: "张女士", next: "明天 10:00", owner: "美甲一店", status: "待确认" },
        { name: "李先生", next: "周五 15:30", owner: "理疗室", status: "已确认" },
        { name: "王女士", next: "今天 18:00", owner: "前台", status: "需改期" }
      ],
      quickActions: ["确认预约", "调整时间", "发送提醒"],
      insight: "今天还有 8 个预约需要确认，18:00 的改期请求会影响晚间排班。"
    },
    inventory: {
      heroAction: "查看低库存预警",
      metricLabels: ["在库 SKU", "低库存", "今日出库"],
      metricValues: ["842", "19", "126"],
      workflow: ["同步库存", "识别低库存", "安排补货"],
      records: [
        { name: "黑色 T 恤 M", next: "建议补货 200 件", owner: "广州仓", status: "低库存" },
        { name: "便携水杯", next: "明早出库 48 件", owner: "上海仓", status: "待出库" },
        { name: "礼盒包装", next: "核对盘点差异", owner: "仓管", status: "需复核" }
      ],
      quickActions: ["生成补货单", "查看出库", "导出盘点表"],
      insight: "低库存集中在热销款，先补黑色 T 恤和礼盒包装，避免影响本周发货。"
    },
    orders: {
      heroAction: "查看待发货订单",
      metricLabels: ["今日订单", "待发货", "售后处理"],
      metricValues: ["356", "42", "6"],
      workflow: ["接收订单", "分配仓库", "跟踪发货"],
      records: [
        { name: "订单 20260618-019", next: "等待拣货", owner: "华东仓", status: "待发货" },
        { name: "订单 20260618-027", next: "物流异常跟进", owner: "客服", status: "需处理" },
        { name: "订单 20260618-044", next: "售后换货确认", owner: "售后组", status: "待确认" }
      ],
      quickActions: ["批量发货", "处理售后", "查看物流异常"],
      insight: "今日待发货订单主要集中在华东仓，先处理物流异常可以减少客户催单。"
    },
    finance: {
      heroAction: "查看今日收支",
      metricLabels: ["本月收入", "待回款", "本周支出"],
      metricValues: ["¥82.4万", "¥16.8万", "¥9.7万"],
      workflow: ["记录收支", "核对应收", "生成老板报表"],
      records: [
        { name: "恒星贸易回款", next: "明天到账核对", owner: "财务", status: "待回款" },
        { name: "广告投放费用", next: "补充发票", owner: "市场部", status: "待报销" },
        { name: "门店租金", next: "月底前付款", owner: "行政", status: "待支付" }
      ],
      quickActions: ["录入收入", "核对回款", "导出报表"],
      insight: "本月现金流健康，重点盯住 16.8 万待回款和广告费用发票。"
    },
    content: {
      heroAction: "查看发布计划",
      metricLabels: ["待发布", "待审核", "本周素材"],
      metricValues: ["12", "4", "36"],
      workflow: ["收集素材", "审核内容", "安排发布"],
      records: [
        { name: "首页案例更新", next: "补客户结果图", owner: "品牌组", status: "待补充" },
        { name: "行业洞察文章", next: "老板终审", owner: "内容组", status: "待审核" },
        { name: "短视频脚本", next: "周五拍摄", owner: "运营", status: "已排期" }
      ],
      quickActions: ["新建内容", "安排发布", "查看素材库"],
      insight: "本周内容重点是案例更新和行业洞察，先补齐客户结果图更利于转化。"
    },
    general: {
      heroAction: "查看重点任务",
      metricLabels: ["进行中事项", "待确认", "本周完成"],
      metricValues: ["24", "8", "5"],
      workflow: ["收集需求", "安排负责人", "检查结果"],
      records: [
        { name: "首页体验优化", next: "今天确认方向", owner: "产品", status: "进行中" },
        { name: "运营数据看板", next: "补充指标", owner: "运营", status: "待确认" },
        { name: "交付验收", next: "准备说明", owner: "项目", status: "可审查" }
      ],
      quickActions: ["新增任务", "查看看板", "生成交付说明"],
      insight: "当前最适合先确认关键指标，再把任务分配给负责人并跟踪结果。"
    }
  };

  return configs[domain];
}

function titleForRequirement(requirement: string): string {
  const cleaned = requirement
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/^(帮我|请|我想|我要|想要|需要|做一个|做个|创建一个|创建个|开发一个|开发个|生成一个|生成个|搭建一个|搭建个|做|创建|开发|生成|搭建)/, "")
    .split(/[，。；;,.!?！？\n]/)[0]
    .trim();
  return cleaned || "业务工作台";
}

function escapeTsxText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/</g, "＜")
    .replace(/>/g, "＞")
    .replace(/{/g, "｛")
    .replace(/}/g, "｝");
}

interface ValidationOutcome {
  validation: ReviewResult["validation"];
  facts: string[];
  feedback: string;
}

async function runWorkflowValidation(
  project: ProjectTool,
  context: { cwd: string; audit: AuditSession; confirmed: boolean; harness?: HarnessContext }
): Promise<ValidationOutcome> {
  let validationError: unknown;
  const results = await project.runValidation(context).catch(async (error: unknown) => {
    validationError = error;
    await context.audit.record("workflow.validation.error", "自动验证没有全部完成", serializeError(error));
    return undefined;
  });

  if (results === undefined) {
    return {
      validation: "failed",
      facts: ["自动验证过程遇到问题。"],
      feedback: JSON.stringify({ error: serializeError(validationError ?? new Error("自动验证过程遇到问题。")) })
    };
  }

  if (!results.length) {
    return {
      validation: "skipped",
      facts: ["当前项目没有可自动执行的验证，或依赖还没有安装。"],
      feedback: "当前项目没有可自动执行的验证，或依赖还没有安装。"
    };
  }

  const failed = results.filter((result) => result.exitCode !== 0);
  if (!failed.length) {
    return {
      validation: "passed",
      facts: [`已完成 ${results.length} 项自动验证。`],
      feedback: "自动验证已通过。"
    };
  }

  return {
    validation: "failed",
    facts: [`${failed.length} 项自动验证没有通过。`],
    feedback: JSON.stringify(
      {
        message: "自动验证没有全部通过。请只做最小必要修复。",
        failed: failed.map(validationResultForFeedback)
      },
      null,
      2
    )
  };
}

function validationResultForFeedback(result: CommandResult): Record<string, unknown> {
  return {
    command: result.command,
    exitCode: result.exitCode,
    stdout: tailForModel(result.stdout),
    stderr: tailForModel(result.stderr)
  };
}

function validationSummary(validation: ReviewResult["validation"]): string {
  if (validation === "passed") {
    return "自动验证已通过。";
  }
  if (validation === "failed") {
    return "自动验证发现问题，已进入受控反馈流程。";
  }
  return "当前项目没有可自动执行的验证，已记录为未覆盖风险。";
}

function mergeBuildResults(first: BuildResult, second: BuildResult): BuildResult {
  if (!second.changedFiles.length) {
    return first;
  }
  return {
    summary: `${first.summary} ${second.summary}`.trim(),
    changedFiles: [...new Set([...first.changedFiles, ...second.changedFiles])],
    usedModel: first.usedModel || second.usedModel
  };
}

async function saveProgress(
  cwd: string,
  audit: AuditSession,
  input: Parameters<typeof progressSnapshot>[0]
): Promise<void> {
  const progress = progressSnapshot(input);
  await writeHarnessProgress(cwd, progress).catch(async (error: unknown) => {
    await audit.record("harness.progress.error", "Harness 进度写入失败", serializeError(error));
  });
}

async function recordHarnessHookEvaluation(
  audit: AuditSession,
  context: HarnessContext,
  input: HarnessHookEvaluationInput
): Promise<void> {
  const evaluation = evaluateHarnessHooks(context, input);
  if (!evaluation.findings.length) {
    return;
  }

  await audit.record(
    `harness.hook.${input.when}`,
    evaluation.blocked ? "驾驭系统已阻止团队交付" : "驾驭系统已完成阶段检查",
    evaluation
  );
  if (evaluation.blocked) {
    throw new HarnessHookBlockedError(evaluation);
  }
}

async function rememberHarnessLesson(
  cwd: string,
  audit: AuditSession,
  input: Parameters<typeof recordHarnessLesson>[1]
): Promise<void> {
  await recordHarnessLesson(cwd, input)
    .then(async (result) => {
      await audit.record(result.written ? "harness.lesson.recorded" : "harness.lesson.duplicate", result.message, {
        path: result.path,
        written: result.written
      });
    })
    .catch(async (error: unknown) => {
      await audit.record("harness.lesson.error", "Harness 经验写入失败", serializeError(error));
    });
}

function tailForModel(text: string): string {
  return text.length <= 4000 ? text : text.slice(-4000);
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type HarnessStage = "inspect" | "plan" | "build" | "validate" | "review" | "save" | "ship";

export interface HarnessDocument {
  path: string;
  title: string;
  content: string;
}

export interface HarnessContext {
  standingFacts: HarnessDocument[];
  rules: HarnessDocument[];
  skills: HarnessDocument[];
  memory?: HarnessDocument;
  toolBudget: HarnessToolBudget[];
}

export interface HarnessToolBudget {
  stage: HarnessStage;
  userVisibleGoal: string;
  allowedTools: string[];
  deniedActions: string[];
}

export interface HarnessProgress {
  task: string;
  currentStage: HarnessStage;
  updatedAt: string;
  summary: string;
  facts: string[];
  nextAction: string;
  validation?: "passed" | "failed" | "skipped";
}

const STANDING_FACT_FILES = ["AGENTS.md", "CLAUDE.md", "CCLI.md", ".ccli/harness/README.md"];
const RULE_FILES = [".ccli/harness/rules/safety.md", ".ccli/harness/rules/product.md"];
const SKILL_FILES = [".ccli/skills/office-hours.md", ".ccli/skills/frontend-design.md", ".ccli/skills/qa.md"];
const MEMORY_FILE = ".ccli/harness/agent-memory/STATE.md";
const PROGRESS_FILE = ".ccli/progress.json";
const MAX_DOCUMENT_CHARS = 5000;

export async function loadHarnessContext(cwd: string): Promise<HarnessContext> {
  const [standingFacts, rules, skills, memory] = await Promise.all([
    readDocuments(cwd, STANDING_FACT_FILES),
    readDocuments(cwd, RULE_FILES),
    readDocuments(cwd, SKILL_FILES),
    readOptionalDocument(cwd, MEMORY_FILE, "项目记忆")
  ]);

  return {
    standingFacts,
    rules,
    skills,
    memory,
    toolBudget: defaultToolBudget()
  };
}

export function harnessPrompt(context: HarnessContext, stage: HarnessStage): string {
  const budget = context.toolBudget.find((item) => item.stage === stage);
  const sections = [
    "Harness 固定规则：",
    "1. 面向普通用户，只输出中文产品语义。",
    "2. 不展示代码、命令、路径、堆栈或原始模型文本。",
    "3. 任何高影响、不可逆、发布、删除、密钥相关动作必须交给策略层确认。",
    "4. 失败要转化成影响、风险和下一步，不责怪用户。",
    budget
      ? [
          "",
          `当前阶段：${budget.userVisibleGoal}`,
          `可用工具语义：${budget.allowedTools.join("、")}`,
          `禁止动作：${budget.deniedActions.join("、")}`
        ].join("\n")
      : "",
    renderDocuments("长期事实", context.standingFacts),
    renderDocuments("确定性规则", context.rules),
    renderDocuments("可复用技能", context.skills),
    context.memory ? renderDocuments("项目记忆", [context.memory]) : ""
  ];

  return sections.filter(Boolean).join("\n\n").slice(0, 16_000);
}

export async function writeHarnessProgress(cwd: string, progress: HarnessProgress): Promise<void> {
  const absolutePath = join(cwd, PROGRESS_FILE);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
}

export async function readHarnessProgress(cwd: string): Promise<HarnessProgress | undefined> {
  try {
    return JSON.parse(await readFile(join(cwd, PROGRESS_FILE), "utf8")) as HarnessProgress;
  } catch {
    return undefined;
  }
}

export function progressSnapshot(input: {
  task: string;
  currentStage: HarnessStage;
  summary: string;
  facts?: string[];
  nextAction: string;
  validation?: "passed" | "failed" | "skipped";
}): HarnessProgress {
  return {
    task: input.task,
    currentStage: input.currentStage,
    updatedAt: new Date().toISOString(),
    summary: input.summary,
    facts: input.facts ?? [],
    nextAction: input.nextAction,
    validation: input.validation
  };
}

export function defaultToolBudget(): HarnessToolBudget[] {
  return [
    {
      stage: "inspect",
      userVisibleGoal: "了解当前项目",
      allowedTools: ["读取项目说明", "搜索文件", "读取本地记忆"],
      deniedActions: ["修改文件", "发送远程内容", "发布或部署"]
    },
    {
      stage: "plan",
      userVisibleGoal: "整理中文产品方案",
      allowedTools: ["读取设计契约", "读取技能", "生成任务拆解"],
      deniedActions: ["改动项目", "创建交付", "发布或部署"]
    },
    {
      stage: "build",
      userVisibleGoal: "实现必要改动",
      allowedTools: ["小范围写入", "格式整理", "保存审计记录"],
      deniedActions: ["删除大量文件", "修改密钥", "修改生产配置"]
    },
    {
      stage: "validate",
      userVisibleGoal: "验证是否正常",
      allowedTools: ["运行测试", "运行构建", "整理失败反馈"],
      deniedActions: ["发布", "部署", "修改远程状态"]
    },
    {
      stage: "review",
      userVisibleGoal: "独立审查风险",
      allowedTools: ["检查变更", "检查验证结果", "生成风险摘要"],
      deniedActions: ["合并", "发布", "跳过未解释风险"]
    },
    {
      stage: "save",
      userVisibleGoal: "保存本次成果",
      allowedTools: ["创建本地提交", "写入项目记忆"],
      deniedActions: ["强制覆盖历史", "跳过审计记录"]
    },
    {
      stage: "ship",
      userVisibleGoal: "准备团队交付",
      allowedTools: ["推送分支", "创建待审查入口", "发布审查摘要"],
      deniedActions: ["无确认合并", "无确认发布", "生产操作"]
    }
  ];
}

export function renderHarnessSummary(context: HarnessContext): string {
  const facts = context.standingFacts.length;
  const rules = context.rules.length;
  const skills = context.skills.length;
  const memory = context.memory ? "已接入历史记忆" : "暂无历史记忆";
  return `驾驭系统已加载：${facts} 份长期事实、${rules} 份确定性规则、${skills} 个复用技能，${memory}。`;
}

async function readDocuments(cwd: string, relativePaths: string[]): Promise<HarnessDocument[]> {
  const documents = await Promise.all(relativePaths.map((relativePath) => readOptionalDocument(cwd, relativePath)));
  return documents.filter((document): document is HarnessDocument => Boolean(document));
}

async function readOptionalDocument(cwd: string, relativePath: string, fallbackTitle?: string): Promise<HarnessDocument | undefined> {
  const absolutePath = join(cwd, relativePath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  const content = (await readFile(absolutePath, "utf8")).slice(0, MAX_DOCUMENT_CHARS).trim();
  if (!content) {
    return undefined;
  }
  return {
    path: relativePath,
    title: fallbackTitle ?? titleFromPath(relativePath),
    content
  };
}

function renderDocuments(title: string, documents: HarnessDocument[]): string {
  if (!documents.length) {
    return "";
  }
  const body = documents.map((document) => `【${document.title}】\n${document.content}`).join("\n\n");
  return `${title}：\n${body}`;
}

function titleFromPath(relativePath: string): string {
  const fileName = relativePath.split("/").pop() ?? relativePath;
  return fileName.replace(/\.[^.]+$/, "");
}

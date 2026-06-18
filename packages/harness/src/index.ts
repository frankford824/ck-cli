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

export type HarnessReadinessLevel = "strong" | "usable" | "thin";

export interface HarnessReadinessItem {
  name: string;
  ready: boolean;
  impact: string;
  nextAction: string;
}

export interface HarnessReadinessReport {
  score: number;
  level: HarnessReadinessLevel;
  summary: string;
  strengths: string[];
  gaps: string[];
  nextSteps: string[];
  items: HarnessReadinessItem[];
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
    "5. 每次会话优先完成一个明确任务，避免把多个目标混在一次开发里。",
    "6. 开发前先理解当前状态，开发后必须让验证和独立审查接住结果。",
    "7. 生成和评估分离：开发代理负责实现，审查代理负责挑风险。",
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

export function analyzeHarnessReadiness(context: HarnessContext, progress?: HarnessProgress): HarnessReadinessReport {
  const items: HarnessReadinessItem[] = [
    {
      name: "确定性项目指南",
      ready: context.standingFacts.length > 0,
      impact: "模型每次都能先看到稳定边界，减少跑偏。",
      nextAction: "补一份项目指南，写清楚目标用户、禁止事项和常用验证方式。"
    },
    {
      name: "安全和产品规则",
      ready: context.rules.length >= 2,
      impact: "高风险动作会被规则提前拦住，普通用户也能看懂影响。",
      nextAction: "补齐安全规则和产品表达规则，尤其是删除、密钥、发布和生产操作。"
    },
    {
      name: "阶段工具预算",
      ready: context.toolBudget.length >= 7 && context.toolBudget.every((budget) => budget.allowedTools.length <= 3),
      impact: "每个阶段只给少量工具语义，降低模型选错工具的概率。",
      nextAction: "把每个阶段的工具收敛到少数必要动作，先读、再改、再验、再审。"
    },
    {
      name: "验证反馈闭环",
      ready: context.toolBudget.some((budget) => budget.stage === "validate" && budget.allowedTools.includes("整理失败反馈")),
      impact: "验证失败会先回到开发代理修复，而不是直接把错误扔给用户。",
      nextAction: "确保验证阶段能收集失败摘要，并限制自动修复次数。"
    },
    {
      name: "独立审查",
      ready: context.toolBudget.some((budget) => budget.stage === "review"),
      impact: "实现和评估分开，减少开发代理自我确认带来的盲区。",
      nextAction: "保留独立审查阶段，审查结论要覆盖风险、验证和未覆盖项。"
    },
    {
      name: "可复用技能",
      ready: context.skills.length > 0,
      impact: "常见场景可以复用成稳定做法，不用每次重新解释。",
      nextAction: "为前端设计、验收检查或业务流程补充至少一个技能文件。"
    },
    {
      name: "长期项目记忆",
      ready: Boolean(context.memory),
      impact: "跨会话能记住项目事实，长任务不完全依赖模型上下文。",
      nextAction: "沉淀一份项目状态，记录已确认事实、当前阶段和下次接手重点。"
    },
    {
      name: "短期进度落盘",
      ready: Boolean(progress),
      impact: "任务中断后可以继续接手，不需要用户重新解释全过程。",
      nextAction: "先运行一次中文任务，让系统写入最近进度和下一步。"
    }
  ];
  const readyItems = items.filter((item) => item.ready);
  const gaps = items.filter((item) => !item.ready);
  const score = Math.round((readyItems.length / items.length) * 100);
  const level: HarnessReadinessLevel = score >= 85 ? "strong" : score >= 60 ? "usable" : "thin";
  const summary =
    level === "strong"
      ? "当前驾驭系统已经比较完整，可以承接较长的自动开发任务。"
      : level === "usable"
        ? "当前驾驭系统可用，但还需要补齐记忆或技能，才能更稳地跑长任务。"
        : "当前驾驭系统偏薄，建议先补规则、记忆和验证闭环，再交给模型执行复杂任务。";

  return {
    score,
    level,
    summary,
    strengths: readyItems.map((item) => item.name),
    gaps: gaps.map((item) => item.name),
    nextSteps: gaps.slice(0, 3).map((item) => item.nextAction),
    items
  };
}

export function renderHarnessReadiness(report: HarnessReadinessReport): string {
  const levelText: Record<HarnessReadinessLevel, string> = {
    strong: "稳健",
    usable: "可用",
    thin: "偏薄"
  };
  const sections = [
    `驾驭系统健康度：${report.score}/100，${levelText[report.level]}。`,
    report.summary,
    report.strengths.length ? `已具备：${report.strengths.join("、")}。` : "",
    report.gaps.length ? `需要补齐：${report.gaps.join("、")}。` : "暂未发现明显缺口。",
    report.nextSteps.length ? `建议下一步：\n${report.nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : ""
  ];

  return sections.filter(Boolean).join("\n");
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

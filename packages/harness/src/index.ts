import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { appendFile, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

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
  artifacts: HarnessDocument[];
  agents: HarnessDocument[];
  memory?: HarnessDocument;
  memories: HarnessDocument[];
  settings?: HarnessSettings;
  hookPlan?: HarnessHookPlan;
  toolBudget: HarnessToolBudget[];
}

export interface HarnessToolBudget {
  stage: HarnessStage;
  userVisibleGoal: string;
  allowedTools: string[];
  deniedActions: string[];
}

export interface HarnessSettings {
  version?: number;
  mode?: string;
  principle?: string;
  modelRoles?: Record<string, string>;
  permissions?: {
    autoApprove?: string[];
    confirm?: string[];
    deny?: string[];
  };
}

export interface HarnessHook {
  id: string;
  when: "before-tool" | "after-edit" | "after-validation" | "session-end";
  description: string;
  blocks?: boolean;
}

export interface HarnessHookPlan {
  version?: number;
  hooks: HarnessHook[];
}

export type HarnessHookSeverity = "info" | "warning" | "blocked";

export interface HarnessHookEvaluationInput {
  when: HarnessHook["when"];
  action: string;
  command?: string;
  target?: string;
  validation?: "passed" | "failed" | "skipped";
  changedFiles?: string[];
}

export interface HarnessHookFinding {
  id: string;
  description: string;
  severity: HarnessHookSeverity;
  reason: string;
  blocks: boolean;
}

export interface HarnessHookEvaluation {
  when: HarnessHook["when"];
  action: string;
  blocked: boolean;
  userMessage: string;
  findings: HarnessHookFinding[];
}

export class HarnessHookBlockedError extends Error {
  readonly evaluation: HarnessHookEvaluation;

  constructor(evaluation: HarnessHookEvaluation) {
    super(evaluation.userMessage);
    this.name = "HarnessHookBlockedError";
    this.evaluation = evaluation;
  }
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

export interface HarnessLessonInput {
  task?: string;
  stage?: HarnessStage;
  symptom: string;
  impact: string;
  prevention: string;
  source?: string;
}

export interface HarnessLessonResult {
  path: string;
  written: boolean;
  entry: string;
  message: string;
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

export type HarnessContextHygieneStatus = "healthy" | "watch" | "bloated";

export interface HarnessContextDocumentCheck {
  title: string;
  status: HarnessContextHygieneStatus;
  size: number;
  issue: string;
  recommendation: string;
}

export interface HarnessContextHygieneReport {
  status: HarnessContextHygieneStatus;
  summary: string;
  totalSize: number;
  recommendedMaxPerDocument: number;
  recommendedMaxTotal: number;
  checks: HarnessContextDocumentCheck[];
  nextSteps: string[];
}

export type HarnessRoadmapTier = "foundation" | "control" | "compound";
export type HarnessRoadmapStatus = "ready" | "next" | "later";

export interface HarnessRoadmapStep {
  number: number;
  tier: HarnessRoadmapTier;
  title: string;
  status: HarnessRoadmapStatus;
  userValue: string;
  nextAction: string;
}

export interface HarnessRoadmapReport {
  readyCount: number;
  nextCount: number;
  laterCount: number;
  summary: string;
  nextSteps: string[];
  steps: HarnessRoadmapStep[];
}

export type HarnessLoopReadinessLevel = "ready" | "manual-only" | "blocked";

export interface HarnessLoopCheck {
  name: string;
  ready: boolean;
  required: boolean;
  userValue: string;
  missingAction: string;
}

export interface HarnessLoopReadinessReport {
  level: HarnessLoopReadinessLevel;
  canRunUnattended: boolean;
  summary: string;
  safeScope: string;
  cadence: string;
  stopCondition: string;
  hardStops: string[];
  nextSteps: string[];
  checks: HarnessLoopCheck[];
}

export type HarnessPlaybookStatus = "ready" | "needs-work";

export interface HarnessPlaybookStep {
  title: string;
  status: HarnessPlaybookStatus;
  userValue: string;
  howToUse: string;
  missingAction: string;
}

export interface HarnessPlaybookReport {
  summary: string;
  focus: string;
  loopReadiness: string;
  steps: HarnessPlaybookStep[];
}

export type HarnessScanSeverity = "pass" | "watch" | "risk";

export interface HarnessScanFinding {
  name: string;
  severity: HarnessScanSeverity;
  issue: string;
  impact: string;
  nextAction: string;
  expertDetail?: string;
}

export interface HarnessScanReport {
  safeToShare: boolean;
  summary: string;
  riskCount: number;
  watchCount: number;
  findings: HarnessScanFinding[];
  nextSteps: string[];
}

const STANDING_FACT_FILES = ["AGENTS.md", "CLAUDE.md", "CCLI.md", ".ccli/harness/README.md"];
const RULE_FILES = [".ccli/harness/rules/safety.md", ".ccli/harness/rules/product.md"];
const SKILL_FILES = [".ccli/skills/office-hours.md", ".ccli/skills/frontend-design.md", ".ccli/skills/qa.md"];
const ARTIFACT_FILES = [".ccli/harness/feature-list.json", ".ccli/harness/init-check.json", ".ccli/harness/loop-gate.json", ".ccli/harness/ROADMAP.md"];
const AGENT_FILES = [".ccli/harness/agents/reviewer.md", ".ccli/harness/agents/eval-runner.md"];
const SETTINGS_FILE = ".ccli/harness/settings.json";
const HOOKS_FILE = ".ccli/harness/hooks.json";
const MEMORY_FILE = ".ccli/harness/agent-memory/STATE.md";
const LESSONS_FILE = ".ccli/harness/agent-memory/LESSONS.md";
const MEMORY_FILES = [MEMORY_FILE, LESSONS_FILE];
const PROGRESS_FILE = ".ccli/progress.json";
const MAX_DOCUMENT_CHARS = 5000;
const STANDING_FACT_DOCUMENT_MAX_CHARS = 2200;
const STANDING_FACT_TOTAL_MAX_CHARS = 5200;
const SECRET_TARGET = /(^|\/|\\)(\.env|\.env\..*|id_rsa|id_dsa|id_ed25519|.*\.pem|.*\.key|.*secret.*|.*credential.*)$/i;
const SECRET_COMMAND = /\b(cat|type|less|more|sed|awk)\b[\s\S]*(\.env|id_rsa|id_dsa|id_ed25519|\.pem|\.key|secret|credential)/i;
const REMOTE_SCRIPT = /(curl|wget)\s+[^|&;]+(\|\s*(bash|sh|zsh)|>\s*[^&;]+\s*&&\s*(bash|sh|zsh))/i;
const DESTRUCTIVE_COMMAND = /\b(rm\s+-rf|del\s+\/[sq]|rmdir\s+\/[sq]|chmod\s+-R\s+777|sudo\s+rm|git\s+reset\s+--hard|git\s+clean\s+-fd)\b/i;
const DATABASE_COMMAND = /\b(drop\s+database|drop\s+schema|truncate\s+table|prisma\s+migrate\s+deploy|sequelize\s+db:migrate|rails\s+db:migrate)\b/i;
const PUBLISH_OR_DEPLOY_COMMAND = /\b(npm\s+publish|pnpm\s+publish|yarn\s+npm\s+publish|docker\s+push|wrangler\s+deploy|vercel\s+--prod|netlify\s+deploy\s+--prod|firebase\s+deploy|kubectl\s+apply|helm\s+upgrade|terraform\s+apply|pulumi\s+up)\b/i;
const FORCE_PUSH = /\bgit\s+push\b[\s\S]*(?:--force|-f)(?:[\s;&|]|$)/i;
const HARNESS_SECRET_VALUE =
  /(sk-[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9_]{20,}|xox[baprs]-[a-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;
const HARNESS_SECRET_ASSIGNMENT =
  /\b(?:api[_-]?key|token|secret|password|passwd|credential|private[_-]?key)\b\s*[:=]\s*["']?[a-z0-9_./+=-]{16,}/i;
const OVERBROAD_AUTO_PERMISSION =
  /(删除|密钥|证书|生产|发布|部署|数据库|迁移|推送|合并|远程脚本|强制|覆盖|主线|main|master|force|publish|deploy|secret|credential|database|migration|push|merge|prod)/i;

export async function loadHarnessContext(cwd: string): Promise<HarnessContext> {
  const [standingFacts, rules, skills, artifacts, agents, memories, settings, hookPlan] = await Promise.all([
    readDocuments(cwd, STANDING_FACT_FILES),
    readDocuments(cwd, RULE_FILES),
    readDocuments(cwd, SKILL_FILES),
    readDocuments(cwd, ARTIFACT_FILES),
    readDocuments(cwd, AGENT_FILES),
    readDocuments(cwd, MEMORY_FILES),
    readJsonDocument<HarnessSettings>(cwd, SETTINGS_FILE),
    readJsonDocument<HarnessHookPlan>(cwd, HOOKS_FILE)
  ]);

  return {
    standingFacts,
    rules,
    skills,
    artifacts,
    agents,
    memory: memories[0],
    memories,
    settings,
    hookPlan: normalizeHookPlan(hookPlan),
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
    renderHarnessSettings(context.settings),
    renderHarnessHooks(context.hookPlan),
    renderDocuments("独立子代理", context.agents),
    renderDocuments("执行清单", context.artifacts),
    context.memories.length ? renderDocuments("项目记忆", context.memories) : context.memory ? renderDocuments("项目记忆", [context.memory]) : ""
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

export async function recordHarnessLesson(cwd: string, input: HarnessLessonInput): Promise<HarnessLessonResult> {
  const normalized = normalizeLessonInput(input);
  const entry = renderHarnessLesson(normalized);
  const absolutePath = join(cwd, LESSONS_FILE);
  await mkdir(dirname(absolutePath), { recursive: true });

  return withLessonFileLock(absolutePath, async () => {
    await ensureLessonFile(absolutePath);
    const existing = await readFile(absolutePath, "utf8");
    const fingerprint = lessonFingerprint(normalized);
    if (existing.includes(fingerprint)) {
      return {
        path: LESSONS_FILE,
        written: false,
        entry,
        message: "这条经验之前已经记录过，后续任务会继续使用。"
      };
    }

    await appendFile(absolutePath, `\n${fingerprint}\n${entry}\n`, "utf8");

    return {
      path: LESSONS_FILE,
      written: true,
      entry,
      message: "已把这条经验写入项目记忆，后续任务会先读取它。"
    };
  });
}

export function renderHarnessMethod(): string {
  return [
    "驾驭方法：把智能体当成“模型 + 外部支架”。",
    "在 ccli 里，这套方法落成四层：",
    "1. 上下文：项目指南、产品规则、设计契约和任务清单，让系统每次先知道边界。",
    "2. 权限：便宜、可撤回的动作自动执行；昂贵、不可逆、发布、密钥和生产动作必须中文确认。",
    "3. 反馈：开发后自动验证，失败摘要先回到开发代理修复，再交给独立审查代理复核。",
    "4. 记忆：每个阶段写进度，踩坑写经验；下一轮先读取，不从零猜。",
    "",
    "落地原则：长期事实保持短小，反复流程沉淀为技能，必须执行或必须阻止的动作交给确定性护栏，研究和审查交给独立角色，循环自动化最后再上。",
    "上下文瘦身原则：每次都要读的只放稳定事实；多步流程放技能；安全禁区放规则；临时进度放记忆。",
    "14 步路线可以压缩为一个顺序：先让一次人工触发的任务稳定，再补项目指南、权限档案、审查子代理、技能、钩子和记忆，最后再考虑循环自动跑。",
    "普通用户只需要说：补齐驾驭系统。ccli 会把这些支架放进项目里，并用中文告诉你还缺什么。",
    "如果某次结果踩坑，只需要说：以后不要再这样。ccli 会把它沉淀成下一轮可用的项目经验。"
  ].join("\n");
}

export function analyzeHarnessContextHygiene(context: HarnessContext): HarnessContextHygieneReport {
  const checks = context.standingFacts.map((document) => analyzeStandingFactDocument(document));
  const totalSize = checks.reduce((sum, check) => sum + check.size, 0);
  const hasBloatedDocument = checks.some((check) => check.status === "bloated");
  const hasWatchDocument = checks.some((check) => check.status === "watch");
  const totalBloated = totalSize > STANDING_FACT_TOTAL_MAX_CHARS;
  const status: HarnessContextHygieneStatus =
    checks.length === 0 ? "watch" : hasBloatedDocument || totalBloated ? "bloated" : hasWatchDocument ? "watch" : "healthy";

  const nextSteps = contextHygieneNextSteps({ checks, status, totalBloated });

  return {
    status,
    summary:
      status === "healthy"
        ? "长期事实保持短小，适合每次开工自动读取。"
        : status === "watch"
          ? "长期事实可以使用，但建议把流程性内容继续拆到技能或规则里。"
          : "长期事实已经偏重，会让模型每次开工都背上太多无关内容。",
    totalSize,
    recommendedMaxPerDocument: STANDING_FACT_DOCUMENT_MAX_CHARS,
    recommendedMaxTotal: STANDING_FACT_TOTAL_MAX_CHARS,
    checks,
    nextSteps
  };
}

export function renderHarnessContextHygiene(report: HarnessContextHygieneReport): string {
  const statusText: Record<HarnessContextHygieneStatus, string> = {
    healthy: "健康",
    watch: "需要留意",
    bloated: "需要瘦身"
  };
  const checkText = report.checks.length
    ? report.checks
        .map(
          (check, index) =>
            `${index + 1}. ${statusText[check.status]}｜${check.title}：${check.issue} 建议：${check.recommendation}`
        )
        .join("\n")
    : "还没有长期事实。";

  return [
    `长期上下文检查：${statusText[report.status]}。`,
    report.summary,
    `当前长期事实约 ${report.totalSize} 字。建议单份不超过 ${report.recommendedMaxPerDocument} 字，总量不超过 ${report.recommendedMaxTotal} 字。`,
    "检查结果：",
    checkText,
    report.nextSteps.length ? `建议下一步：\n${report.nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function analyzeHarnessPlaybook(context: HarnessContext, progress?: HarnessProgress): HarnessPlaybookReport {
  const readiness = analyzeHarnessReadiness(context, progress);
  const hasFacts = context.standingFacts.length > 0;
  const hasRules = context.rules.length >= 2;
  const hasStartupChecklist = context.artifacts.some((document) => document.path.endsWith("init-check.json"));
  const hasPermissions = Boolean(
    context.settings?.permissions?.autoApprove?.length &&
      context.settings.permissions.confirm?.length &&
      context.settings.permissions.deny?.length
  );
  const hasBlockingHook = Boolean(context.hookPlan?.hooks.some((hook) => hook.blocks));
  const hasQualityHook = Boolean(context.hookPlan?.hooks.some((hook) => hook.id === "quality-feedback"));
  const hasReviewHook = Boolean(context.hookPlan?.hooks.some((hook) => hook.id === "review-before-ship"));
  const hasMemoryHook = Boolean(context.hookPlan?.hooks.some((hook) => hook.id === "session-memory-writer"));
  const hasReviewer = context.agents.some((agent) => agent.path.endsWith("reviewer.md"));
  const hasEvaluator = context.agents.some((agent) => agent.path.endsWith("eval-runner.md"));
  const hasSkills = context.skills.length > 0;
  const hasMemory = context.memories.length > 0 || Boolean(context.memory) || Boolean(progress);
  const hasLessons = context.memories.some((document) => document.path === LESSONS_FILE);
  const hasCompactToolBudget = context.toolBudget.length >= 7 && context.toolBudget.every((budget) => budget.allowedTools.length <= 3);

  const steps: HarnessPlaybookStep[] = [
    playbookStep(
      "开工前先定边界",
      hasFacts && hasRules && hasStartupChecklist,
      "系统不用每次重新猜项目目标、表达方式和安全底线。",
      "先确认一个最重要的用户结果，再读取项目事实、产品规则和开工检查。",
      "补齐项目指南、产品规则和开工检查。"
    ),
    playbookStep(
      "每个阶段只给少量工具",
      hasCompactToolBudget,
      "模型更少分心，知道当前只该了解、计划、实现、验证或审查。",
      "了解阶段只读，开发阶段小范围改，验证阶段只检查结果，交付阶段只准备审查入口。",
      "把阶段工具收敛到少数必要动作。"
    ),
    playbookStep(
      "高影响动作先被护栏拦住",
      hasPermissions && hasBlockingHook,
      "删除、密钥、发布、生产和主线覆盖不会靠模型自觉判断。",
      "低风险动作自动推进；影响大、不可逆或远程动作先停下来，用中文说明影响后再让用户决定。",
      "补齐权限档案和危险动作护栏。"
    ),
    playbookStep(
      "验证失败先回流修复",
      hasQualityHook && hasEvaluator,
      "失败不会直接扔给普通用户，而是变成开发代理能处理的反馈。",
      "改动后先验证；失败时整理影响和最可能原因，最多先做一次最小修复，再重新验证。",
      "补齐验证执行角色和改动后质量反馈。"
    ),
    playbookStep(
      "交付前独立复核",
      hasReviewer && hasReviewHook,
      "开发和评估分开，减少自己证明自己正确。",
      "保存或交付前让独立角色检查用户目标、验证结果、风险和未覆盖项。",
      "补齐独立审查角色和交付前复核护栏。"
    ),
    playbookStep(
      "结束前写下现场",
      hasMemory && hasMemoryHook,
      "上下文断了也能接着做，不需要用户重新解释全过程。",
      "每次任务结束或中断前记录当前阶段、已确认事实、验证状态和下一步。",
      "补齐会话结束记忆写入，并完成一次任务进度落盘。"
    ),
    playbookStep(
      "把踩坑变成下一轮检查",
      hasLessons && hasSkills,
      "同类问题下次会先被提醒，不再只靠模型记性。",
      "用户说以后不要再这样时先写入经验；反复有效的经验再沉淀成通用技能。",
      "补齐失败经验库和至少一个可复用技能。"
    )
  ];

  const gaps = steps.filter((step) => step.status === "needs-work");
  const summary =
    gaps.length === 0
      ? "当前项目已经具备一套可执行的驾驭剧本，可以承接较长任务。"
      : readiness.level === "usable"
        ? "当前项目可以使用驾驭方法，但还需要补齐若干环节才能稳定跑长任务。"
        : "当前项目还在打基础，建议先把支架补齐，再交给模型做复杂任务。";
  const focus = gaps[0] ? `${gaps[0].title}：${gaps[0].missingAction}` : "先用一次真实任务跑完整闭环，再把有效做法复用到下一个项目。";
  const loopReadiness =
    readiness.level === "strong" && gaps.length <= 1
      ? "可以考虑小范围定时检查，但仍应让独立复核决定是否完成。"
      : "暂时不要上自动循环；先让一次人工触发的任务稳定通过验证和复核。";

  return {
    summary,
    focus,
    loopReadiness,
    steps
  };
}

export function renderHarnessPlaybook(report: HarnessPlaybookReport): string {
  const statusText: Record<HarnessPlaybookStatus, string> = {
    ready: "已就绪",
    "needs-work": "先补齐"
  };
  return [
    `驾驭实操剧本：${report.summary}`,
    `当前重点：${report.focus}`,
    `自动循环判断：${report.loopReadiness}`,
    "今天这样使用：",
    ...report.steps.map((step, index) =>
      [
        `${index + 1}. ${statusText[step.status]}｜${step.title}：${step.userValue}`,
        `做法：${step.howToUse}`,
        step.status === "needs-work" ? `先补：${step.missingAction}` : ""
      ]
        .filter(Boolean)
        .join(" ")
    )
  ].join("\n");
}

export function analyzeHarnessRoadmap(context: HarnessContext, progress?: HarnessProgress): HarnessRoadmapReport {
  const contextHygiene = analyzeHarnessContextHygiene(context);
  const hasHarnessFolder = Boolean(
    context.rules.length || context.skills.length || context.artifacts.length || context.agents.length || context.settings || context.hookPlan
  );
  const hasHarnessGuide = context.standingFacts.some((document) => document.path === ".ccli/harness/README.md");
  const hasPermissions = Boolean(
    context.settings?.permissions?.autoApprove?.length &&
      context.settings.permissions.confirm?.length &&
      context.settings.permissions.deny?.length
  );
  const hasReviewer = context.agents.some((agent) => agent.path.endsWith("reviewer.md"));
  const hasEvaluator = context.agents.some((agent) => agent.path.endsWith("eval-runner.md"));
  const hasBlockingHook = Boolean(context.hookPlan?.hooks.some((hook) => hook.blocks));
  const hasQualityHook = Boolean(context.hookPlan?.hooks.some((hook) => hook.id === "quality-feedback"));
  const hasMemory = context.memories.length > 0 || Boolean(context.memory) || Boolean(progress);
  const hasLessons = context.memories.some((document) => document.path === LESSONS_FILE);
  const compactStandingFacts = context.standingFacts.length > 0 && contextHygiene.status === "healthy";
  const canShareHarness = Boolean(
    context.rules.length >= 2 &&
      context.skills.length > 0 &&
      context.settings &&
      context.hookPlan?.hooks.length &&
      hasReviewer &&
      hasMemory
  );

  const steps: HarnessRoadmapStep[] = [
    roadmapStep(1, "foundation", "先定义单个智能体的运行环境", "让系统知道自己能想什么、能做什么、不能做什么。", true, "保持每次任务只推进一个明确目标。"),
    roadmapStep(2, "foundation", "把支架集中在项目里", "别人接手时能一眼看懂项目规则、技能、护栏和记忆。", hasHarnessFolder, "直接说：补齐驾驭系统。"),
    roadmapStep(3, "foundation", "分清支架、循环和长期系统", "先让一次人工触发的任务稳定，再考虑自动循环。", hasHarnessGuide, "先补一份项目支架说明，避免把流程规则塞进临时对话。"),
    roadmapStep(4, "foundation", "摆脱空白默认配置", "不要每次让模型重新猜项目边界。", Boolean(context.settings || context.rules.length), "固定项目规则、权限和验证入口。"),
    roadmapStep(5, "foundation", "保持长期事实短小", "每次开工只读取稳定事实，不把长流程都塞进上下文。", compactStandingFacts, "把流程步骤放进技能，把项目事实保留得更短。"),
    roadmapStep(6, "control", "固定权限档案", "低风险动作自动走，高影响动作必须中文确认。", hasPermissions, "直接说：补齐权限护栏。"),
    roadmapStep(7, "control", "让独立审查代理接住结果", "开发和审查分开，减少自己证明自己正确。", hasReviewer, "补齐独立审查角色，让它只看目标、风险和验证结果。"),
    roadmapStep(8, "control", "把常用流程沉淀为技能", "反复出现的做法不用每次重新解释。", context.skills.length > 0, "把前端设计、验收检查和业务追问沉淀成可复用技能。"),
    roadmapStep(9, "control", "用确定性规则拦截风险", "危险动作由系统规则挡住，不靠模型自觉。", hasBlockingHook && hasQualityHook, "补齐危险动作拦截和改动后验证反馈。"),
    roadmapStep(10, "compound", "先稳定人工触发，再进入循环", "循环只能放大已有支架，不能替代支架。", Boolean(progress), "先完成一次从理解、开发、验证到审查的闭环，并写入进度。"),
    roadmapStep(11, "compound", "让复杂任务按小队协作", "研究、开发、验证、审查分别处理，主线不被噪音污染。", hasReviewer && hasEvaluator && context.skills.length > 0, "补齐验证执行角色，再把复杂任务拆给不同角色。"),
    roadmapStep(12, "compound", "把状态落到本地记忆", "中断后能继续，不需要用户重新解释一遍。", hasMemory, "每次任务结束前写清当前阶段、已确认事实和下一步。"),
    roadmapStep(13, "compound", "把踩坑变成下一轮输入", "同类问题以后先被检查，而不是反复犯。", hasLessons, "直接说：记住这次经验，以后不要再这样。"),
    roadmapStep(14, "compound", "把有效支架打包复用", "一个项目跑稳后，新项目可以继承同样的规则和护栏。", canShareHarness, "等规则、技能、权限、审查和记忆都稳定后，再作为团队默认支架复用。")
  ];
  const readyCount = steps.filter((step) => step.status === "ready").length;
  const nextCount = steps.filter((step) => step.status === "next").length;
  const laterCount = steps.filter((step) => step.status === "later").length;
  const summary =
    readyCount >= 11
      ? "这套驾驭系统已经进入可复用阶段，可以承接较长的自动开发任务。"
      : readyCount >= 7
        ? "这套驾驭系统已经可用，下一步应补记忆、技能和更清晰的审查闭环。"
        : "这套驾驭系统还在打基础，先补规则、权限、审查和记忆，再让模型跑复杂任务。";

  return {
    readyCount,
    nextCount,
    laterCount,
    summary,
    nextSteps: steps.filter((step) => step.status === "next").slice(0, 3).map((step) => `${step.title}：${step.nextAction}`),
    steps
  };
}

export function renderHarnessRoadmap(report: HarnessRoadmapReport): string {
  const tierText: Record<HarnessRoadmapTier, string> = {
    foundation: "基础层",
    control: "控制层",
    compound: "复利层"
  };
  const statusText: Record<HarnessRoadmapStatus, string> = {
    ready: "已具备",
    next: "先补",
    later: "稍后"
  };
  const lines = report.steps.map(
    (step) =>
      `${String(step.number).padStart(2, "0")}. ${statusText[step.status]}｜${tierText[step.tier]}｜${step.title}：${step.userValue} 下一步：${step.nextAction}`
  );

  return [
    `驾驭路线图：14 步中已有 ${report.readyCount} 步具备，${report.nextCount} 步建议优先补齐，${report.laterCount} 步适合后续完善。`,
    report.summary,
    report.nextSteps.length ? `当前最该做：\n${report.nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : "",
    "完整路线：",
    ...lines
  ]
    .filter(Boolean)
    .join("\n");
}

export function analyzeHarnessLoopReadiness(context: HarnessContext, progress?: HarnessProgress): HarnessLoopReadinessReport {
  const hasFactsAndRules = Boolean(context.standingFacts.length && context.rules.length >= 2);
  const hasStartupChecklist = context.artifacts.some((document) => document.path.endsWith("init-check.json"));
  const hasLoopGate = context.artifacts.some((document) => document.path.endsWith("loop-gate.json"));
  const hasPermissions = Boolean(
    context.settings?.permissions?.autoApprove?.length &&
      context.settings.permissions.confirm?.length &&
      context.settings.permissions.deny?.length
  );
  const hasBlockingHook = Boolean(context.hookPlan?.hooks.some((hook) => hook.blocks && hook.when === "before-tool"));
  const hasQualityFeedback = Boolean(
    context.hookPlan?.hooks.some((hook) => hook.id === "quality-feedback") &&
      context.agents.some((agent) => agent.path.endsWith("eval-runner.md"))
  );
  const hasIndependentReview = Boolean(
    context.hookPlan?.hooks.some((hook) => hook.id === "review-before-ship") &&
      context.agents.some((agent) => agent.path.endsWith("reviewer.md"))
  );
  const hasMemory = Boolean(context.memories.length || context.memory || progress);
  const hasLessonsAndSkills = Boolean(context.memories.some((document) => document.path === LESSONS_FILE) && context.skills.length);
  const hasPassedRecentRun = progress?.validation === "passed" && ["validate", "review", "save", "ship"].includes(progress.currentStage);

  const checks: HarnessLoopCheck[] = [
    loopCheck(
      "开工边界清楚",
      hasFactsAndRules && hasStartupChecklist,
      true,
      "循环开始前不用重新猜项目目标、产品表达和安全底线。",
      "先补项目指南、产品规则、安全规则和开工检查。"
    ),
    loopCheck(
      "循环闸门明确",
      hasLoopGate,
      true,
      "自动跑之前先知道什么能做、什么必须停、谁来判断完成。",
      "补一份自动循环闸门，写清范围、停止条件和交付前检查。"
    ),
    loopCheck(
      "权限和危险动作护栏已固定",
      hasPermissions && hasBlockingHook,
      true,
      "删除、密钥、生产、发布和主线覆盖不会靠模型自觉。",
      "补齐权限档案和执行前危险动作拦截。"
    ),
    loopCheck(
      "验证失败能回流",
      hasQualityFeedback,
      true,
      "失败会先变成开发代理能修复的反馈，而不是直接扩大循环。",
      "补齐验证执行角色和改动后质量反馈。"
    ),
    loopCheck(
      "完成判断独立于开发代理",
      hasIndependentReview,
      true,
      "不是让同一个开发代理自己宣布完成，而是由独立复核接住结果。",
      "补齐独立审查角色和交付前复核规则。"
    ),
    loopCheck(
      "现场能跨会话延续",
      hasMemory,
      true,
      "上下文断了也能读回进度、事实和下一步。",
      "先完成一次进度落盘，或补齐项目状态记忆。"
    ),
    loopCheck(
      "踩坑能沉淀成下一轮输入",
      hasLessonsAndSkills,
      false,
      "循环每跑一轮都能把经验写回规则或技能，越跑越稳。",
      "补齐失败经验库，并至少保留一个可复用技能。"
    ),
    loopCheck(
      "最近已有通过验证的完整闭环",
      hasPassedRecentRun,
      false,
      "自动循环不是从空白开始，而是复用已经跑通的一次人工任务。",
      "先人工触发完成一次开发、验证和审查，并写入通过状态。"
    )
  ];

  const requiredMissing = checks.filter((check) => check.required && !check.ready);
  const optionalMissing = checks.filter((check) => !check.required && !check.ready);
  const level: HarnessLoopReadinessLevel =
    requiredMissing.length === 0 && hasPassedRecentRun
      ? "ready"
      : requiredMissing.length <= 2 && hasFactsAndRules && hasPermissions && hasBlockingHook
        ? "manual-only"
        : "blocked";
  const canRunUnattended = level === "ready";

  return {
    level,
    canRunUnattended,
    summary:
      level === "ready"
        ? "可以小范围开启自动巡检，但交付、合并、发布和生产动作仍必须保留硬护栏。"
        : level === "manual-only"
          ? "可以继续人工触发的自动开发；暂时不建议无人值守循环。"
          : "暂不适合自动循环，先把支架补齐，否则只会更快放大错误。",
    safeScope:
      level === "ready"
        ? "适合低风险维护：检查失败、整理小修复、生成审查草稿、更新进度和经验。"
        : level === "manual-only"
          ? "只适合由用户明确触发一次任务，再按理解、实现、验证、审查推进。"
          : "先不进入循环，只做支架初始化、规则补齐和一次人工闭环。",
    cadence:
      level === "ready"
        ? "建议 30 到 60 分钟一次，并设置明确停止条件。"
        : level === "manual-only"
          ? "由用户每次手动触发，不定时自动跑。"
          : "不启用自动节奏。",
    stopCondition: "验证通过、独立审查通过、没有高影响动作等待确认，才算一轮完成。",
    hardStops: ["删除大量内容", "密钥或敏感配置", "生产或数据库操作", "发布或部署", "直接改动主线", "验证失败后连续修复仍失败", "独立审查不通过"],
    nextSteps: [...requiredMissing, ...optionalMissing].slice(0, 3).map((check) => check.missingAction),
    checks
  };
}

export function renderHarnessLoopReadiness(report: HarnessLoopReadinessReport): string {
  const levelText: Record<HarnessLoopReadinessLevel, string> = {
    ready: "可以小范围自动循环",
    "manual-only": "只建议人工触发",
    blocked: "暂不适合自动循环"
  };
  const readyChecks = report.checks.filter((check) => check.ready).map((check) => check.name);
  const missingChecks = report.checks.filter((check) => !check.ready).map((check) => check.name);

  return [
    `自动循环就绪：${levelText[report.level]}。`,
    report.summary,
    `适合范围：${report.safeScope}`,
    `运行节奏：${report.cadence}`,
    `完成标准：${report.stopCondition}`,
    `必须停下来的情况：${report.hardStops.join("、")}。`,
    readyChecks.length ? `已具备：${readyChecks.join("、")}。` : "",
    missingChecks.length ? `还要补齐：${missingChecks.join("、")}。` : "",
    report.nextSteps.length ? `建议下一步：\n${report.nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function analyzeHarnessScan(context: HarnessContext, progress?: HarnessProgress): HarnessScanReport {
  const documents = [
    ...context.standingFacts,
    ...context.rules,
    ...context.skills,
    ...context.artifacts,
    ...context.agents,
    ...context.memories
  ];
  const secretDocuments = documents.filter((document) => hasHarnessSecretSignal(document.content));
  const autoApprove = context.settings?.permissions?.autoApprove ?? [];
  const confirm = context.settings?.permissions?.confirm ?? [];
  const deny = context.settings?.permissions?.deny ?? [];
  const overbroadAutoApprove = autoApprove.filter((item) => OVERBROAD_AUTO_PERMISSION.test(item));
  const hasBeforeToolBlock = Boolean(context.hookPlan?.hooks.some((hook) => hook.when === "before-tool" && hook.blocks));
  const hasReviewGate = Boolean(context.hookPlan?.hooks.some((hook) => hook.id === "review-before-ship" && hook.blocks));
  const loopReadiness = analyzeHarnessLoopReadiness(context, progress);
  const contextHygiene = analyzeHarnessContextHygiene(context);

  const findings: HarnessScanFinding[] = [
    secretDocuments.length
      ? scanFinding(
          "敏感信息",
          "risk",
          `发现 ${secretDocuments.length} 处疑似授权信息。`,
          "如果把这套支架分享给别人，可能把账号、模型或代码平台权限一起带出去。",
          "先移除敏感内容，只保留环境变量名称或中文说明。",
          `疑似敏感文件：${secretDocuments.map((document) => document.path).join("、")}`
        )
      : scanFinding("敏感信息", "pass", "没有在支架内容里发现明显授权串。", "支架更适合复制到新项目。", "继续把密钥放在系统环境或全局配置里。"),
    overbroadAutoApprove.length
      ? scanFinding(
          "自动权限",
          "risk",
          "自动执行范围里混入了高影响动作。",
          "模型可能在用户没理解影响前执行删除、推送、发布或生产类动作。",
          "把这些动作移到中文确认或默认禁止里。",
          `过宽自动权限：${overbroadAutoApprove.join("、")}`
        )
      : scanFinding("自动权限", "pass", "自动执行范围没有发现明显高影响动作。", "普通任务可以少打断，高风险动作仍可被拦住。", "继续保持低风险自动、高影响确认。"),
    confirm.length && deny.length
      ? scanFinding("确认和禁止清单", "pass", "已经区分必须确认和默认禁止的动作。", "普通用户不需要理解技术命令，也能先看到影响说明。", "继续把不可逆动作留在确认或禁止清单。")
      : scanFinding("确认和禁止清单", "watch", "确认或禁止清单不完整。", "高影响动作容易回到临场判断，长任务会不稳定。", "补齐删除、密钥、数据库、发布、生产、推送和合并类护栏。"),
    hasBeforeToolBlock
      ? scanFinding("执行前硬护栏", "pass", "危险动作会在执行前被确定性检查。", "删除、密钥、远程脚本和生产动作不只靠模型自觉。", "继续保留执行前拦截。")
      : scanFinding("执行前硬护栏", "risk", "缺少执行前阻断护栏。", "模型即使理解错规则，也可能先执行再补救。", "补齐危险动作拦截钩子。"),
    hasReviewGate
      ? scanFinding("交付前复核", "pass", "交付前已经要求独立复核。", "开发和评估分开，减少自己证明自己正确。", "继续让审查代理检查目标、验证和风险。")
      : scanFinding("交付前复核", "watch", "交付前复核护栏还不完整。", "结果可能由开发代理自己宣布完成。", "补齐交付前独立审查。"),
    loopReadiness.canRunUnattended
      ? scanFinding("自动循环", "pass", "自动循环具备小范围使用条件。", "可以用于低风险巡检，但交付和生产仍要确认。", "先从低风险维护循环开始。")
      : scanFinding("自动循环", "watch", "暂不建议无人值守循环。", "循环会放大现有支架缺口。", loopReadiness.nextSteps[0] ?? "先让一次人工触发任务稳定通过。"),
    contextHygiene.status === "bloated"
      ? scanFinding("上下文体积", "watch", "长期上下文偏重。", "模型每次开工都会背上过多无关信息，成本和跑偏概率都会变高。", "把流程拆到技能，把禁区拆到规则，只保留稳定事实。")
      : scanFinding("上下文体积", "pass", "长期上下文没有明显过载。", "每次开工更容易聚焦当前任务。", "继续保持事实短小，流程放技能。")
  ];

  const riskCount = findings.filter((finding) => finding.severity === "risk").length;
  const watchCount = findings.filter((finding) => finding.severity === "watch").length;
  const nextSteps = findings
    .filter((finding) => finding.severity !== "pass")
    .map((finding) => finding.nextAction)
    .slice(0, 3);

  return {
    safeToShare: riskCount === 0,
    summary:
      riskCount > 0
        ? "这套支架还不适合共享或放进自动循环，先处理高风险项。"
        : watchCount > 0
          ? "这套支架没有发现必须阻止共享的风险，但仍有几项建议先收紧。"
          : "这套支架没有发现明显共享风险，可以作为项目默认支架继续使用。",
    riskCount,
    watchCount,
    findings,
    nextSteps
  };
}

export function renderHarnessScan(report: HarnessScanReport): string {
  const severityText: Record<HarnessScanSeverity, string> = {
    pass: "通过",
    watch: "留意",
    risk: "风险"
  };
  const lines = report.findings.map(
    (finding, index) =>
      `${index + 1}. ${severityText[finding.severity]}｜${finding.name}：${finding.issue} 影响：${finding.impact} 建议：${finding.nextAction}`
  );

  return [
    `支架共享扫描：${report.safeToShare ? "没有发现必须阻止共享的风险" : "发现必须先处理的风险"}。`,
    report.summary,
    `风险项 ${report.riskCount} 个，需要留意 ${report.watchCount} 个。`,
    "检查结果：",
    ...lines,
    report.nextSteps.length ? `建议下一步：\n${report.nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
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
  const contextHygiene = analyzeHarnessContextHygiene(context);
  const items: HarnessReadinessItem[] = [
    {
      name: "确定性项目指南",
      ready: context.standingFacts.length > 0,
      impact: "模型每次都能先看到稳定边界，减少跑偏。",
      nextAction: "补一份项目指南，写清楚目标用户、禁止事项和常用验证方式。"
    },
    {
      name: "长期上下文瘦身",
      ready: contextHygiene.status === "healthy",
      impact: "长期事实保持短小，流程放进技能和规则，模型每次开工更稳定。",
      nextAction: contextHygiene.nextSteps[0] ?? "把流程步骤移到技能，把安全底线移到规则，长期事实只保留每次必读内容。"
    },
    {
      name: "安全和产品规则",
      ready: context.rules.length >= 2,
      impact: "高风险动作会被规则提前拦住，普通用户也能看懂影响。",
      nextAction: "补齐安全规则和产品表达规则，尤其是删除、密钥、发布和生产操作。"
    },
    {
      name: "权限档案",
      ready: Boolean(
        context.settings?.permissions?.autoApprove?.length &&
          context.settings.permissions.confirm?.length &&
          context.settings.permissions.deny?.length
      ),
      impact: "可自动执行和必须确认的动作被固定下来，减少每次临场判断。",
      nextAction: "直接说：补齐驾驭系统，让系统生成权限档案，区分自动、确认和禁止动作。"
    },
    {
      name: "确定性钩子计划",
      ready: Boolean(context.hookPlan?.hooks.some((hook) => hook.blocks) && context.hookPlan.hooks.length >= 2),
      impact: "危险动作、改动后验证和会话结束记忆会走确定规则，不依赖模型自觉。",
      nextAction: "直接说：补齐驾驭系统，让系统生成危险动作拦截、质量反馈和记忆写入钩子计划。"
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
      ready: context.toolBudget.some((budget) => budget.stage === "review") && context.agents.some((agent) => agent.path.endsWith("reviewer.md")),
      impact: "实现和评估分开，减少开发代理自我确认带来的盲区。",
      nextAction: "保留独立审查阶段，并补一份独立审查代理说明。"
    },
    {
      name: "可复用技能",
      ready: context.skills.length > 0,
      impact: "常见场景可以复用成稳定做法，不用每次重新解释。",
      nextAction: "为前端设计、验收检查或业务流程补充至少一个技能文件。"
    },
    {
      name: "结构化任务清单",
      ready: context.artifacts.some((document) => document.path.endsWith("feature-list.json")),
      impact: "长任务会按一个明确任务推进，降低一次做太多导致跑偏的概率。",
      nextAction: "直接说：补齐驾驭系统，让系统生成结构化任务清单。"
    },
    {
      name: "开工基线检查",
      ready: context.artifacts.some((document) => document.path.endsWith("init-check.json")),
      impact: "每次开工前先确认当前状态，避免在已经坏掉的项目上继续叠加新功能。",
      nextAction: "直接说：补齐驾驭系统，让系统生成开工检查清单。"
    },
    {
      name: "长期项目记忆",
      ready: context.memories.length > 0 || Boolean(context.memory),
      impact: "跨会话能记住项目事实，长任务不完全依赖模型上下文。",
      nextAction: "沉淀一份项目状态，记录已确认事实、当前阶段和下次接手重点。"
    },
    {
      name: "失败经验库",
      ready: context.memories.some((document) => document.path === LESSONS_FILE),
      impact: "已经发生过的问题会变成下次任务前的输入，减少同类错误反复出现。",
      nextAction: "直接说：记住这次经验，例如“以后页面按钮必须在手机上也清楚”。"
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

function analyzeStandingFactDocument(document: HarnessDocument): HarnessContextDocumentCheck {
  const size = document.content.length;
  const signalCount = countProcedureSignals(document.content);
  const tooLarge = size > STANDING_FACT_DOCUMENT_MAX_CHARS;
  const procedureHeavy = signalCount >= 5 || (signalCount >= 3 && size > 1200);
  const status: HarnessContextHygieneStatus = tooLarge ? "bloated" : procedureHeavy ? "watch" : "healthy";

  return {
    title: standingFactDisplayTitle(document.path, document.title),
    status,
    size,
    issue: tooLarge
      ? "内容太长，已经不适合每次完整读取。"
      : procedureHeavy
        ? "里面混入了较多流程步骤，容易把长期事实变成操作手册。"
        : "长度和内容都适合做长期事实。",
    recommendation: tooLarge
      ? "只保留稳定事实，把流程拆到技能，把强制要求放到规则。"
      : procedureHeavy
        ? "保留每次必读事实，把多步做法拆成可复用技能。"
        : "继续保持短小，新增流程时优先放进技能。"
  };
}

function countProcedureSignals(content: string): number {
  const matches = [
    content.match(/(^|\n)\s*\d+[.、]/g)?.length ?? 0,
    content.match(/固定流程|操作步骤|执行步骤|检查清单|发布流程|合并流程|交付流程/g)?.length ?? 0,
    content.match(/运行命令|执行命令|代码块|错误堆栈|原始日志/g)?.length ?? 0,
    content.match(/先[^。\n；;]{0,80}(?:再|然后|最后)/g)?.length ?? 0
  ];
  return matches.reduce((sum, count) => sum + count, 0);
}

function standingFactDisplayTitle(path: string, fallback: string): string {
  const titles: Record<string, string> = {
    "AGENTS.md": "项目固定事实",
    "CLAUDE.md": "模型固定事实",
    "CCLI.md": "ccli 固定事实",
    ".ccli/harness/README.md": "驾驭说明"
  };
  return titles[path] ?? fallback;
}

function contextHygieneNextSteps(input: {
  checks: HarnessContextDocumentCheck[];
  status: HarnessContextHygieneStatus;
  totalBloated: boolean;
}): string[] {
  if (!input.checks.length) {
    return ["补一份短项目指南，只写目标用户、输出语言、安全底线和最重要的项目事实。"];
  }

  const steps: string[] = [];
  if (input.totalBloated) {
    steps.push("先压缩长期事实总量，只留下每次开工都必须知道的稳定事实。");
  }
  if (input.checks.some((check) => check.status === "bloated")) {
    steps.push("把长篇流程、发布说明和检查步骤移到技能或规则里，长期事实只保留短句。");
  }
  if (input.checks.some((check) => check.status === "watch")) {
    steps.push("把重复出现的多步做法沉淀为技能，避免每次开工都读完整流程。");
  }
  if (!steps.length && input.status === "healthy") {
    steps.push("继续保持长期事实短小；新增流程时优先写进技能，新增禁区时写进规则。");
  }
  return steps.slice(0, 3);
}

function roadmapStep(
  number: number,
  tier: HarnessRoadmapTier,
  title: string,
  userValue: string,
  ready: boolean,
  nextAction: string
): HarnessRoadmapStep {
  return {
    number,
    tier,
    title,
    status: ready ? "ready" : number <= 10 ? "next" : "later",
    userValue,
    nextAction
  };
}

function playbookStep(
  title: string,
  ready: boolean,
  userValue: string,
  howToUse: string,
  missingAction: string
): HarnessPlaybookStep {
  return {
    title,
    status: ready ? "ready" : "needs-work",
    userValue,
    howToUse,
    missingAction
  };
}

function loopCheck(
  name: string,
  ready: boolean,
  required: boolean,
  userValue: string,
  missingAction: string
): HarnessLoopCheck {
  return {
    name,
    ready,
    required,
    userValue,
    missingAction
  };
}

function scanFinding(
  name: string,
  severity: HarnessScanSeverity,
  issue: string,
  impact: string,
  nextAction: string,
  expertDetail?: string
): HarnessScanFinding {
  return {
    name,
    severity,
    issue,
    impact,
    nextAction,
    expertDetail
  };
}

function hasHarnessSecretSignal(content: string): boolean {
  return HARNESS_SECRET_VALUE.test(content) || HARNESS_SECRET_ASSIGNMENT.test(content);
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

export function renderHarnessProfile(context: HarnessContext): string {
  const permissions = context.settings?.permissions;
  const permissionText = permissions
    ? [
        permissions.autoApprove?.length ? `可自动执行 ${permissions.autoApprove.length} 类低风险动作` : "",
        permissions.confirm?.length ? `${permissions.confirm.length} 类高影响动作需要中文确认` : "",
        permissions.deny?.length ? `${permissions.deny.length} 类动作默认禁止` : ""
      ]
        .filter(Boolean)
        .join("，")
    : "还没有权限档案";
  const hookText = context.hookPlan?.hooks.length
    ? context.hookPlan.hooks.map((hook) => hook.description).join("；")
    : "还没有确定性钩子计划";
  const agentText = context.agents.length
    ? `已准备 ${context.agents.length} 个独立子代理说明`
    : "还没有独立子代理说明";

  return [`驾驭配置：${permissionText}。`, `确定规则：${hookText}。`, `独立复核：${agentText}。`].join("\n");
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

export function evaluateHarnessHooks(context: HarnessContext, input: HarnessHookEvaluationInput): HarnessHookEvaluation {
  const hooks = context.hookPlan?.hooks.filter((hook) => hook.when === input.when) ?? [];
  const findings = hooks.flatMap((hook) => evaluateHarnessHook(hook, input));
  const blocked = findings.some((finding) => finding.severity === "blocked" && finding.blocks);
  const blockingReasons = findings.filter((finding) => finding.severity === "blocked").map((finding) => finding.reason);

  return {
    when: input.when,
    action: input.action,
    blocked,
    findings,
    userMessage: blocked
      ? `这个后台动作已被驾驭系统阻止：${blockingReasons.join("、") || "风险过高"}。`
      : findings.length
        ? "驾驭系统已完成后台检查。"
        : "没有需要执行的驾驭钩子。"
  };
}

export function renderHarnessSummary(context: HarnessContext): string {
  const facts = context.standingFacts.length;
  const rules = context.rules.length;
  const skills = context.skills.length;
  const artifacts = context.artifacts.length;
  const agents = context.agents.length;
  const settings = context.settings ? "已加载权限档案" : "暂无权限档案";
  const hooks = context.hookPlan?.hooks.length ? `已加载 ${context.hookPlan.hooks.length} 个确定性钩子` : "暂无确定性钩子";
  const memory = context.memories.length ? `已接入 ${context.memories.length} 份项目记忆` : context.memory ? "已接入历史记忆" : "暂无历史记忆";
  return `驾驭系统已加载：${facts} 份长期事实、${rules} 份确定性规则、${skills} 个复用技能、${artifacts} 份执行清单、${agents} 个子代理说明，${settings}，${hooks}，${memory}。`;
}

function evaluateHarnessHook(hook: HarnessHook, input: HarnessHookEvaluationInput): HarnessHookFinding[] {
  if (hook.id === "dangerous-action-gate" || (hook.when === "before-tool" && hook.blocks)) {
    const reason = detectDangerousAction(input);
    return reason
      ? [
          {
            id: hook.id,
            description: hook.description,
            severity: hook.blocks ? "blocked" : "warning",
            reason,
            blocks: Boolean(hook.blocks)
          }
        ]
      : [];
  }

  if (hook.id === "quality-feedback" && input.when === "after-edit" && (input.target || input.changedFiles?.length)) {
    return [
      {
        id: hook.id,
        description: hook.description,
        severity: "info",
        reason: "项目内容已更新，后续需要进入验证反馈闭环。",
        blocks: false
      }
    ];
  }

  if (hook.id === "review-before-ship" && input.when === "after-validation") {
    if (input.action === "ship" && input.validation !== "passed") {
      return [
        {
          id: hook.id,
          description: hook.description,
          severity: hook.blocks ? "blocked" : "warning",
          reason: "自动验证还没有通过，不能准备团队交付。",
          blocks: Boolean(hook.blocks)
        }
      ];
    }

    return [
      {
        id: hook.id,
        description: hook.description,
        severity: input.validation === "failed" ? "warning" : "info",
        reason:
          input.validation === "failed"
            ? "自动验证没有通过，必须先说明影响并经过独立审查。"
            : "验证结束后需要经过独立审查再交付。",
        blocks: false
      }
    ];
  }

  if (hook.id === "session-memory-writer" && input.when === "session-end") {
    return [
      {
        id: hook.id,
        description: hook.description,
        severity: "info",
        reason: "会话结束前需要写入进度、事实和下一步。",
        blocks: false
      }
    ];
  }

  return [];
}

function detectDangerousAction(input: HarnessHookEvaluationInput): string | undefined {
  const command = input.command ?? "";
  const target = input.target ?? "";
  const combined = `${command}\n${target}`;

  if (SECRET_TARGET.test(target) || SECRET_COMMAND.test(command)) {
    return "涉及密钥或敏感配置";
  }
  if (DESTRUCTIVE_COMMAND.test(command)) {
    return "包含破坏性清理或历史覆盖动作";
  }
  if (REMOTE_SCRIPT.test(command)) {
    return "会执行来自网络的脚本";
  }
  if (DATABASE_COMMAND.test(command)) {
    return "可能改变数据库结构或生产数据";
  }
  if (PUBLISH_OR_DEPLOY_COMMAND.test(command)) {
    return "可能发布或部署到外部环境";
  }
  if (isMainBranchPush(command)) {
    return "可能直接改动主线或强制覆盖远程历史";
  }
  if (
    /\bproduction\b|\bprod\b|生产/.test(combined) &&
    /(delete|remove|drop|truncate|deploy|publish|release|清空|删除|发布|部署)/i.test(combined)
  ) {
    return "可能影响生产环境";
  }

  return undefined;
}

function isMainBranchPush(command: string): boolean {
  if (!/\bgit\s+push\b/i.test(command)) {
    return false;
  }
  if (FORCE_PUSH.test(command)) {
    return true;
  }

  const normalized = command.replace(/['"]/g, " ");
  return /\bgit\s+push\b[\s\S]*(?:^|\s)(?:origin\s+)?(?:main|master)(?:[\s;&|]|$)/i.test(normalized);
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

async function readJsonDocument<T>(cwd: string, relativePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(join(cwd, relativePath), "utf8")) as T;
  } catch {
    return undefined;
  }
}

function normalizeHookPlan(plan?: HarnessHookPlan): HarnessHookPlan | undefined {
  if (!plan?.hooks?.length) {
    return undefined;
  }
  const hooks = plan.hooks.filter(
    (hook): hook is HarnessHook =>
      Boolean(hook?.id && hook.description && ["before-tool", "after-edit", "after-validation", "session-end"].includes(hook.when))
  );
  return hooks.length ? { version: plan.version, hooks } : undefined;
}

function renderDocuments(title: string, documents: HarnessDocument[]): string {
  if (!documents.length) {
    return "";
  }
  const body = documents.map((document) => `【${document.title}】\n${document.content}`).join("\n\n");
  return `${title}：\n${body}`;
}

function renderHarnessSettings(settings?: HarnessSettings): string {
  if (!settings) {
    return "";
  }
  const permissions = settings.permissions;
  const sections = [
    settings.mode ? `运行模式：${settings.mode}` : "",
    settings.principle ? `权限原则：${settings.principle}` : "",
    permissions?.autoApprove?.length ? `自动允许：${permissions.autoApprove.join("、")}` : "",
    permissions?.confirm?.length ? `必须确认：${permissions.confirm.join("、")}` : "",
    permissions?.deny?.length ? `默认禁止：${permissions.deny.join("、")}` : "",
    settings.modelRoles ? `模型角色：${Object.entries(settings.modelRoles).map(([role, value]) => `${role}=${value}`).join("、")}` : ""
  ].filter(Boolean);
  return sections.length ? `权限档案：\n${sections.join("\n")}` : "";
}

function renderHarnessHooks(plan?: HarnessHookPlan): string {
  if (!plan?.hooks.length) {
    return "";
  }
  return `确定性钩子：\n${plan.hooks
    .map((hook) => `- ${hook.description}${hook.blocks ? "，可阻止高风险动作" : ""}`)
    .join("\n")}`;
}

function titleFromPath(relativePath: string): string {
  const fileName = relativePath.split("/").pop() ?? relativePath;
  return fileName.replace(/\.[^.]+$/, "");
}

function normalizeLessonInput(input: HarnessLessonInput): Required<HarnessLessonInput> {
  const symptom = cleanLessonText(input.symptom, "未说明的问题");
  const impact = cleanLessonText(input.impact, "这会影响用户对结果的判断。");
  const prevention = cleanLessonText(input.prevention, `以后遇到类似情况，先检查：${symptom}`);
  return {
    task: cleanLessonText(input.task ?? "通用经验", "通用经验"),
    stage: input.stage ?? "review",
    symptom,
    impact,
    prevention,
    source: cleanLessonText(input.source ?? "用户经验", "用户经验")
  };
}

function renderHarnessLesson(input: Required<HarnessLessonInput>): string {
  return [
    `## 经验：${input.symptom}`,
    "",
    `- 时间：${new Date().toISOString()}`,
    `- 任务：${input.task}`,
    `- 阶段：${stageLabel(input.stage)}`,
    `- 影响：${input.impact}`,
    `- 以后这样避免：${input.prevention}`,
    `- 来源：${input.source}`
  ].join("\n");
}

function lessonFingerprint(input: Required<HarnessLessonInput>): string {
  const hash = createHash("sha256")
    .update([input.task, input.stage, input.symptom, input.impact, input.prevention].join("\n"))
    .digest("hex")
    .slice(0, 12);
  return `<!-- ccli-lesson:${hash} -->`;
}

function cleanLessonText(value: string, fallback: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 500);
}

function stageLabel(stage: HarnessStage): string {
  const labels: Record<HarnessStage, string> = {
    inspect: "了解项目",
    plan: "整理方案",
    build: "实现功能",
    validate: "自动验证",
    review: "独立审查",
    save: "保存成果",
    ship: "准备交付"
  };
  return labels[stage];
}

async function ensureLessonFile(absolutePath: string): Promise<void> {
  try {
    await writeFile(absolutePath, "# 失败经验库\n\n这里记录已经发生过的问题，以及以后如何避免。\n", { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (!isFileExistsError(error)) {
      throw error;
    }
  }
}

async function withLessonFileLock<T>(absolutePath: string, callback: () => Promise<T>): Promise<T> {
  const lockPath = `${absolutePath}.lock`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(new Date().toISOString(), "utf8");
      return await callback();
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw error;
      }
      await delay(25 + attempt * 10);
    } finally {
      if (handle) {
        await handle.close();
        await unlink(lockPath).catch(() => undefined);
      }
    }
  }
  throw new Error("经验库正在写入，请稍后再试。");
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "EEXIST";
}

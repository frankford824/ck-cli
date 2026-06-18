export type InteractionSurface = "terminal" | "voice" | "hardware" | "remote";

export type ExperienceTone = "calm" | "asking" | "success" | "warning" | "blocked";

export type ExperienceActionKind = "utterance" | "command";

export interface ExperienceAction {
  id: string;
  label: string;
  kind: ExperienceActionKind;
  say?: string;
  command?: string;
  description?: string;
  requiresConfirmation?: boolean;
}

export interface ExperienceEvent {
  surface: InteractionSurface;
  tone: ExperienceTone;
  say: string;
  screen?: string;
  choices?: string[];
  actions?: ExperienceAction[];
  audit?: unknown;
}

export interface HardwareResponse<T = unknown> {
  protocol: "ccli-experience-protocol";
  version: 1;
  event: ExperienceEvent;
  data?: T;
}

export interface WelcomeCard {
  title: string;
  summary: string;
  nextActions: string[];
  examples: string[];
}

export interface StarterIdea {
  id: string;
  title: string;
  bestFor: string;
  outcome: string;
  say: string;
  firstCheck: string;
}

export interface NextAction {
  id: string;
  title: string;
  reason: string;
  say: string;
  command?: string;
}

export interface NextActionPlan {
  summary: string;
  actions: NextAction[];
}

export interface BossHomeTemplate {
  id: string;
  title: string;
  outcome: string;
  say: string;
}

export interface BossHome {
  title: string;
  summary: string;
  readiness: string;
  primary: NextAction;
  actions: NextAction[];
  templates: BossHomeTemplate[];
  ask: string;
}

export type HealthStatus = "ready" | "action-needed" | "optional";

export interface HealthCheckItem {
  name: string;
  status: HealthStatus;
  userMessage: string;
  fix?: string;
}

export interface HealthReport {
  summary: string;
  items: HealthCheckItem[];
}

export function welcomeCard(): WelcomeCard {
  return {
    title: "ccli 中文开发管家",
    summary: "你只需要说清楚想要的结果，ccli 负责规划、开发、验证、审查和交付。",
    nextActions: [
      "开箱首页：ccli home",
      "首次设置：ccli setup",
      "不知道下一步：ccli next",
      "最快体验：ccli go \"做一个客户管理系统\"",
      "不知道做什么：ccli ideas",
      "直接选模板：ccli ideas 3",
      "查看我的产品：ccli projects",
      "打开最近产品：ccli open",
      "直接说：ccli \"打开我上次做的系统\"",
      "一句话创建产品：ccli create \"做一个客户管理系统\"",
      "查看本地页面：ccli preview --install",
      "创建空项目：ccli new 我的应用",
      "改当前项目：ccli \"给订单页面增加导出按钮\"",
      "进入对话：ccli chat",
      "检查环境：ccli doctor"
    ],
    examples: [
      "做一个客户管理系统，能记录跟进和提醒",
      "下一步怎么办",
      "给我几个产品模板",
      "做第 3 个模板",
      "一键做一个门店预约系统并打开页面",
      "打开我上次做的系统",
      "把首页改得更像高端咨询公司",
      "给客户列表增加搜索和导出",
      "检查这个项目为什么不能正常启动",
      "我第一次用，怎么开始",
      "把本次改动自动审查并合并"
    ]
  };
}

export function renderWelcome(card: WelcomeCard = welcomeCard()): string {
  return [
    card.title,
    "",
    card.summary,
    "",
    "下一步可以这样说：",
    ...card.nextActions.map((action) => `- ${action}`),
    "",
    "你可以直接描述目标，例如：",
    ...card.examples.map((example) => `- ${example}`)
  ].join("\n");
}

export function starterIdeas(): StarterIdea[] {
  return [
    {
      id: "customer",
      title: "客户跟进系统",
      bestFor: "销售、门店、服务公司",
      outcome: "记录客户、跟进提醒、成交状态和老板优先事项。",
      say: "做一个客户管理系统，能记录跟进、提醒回访、老板能看高意向客户",
      firstCheck: "打开后先看是否能分清高意向、待跟进和已成交客户。"
    },
    {
      id: "booking",
      title: "预约排班系统",
      bestFor: "门店、美业、诊所、培训",
      outcome: "管理预约、待确认、改期和空闲时段。",
      say: "做一个门店预约系统，客户能选时间，老板能看今日预约和待确认",
      firstCheck: "打开后先看今日预约和待确认预约是否一眼能看懂。"
    },
    {
      id: "inventory",
      title: "库存预警看板",
      bestFor: "仓库、零售、电商、工厂",
      outcome: "查看库存、低库存、出库提醒和补货动作。",
      say: "做一个库存看板，能看低库存、今日出库和生成补货提醒",
      firstCheck: "打开后先看低库存和今日出库是否在首屏突出。"
    },
    {
      id: "orders",
      title: "订单发货工作台",
      bestFor: "电商、批发、售后团队",
      outcome: "跟踪订单、待发货、物流异常和售后处理。",
      say: "做一个订单发货工作台，老板能看待发货、物流异常和售后处理",
      firstCheck: "打开后先看待发货订单和异常订单是否能快速定位。"
    },
    {
      id: "finance",
      title: "老板收支看板",
      bestFor: "小公司、门店、项目制团队",
      outcome: "汇总收入、支出、待回款和现金流风险。",
      say: "做一个老板收支看板，能看本月收入、支出、待回款和现金流提醒",
      firstCheck: "打开后先看本月收入、待回款和风险提醒是否清楚。"
    },
    {
      id: "content",
      title: "内容发布管理",
      bestFor: "品牌、咨询公司、自媒体、市场团队",
      outcome: "管理选题、素材、审核和发布计划。",
      say: "做一个内容发布管理系统，能看待发布、待审核、素材和发布计划",
      firstCheck: "打开后先看待发布内容和审核状态是否清楚。"
    }
  ];
}

export function renderStarterIdeas(ideas: StarterIdea[] = starterIdeas()): string {
  const lines = ["可以先从这些常见产品开始：", ""];
  for (const [index, idea] of ideas.entries()) {
    lines.push(`${index + 1}. ${idea.title}`);
    lines.push(`适合：${idea.bestFor}`);
    lines.push(`结果：${idea.outcome}`);
    lines.push(`直接说：${idea.say}`);
    lines.push(`先验收：${idea.firstCheck}`);
    lines.push("");
  }
  lines.push("选好后，直接把“直接说”后面的那句话交给 ccli。");
  return lines.join("\n").trim();
}

export function renderNextActions(plan: NextActionPlan): string {
  const lines = [plan.summary, ""];
  for (const [index, action] of plan.actions.entries()) {
    lines.push(`${index + 1}. ${action.title}`);
    lines.push(`原因：${action.reason}`);
    lines.push(`直接说：${action.say}`);
    if (action.command) {
      lines.push(`也可以执行：${action.command}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function createBossHome(input: {
  health: HealthReport;
  nextPlan: NextActionPlan;
  ideas?: StarterIdea[];
}): BossHome {
  const actionNeeded = input.health.items.filter((item) => item.status === "action-needed").length;
  const ready = input.health.items.filter((item) => item.status === "ready").length;
  const ideas = input.ideas ?? starterIdeas();
  const primary = input.nextPlan.actions[0] ?? {
    id: "ideas",
    title: "从产品模板开始",
    reason: "当前还没有明确产品，选一个常见场景最快能看到首版。",
    say: "给我几个产品模板",
    command: "ccli ideas"
  };
  const readiness =
    actionNeeded > 0
      ? `还有 ${actionNeeded} 项准备工作会影响完整体验，但现在仍可以先创建产品。`
      : `当前已有 ${ready} 项能力就绪，可以直接开始。`;

  return {
    title: "老板开箱驾驶舱",
    summary: input.nextPlan.summary,
    readiness,
    primary,
    actions: input.nextPlan.actions.slice(0, 4),
    templates: ideas.slice(0, 3).map((idea) => ({
      id: idea.id,
      title: idea.title,
      outcome: idea.outcome,
      say: idea.say
    })),
    ask: "不知道怎么选，就直接说：下一步怎么办。"
  };
}

export function renderBossHome(home: BossHome): string {
  const lines = [
    home.title,
    "",
    `当前状态：${home.readiness}`,
    `建议：${home.summary}`,
    "",
    "现在最建议做：",
    `1. ${home.primary.title}`,
    `原因：${home.primary.reason}`,
    `直接说：${home.primary.say}`,
    ""
  ];

  if (home.actions.length > 1) {
    lines.push("也可以选：");
    for (const [index, action] of home.actions.slice(1).entries()) {
      lines.push(`${index + 2}. ${action.title}`);
      lines.push(`原因：${action.reason}`);
      lines.push(`直接说：${action.say}`);
    }
    lines.push("");
  }

  if (home.templates.length) {
    lines.push("常见开工模板：");
    for (const [index, template] of home.templates.entries()) {
      lines.push(`${index + 1}. ${template.title}`);
      lines.push(`结果：${template.outcome}`);
      lines.push(`直接说：${template.say}`);
    }
    lines.push("");
  }

  lines.push(home.ask);
  return lines.join("\n").trim();
}

export function healthSummary(items: HealthCheckItem[]): HealthReport {
  const actionCount = items.filter((item) => item.status === "action-needed").length;
  const summary =
    actionCount === 0
      ? "当前环境已准备好，可以直接开始。"
      : `当前还有 ${actionCount} 项需要处理，处理后体验会更完整。`;
  return { summary, items };
}

export function renderHealthReport(report: HealthReport, expert = false): string {
  const lines = [report.summary, ""];
  for (const item of report.items) {
    const prefix = item.status === "ready" ? "已就绪" : item.status === "optional" ? "可选" : "需处理";
    lines.push(`${prefix}：${item.name}。${item.userMessage}`);
    if (expert && item.fix) {
      lines.push(`  建议：${item.fix}`);
    }
  }
  return lines.join("\n");
}

export function createExperienceEvent(input: Omit<ExperienceEvent, "surface"> & { surface?: InteractionSurface }): ExperienceEvent {
  return {
    surface: input.surface ?? "terminal",
    tone: input.tone,
    say: input.say,
    screen: input.screen ?? input.say,
    choices: input.choices,
    actions: input.actions,
    audit: input.audit
  };
}

export function createHardwareResponse<T>(event: ExperienceEvent, data?: T): HardwareResponse<T> {
  return {
    protocol: "ccli-experience-protocol",
    version: 1,
    event,
    data
  };
}

export function speechText(event: ExperienceEvent): string {
  return event.say.replace(/\s+/g, " ").trim();
}

export function hardwareManifest() {
  return {
    name: "ccli-experience-protocol",
    version: 1,
    input: ["text", "voice"],
    output: ["speech", "screen", "choice", "action-button", "boss-home", "project-catalog", "idea-catalog", "next-action"],
    events: ["welcome", "home", "ask", "idea", "next", "progress", "risk", "success", "blocked"],
    invariant: "普通用户听到和看到的内容都必须是中文产品语义，不暴露代码、命令、路径或堆栈。"
  };
}

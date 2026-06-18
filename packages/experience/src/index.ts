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

export interface AcceptanceCheck {
  id: string;
  title: string;
  why: string;
  passHint: string;
  failSay: string;
}

export interface AcceptanceGuide {
  title: string;
  summary: string;
  productName?: string;
  goal?: string;
  checks: AcceptanceCheck[];
  passSay: string;
  changeSay: string;
  shipSay: string;
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

export interface SetupGuideStep {
  id: string;
  title: string;
  status: "ready" | "need-action" | "optional";
  reason: string;
  say: string;
  command?: string;
  primary?: boolean;
}

export interface SetupGuide {
  title: string;
  summary: string;
  steps: SetupGuideStep[];
  nextSay: string;
  ask: string;
}

export function welcomeCard(): WelcomeCard {
  return {
    title: "ccli 中文开发管家",
    summary: "你只需要说清楚想要的结果，ccli 负责规划、开发、验证、审查和交付。",
    nextActions: [
      "开箱首页：ccli home",
      "开箱准备：ccli ready",
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

export function createAcceptanceGuide(input: {
  productName?: string;
  goal?: string;
  firstCheck?: string;
  canPreview?: boolean;
}): AcceptanceGuide {
  const productName = cleanText(input.productName);
  const goal = cleanText(input.goal);
  const firstCheck = cleanText(input.firstCheck) ?? firstCheckFromGoal(goal);
  const subject = productName ? `「${productName}」` : "当前产品";
  const goalText = goal ? `目标：${goal}` : "先按老板能不能一眼看懂来验收。";
  const checks: AcceptanceCheck[] = [
    {
      id: "first-screen",
      title: "第一眼是否看懂",
      why: firstCheck ?? "老板打开页面后，应该不用解释就知道这个产品解决什么问题。",
      passHint: "首屏能看清业务重点、当前状态和下一步动作。",
      failSay: "第一眼看不懂，把首页改得更清楚"
    },
    {
      id: "core-result",
      title: "核心结果是否突出",
      why: "产品必须先服务业务结果，而不是只有好看的页面。",
      passHint: "最重要的数据、列表、提醒或流程在页面上足够明显。",
      failSay: "把最重要的业务结果放到更显眼的位置"
    },
    {
      id: "next-action",
      title: "下一步是否明确",
      why: "普通用户不应该猜该点哪里、先做什么。",
      passHint: "每个主要区域都有清楚的按钮、状态或处理建议。",
      failSay: "把页面上的下一步动作改得更明确"
    },
    {
      id: "mobile",
      title: "小屏幕是否可用",
      why: "老板和员工经常在手机或小窗口里看结果。",
      passHint: "文字不挤、按钮好点、关键内容没有被遮住。",
      failSay: "把手机上的页面改得更清楚好用"
    }
  ];

  return {
    title: `${subject}验收清单`,
    summary: input.canPreview === false ? "当前还不能直接预览，先按目标检查需求是否清楚。" : goalText,
    productName,
    goal,
    checks,
    passSay: "我满意，准备交付",
    changeSay: "我想改一下：",
    shipSay: "我满意，准备交付",
    ask: "不满意就直接说想改哪里；满意就说“我满意，准备交付”。"
  };
}

export function renderAcceptanceGuide(guide: AcceptanceGuide): string {
  const lines = [
    guide.title,
    "",
    guide.summary,
    "",
    "按这几项看一遍："
  ];

  for (const [index, check] of guide.checks.entries()) {
    lines.push(`${index + 1}. ${check.title}`);
    lines.push(`看什么：${check.why}`);
    lines.push(`通过标准：${check.passHint}`);
    lines.push(`不满意直接说：${check.failSay}`);
  }

  lines.push("");
  lines.push(`满意直接说：${guide.passSay}`);
  lines.push(`想继续改直接说：${guide.changeSay}后面加你的要求`);
  lines.push(`要交付直接说：${guide.shipSay}`);
  lines.push(guide.ask);
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

export function createSetupGuide(report: HealthReport): SetupGuide {
  const model = healthItem(report, "智能开发能力");
  const workspace = healthItem(report, "当前工作区");
  const localBuild = healthItem(report, "本地构建能力");
  const delivery = healthItem(report, "团队交付能力");
  const modelReady = model?.status === "ready";
  const workspaceReady = workspace?.status === "ready";
  const localReady = localBuild?.status === "ready";
  const deliveryReady = delivery?.status === "ready";
  const firstAction = !modelReady
    ? "开始首次设置"
    : !workspaceReady
      ? "给我几个产品模板"
      : !localReady
        ? "打开当前产品页面"
        : "下一步怎么办";
  const summary = modelReady
    ? workspaceReady
      ? "智能开发准备已基本完成，可以直接继续做产品。"
      : "智能开发已经接好，下一步先创建或打开一个产品。"
    : "还差模型授权；现在也可以先从模板创建产品，后续再补授权。";

  return {
    title: "开箱准备向导",
    summary,
    steps: [
      {
        id: "model",
        title: "接上智能开发能力",
        status: modelReady ? "ready" : "need-action",
        reason: model?.userMessage ?? "模型授权决定 ccli 能不能真正替你规划、开发和审查。",
        say: "开始首次设置",
        command: "ccli setup",
        primary: !modelReady
      },
      {
        id: "workspace",
        title: "准备第一个产品",
        status: workspaceReady ? "ready" : "need-action",
        reason: workspace?.userMessage ?? "先有一个产品，老板才能看到页面、验收和继续修改。",
        say: workspaceReady ? "打开当前产品页面" : "给我几个产品模板",
        command: workspaceReady ? "ccli preview --install" : "ccli ideas",
        primary: modelReady && !workspaceReady
      },
      {
        id: "local-preview",
        title: "确认本地能打开页面",
        status: localReady ? "ready" : "need-action",
        reason: localBuild?.userMessage ?? "本地预览能让老板直接看效果，不需要理解开发过程。",
        say: "打开当前产品页面",
        command: "ccli preview --install",
        primary: modelReady && workspaceReady && !localReady
      },
      {
        id: "delivery",
        title: "准备团队交付",
        status: deliveryReady ? "ready" : "optional",
        reason: delivery?.userMessage ?? "配置后可以自动创建审查入口并合并成果。",
        say: "检查当前电脑是否准备好",
        command: "ccli doctor"
      }
    ],
    nextSay: firstAction,
    ask: "不确定就直接说：下一步怎么办。"
  };
}

export function renderSetupGuide(guide: SetupGuide): string {
  const lines = [guide.title, "", guide.summary, "", `现在先说：${guide.nextSay}`, "", "准备项："];
  for (const [index, step] of guide.steps.entries()) {
    const prefix = step.status === "ready" ? "已就绪" : step.status === "optional" ? "可稍后" : "先处理";
    lines.push(`${index + 1}. ${prefix}：${step.title}`);
    lines.push(`原因：${step.reason}`);
    lines.push(`直接说：${step.say}`);
  }
  lines.push("", guide.ask);
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
    output: [
      "speech",
      "screen",
      "choice",
      "action-button",
      "boss-home",
      "setup-guide",
      "control-help",
      "control-cancelled",
      "acceptance-guide",
      "revision-request",
      "delivery-confirmation",
      "project-catalog",
      "idea-catalog",
      "next-action"
    ],
    events: ["welcome", "home", "setup", "help", "cancel", "acceptance", "revision", "delivery", "ask", "idea", "next", "progress", "risk", "success", "blocked"],
    invariant: "普通用户听到和看到的内容都必须是中文产品语义，不暴露代码、命令、路径或堆栈。"
  };
}

export function hardwareSchema() {
  return {
    protocol: "ccli-experience-protocol",
    version: 1,
    response: {
      protocol: "固定值：ccli-experience-protocol",
      version: "固定值：1",
      event: {
        surface: ["hardware", "voice", "terminal", "remote"],
        tone: ["calm", "asking", "success", "warning", "blocked"],
        say: "给语音设备朗读的中文短句",
        screen: "给屏幕展示的中文内容，可比朗读内容更完整",
        choices: "兼容简单设备的按钮文字数组",
        actions: [
          {
            id: "稳定动作标识",
            label: "按钮显示文字",
            kind: ["utterance", "command"],
            say: "再次交给 ccli 的中文说法，kind 为 utterance 时使用",
            command: "需要终端执行的命令，kind 为 command 时使用",
            description: "中文影响说明",
            requiresConfirmation: "高影响动作是否必须确认"
          }
        ]
      },
      data: "按 kind 返回的结构化数据"
    },
    kinds: [
      "welcome",
      "boss-home",
      "setup-guide",
      "control-help",
      "control-cancelled",
      "next-action",
      "idea-catalog",
      "project-catalog",
      "open-project",
      "preview-current",
      "acceptance-guide",
      "revision-request",
      "delivery-confirmation",
      "create-product",
      "health-check",
      "fallback"
    ],
    safety: [
      "普通用户界面只展示中文产品语义",
      "创建产品、打开终端命令、发送远端、交付和合并必须由硬件侧二次确认",
      "不要把代码、路径、命令、堆栈或原始模型输出朗读给用户",
      "command 动作只给受信任的控制端使用，普通语音设备优先回传 say"
    ]
  };
}

export function hardwareExamples() {
  const nextActions = [
    {
      id: "home",
      label: "打开开箱首页",
      kind: "utterance" as const,
      say: "打开开箱首页",
      description: "回到老板开箱驾驶舱",
      requiresConfirmation: false
    },
    {
      id: "ideas",
      label: "给我几个产品模板",
      kind: "utterance" as const,
      say: "给我几个产品模板",
      description: "查看常见产品场景",
      requiresConfirmation: false
    }
  ];
  return [
    createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "当前还没有产品，建议先从一个常见场景直接开工。",
        screen: "老板开箱驾驶舱\n当前还没有产品。\n可以先看产品模板，也可以直接说想做什么。",
        choices: nextActions.map((action) => action.label),
        actions: nextActions
      }),
      { kind: "boss-home" }
    ),
    createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "还差模型授权；现在也可以先从模板创建产品，后续再补授权。",
        screen: "开箱准备向导\n\n现在先说：开始首次设置\n\n准备项：\n1. 先处理：接上智能开发能力\n直接说：开始首次设置\n2. 先处理：准备第一个产品\n直接说：给我几个产品模板",
        choices: ["开始首次设置", "给我几个产品模板", "下一步怎么办"],
        actions: [
          {
            id: "setup",
            label: "开始首次设置",
            kind: "command",
            command: "ccli setup",
            description: "保存模型授权，让 ccli 可以自动规划、开发和审查。",
            requiresConfirmation: true
          },
          {
            id: "ideas",
            label: "给我几个产品模板",
            kind: "utterance",
            say: "给我几个产品模板",
            requiresConfirmation: false
          }
        ]
      }),
      { kind: "setup-guide" }
    ),
    createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "我理解你已经满意，准备交付。这个动作需要确认。",
        screen: "准备交付\n确认后会发送成果、独立审查，并在审查通过后合并。",
        choices: ["确认交付并合并", "再看验收清单", "我还想改"],
        actions: [
          {
            id: "confirm-delivery",
            label: "确认交付并合并",
            kind: "command",
            command: "ccli finish --yes",
            description: "会发送成果、进行独立审查，并在审查通过后合并。",
            requiresConfirmation: true
          },
          {
            id: "acceptance",
            label: "再看验收清单",
            kind: "utterance",
            say: "怎么验收当前产品",
            requiresConfirmation: false
          }
        ]
      }),
      { kind: "delivery-confirmation" }
    ),
    createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "calm",
        say: "已停止这次口令。你可以重新说下一步怎么办，或者回到开箱首页。",
        screen: "已停止这次口令。\n没有开始新的开发任务。\n\n你可以说：\n下一步怎么办\n打开开箱首页\n给我几个产品模板",
        choices: ["回到开箱首页", "下一步怎么办", "给我几个产品模板"],
        actions: [
          {
            id: "home",
            label: "回到开箱首页",
            kind: "utterance",
            say: "打开开箱首页",
            requiresConfirmation: false
          },
          {
            id: "next",
            label: "下一步怎么办",
            kind: "utterance",
            say: "下一步怎么办",
            requiresConfirmation: false
          }
        ]
      }),
      { kind: "control-cancelled" }
    )
  ];
}

function firstCheckFromGoal(goal?: string): string | undefined {
  if (!goal) {
    return undefined;
  }
  return starterIdeas().find((idea) => goal.includes(idea.say) || idea.say.includes(goal) || keywordMatch(goal, idea))?.firstCheck;
}

function keywordMatch(goal: string, idea: StarterIdea): boolean {
  const text = `${idea.title}${idea.bestFor}${idea.outcome}${idea.say}`;
  return goal
    .split(/[，。,\s]+/)
    .filter((part) => part.length >= 2)
    .some((part) => text.includes(part));
}

function healthItem(report: HealthReport, name: string): HealthCheckItem | undefined {
  return report.items.find((item) => item.name === name);
}

function cleanText(value?: string): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

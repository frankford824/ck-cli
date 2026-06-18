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

export interface BossApprovalReceipt {
  title: string;
  summary: string;
  productName?: string;
  goal?: string;
  approvedAt: string;
  note?: string;
  proof: string[];
  actions: NextAction[];
  ask: string;
}

export interface BossBrief {
  title: string;
  summary: string;
  productName?: string;
  goal: string;
  audience: string;
  problem: string;
  mustHaves: string[];
  acceptance: string[];
  boundaries: string[];
  actions: NextAction[];
  updatedAt?: string;
  ask: string;
}

export interface BossClarificationAnswers {
  audience?: string;
  firstScreen?: string;
  passCondition?: string;
}

export interface BossQuestion {
  id: string;
  question: string;
  why: string;
  examples: string[];
}

export interface BossQuestionCard {
  title: string;
  summary: string;
  productName?: string;
  goal?: string;
  questions: BossQuestion[];
  readyEnough: boolean;
  actions: NextAction[];
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

export interface ResumeProgressSnapshot {
  task?: string;
  currentStage?: string;
  updatedAt?: string;
  summary?: string;
  nextAction?: string;
  validation?: "passed" | "failed" | "skipped";
}

export interface ResumeStateSnapshot {
  currentTask?: string;
  status?: "idle" | "running" | "done" | "failed";
  summary?: string;
}

export interface ResumeGuide {
  title: string;
  summary: string;
  focus: string;
  task?: string;
  lastUpdated?: string;
  actions: NextAction[];
  ask: string;
}

export type BossReportStatus = "ready" | "in-progress" | "needs-attention" | "empty";

export interface BossReportCard {
  title: string;
  summary: string;
  productName?: string;
  goal?: string;
  status: BossReportStatus;
  focus: string;
  proof: string[];
  actions: NextAction[];
  ask: string;
}

export function welcomeCard(): WelcomeCard {
  return {
    title: "ccli 中文开发管家",
    summary: "你只需要说清楚想要的结果，ccli 负责规划、开发、验证、审查和交付。",
    nextActions: [
      "开箱首页：ccli home",
      "老板开工向导：ccli wizard",
      "开箱准备：ccli ready",
      "继续上次任务：ccli resume",
      "首次设置：ccli setup",
      "安全试用：ccli try",
      "需求追问：ccli questions \"做一个客户管理系统\"",
      "沉淀回答：ccli answers \"销售每天用；第一眼看待跟进客户；首版能新增客户并提醒\"",
      "按简报开工：ccli launch",
      "整理业务简报：ccli brief \"做一个客户管理系统\"",
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
      "开工向导：做一个客户管理系统，能记录跟进和提醒",
      "一步步问我，然后按回答开工",
      "帮我澄清需求：做一个客户管理系统，能记录跟进和提醒",
      "我的回答是：销售每天用；第一眼看待跟进客户；首版能新增客户并提醒",
      "按简报生成首版",
      "整理业务简报：做一个客户管理系统，能记录跟进和提醒",
      "下一步怎么办",
      "试用一下",
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

export function createBossApprovalReceipt(input: {
  productName?: string;
  goal?: string;
  checks?: AcceptanceCheck[];
  note?: string;
  approvedAt?: string;
}): BossApprovalReceipt {
  const productName = cleanText(input.productName);
  const goal = cleanText(input.goal);
  const note = cleanText(input.note);
  const approvedAt = input.approvedAt ?? new Date().toISOString();
  const subject = productName ? `「${productName}」` : "当前产品";
  const proof = uniqueStrings([
    goal ? `业务目标：${goal}` : undefined,
    ...(input.checks?.slice(0, 4).map((check) => `已按「${check.title}」验收：${check.passHint}`) ?? []),
    note ? `老板备注：${note}` : undefined
  ]);

  return {
    title: "老板验收凭证",
    summary: `${subject}已记录为验收通过。`,
    productName,
    goal,
    approvedAt,
    note,
    proof: proof.length ? proof : ["老板已确认当前结果可以进入交付。"],
    actions: [
      {
        id: "finish-current",
        title: "准备交付",
        reason: "验收已通过，可以进入审查、保存和合并。",
        say: "我满意，准备交付"
      },
      {
        id: "report-current",
        title: "查看交付卡",
        reason: "把当前成果、验收和下一步汇总给老板看。",
        say: "给我一个进度汇报"
      },
      {
        id: "revise-current",
        title: "继续修改",
        reason: "如果验收后又想到调整，仍然可以继续补充。",
        say: "我想改一下："
      }
    ],
    ask: "如果确认要交付，就直接说：我满意，准备交付。"
  };
}

export function renderBossApprovalReceipt(receipt: BossApprovalReceipt): string {
  const lines = [receipt.title, "", receipt.summary];
  if (receipt.productName) {
    lines.push(`产品：${receipt.productName}`);
  }
  if (receipt.goal) {
    lines.push(`目标：${receipt.goal}`);
  }
  lines.push(`通过时间：${formatDisplayDate(receipt.approvedAt)}`);
  if (receipt.note) {
    lines.push(`老板备注：${receipt.note}`);
  }

  lines.push("", "验收依据：");
  for (const [index, item] of receipt.proof.entries()) {
    lines.push(`${index + 1}. ${item}`);
  }

  lines.push("", "下一步可以直接说：");
  for (const [index, action] of receipt.actions.entries()) {
    lines.push(`${index + 1}. ${action.title}`);
    lines.push(`原因：${action.reason}`);
    lines.push(`直接说：${action.say}`);
  }

  lines.push("", receipt.ask);
  return lines.join("\n").trim();
}

export function createBossBrief(input: {
  goal: string;
  productName?: string;
  audience?: string;
  updatedAt?: string;
}): BossBrief {
  const goal = cleanText(input.goal) ?? "先做一个能让老板看懂、能继续修改的业务产品。";
  const matched = starterIdeas().find((idea) => goal.includes(idea.title) || goal.includes(idea.id) || keywordMatch(goal, idea));
  const productName = cleanText(input.productName) ?? matched?.title;
  const audience = cleanText(input.audience) ?? matched?.bestFor ?? audienceFromGoal(goal);
  const outcome = matched?.outcome ?? "把老板口头需求变成一个可以打开、可以验收、可以继续改的首版产品。";
  const firstCheck = matched?.firstCheck ?? firstCheckFromGoal(goal) ?? "打开后先看首屏是否能一眼说明产品要解决什么问题。";

  return {
    title: "老板业务简报",
    summary: productName ? `已把「${productName}」整理成可执行的业务简报。` : "已把这句话整理成可执行的业务简报。",
    productName,
    goal,
    audience,
    problem: outcome,
    mustHaves: uniqueStrings([
      "首屏一眼看懂这个产品解决什么业务问题。",
      "把目标里提到的核心信息、状态和下一步动作放到显眼位置。",
      matched ? `覆盖核心结果：${matched.outcome}` : undefined,
      goal.includes("提醒") ? "需要有清楚的待办、提醒或风险提示。" : undefined,
      goal.includes("搜索") || goal.includes("查询") ? "需要能快速找到关键记录。" : undefined,
      goal.includes("导出") ? "需要让用户知道哪些内容可以交付或带走。" : undefined,
      goal.includes("手机") || goal.includes("移动") ? "小屏幕也要清楚、好点击。" : undefined
    ]).slice(0, 5),
    acceptance: uniqueStrings([
      firstCheck,
      "老板不看代码，也能说清楚这个产品现在能做什么。",
      "主要按钮、状态和下一步动作不用解释也能看懂。",
      "如果不满意，能直接指出要改的页面、内容或流程。",
      "满意后可以进入审查、保存和交付。"
    ]).slice(0, 5),
    boundaries: [
      "首版先做可看、可验收、可继续修改的业务流程。",
      "暂不默认连接真实支付、真实生产数据或正式发布环境。",
      "涉及删除、发布、合并、生产数据和密钥的动作仍需要确认。"
    ],
    actions: [
      {
        id: "start-product",
        title: "开始生成首版",
        reason: "简报已经能指导第一轮开发。",
        say: goal
      },
      {
        id: "accept-current",
        title: "按清单验收",
        reason: "开发后用同一份标准判断是否满意。",
        say: "怎么验收当前产品"
      },
      {
        id: "revise-current",
        title: "继续补充要求",
        reason: "如果简报还不准，直接说要改哪里。",
        say: "我想改一下：目标用户和验收标准再写清楚"
      }
    ],
    updatedAt: input.updatedAt,
    ask: "如果简报准确，就直接说目标开始做；如果不准确，就直接说想补充什么。"
  };
}

export function createBossBriefFromAnswers(input: {
  goal: string;
  productName?: string;
  answers: BossClarificationAnswers;
  updatedAt?: string;
}): BossBrief {
  const audience = cleanText(input.answers.audience);
  const firstScreen = cleanText(input.answers.firstScreen);
  const passCondition = cleanText(input.answers.passCondition);
  const base = createBossBrief({
    goal: input.goal,
    productName: input.productName,
    audience,
    updatedAt: input.updatedAt
  });
  const productName = base.productName ?? cleanText(input.productName);

  return {
    ...base,
    summary: productName ? `已把老板回答沉淀为「${productName}」业务简报。` : "已把老板回答沉淀为可执行的业务简报。",
    problem:
      firstScreen || passCondition
        ? `让${base.audience}打开后先看到${firstScreen ?? "最重要的业务重点"}，并用「${passCondition ?? "老板能看懂、能继续修改"}」判断首版是否通过。`
        : base.problem,
    mustHaves: uniqueStrings([
      firstScreen ? `首屏优先呈现：${firstScreen}。` : undefined,
      passCondition ? `围绕通过条件设计：${passCondition}。` : undefined,
      ...base.mustHaves
    ]).slice(0, 5),
    acceptance: uniqueStrings([
      firstScreen ? `打开后第一眼能看到：${firstScreen}。` : undefined,
      passCondition ? `首版通过条件：${passCondition}。` : undefined,
      audience ? `${audience}不用解释也能完成最关键判断。` : undefined,
      ...base.acceptance
    ]).slice(0, 5),
    actions: [
      {
        id: "start-product",
        title: "按回答生成首版",
        reason: "老板回答已经沉淀为业务简报，可以直接开工。",
        say: base.goal
      },
      ...base.actions.filter((action) => action.id !== "start-product")
    ],
    ask: "如果这份简报准确，就直接说开始做；如果答案有变化，就继续说：我的回答是。"
  };
}

export function renderBossBrief(brief: BossBrief): string {
  const lines = [brief.title, "", brief.summary];
  if (brief.productName) {
    lines.push(`产品：${brief.productName}`);
  }
  lines.push(`目标：${brief.goal}`);
  lines.push(`使用者：${brief.audience}`);
  lines.push(`要解决的问题：${brief.problem}`);

  lines.push("", "首版必须做到：");
  for (const [index, item] of brief.mustHaves.entries()) {
    lines.push(`${index + 1}. ${item}`);
  }

  lines.push("", "验收标准：");
  for (const [index, item] of brief.acceptance.entries()) {
    lines.push(`${index + 1}. ${item}`);
  }

  lines.push("", "先不做：");
  for (const [index, item] of brief.boundaries.entries()) {
    lines.push(`${index + 1}. ${item}`);
  }

  lines.push("", "可以直接说：");
  for (const [index, action] of brief.actions.entries()) {
    lines.push(`${index + 1}. ${action.title}`);
    lines.push(`原因：${action.reason}`);
    lines.push(`直接说：${action.say}`);
  }

  lines.push("", brief.ask);
  return lines.join("\n").trim();
}

export function createBossQuestionCard(input: {
  goal?: string;
  productName?: string;
  brief?: BossBrief;
}): BossQuestionCard {
  const goal = cleanText(input.goal ?? input.brief?.goal);
  const productName = cleanText(input.productName ?? input.brief?.productName);
  const matched = goal ? starterIdeas().find((idea) => goal.includes(idea.title) || goal.includes(idea.id) || keywordMatch(goal, idea)) : undefined;
  const readyEnough = Boolean(input.brief || (goal && goal.length >= 8));
  const focusName = productName ?? matched?.title ?? "这个想法";
  const fallbackGoal = goal ?? "做一个客户管理系统，能记录跟进和提醒";
  const summary = input.brief
    ? "已有业务简报，可以直接开工；如果还想补充，也可以先回答下面 3 个问题。"
    : goal
      ? `我先把「${focusName}」拆成 3 个关键问题，回答后就能生成更准的业务简报。`
      : "你不用先写方案，先回答 3 个问题，就能把模糊想法变成可开工需求。";

  const actions = input.brief
    ? [
        {
          id: "start-product",
          title: "开始生成首版",
          reason: "业务简报已经能指导第一轮开发。",
          say: input.brief.goal
        },
        {
          id: "revise-brief",
          title: "补充业务简报",
          reason: "如果问题答案改变了目标，可以先更新简报。",
          say: `整理业务简报：${input.brief.goal}`
        },
        {
          id: "accept-current",
          title: "按清单验收",
          reason: "已有产品时，可以直接按老板标准看效果。",
          say: "怎么验收当前产品"
        }
      ]
    : [
        {
          id: "make-brief",
          title: "整理业务简报",
          reason: "回答不完整也可以先生成一版清楚的开工说明。",
          say: `整理业务简报：${fallbackGoal}`
        },
        {
          id: "ideas",
          title: "先看产品模板",
          reason: "如果还没想清楚，可以从常见场景里选一个。",
          say: "给我几个产品模板"
        },
        ...(goal
          ? [
              {
                id: "start-product",
                title: "开始生成首版",
                reason: "目标已经有方向，可以先做可看的第一版。",
                say: goal
              }
            ]
          : [])
      ];

  return {
    title: "老板需求追问卡",
    summary,
    productName,
    goal,
    questions: bossQuestionsForGoal(goal, matched),
    readyEnough,
    actions,
    ask: readyEnough
      ? "如果这 3 个答案已经清楚，就直接说：整理业务简报。"
      : "先按直觉回答这 3 个问题，不需要使用任何技术词。"
  };
}

export function renderBossQuestionCard(card: BossQuestionCard): string {
  const lines = [card.title, "", card.summary];
  if (card.productName) {
    lines.push(`产品：${card.productName}`);
  }
  if (card.goal) {
    lines.push(`想法：${card.goal}`);
  }
  lines.push(`当前判断：${card.readyEnough ? "信息基本够，可以先整理简报或生成首版。" : "信息还偏模糊，先回答下面几个问题。"}`);

  lines.push("", "请先回答：");
  for (const [index, question] of card.questions.entries()) {
    lines.push(`${index + 1}. ${question.question}`);
    lines.push(`为什么问：${question.why}`);
    lines.push(`可以这样答：${question.examples.join("、")}`);
  }

  lines.push("", "可以直接说：");
  for (const [index, action] of card.actions.entries()) {
    lines.push(`${index + 1}. ${action.title}`);
    lines.push(`原因：${action.reason}`);
    lines.push(`直接说：${action.say}`);
  }

  lines.push("", card.ask);
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

export function createResumeGuide(input: {
  progress?: ResumeProgressSnapshot;
  state?: ResumeStateSnapshot;
  canPreview?: boolean;
}): ResumeGuide {
  const task = cleanText(input.progress?.task ?? input.state?.currentTask);
  const lastUpdated = cleanText(input.progress?.updatedAt);
  const status = input.state?.status;
  const hasRecord = Boolean(input.progress || input.state);
  const progressSummary = cleanText(input.progress?.summary);
  const stateSummary = cleanText(input.state?.summary);
  const summary = hasRecord
    ? status === "failed" || input.progress?.validation === "failed"
      ? "上次任务没有顺利完成，建议先看清影响，再继续处理。"
      : status === "done" || input.progress?.validation === "passed"
        ? "上次任务已有结果，可以先打开页面验收，再决定是否继续修改。"
        : "已找到上次任务现场，可以从这里接着判断下一步。"
    : "还没有找到可恢复的任务记录，可以先从开箱首页或模板开始。";
  const focus = progressSummary ?? stateSummary ?? "先看当前项目建议，再决定要继续哪个方向。";
  const actions: NextAction[] = hasRecord
    ? [
        {
          id: "status",
          title: "查看上次进度",
          reason: "先看中文进度，避免重复解释上次做到哪里。",
          say: "查看当前任务进度",
          command: "ccli status"
        },
        ...(input.canPreview
          ? [
              {
                id: "preview-current",
                title: "打开当前产品",
                reason: "如果上次已经生成页面，先看效果最容易决定下一步。",
                say: "打开当前产品页面",
                command: "ccli preview --install"
              }
            ]
          : []),
        {
          id: "accept-current",
          title: "按清单验收",
          reason: "用老板能看懂的清单判断满意还是需要改。",
          say: "怎么验收当前产品",
          command: "ccli accept"
        },
        {
          id: "next",
          title: "让系统给下一步",
          reason: "如果不确定要继续做什么，先让 ccli 根据当前状态推荐。",
          say: "下一步怎么办",
          command: "ccli next"
        }
      ]
    : [
        {
          id: "home",
          title: "回到开箱首页",
          reason: "先看当前状态和最建议动作。",
          say: "打开开箱首页",
          command: "ccli home"
        },
        {
          id: "ideas",
          title: "从模板开始",
          reason: "还没有任务记录时，模板最快能看到首版产品。",
          say: "给我几个产品模板",
          command: "ccli ideas"
        },
        {
          id: "ready",
          title: "检查开箱准备",
          reason: "确认模型、项目和预览能力是否准备好。",
          say: "开箱准备",
          command: "ccli ready"
        }
      ];

  return {
    title: "继续上次任务",
    summary,
    focus,
    task,
    lastUpdated,
    actions: actions.slice(0, 4),
    ask: "不知道怎么接，就直接说：下一步怎么办。"
  };
}

export function renderResumeGuide(guide: ResumeGuide): string {
  const lines = [guide.title, "", guide.summary];
  if (guide.task) {
    lines.push(`上次任务：${guide.task}`);
  }
  if (guide.lastUpdated) {
    lines.push(`记录时间：${formatDisplayDate(guide.lastUpdated)}`);
  }
  lines.push("", `当前重点：${guide.focus}`, "", "可以这样继续：");
  for (const [index, action] of guide.actions.entries()) {
    lines.push(`${index + 1}. ${action.title}`);
    lines.push(`原因：${action.reason}`);
    lines.push(`直接说：${action.say}`);
  }
  lines.push("", guide.ask);
  return lines.join("\n");
}

export function createBossReportCard(input: {
  productName?: string;
  goal?: string;
  progress?: ResumeProgressSnapshot;
  state?: ResumeStateSnapshot;
  canPreview?: boolean;
  nextActions?: NextAction[];
  auditSummary?: string;
  approvalSummary?: string;
}): BossReportCard {
  const productName = cleanText(input.productName);
  const goal = cleanText(input.goal);
  const task = cleanText(input.progress?.task ?? input.state?.currentTask);
  const progressSummary = cleanText(input.progress?.summary);
  const stateSummary = cleanText(input.state?.summary);
  const auditSummary = cleanText(input.auditSummary);
  const approvalSummary = cleanText(input.approvalSummary);
  const hasAnyRecord = Boolean(productName || goal || task || input.progress || input.state);
  const status = reportStatus(input, hasAnyRecord);
  const subject = productName ? `「${productName}」` : "当前产品";
  const summary =
    status === "empty"
      ? "还没有找到可汇报的产品。建议先安全试用，或者从一个常见产品模板开始。"
      : status === "needs-attention"
        ? `${subject}有一项需要处理的情况，建议先看影响，再继续修改或撤回。`
        : status === "ready"
          ? `${subject}已有可验收结果，建议先打开页面或按清单验收。`
          : `${subject}正在推进中，可以先看当前重点，再决定继续、验收或调整。`;
  const focus =
    status === "empty"
      ? "先确定要做哪个业务产品，让 ccli 生成一个可以看的首版。"
      : approvalSummary ?? progressSummary ?? stateSummary ?? auditSummary ?? goal ?? task ?? "先打开当前结果，看是否符合业务目标。";

  return {
    title: "老板交付卡",
    summary,
    productName,
    goal,
    status,
    focus,
    proof: reportProof({
      productName,
      goal,
      task,
      progress: input.progress,
      state: input.state,
      canPreview: input.canPreview,
      auditSummary,
      approvalSummary
    }),
    actions: (input.nextActions?.length ? input.nextActions : defaultReportActions(status, Boolean(input.canPreview))).slice(0, 5),
    ask: status === "empty" ? "不知道怎么开始，就直接说：试用一下。" : "不确定下一步，就直接说：下一步怎么办。"
  };
}

export function renderBossReportCard(card: BossReportCard): string {
  const lines = [card.title, "", card.summary];
  if (card.productName) {
    lines.push(`产品：${card.productName}`);
  }
  if (card.goal) {
    lines.push(`目标：${card.goal}`);
  }
  lines.push(`当前重点：${card.focus}`);

  if (card.proof.length) {
    lines.push("", "看得见的依据：");
    for (const [index, item] of card.proof.entries()) {
      lines.push(`${index + 1}. ${item}`);
    }
  }

  if (card.actions.length) {
    lines.push("", "可以直接说：");
    for (const [index, action] of card.actions.entries()) {
      lines.push(`${index + 1}. ${action.title}`);
      lines.push(`原因：${action.reason}`);
      lines.push(`直接说：${action.say}`);
    }
  }

  lines.push("", card.ask);
  return lines.join("\n").trim();
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
      "resume-guide",
      "action-confirmed",
      "confirmation-empty",
      "control-help",
      "control-cancelled",
      "boss-wizard",
      "question-card",
      "brief-card",
      "approval-receipt",
      "report-card",
      "acceptance-guide",
      "revision-request",
      "delivery-confirmation",
      "try-demo",
      "undo-confirmation",
      "project-catalog",
      "idea-catalog",
      "next-action"
    ],
    events: ["welcome", "home", "setup", "resume", "wizard", "question", "brief", "approval", "report", "confirm", "help", "cancel", "acceptance", "revision", "delivery", "ask", "idea", "next", "progress", "risk", "success", "blocked"],
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
      "resume-guide",
      "action-confirmed",
      "confirmation-empty",
      "control-help",
      "control-cancelled",
      "boss-wizard",
      "question-card",
      "brief-card",
      "approval-receipt",
      "report-card",
      "next-action",
      "idea-catalog",
      "project-catalog",
      "open-project",
      "preview-current",
      "acceptance-guide",
      "revision-request",
      "delivery-confirmation",
      "try-demo",
      "undo-confirmation",
      "create-product",
      "health-check",
      "fallback"
    ],
    safety: [
      "普通用户界面只展示中文产品语义",
      "创建产品、打开终端命令、发送远端、交付和合并必须由硬件侧二次确认",
      "硬件侧可以在用户说确认后读取 action-confirmed，并只执行返回的已确认 action",
      "不要把代码、路径、命令、堆栈或原始模型输出朗读给用户",
      "command 动作只给受信任的控制端使用，普通语音设备优先回传 say"
    ]
  };
}

export function hardwareExamples() {
  const nextActions = [
    {
      id: "boss-wizard",
      label: "先问清楚业务目标",
      kind: "utterance" as const,
      say: "一步步问我，然后开工",
      description: "先用中文问清目标用户、首屏重点和验收标准。",
      requiresConfirmation: false
    },
    {
      id: "harness-init",
      label: "补齐驾驭支架",
      kind: "utterance" as const,
      say: "补齐驾驭系统",
      description: "补好项目规则、权限护栏、验证反馈和进度记忆。",
      requiresConfirmation: false
    },
    {
      id: "try-demo",
      label: "先安全试用一遍",
      kind: "utterance" as const,
      say: "试用一下",
      description: "先在本机试用区看到一套演示产品。",
      requiresConfirmation: false
    }
  ];
  return [
    createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "当前还没有产品，建议先用开工向导问清楚业务目标，再决定生成首版或安全试用。",
        screen: "老板开箱驾驶舱\n当前还没有产品。\n建议先问清楚业务目标，也可以补齐驾驭支架或安全试用。",
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
        say: "已找到上次任务现场，可以从这里接着判断下一步。",
        screen: "继续上次任务\n\n上次任务：添加登录页面\n当前重点：中文产品方案已生成。\n\n可以这样继续：\n1. 查看上次进度\n直接说：查看当前任务进度\n2. 打开当前产品\n直接说：打开当前产品页面",
        choices: ["查看上次进度", "打开当前产品", "下一步怎么办"],
        actions: [
          {
            id: "status",
            label: "查看上次进度",
            kind: "utterance",
            say: "查看当前任务进度",
            requiresConfirmation: false
          },
          {
            id: "preview-current",
            label: "打开当前产品",
            kind: "utterance",
            say: "打开当前产品页面",
            requiresConfirmation: false
          }
        ]
      }),
      { kind: "resume-guide" }
    ),
    createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "我先把这个想法拆成 3 个关键问题，回答后就能生成更准的业务简报。",
        screen: "老板需求追问卡\n\n想法：做一个客户管理系统，能记录跟进和提醒\n当前判断：信息基本够，可以先整理简报或生成首版。\n\n请先回答：\n1. 谁每天会用这个产品？\n可以这样答：老板、销售、客服、门店员工\n2. 打开后第一眼最想看到什么？\n可以这样答：待跟进客户、高意向客户、今天要联系的人\n3. 什么情况算首版通过？\n可以这样答：能看懂重点、能看到该处理的提醒",
        choices: ["整理业务简报", "开始生成首版", "先看产品模板"],
        actions: [
          {
            id: "make-brief",
            label: "整理业务简报",
            kind: "utterance",
            say: "整理业务简报：做一个客户管理系统，能记录跟进和提醒",
            requiresConfirmation: false
          },
          {
            id: "start-product",
            label: "开始生成首版",
            kind: "utterance",
            say: "做一个客户管理系统，能记录跟进和提醒",
            requiresConfirmation: true
          }
        ]
      }),
      { kind: "question-card" }
    ),
    createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "已把这句话整理成可执行的业务简报。",
        screen: "老板业务简报\n\n目标：做一个客户管理系统，能记录跟进和提醒\n使用者：销售、门店、服务公司\n要解决的问题：记录客户、跟进提醒、成交状态和老板优先事项。\n\n验收标准：\n1. 打开后先看是否能分清高意向、待跟进和已成交客户。\n2. 老板不看代码，也能说清楚这个产品现在能做什么。",
        choices: ["开始生成首版", "补充要求", "按清单验收"],
        actions: [
          {
            id: "launch-from-brief",
            label: "开始生成首版",
            kind: "command",
            command: "ccli launch --yes",
            description: "按这份业务简报生成首版产品。",
            requiresConfirmation: true
          },
          {
            id: "revise-brief",
            label: "补充要求",
            kind: "utterance",
            say: "我想改一下：目标用户和验收标准再写清楚",
            requiresConfirmation: false
          }
        ]
      }),
      { kind: "brief-card" }
    ),
    createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "success",
        say: "当前产品已记录为验收通过。",
        screen: "老板验收凭证\n\n当前产品已记录为验收通过。\n产品：客户跟进系统\n目标：记录客户、跟进和提醒\n\n下一步可以直接说：\n1. 准备交付\n直接说：我满意，准备交付\n2. 查看交付卡\n直接说：给我一个进度汇报",
        choices: ["准备交付", "查看交付卡", "继续修改"],
        actions: [
          {
            id: "finish-current",
            label: "准备交付",
            kind: "utterance",
            say: "我满意，准备交付",
            requiresConfirmation: true
          },
          {
            id: "report-current",
            label: "查看交付卡",
            kind: "utterance",
            say: "给我一个进度汇报",
            requiresConfirmation: false
          }
        ]
      }),
      { kind: "approval-receipt" }
    ),
    createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "当前产品已有可验收结果，建议先打开页面或按清单验收。",
        screen: "老板交付卡\n\n当前产品已有可验收结果，建议先打开页面或按清单验收。\n产品：客户跟进系统\n目标：记录客户、跟进和提醒\n当前重点：首版页面已生成，可以先看是否一眼能懂。\n\n可以直接说：\n1. 打开当前产品\n直接说：打开当前产品页面\n2. 按清单验收\n直接说：怎么验收当前产品",
        choices: ["打开当前产品", "按清单验收", "我想改一下"],
        actions: [
          {
            id: "preview-current",
            label: "打开当前产品",
            kind: "utterance",
            say: "打开当前产品页面",
            requiresConfirmation: false
          },
          {
            id: "accept-current",
            label: "按清单验收",
            kind: "utterance",
            say: "怎么验收当前产品",
            requiresConfirmation: false
          }
        ]
      }),
      { kind: "report-card" }
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
        tone: "success",
        say: "已确认：确认交付并合并。",
        screen: "已确认：确认交付并合并\n可以继续完成这一步。",
        choices: ["确认交付并合并"],
        actions: [
          {
            id: "confirm-delivery",
            label: "确认交付并合并",
            kind: "command",
            command: "ccli finish --yes",
            description: "会发送成果、进行独立审查，并在审查通过后合并。",
            requiresConfirmation: false
          }
        ]
      }),
      { kind: "action-confirmed" }
    ),
    createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "可以先安全试用一遍。确认后会创建一个演示产品，不会改当前项目。",
        screen: "安全试用\n确认后会在本机试用区创建演示产品，并打开页面让你验收。",
        choices: ["开始安全试用", "先看产品模板", "下一步怎么办"],
        actions: [
          {
            id: "start-demo",
            label: "开始安全试用",
            kind: "command",
            command: "ccli try",
            description: "会在本机试用区创建演示产品，并尝试打开本地页面。",
            requiresConfirmation: true
          },
          {
            id: "ideas",
            label: "先看产品模板",
            kind: "utterance",
            say: "给我几个产品模板",
            requiresConfirmation: false
          }
        ]
      }),
      { kind: "try-demo" }
    ),
    createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "可以撤回上次保存的成果。这个动作会改变当前产品，需要确认。",
        screen: "撤回上次成果\n确认后会撤回上次保存的成果，并生成一条新的保存记录。",
        choices: ["确认撤回上次成果", "先看验收清单", "先不撤回"],
        actions: [
          {
            id: "confirm-undo",
            label: "确认撤回上次成果",
            kind: "command",
            command: "ccli undo --yes",
            description: "会撤回上次保存的成果，并生成一条新的保存记录。",
            requiresConfirmation: true
          },
          {
            id: "acceptance",
            label: "先看验收清单",
            kind: "utterance",
            say: "怎么验收当前产品",
            requiresConfirmation: false
          }
        ]
      }),
      { kind: "undo-confirmation" }
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

function reportStatus(input: {
  progress?: ResumeProgressSnapshot;
  state?: ResumeStateSnapshot;
  canPreview?: boolean;
}, hasAnyRecord: boolean): BossReportStatus {
  if (!hasAnyRecord) {
    return "empty";
  }
  if (input.state?.status === "failed" || input.progress?.validation === "failed") {
    return "needs-attention";
  }
  if (input.state?.status === "done" || input.progress?.validation === "passed" || input.canPreview) {
    return "ready";
  }
  return "in-progress";
}

function reportProof(input: {
  productName?: string;
  goal?: string;
  task?: string;
  progress?: ResumeProgressSnapshot;
  state?: ResumeStateSnapshot;
  canPreview?: boolean;
  auditSummary?: string;
  approvalSummary?: string;
}): string[] {
  const proof = [
    input.productName ? `已识别当前产品：${input.productName}` : undefined,
    input.goal ? `已记录业务目标：${input.goal}` : undefined,
    input.approvalSummary,
    input.task ? `最近任务：${input.task}` : undefined,
    input.progress?.updatedAt ? `最近记录时间：${formatDisplayDate(input.progress.updatedAt)}` : undefined,
    input.canPreview === true ? "已有本地页面可以打开验收。" : undefined,
    input.state?.status === "done" || input.progress?.validation === "passed" ? "最近一次处理已有可检查结果。" : undefined,
    input.state?.status === "failed" || input.progress?.validation === "failed" ? "最近一次处理没有顺利完成，需要先处理影响。" : undefined,
    input.auditSummary ? `后台已保留处理记录：${input.auditSummary}` : undefined
  ];
  return proof.filter((item): item is string => Boolean(item)).slice(0, 5);
}

function defaultReportActions(status: BossReportStatus, canPreview: boolean): NextAction[] {
  if (status === "empty") {
    return [
      {
        id: "try-demo",
        title: "先安全试用一遍",
        reason: "不用模型授权，也不改当前目录，先看到一套演示产品。",
        say: "试用一下"
      },
      {
        id: "starter-ideas",
        title: "从模板直接开工",
        reason: "选一个常见场景最快能看到首版。",
        say: "给我几个产品模板"
      },
      {
        id: "home",
        title: "回到开箱首页",
        reason: "先看当前状态和最建议动作。",
        say: "打开开箱首页"
      }
    ];
  }

  const actions: NextAction[] = [];
  if (canPreview) {
    actions.push({
      id: "preview-current",
      title: "打开当前产品",
      reason: "先看真实页面，最容易判断是否满意。",
      say: "打开当前产品页面"
    });
  }
  actions.push({
    id: "accept-current",
    title: "按清单验收",
    reason: "用老板能看懂的标准判断是否满意。",
    say: "怎么验收当前产品"
  });
  if (status === "needs-attention") {
    actions.push({
      id: "status",
      title: "先看影响",
      reason: "最近一次处理没有顺利完成，先看中文影响再决定。",
      say: "查看当前任务进度"
    });
  }
  actions.push({
    id: "revise-current",
    title: "继续修改",
    reason: "不满意可以直接说具体要改哪里。",
    say: "我想改一下：首页重点不够明显"
  });
  actions.push({
    id: "undo-current",
    title: "撤回上次成果",
    reason: "如果最近一次改动方向错了，可以撤回最近保存的成果。",
    say: "撤回上次改动"
  });
  if (status === "ready") {
    actions.push({
      id: "finish-current",
      title: "准备交付",
      reason: "如果已经满意，可以进入审查和交付。",
      say: "我满意，准备交付"
    });
  }
  actions.push({
    id: "next",
    title: "让系统给下一步",
    reason: "如果还没判断好，先让 ccli 根据当前状态推荐。",
    say: "下一步怎么办"
  });
  return actions;
}

function bossQuestionsForGoal(goal: string | undefined, matched: StarterIdea | undefined): BossQuestion[] {
  return [
    {
      id: "daily-user",
      question: "谁每天会用这个产品？",
      why: "先确定真正使用的人，页面重点和说话方式才不会跑偏。",
      examples: audienceExamples(goal, matched)
    },
    {
      id: "first-screen",
      question: "打开后第一眼最想看到什么？",
      why: "首屏决定老板和员工能不能马上判断产品有用。",
      examples: firstScreenExamples(goal, matched)
    },
    {
      id: "first-version-pass",
      question: "什么情况算首版通过？",
      why: "提前定好通过标准，后面就能减少来回解释和返工。",
      examples: acceptanceExamples(goal, matched)
    }
  ];
}

function audienceExamples(goal: string | undefined, matched: StarterIdea | undefined): string[] {
  return uniqueExampleItems([
    matched?.bestFor,
    goal && /客户|销售|crm/i.test(goal) ? "老板、销售、客服、门店员工" : undefined,
    goal && /预约|排班|门店|诊所|美业/.test(goal) ? "前台、店长、服务人员、预约客户" : undefined,
    goal && /库存|仓库|补货|出库/.test(goal) ? "仓库、采购、店长、运营人员" : undefined,
    goal && /订单|发货|物流|售后/.test(goal) ? "客服、发货员、售后、老板" : undefined,
    goal && /财务|收支|回款|现金流/.test(goal) ? "老板、财务、项目负责人" : undefined,
    "老板自己、销售、前台、仓库、客户"
  ], 5);
}

function firstScreenExamples(goal: string | undefined, matched: StarterIdea | undefined): string[] {
  return uniqueExampleItems([
    matched?.firstCheck.replace(/^打开后先看是否能/, "").replace(/^打开后先看/, "").replace(/。$/, ""),
    goal && /客户|销售|crm/i.test(goal) ? "待跟进客户、高意向客户、今天要联系的人" : undefined,
    goal && /预约|排班|门店|诊所|美业/.test(goal) ? "今日预约、空闲时间、临近到店提醒" : undefined,
    goal && /库存|仓库|补货|出库/.test(goal) ? "低库存、今日出库、需要补货的商品" : undefined,
    goal && /订单|发货|物流|售后/.test(goal) ? "待发货订单、异常订单、售后风险" : undefined,
    goal && /财务|收支|回款|现金流/.test(goal) ? "今日收支、待回款、现金流风险" : undefined,
    "待办重点、风险提醒、今天最该处理的事"
  ], 5);
}

function acceptanceExamples(goal: string | undefined, matched: StarterIdea | undefined): string[] {
  return uniqueExampleStrings([
    matched?.firstCheck,
    "能看懂重点",
    goal?.includes("提醒") ? "能看到该处理的提醒" : undefined,
    goal && /新增|记录|录入|客户|订单|库存/.test(goal) ? "能新增或记录一条业务信息" : undefined,
    "手机上也能看清楚",
    "老板不解释也能判断是否有用"
  ], 5);
}

function uniqueExampleItems(values: Array<string | undefined>, limit: number): string[] {
  return uniqueStrings(
    values.flatMap((value) =>
      cleanExample(value)
        ?.split(/[、，,]|和/)
        .map((part) => cleanExample(part))
        .filter((part): part is string => Boolean(part)) ?? []
    )
  ).slice(0, limit);
}

function uniqueExampleStrings(values: Array<string | undefined>, limit: number): string[] {
  return uniqueStrings(values.map((value) => cleanExample(value))).slice(0, limit);
}

function cleanExample(value?: string): string | undefined {
  return cleanText(value)?.replace(/[。；;]+$/g, "");
}

function firstCheckFromGoal(goal?: string): string | undefined {
  if (!goal) {
    return undefined;
  }
  return starterIdeas().find((idea) => goal.includes(idea.say) || idea.say.includes(goal) || keywordMatch(goal, idea))?.firstCheck;
}

function audienceFromGoal(goal: string): string {
  if (/客户|销售|crm/i.test(goal)) {
    return "销售、门店、服务公司";
  }
  if (/预约|排班|门店|诊所|美业/.test(goal)) {
    return "门店、服务人员和预约客户";
  }
  if (/库存|仓库|补货|出库/.test(goal)) {
    return "仓库、零售、电商和运营人员";
  }
  if (/订单|发货|物流|售后/.test(goal)) {
    return "电商、批发和售后团队";
  }
  if (/财务|收支|回款|现金流/.test(goal)) {
    return "老板、财务和项目负责人";
  }
  if (/内容|发布|素材|审核/.test(goal)) {
    return "品牌、市场和内容团队";
  }
  return "老板、员工和日常使用者";
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    const cleaned = cleanText(value);
    if (!cleaned || seen.has(cleaned)) {
      return false;
    }
    seen.add(cleaned);
    return true;
  });
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

function formatDisplayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const datePart = date.toISOString().slice(0, 10);
  const timePart = date.toTimeString().slice(0, 5);
  return `${datePart} ${timePart}`;
}

function cleanText(value?: string): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

export type InteractionSurface = "terminal" | "voice" | "hardware" | "remote";

export type ExperienceTone = "calm" | "asking" | "success" | "warning" | "blocked";

export interface ExperienceEvent {
  surface: InteractionSurface;
  tone: ExperienceTone;
  say: string;
  screen?: string;
  choices?: string[];
  audit?: unknown;
}

export interface WelcomeCard {
  title: string;
  summary: string;
  nextActions: string[];
  examples: string[];
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
      "首次设置：ccli setup",
      "创建新产品：ccli new 我的应用",
      "改当前项目：ccli \"给订单页面增加导出按钮\"",
      "进入对话：ccli chat",
      "检查环境：ccli doctor"
    ],
    examples: [
      "把首页改得更像高端咨询公司",
      "给客户列表增加搜索和导出",
      "检查这个项目为什么不能正常启动",
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
    audit: input.audit
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
    output: ["speech", "screen", "choice"],
    events: ["welcome", "ask", "progress", "risk", "success", "blocked"],
    invariant: "普通用户听到和看到的内容都必须是中文产品语义，不暴露代码、命令、路径或堆栈。"
  };
}

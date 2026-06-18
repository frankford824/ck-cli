export type ProductEventType =
  | "inspect"
  | "plan"
  | "edit"
  | "validate"
  | "review"
  | "save"
  | "pr"
  | "done"
  | "risk"
  | "error"
  | "info"
  | "audit";

export type ProductSeverity = "info" | "success" | "warning" | "error";

export interface ProductEvent {
  type: ProductEventType;
  message?: string;
  detail?: string;
  raw?: unknown;
  severity?: ProductSeverity;
}

export interface RenderOptions {
  expert?: boolean;
}

const DEFAULT_MESSAGES: Record<ProductEventType, string> = {
  inspect: "正在了解当前项目。",
  plan: "正在整理实现方案。",
  edit: "正在实现功能。",
  validate: "正在验证是否正常。",
  review: "正在进行独立审查。",
  save: "正在保存本次成果。",
  pr: "正在准备交付给团队审查。",
  done: "已完成。",
  risk: "发现一个需要确认的风险。",
  error: "遇到一个需要处理的问题。",
  info: "任务继续进行中。",
  audit: "技术细节已记录到审计日志。"
};

const TECHNICAL_PATTERNS: RegExp[] = [
  /```[\s\S]*?```/g,
  /`[^`\n]+`/g,
  /^\s*(diff --git|index [0-9a-f]+|--- |\+\+\+ |@@ |-|\+{1}[^+])/gm,
  /\b(?:src|app|lib|packages|apps|node_modules|dist|build|\.ccli)\/[A-Za-z0-9._/@-]+/g,
  /(?:[A-Za-z]:\\|\/mnt\/|\/home\/|\/Users\/)[^\s，。；：]+/g,
  /\b(?:npm|pnpm|yarn|bun|git|gh|node|tsx|tsc|vite|vitest|curl|wget|bash|sh|rm|sudo)\s+[^\n，。；：]+/g,
  /\b(?:TypeError|ReferenceError|SyntaxError|Error|Exception):[^\n]+/g,
  /\s+at\s+[^\n]+/g
];

const TECHNICAL_WORDS = /\b(diff|patch|stack trace|command|shell|stdout|stderr|commit|branch|pull request|api key|token)\b/i;

export function sanitizeForProduct(rawText: string): string {
  let text = rawText;
  for (const pattern of TECHNICAL_PATTERNS) {
    text = text.replace(pattern, "（技术细节已记录）");
  }
  text = text.replace(/\s+/g, " ").trim();

  if (!text) {
    return "技术细节已记录到审计日志。";
  }

  const cjkCount = [...text].filter((char) => /[\u3400-\u9fff]/.test(char)).length;
  const visibleCount = [...text].filter((char) => /\S/.test(char)).length || 1;
  const mostlyNonChinese = cjkCount / visibleCount < 0.25;

  if (mostlyNonChinese || TECHNICAL_WORDS.test(text)) {
    return "我已处理模型返回的技术内容，并把细节记录到审计日志。";
  }

  return text;
}

export class ProductRenderer {
  readonly expert: boolean;

  constructor(options: RenderOptions = {}) {
    this.expert = Boolean(options.expert);
  }

  render(event: ProductEvent): string {
    const base = event.message ?? DEFAULT_MESSAGES[event.type];
    const detail = event.detail ? ` ${event.detail}` : "";
    const message = `${base}${detail}`;

    if (this.expert) {
      const raw = event.raw === undefined ? "" : `\n${formatRaw(event.raw)}`;
      return `${prefixFor(event)} ${message}${raw}`.trim();
    }

    return `${prefixFor(event)} ${sanitizeForProduct(message)}`.trim();
  }

  progress(type: ProductEventType, detail?: string): string {
    return this.render({ type, detail });
  }

  error(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return this.render({
      type: "error",
      message: "遇到一个需要处理的问题。",
      detail: sanitizeForProduct(message),
      raw: error,
      severity: "error"
    });
  }
}

function prefixFor(event: ProductEvent): string {
  switch (event.severity ?? event.type) {
    case "success":
    case "done":
      return "完成";
    case "warning":
    case "risk":
      return "注意";
    case "error":
      return "问题";
    default:
      return "进度";
  }
}

function formatRaw(raw: unknown): string {
  if (raw instanceof Error) {
    return `${raw.name}: ${raw.message}\n${raw.stack ?? ""}`.trim();
  }

  if (typeof raw === "string") {
    return raw;
  }

  return JSON.stringify(raw, null, 2);
}

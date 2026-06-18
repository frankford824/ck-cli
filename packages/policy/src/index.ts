export type OperationKind =
  | "read"
  | "write"
  | "delete"
  | "shell"
  | "git-init"
  | "git-branch"
  | "git-commit"
  | "git-push"
  | "github-pr"
  | "github-merge"
  | "install"
  | "validate"
  | "deploy";

export type RiskLevel = "low" | "medium" | "high" | "blocked";

export interface OperationRequest {
  kind: OperationKind;
  target?: string;
  command?: string;
  description?: string;
}

export interface PolicyDecision {
  risk: RiskLevel;
  allowed: boolean;
  confirmationRequired: boolean;
  userMessage: string;
  reasons: string[];
}

const SECRET_TARGET = /(^|\/|\\)(\.env|\.env\..*|id_rsa|id_dsa|id_ed25519|.*\.pem|.*\.key|.*secret.*|.*credential.*)$/i;
const DEPLOY_TARGET = /(wrangler|vercel|netlify|firebase|kubectl|helm|terraform|pulumi|serverless)\s+(deploy|apply|up|release|publish)/i;
const REMOTE_SCRIPT = /(curl|wget)\s+[^|&;]+(\|\s*(bash|sh|zsh)|>\s*[^&;]+\s*&&\s*(bash|sh|zsh))/i;
const DESTRUCTIVE_COMMAND = /\b(rm\s+-rf|del\s+\/[sq]|rmdir\s+\/[sq]|chmod\s+-R\s+777|sudo\s+rm|git\s+reset\s+--hard|git\s+clean\s+-fd)\b/i;
const DATABASE_COMMAND = /\b(drop\s+database|drop\s+schema|truncate\s+table|prisma\s+migrate\s+deploy|sequelize\s+db:migrate|rails\s+db:migrate)\b/i;
const PUBLISH_COMMAND = /\b(npm\s+publish|pnpm\s+publish|yarn\s+npm\s+publish|docker\s+push)\b/i;

export function assessOperation(operation: OperationRequest): PolicyDecision {
  const reasons: string[] = [];
  let risk: RiskLevel = "low";
  let confirmationRequired = false;
  let allowed = true;

  const command = operation.command ?? "";
  const target = operation.target ?? "";

  if (operation.kind === "delete") {
    risk = "high";
    confirmationRequired = true;
    reasons.push("会删除内容");
  }

  if (operation.kind === "git-push" || operation.kind === "github-pr" || operation.kind === "github-merge") {
    risk = maxRisk(risk, "high");
    confirmationRequired = true;
    reasons.push(
      operation.kind === "git-push"
        ? "会把成果发送到远程仓库"
        : operation.kind === "github-pr"
          ? "会创建团队审查入口"
          : "会把审查后的成果合入主线"
    );
  }

  if (operation.kind === "deploy") {
    risk = maxRisk(risk, "high");
    confirmationRequired = true;
    reasons.push("可能影响线上服务");
  }

  if (SECRET_TARGET.test(target)) {
    risk = maxRisk(risk, "high");
    confirmationRequired = true;
    reasons.push("涉及密钥或敏感配置");
  }

  if (REMOTE_SCRIPT.test(command)) {
    risk = maxRisk(risk, "high");
    confirmationRequired = true;
    reasons.push("会执行来自网络的脚本");
  }

  if (DESTRUCTIVE_COMMAND.test(command)) {
    risk = "blocked";
    allowed = false;
    confirmationRequired = true;
    reasons.push("包含高破坏性操作");
  }

  if (DATABASE_COMMAND.test(command)) {
    risk = maxRisk(risk, "high");
    confirmationRequired = true;
    reasons.push("可能改变数据库结构或数据");
  }

  if (PUBLISH_COMMAND.test(command) || DEPLOY_TARGET.test(command)) {
    risk = maxRisk(risk, "high");
    confirmationRequired = true;
    reasons.push("可能发布或部署到外部环境");
  }

  if (operation.kind === "install" && risk === "low") {
    risk = "medium";
    reasons.push("会安装或更新依赖");
  }

  return {
    risk,
    allowed,
    confirmationRequired,
    reasons,
    userMessage: describeDecision(operation, risk, allowed, confirmationRequired, reasons)
  };
}

export class PolicyBlockedError extends Error {
  readonly decision: PolicyDecision;

  constructor(decision: PolicyDecision) {
    super(decision.userMessage);
    this.name = "PolicyBlockedError";
    this.decision = decision;
  }
}

function describeDecision(
  operation: OperationRequest,
  risk: RiskLevel,
  allowed: boolean,
  confirmationRequired: boolean,
  reasons: string[]
): string {
  if (!allowed) {
    return "这个操作风险过高，已被阻止。";
  }

  if (confirmationRequired) {
    return `这个操作需要你确认：${reasons.join("、") || operation.description || "影响较大"}。`;
  }

  if (risk === "medium") {
    return "这个操作会自动执行，并已记录到审计日志。";
  }

  return "这个操作可以自动执行。";
}

function maxRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ["low", "medium", "high", "blocked"];
  return order.indexOf(right) > order.indexOf(left) ? right : left;
}

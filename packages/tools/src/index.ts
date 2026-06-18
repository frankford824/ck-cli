import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { assessOperation, PolicyBlockedError, type OperationKind } from "@ccli/policy";
import type { AuditSession } from "@ccli/session";
import { createWebAppTemplate } from "@ccli/templates";

export interface ToolContext {
  cwd: string;
  audit?: AuditSession;
  confirmed?: boolean;
}

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface DraftPrOptions {
  title: string;
  body: string;
  base?: string;
  confirmed?: boolean;
}

export interface DraftPrResult {
  url?: string;
  number?: number;
  created: boolean;
  message: string;
}

export interface PullRequestInfo {
  number: number;
  url: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  mergeable?: boolean | null;
  head: string;
  base: string;
  sha: string;
}

export interface PrCommentResult {
  posted: boolean;
  url?: string;
  message: string;
}

export interface MergePrOptions {
  number: number;
  method?: "squash" | "merge" | "rebase";
  commitTitle?: string;
  commitMessage?: string;
  confirmed?: boolean;
}

export interface MergePrResult {
  merged: boolean;
  url?: string;
  message: string;
}

export class ShellTool {
  async run(command: string, context: ToolContext & { kind?: OperationKind; timeoutMs?: number }): Promise<CommandResult> {
    const decision = assessOperation({ kind: context.kind ?? "shell", command });
    if (!decision.allowed || (decision.confirmationRequired && !context.confirmed)) {
      throw new PolicyBlockedError(decision);
    }

    await context.audit?.record("tool.shell.start", "开始执行后台操作", { command });
    const result = await runShell(command, context.cwd, context.timeoutMs ?? 120_000);
    await context.audit?.record("tool.shell.end", "后台操作已结束", result);
    return result;
  }
}

export class FileTool {
  async read(relativePath: string, context: ToolContext): Promise<string> {
    const absolutePath = safeResolve(context.cwd, relativePath);
    const content = await readFile(absolutePath, "utf8");
    await context.audit?.record("tool.file.read", "读取项目内容", { relativePath });
    return content;
  }

  async write(relativePath: string, content: string, context: ToolContext): Promise<void> {
    const absolutePath = safeResolve(context.cwd, relativePath);
    const decision = assessOperation({ kind: "write", target: relativePath });
    if (!decision.allowed || (decision.confirmationRequired && !context.confirmed)) {
      throw new PolicyBlockedError(decision);
    }

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
    await context.audit?.record("tool.file.write", "更新项目内容", { relativePath, bytes: Buffer.byteLength(content) });
  }

  async list(context: ToolContext, relativePath = "."): Promise<string[]> {
    const root = safeResolve(context.cwd, relativePath);
    const results: string[] = [];
    await walk(root, context.cwd, results);
    await context.audit?.record("tool.file.list", "了解项目结构", { relativePath, count: results.length });
    return results;
  }
}

export class GitTool {
  private readonly shell = new ShellTool();

  async isRepo(cwd: string): Promise<boolean> {
    const result = await runShell("git rev-parse --is-inside-work-tree", cwd, 30_000).catch(() => undefined);
    return result?.exitCode === 0 && result.stdout.trim() === "true";
  }

  async init(context: ToolContext): Promise<void> {
    if (await this.isRepo(context.cwd)) {
      return;
    }
    await this.shell.run("git init -b main", { ...context, kind: "git-init", confirmed: true });
  }

  async ensureMainBranch(context: ToolContext): Promise<void> {
    if (!(await this.isRepo(context.cwd))) {
      await this.init(context);
      return;
    }
    const branch = await this.currentBranch(context.cwd).catch(() => "");
    if (!branch) {
      await this.shell.run("git branch -M main", { ...context, kind: "git-branch", confirmed: true }).catch(() => undefined);
    }
  }

  async createTaskBranch(slug: string, context: ToolContext): Promise<string> {
    await this.init(context);
    const base = `ccli/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}/${slug}`;
    let branch = base;
    for (let index = 2; index < 50; index += 1) {
      const exists = await this.branchExists(branch, context.cwd);
      if (!exists) {
        break;
      }
      branch = `${base}-${index}`;
    }
    await this.shell.run(`git switch -c ${quote(branch)}`, { ...context, kind: "git-branch", confirmed: true });
    return branch;
  }

  async currentBranch(cwd: string): Promise<string> {
    const result = await runShell("git branch --show-current", cwd, 30_000);
    return result.stdout.trim();
  }

  async status(cwd: string): Promise<string> {
    const result = await runShell("git status --short", cwd, 30_000);
    return result.stdout.trim();
  }

  async changedFilesSinceBase(cwd: string, base = "origin/main"): Promise<string[]> {
    const result = await runShell(`git diff --name-only ${quote(base)}...HEAD`, cwd, 30_000);
    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async hasChanges(cwd: string): Promise<boolean> {
    return (await this.status(cwd)).length > 0;
  }

  async commitAll(message: string, context: ToolContext): Promise<boolean> {
    if (!(await this.hasChanges(context.cwd))) {
      await context.audit?.record("tool.git.commit.skip", "没有需要保存的新成果");
      return false;
    }

    await this.ensureLocalIdentity(context.cwd);
    await this.shell.run("git add .", { ...context, kind: "git-commit", confirmed: true });
    await this.shell.run(`git commit -m ${quote(message)}`, { ...context, kind: "git-commit", confirmed: true });
    return true;
  }

  async pushCurrent(context: ToolContext): Promise<void> {
    const branch = await this.currentBranch(context.cwd);
    await this.shell.run(`git push -u origin ${quote(branch)}`, { ...context, kind: "git-push" });
  }

  async defaultBaseBranch(cwd: string): Promise<string> {
    const result = await runShell("git remote show origin", cwd, 30_000).catch(() => undefined);
    const match = result?.stdout.match(/HEAD branch:\s+(.+)/);
    return match?.[1]?.trim() || "main";
  }

  private async branchExists(branch: string, cwd: string): Promise<boolean> {
    const result = await runShell(`git rev-parse --verify ${quote(branch)}`, cwd, 30_000).catch(() => undefined);
    return result?.exitCode === 0;
  }

  private async ensureLocalIdentity(cwd: string): Promise<void> {
    const name = await runShell("git config user.name", cwd, 30_000).catch(() => undefined);
    const email = await runShell("git config user.email", cwd, 30_000).catch(() => undefined);
    if (!name?.stdout.trim()) {
      await runShell("git config user.name ccli", cwd, 30_000);
    }
    if (!email?.stdout.trim()) {
      await runShell("git config user.email ccli@example.invalid", cwd, 30_000);
    }
  }
}

export class GitHubTool {
  async findOpenPrForCurrentBranch(context: ToolContext): Promise<PullRequestInfo | undefined> {
    const git = new GitTool();
    const branch = await git.currentBranch(context.cwd);
    const remote = await getRemote(context.cwd);
    const parsedRemote = remote ? parseGithubRemote(remote) : undefined;
    if (!parsedRemote) {
      return undefined;
    }

    const prs = await githubApi<PullRequestApi[]>(
      `/repos/${parsedRemote.owner}/${parsedRemote.repo}/pulls?head=${encodeURIComponent(
        `${parsedRemote.owner}:${branch}`
      )}&state=open`
    );
    const pr = prs[0];
    return pr ? mapPullRequest(pr) : undefined;
  }

  async createOrFindDraftPr(context: ToolContext, options: DraftPrOptions): Promise<DraftPrResult> {
    const existing = await this.findOpenPrForCurrentBranch(context);
    if (existing) {
      await context.audit?.record("tool.github.pr.existing", "已找到现有团队审查入口", existing);
      return {
        created: false,
        number: existing.number,
        url: existing.url,
        message: "已找到现有待审查交付链接。"
      };
    }

    return this.createDraftPr(context, options);
  }

  async createDraftPr(context: ToolContext, options: DraftPrOptions): Promise<DraftPrResult> {
    const decision = assessOperation({ kind: "github-pr" });
    if (!decision.allowed || (decision.confirmationRequired && !options.confirmed && !context.confirmed)) {
      throw new PolicyBlockedError(decision);
    }

    const git = new GitTool();
    const branch = await git.currentBranch(context.cwd);
    const base = options.base ?? (await git.defaultBaseBranch(context.cwd));
    const remote = await getRemote(context.cwd);
    const parsedRemote = remote ? parseGithubRemote(remote) : undefined;

    await context.audit?.record("tool.github.pr.start", "准备创建团队审查入口", {
      branch,
      base,
      remote: parsedRemote
    });

    if (parsedRemote && process.env.GITHUB_TOKEN) {
      const pr = await createPrWithApi(parsedRemote, {
        title: options.title,
        body: options.body,
        head: branch,
        base,
        token: process.env.GITHUB_TOKEN
      });
      await context.audit?.record("tool.github.pr.done", "已创建团队审查入口", pr);
      return { created: true, number: pr.number, url: pr.url, message: "已创建待审查交付链接。" };
    }

    const ghAvailable = await commandExists("gh", context.cwd);
    if (ghAvailable) {
      const command = [
        "gh pr create",
        "--draft",
        `--title ${quote(options.title)}`,
        `--body ${quote(options.body)}`,
        `--base ${quote(base)}`,
        `--head ${quote(branch)}`
      ].join(" ");
      const result = await runShell(command, context.cwd, 120_000);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || "创建团队审查入口失败");
      }
      const url = result.stdout.trim().split(/\s+/).find((part) => part.startsWith("http"));
      const number = parsePrNumber(url);
      await context.audit?.record("tool.github.pr.done", "已创建团队审查入口", { url, number, stdout: result.stdout });
      return { created: true, number, url, message: "已创建待审查交付链接。" };
    }

    return {
      created: false,
      message: "还不能自动创建团队审查入口。请先配置 GitHub Token，或登录 GitHub CLI。"
    };
  }

  async postReviewSummary(context: ToolContext, number: number, body: string): Promise<PrCommentResult> {
    const remote = await getRemote(context.cwd);
    const parsedRemote = remote ? parseGithubRemote(remote) : undefined;
    await context.audit?.record("tool.github.review.start", "准备发布审查摘要", { number });

    if (parsedRemote && process.env.GITHUB_TOKEN) {
      const comment = await githubApi<{ html_url?: string }>(`/repos/${parsedRemote.owner}/${parsedRemote.repo}/issues/${number}/comments`, {
        method: "POST",
        body: { body }
      });
      await context.audit?.record("tool.github.review.done", "已发布审查摘要", comment);
      return { posted: true, url: comment.html_url, message: "已把审查摘要发布到团队审查入口。" };
    }

    const ghAvailable = await commandExists("gh", context.cwd);
    if (ghAvailable) {
      const result = await runShell(`gh pr comment ${number} --body ${quote(body)}`, context.cwd, 120_000);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || "发布审查摘要失败");
      }
      return { posted: true, message: "已把审查摘要发布到团队审查入口。" };
    }

    return {
      posted: false,
      message: "还不能自动发布审查摘要。请先配置 GitHub Token，或登录 GitHub CLI。"
    };
  }

  async mergePr(context: ToolContext, options: MergePrOptions): Promise<MergePrResult> {
    const decision = assessOperation({ kind: "github-merge" });
    if (!decision.allowed || (decision.confirmationRequired && !options.confirmed && !context.confirmed)) {
      throw new PolicyBlockedError(decision);
    }

    const remote = await getRemote(context.cwd);
    const parsedRemote = remote ? parseGithubRemote(remote) : undefined;
    const method = options.method ?? "squash";
    await context.audit?.record("tool.github.merge.start", "准备合并团队审查入口", {
      number: options.number,
      method
    });

    if (parsedRemote && process.env.GITHUB_TOKEN) {
      const pr = await githubApi<{ html_url?: string; merged?: boolean; message?: string }>(
        `/repos/${parsedRemote.owner}/${parsedRemote.repo}/pulls/${options.number}/merge`,
        {
          method: "PUT",
          body: {
            merge_method: method,
            commit_title: options.commitTitle,
            commit_message: options.commitMessage
          }
        }
      );
      await context.audit?.record("tool.github.merge.done", "已合并团队审查入口", pr);
      return {
        merged: Boolean(pr.merged),
        url: pr.html_url,
        message: pr.merged ? "已把审查后的成果合入主线。" : pr.message ?? "合并没有完成。"
      };
    }

    const ghAvailable = await commandExists("gh", context.cwd);
    if (ghAvailable) {
      const methodFlag = method === "merge" ? "--merge" : method === "rebase" ? "--rebase" : "--squash";
      const result = await runShell(`gh pr merge ${options.number} ${methodFlag} --delete-branch`, context.cwd, 120_000);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || "合并团队审查入口失败");
      }
      await context.audit?.record("tool.github.merge.done", "已合并团队审查入口", result);
      return { merged: true, message: "已把审查后的成果合入主线。" };
    }

    return {
      merged: false,
      message: "还不能自动合并。请先配置 GitHub Token，或登录 GitHub CLI。"
    };
  }
}

export class ProjectTool {
  async detectPackageManager(cwd: string): Promise<"pnpm" | "npm" | "yarn" | "bun" | undefined> {
    if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
    if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
    if (existsSync(join(cwd, "package-lock.json"))) return "npm";
    if (existsSync(join(cwd, "package.json"))) return "pnpm";
    return undefined;
  }

  async packageScripts(cwd: string): Promise<Record<string, string>> {
    try {
      const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as { scripts?: Record<string, string> };
      return pkg.scripts ?? {};
    } catch {
      return {};
    }
  }

  async runValidation(context: ToolContext): Promise<CommandResult[]> {
    const manager = await this.detectPackageManager(context.cwd);
    const scripts = await this.packageScripts(context.cwd);
    if (!manager) {
      await context.audit?.record("tool.validate.skip", "没有发现可自动验证的项目配置");
      return [];
    }
    if (!existsSync(join(context.cwd, "node_modules"))) {
      await context.audit?.record("tool.validate.skip", "项目依赖尚未安装，已跳过自动验证");
      return [];
    }

    const commands: string[] = [];
    if (scripts.test) commands.push(scriptCommand(manager, "test"));
    if (scripts.build) commands.push(scriptCommand(manager, "build"));

    const shell = new ShellTool();
    const results: CommandResult[] = [];
    for (const command of commands) {
      results.push(await shell.run(command, { ...context, kind: "validate", confirmed: true, timeoutMs: 180_000 }));
    }
    return results;
  }
}

export async function createTemplateProject(root: string, name: string, audit?: AuditSession): Promise<string[]> {
  const files = await createWebAppTemplate({ root, name });
  await audit?.record("tool.template.create", "创建 Web 应用模板", { files });
  return files;
}

export async function runShell(command: string, cwd: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolvePromise({ command, exitCode: exitCode ?? 1, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({ command, exitCode: 1, stdout, stderr: error.message });
    });
  });
}

function safeResolve(cwd: string, relativePath: string): string {
  const root = resolve(cwd);
  const absolutePath = resolve(root, relativePath);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
    throw new Error("目标不在当前工作区内");
  }
  return absolutePath;
}

async function walk(root: string, cwd: string, results: string[]): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }
    const absolutePath = join(root, entry.name);
    const relativePath = relative(cwd, absolutePath);
    if (entry.isDirectory()) {
      await walk(absolutePath, cwd, results);
    } else {
      const fileStat = await stat(absolutePath);
      if (fileStat.size < 500_000) {
        results.push(relativePath);
      }
    }
  }
}

function scriptCommand(manager: "pnpm" | "npm" | "yarn" | "bun", script: string): string {
  if (manager === "npm") return `npm run ${script}`;
  if (manager === "bun") return `bun run ${script}`;
  return `${manager} ${script}`;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function commandExists(command: string, cwd: string): Promise<boolean> {
  const probe = process.platform === "win32" ? `where ${quote(command)}` : `command -v ${quote(command)}`;
  const result = await runShell(probe, cwd, 30_000);
  return result.exitCode === 0;
}

async function getRemote(cwd: string): Promise<string | undefined> {
  const result = await runShell("git config --get remote.origin.url", cwd, 30_000).catch(() => undefined);
  return result?.stdout.trim() || undefined;
}

function parseGithubRemote(remote: string): { owner: string; repo: string } | undefined {
  const https = remote.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (https) {
    return { owner: https[1], repo: https[2] };
  }
  const ssh = remote.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) {
    return { owner: ssh[1], repo: ssh[2] };
  }
  return undefined;
}

interface PullRequestApi {
  number: number;
  html_url?: string;
  state: "open" | "closed";
  draft?: boolean;
  merged_at?: string | null;
  mergeable?: boolean | null;
  head?: { ref?: string; sha?: string };
  base?: { ref?: string };
}

interface GithubRequestOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
}

async function githubApi<T>(path: string, options: GithubRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28"
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

function mapPullRequest(pr: PullRequestApi): PullRequestInfo {
  return {
    number: pr.number,
    url: pr.html_url ?? "",
    state: pr.state,
    draft: Boolean(pr.draft),
    merged: Boolean(pr.merged_at),
    mergeable: pr.mergeable,
    head: pr.head?.ref ?? "",
    base: pr.base?.ref ?? "",
    sha: pr.head?.sha ?? ""
  };
}

async function createPrWithApi(
  remote: { owner: string; repo: string },
  input: { title: string; body: string; head: string; base: string; token: string }
): Promise<{ url?: string; number?: number }> {
  const response = await fetch(`https://api.github.com/repos/${remote.owner}/${remote.repo}/pulls`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${input.token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28"
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
      draft: true
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const json = (await response.json()) as { html_url?: string; number?: number };
  return { url: json.html_url, number: json.number };
}

function parsePrNumber(url?: string): number | undefined {
  const match = url?.match(/\/pull\/(\d+)/);
  return match?.[1] ? Number(match[1]) : undefined;
}

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProductEvent } from "@ccli/product-ui";

export type AuditVisibility = "hidden" | "user";

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  summary: string;
  visibility: AuditVisibility;
  payload?: unknown;
}

export interface TaskStepState {
  name: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  message: string;
}

export interface CcliState {
  updatedAt: string;
  currentTask?: string;
  status: "idle" | "running" | "done" | "failed";
  summary: string;
  branch?: string;
  auditFile?: string;
  steps: TaskStepState[];
}

export interface AuditSessionOptions {
  cwd: string;
  task?: string;
}

export class AuditSession {
  readonly cwd: string;
  readonly auditFile: string;

  private constructor(cwd: string, auditFile: string) {
    this.cwd = cwd;
    this.auditFile = auditFile;
  }

  static async create(options: AuditSessionOptions): Promise<AuditSession> {
    const root = join(options.cwd, ".ccli", "audit");
    await mkdir(root, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = join(root, `${stamp}.jsonl`);
    const session = new AuditSession(options.cwd, file);
    await session.record("session.start", "开始新的任务会话", { task: options.task }, "hidden");
    return session;
  }

  async record(
    action: string,
    summary: string,
    payload?: unknown,
    visibility: AuditVisibility = "hidden"
  ): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: new Date().toISOString(),
      action,
      summary,
      visibility,
      payload
    };
    await appendFile(this.auditFile, `${JSON.stringify(entry)}\n`, "utf8");
    return entry;
  }

  async recordEvent(event: ProductEvent): Promise<void> {
    await this.record(`ui.${event.type}`, event.message ?? event.type, event.raw, "user");
  }
}

export async function updateState(cwd: string, patch: Partial<CcliState>): Promise<CcliState> {
  const current = await readState(cwd);
  const next: CcliState = {
    updatedAt: new Date().toISOString(),
    status: "idle",
    summary: "暂无正在进行的任务。",
    steps: [],
    ...current,
    ...patch
  };

  const file = statePath(cwd);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function readState(cwd: string): Promise<CcliState | undefined> {
  try {
    const content = await readFile(statePath(cwd), "utf8");
    return JSON.parse(content) as CcliState;
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function readLatestAuditSummary(cwd: string): Promise<{ file?: string; entries: AuditEntry[] }> {
  const state = await readState(cwd);
  if (!state?.auditFile) {
    return { entries: [] };
  }

  try {
    const content = await readFile(state.auditFile, "utf8");
    const entries = content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditEntry);
    return { file: state.auditFile, entries };
  } catch (error) {
    if (isNotFound(error)) {
      return { file: state.auditFile, entries: [] };
    }
    throw error;
  }
}

export function statePath(cwd: string): string {
  return join(cwd, ".ccli", "state.json");
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

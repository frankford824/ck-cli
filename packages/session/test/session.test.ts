import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuditSession, readLatestAuditSummary, readState, updateState } from "../src/index.js";

describe("session", () => {
  it("records audit entries and state", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-session-"));
    try {
      const session = await AuditSession.create({ cwd, task: "测试任务" });
      await session.record("tool.test", "测试记录", { ok: true });
      await updateState(cwd, {
        currentTask: "测试任务",
        status: "running",
        summary: "正在处理测试任务。",
        auditFile: session.auditFile
      });

      const state = await readState(cwd);
      const audit = await readLatestAuditSummary(cwd);

      expect(state?.currentTask).toBe("测试任务");
      expect(audit.entries.length).toBeGreaterThanOrEqual(2);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

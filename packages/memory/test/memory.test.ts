import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalMemoryStore, memoryContextForPrompt } from "../src/index.js";

describe("LocalMemoryStore", () => {
  it("stores and searches local project memories", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-memory-"));
    try {
      const store = new LocalMemoryStore(cwd);
      await store.remember({
        wing: "项目",
        room: "任务",
        drawer: "登录",
        kind: "task",
        text: "用户希望增加登录页面"
      });

      const hits = await store.search("登录页面");
      expect(hits).toHaveLength(1);
      expect(memoryContextForPrompt(hits)).toContain("登录页面");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

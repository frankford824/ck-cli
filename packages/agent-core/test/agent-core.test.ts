import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TaskOrchestrator } from "../src/index.js";
import { createTemplateProject } from "@ccli/tools";

describe("TaskOrchestrator", () => {
  it("runs a fallback workflow without model credentials", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-agent-"));
    try {
      await createTemplateProject(cwd, "demo");
      const events: string[] = [];
      const result = await new TaskOrchestrator().run({
        cwd,
        requirement: "添加登录页面",
        onEvent: (_event, rendered) => {
          events.push(rendered);
        }
      });

      expect(result.branch).toContain("ccli/");
      expect(result.build.usedModel).toBe(false);
      expect(result.build.changedFiles).toContain("src/App.tsx");
      expect(events.join("\n")).toContain("正在实现功能");
      await expect(readFile(join(cwd, "src", "App.tsx"), "utf8").then((content) => content)).resolves.toContain(
        "登录页面"
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("generates a useful inventory starter without model credentials", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-agent-"));
    try {
      await createTemplateProject(cwd, "inventory-demo");
      await new TaskOrchestrator().run({
        cwd,
        requirement: "做一个库存看板，能看低库存和出库提醒"
      });

      const app = await readFile(join(cwd, "src", "App.tsx"), "utf8");
      expect(app).toContain("低库存预警");
      expect(app).toContain("生成补货单");
      expect(app).toContain("今日出库");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

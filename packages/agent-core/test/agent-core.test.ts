import { mkdtemp, rm } from "node:fs/promises";
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
      expect(events.join("\n")).toContain("正在实现功能");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

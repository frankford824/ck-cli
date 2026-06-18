import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  defaultToolBudget,
  harnessPrompt,
  loadHarnessContext,
  progressSnapshot,
  readHarnessProgress,
  renderHarnessSummary,
  writeHarnessProgress
} from "../src/index.js";

describe("harness", () => {
  it("loads deterministic project guidance and renders stage tool budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-harness-"));
    try {
      await writeFile(join(root, "AGENTS.md"), "项目固定事实：所有输出默认中文。\n", "utf8");
      await writeFile(join(root, "CLAUDE.md"), "不要把过程术语直接暴露给普通用户。\n", "utf8");
      await mkdir(join(root, ".ccli", "harness", "rules"), { recursive: true });
      await writeFile(join(root, ".ccli", "harness", "rules", "safety.md"), "高影响动作必须确认。\n", "utf8");

      const context = await loadHarnessContext(root);
      const prompt = harnessPrompt(context, "plan");

      expect(context.standingFacts).toHaveLength(2);
      expect(prompt).toContain("整理中文产品方案");
      expect(prompt).toContain("项目固定事实");
      expect(prompt).toContain("不展示代码、命令、路径、堆栈");
      expect(renderHarnessSummary(context)).toContain("驾驭系统已加载");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists progress so a later run can resume context", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-progress-"));
    try {
      const progress = progressSnapshot({
        task: "添加登录页",
        currentStage: "validate",
        summary: "正在验证是否正常。",
        facts: ["已经完成页面初稿"],
        nextAction: "如果验证失败，将反馈给开发代理修复。",
        validation: "failed"
      });

      await writeHarnessProgress(root, progress);
      await expect(readHarnessProgress(root)).resolves.toMatchObject({
        task: "添加登录页",
        currentStage: "validate",
        validation: "failed"
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps a small staged tool surface", () => {
    const budgets = defaultToolBudget();
    expect(budgets).toHaveLength(7);
    expect(budgets.every((budget) => budget.allowedTools.length <= 3)).toBe(true);
    expect(budgets.find((budget) => budget.stage === "ship")?.deniedActions).toContain("无确认发布");
  });
});

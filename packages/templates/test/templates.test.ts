import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { harnessScaffoldFiles, installHarnessScaffold, installHarnessSkills, webTemplateFiles } from "../src/index.js";

describe("webTemplateFiles", () => {
  it("creates the expected Vite React files", () => {
    const files = webTemplateFiles("演示项目");

    expect(files["package.json"]).toContain("vite");
    expect(files["src/App.tsx"]).toContain("演示项目");
    expect(files[".ccli/config.json"]).toContain("plain-user");
    expect(files[".ccli/config.json"]).not.toContain("claude-sonnet");
    expect(files["DESIGN.md"]).toContain("设计契约");
    expect(files["AGENTS.md"]).toContain("项目指南");
    expect(files[".ccli/harness/rules/safety.md"]).toContain("安全规则");
    expect(files[".ccli/harness/rules/product.md"]).toContain("产品规则");
    expect(files[".ccli/harness/feature-list.json"]).toContain("first-visible-outcome");
    expect(files[".ccli/harness/init-check.json"]).toContain("每次长任务开始前");
    expect(files[".ccli/harness/agent-memory/LESSONS.md"]).toContain("失败经验库");
    expect(files[".ccli/skills/office-hours.md"]).toContain("固定追问");
    expect(files[".ccli/skills/frontend-design.md"]).toContain("前端设计技能");
    expect(files[".gitignore"]).toContain(".ccli/progress.json");
  });

  it("installs reusable harness skills without overwriting local edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-skills-"));
    try {
      const first = await installHarnessSkills({ root });
      expect(first.written).toContain(".ccli/skills/frontend-design.md");
      expect(await readFile(join(root, ".ccli", "skills", "qa.md"), "utf8")).toContain("质量审查技能");

      await writeFile(join(root, ".ccli", "skills", "qa.md"), "自定义审查规则\n", "utf8");
      const second = await installHarnessSkills({ root });

      expect(second.skipped).toContain(".ccli/skills/qa.md");
      expect(await readFile(join(root, ".ccli", "skills", "qa.md"), "utf8")).toBe("自定义审查规则\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("provides full harness scaffold files for existing repositories", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-scaffold-"));
    try {
      await writeFile(join(root, "AGENTS.md"), "保留我的项目规则\n", "utf8");
      const result = await installHarnessScaffold({ root, projectName: "老板系统" });

      expect(result.skipped).toContain("AGENTS.md");
      expect(result.written).toContain(".ccli/harness/feature-list.json");
      expect(result.written).toContain(".ccli/harness/init-check.json");
      expect(result.written).toContain(".ccli/skills/frontend-design.md");
      expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("保留我的项目规则\n");
      expect(await readFile(join(root, ".ccli", "harness", "feature-list.json"), "utf8")).toContain("老板系统");
      expect(harnessScaffoldFiles("老板系统")["DESIGN.md"]).toContain("老板系统");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

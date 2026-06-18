import { describe, expect, it } from "vitest";
import { webTemplateFiles } from "../src/index.js";

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
    expect(files[".ccli/skills/office-hours.md"]).toContain("固定追问");
    expect(files[".ccli/skills/frontend-design.md"]).toContain("前端设计技能");
    expect(files[".gitignore"]).toContain(".ccli/progress.json");
  });
});

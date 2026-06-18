import { describe, expect, it } from "vitest";
import { webTemplateFiles } from "../src/index.js";

describe("webTemplateFiles", () => {
  it("creates the expected Vite React files", () => {
    const files = webTemplateFiles("演示项目");

    expect(files["package.json"]).toContain("vite");
    expect(files["src/App.tsx"]).toContain("演示项目");
    expect(files[".ccli/config.json"]).toContain("plain-user");
    expect(files["DESIGN.md"]).toContain("设计契约");
    expect(files[".ccli/skills/office-hours.md"]).toContain("固定追问");
    expect(files[".ccli/skills/frontend-design.md"]).toContain("前端设计技能");
  });
});

import { describe, expect, it } from "vitest";
import { ProductRenderer, sanitizeForProduct } from "../src/index.js";

describe("ProductRenderer", () => {
  it("hides code blocks, commands, paths and stack traces in normal mode", () => {
    const renderer = new ProductRenderer();
    const output = renderer.render({
      type: "error",
      message: "失败于 src/App.tsx",
      detail:
        "```ts\nconst x = 1\n``` git commit -m test TypeError: boom\n    at run (/tmp/a.ts:1:1)"
    });

    expect(output).not.toContain("src/App.tsx");
    expect(output).not.toContain("git commit");
    expect(output).not.toContain("const x");
    expect(output).not.toContain("TypeError");
    expect(output).toContain("技术细节");
  });

  it("keeps ordinary Chinese product wording", () => {
    expect(sanitizeForProduct("正在验证功能是否能正常运行。")).toBe("正在验证功能是否能正常运行。");
  });

  it("shows raw details only in expert mode", () => {
    const renderer = new ProductRenderer({ expert: true });
    const output = renderer.render({ type: "info", message: "查看细节", raw: { path: "src/App.tsx" } });

    expect(output).toContain("src/App.tsx");
  });
});

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTemplateProject, FileTool, ProjectTool } from "../src/index.js";

describe("tools", () => {
  it("creates a template project", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-tools-"));
    try {
      await createTemplateProject(cwd, "测试应用");
      const pkg = await readFile(join(cwd, "package.json"), "utf8");
      expect(pkg).toContain("vite");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("prevents file writes outside workspace", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-tools-"));
    try {
      const fileTool = new FileTool();
      await expect(fileTool.write("../outside.txt", "bad", { cwd, confirmed: true })).rejects.toThrow(
        "当前工作区"
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("detects package manager from package.json", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-tools-"));
    try {
      await createTemplateProject(cwd, "demo");
      await expect(new ProjectTool().detectPackageManager(cwd)).resolves.toBe("pnpm");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

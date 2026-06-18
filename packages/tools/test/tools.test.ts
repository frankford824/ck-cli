import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTemplateProject, FileTool, GitHubTool, ProjectTool, runShell } from "../src/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("finds an existing open PR for the current branch", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-tools-"));
    try {
      await runShell("git init -b main", cwd, 30_000);
      await runShell("git remote add origin git@github.com:owner/repo.git", cwd, 30_000);
      await runShell("git switch -c feature/demo", cwd, 30_000);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify([
              {
                number: 7,
                html_url: "https://github.com/owner/repo/pull/7",
                state: "open",
                draft: false,
                merged_at: null,
                mergeable: true,
                head: { ref: "feature/demo", sha: "abc" },
                base: { ref: "main" }
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      );

      const pr = await new GitHubTool().findOpenPrForCurrentBranch({ cwd });

      expect(pr?.number).toBe(7);
      expect(pr?.url).toContain("/pull/7");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

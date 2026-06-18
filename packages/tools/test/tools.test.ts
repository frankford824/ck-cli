import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTemplateProject, FileTool, GitHubTool, GitTool, ProjectTool, runShell } from "../src/index.js";

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

  it("stops timed out shell commands", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-tools-"));
    try {
      const result = await runShell("node -e \"setTimeout(() => {}, 5000)\"", cwd, 100);
      expect(result.exitCode).toBe(124);
      expect(result.stderr).toContain("超时");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("streams shell output to a progress callback", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-tools-"));
    try {
      const chunks: string[] = [];
      const result = await runShell("node -e \"console.log('progress-ready')\"", cwd, 30_000, (chunk) => {
        chunks.push(chunk);
      });
      expect(result.exitCode).toBe(0);
      expect(chunks.join("")).toContain("progress-ready");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("reverts the last commit without rewriting history", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-git-revert-"));
    try {
      const git = new GitTool();
      await runShell("git init -b main", cwd, 30_000);
      await writeFile(join(cwd, "note.txt"), "first\n", "utf8");
      await git.commitAll("first", { cwd, confirmed: true });
      await writeFile(join(cwd, "note.txt"), "second\n", "utf8");
      await git.commitAll("second", { cwd, confirmed: true });

      const result = await git.revertLastCommit({ cwd, confirmed: true });

      expect(result.reverted).toBe(true);
      expect(result.commit?.message).toBe("second");
      await expect(readFile(join(cwd, "note.txt"), "utf8")).resolves.toBe("first\n");
      const log = await runShell("git log --oneline --max-count=3", cwd, 30_000);
      expect(log.stdout).toContain("Revert");
      expect(log.stdout).toContain("second");
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
                draft: true,
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
      expect(pr?.draft).toBe(true);
      expect(pr?.url).toContain("/pull/7");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

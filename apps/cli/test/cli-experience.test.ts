import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("cli boss experience", () => {
  it("does not recommend missing products from the local registry", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-empty-"));
    try {
      await mkdir(join(home, ".ccli"), { recursive: true });
      await writeFile(
        join(home, ".ccli", "projects.json"),
        `${JSON.stringify(
          [
            {
              id: "missing-product",
              name: "已经不存在的产品",
              idea: "做一个已经不存在的产品",
              path: join(home, "missing-product"),
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z"
            }
          ],
          null,
          2
        )}\n`,
        "utf8"
      );

      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "下一步怎么办"],
        {
          cwd: resolve("."),
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home
          },
          timeout: 30_000
        }
      );

      expect(stdout).toContain("当前还没有产品");
      expect(stdout).toContain("一步步问我，然后开工");
      expect(stdout).not.toContain("已经不存在的产品");
      expect(stdout).not.toContain("打开最近产品");
      expect(stdout).not.toContain("打开我上次做的系统");
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("shows plain Chinese harness context slimming advice", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-context-"));
    try {
      const longProcedure = Array.from(
        { length: 80 },
        (_, index) => `${index + 1}. 固定流程：先执行第 ${index + 1} 步，然后记录命令、日志和检查结果。`
      ).join("\n");
      await writeFile(join(cwd, "AGENTS.md"), `项目事实：所有输出默认中文。\n\n${longProcedure}\n`, "utf8");

      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "harness", "--context"],
        {
          cwd: resolve("."),
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home
          },
          timeout: 30_000
        }
      );

      expect(stdout).toContain("长期上下文检查");
      expect(stdout).toContain("需要瘦身");
      expect(stdout).toContain("技能");
      expect(stdout).toContain("规则");
      expect(stdout).not.toContain("AGENTS.md");
      expect(stdout).not.toContain(".ccli/");
      expect(stdout).not.toMatch(/```/);
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("accepts Chinese confirmation for high impact terminal actions", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const project = await mkdtemp(join(tmpdir(), "ccli-confirm-product-"));
    try {
      await execFileAsync("git", ["init", "-b", "main"], { cwd: project });
      await execFileAsync("git", ["config", "user.name", "ccli-test"], { cwd: project });
      await execFileAsync("git", ["config", "user.email", "ccli-test@example.invalid"], { cwd: project });
      await writeFile(join(project, "note.txt"), "one\n", "utf8");
      await execFileAsync("git", ["add", "note.txt"], { cwd: project });
      await execFileAsync("git", ["commit", "-m", "first"], { cwd: project });
      await writeFile(join(project, "note.txt"), "two\n", "utf8");
      await execFileAsync("git", ["add", "note.txt"], { cwd: project });
      await execFileAsync("git", ["commit", "-m", "second"], { cwd: project });

      await mkdir(join(home, ".ccli"), { recursive: true });
      const now = new Date().toISOString();
      await writeFile(
        join(home, ".ccli", "projects.json"),
        `${JSON.stringify(
          [
            {
              id: "confirm-product",
              name: "确认测试产品",
              idea: "测试中文确认撤回",
              path: project,
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: now
            }
          ],
          null,
          2
        )}\n`,
        "utf8"
      );

      const result = await runCliWithInput(["--cwd", project, "undo"], {
        home,
        input: "确认\n"
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("输入“确认”继续");
      expect(result.stdout).not.toContain("输入 yes");
      expect(result.stdout).toContain("正在撤回上次成果");
      expect(result.stdout).toContain("已撤回上次保存的成果");
      await expect(readFile(join(project, "note.txt"), "utf8")).resolves.toBe("one\n");
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });
});

async function runCliWithInput(
  args: string[],
  options: { home: string; input: string; timeoutMs?: number }
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", ...args], {
      cwd: resolve("."),
      env: {
        ...process.env,
        HOME: options.home,
        USERPROFILE: options.home
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`CLI timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, options.timeoutMs ?? 30_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolvePromise({ stdout, stderr, exitCode });
    });
    child.stdin.end(options.input);
  });
}

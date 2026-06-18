import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
});

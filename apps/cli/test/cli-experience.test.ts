import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
      expect(stdout).toContain("直接一句话开工");
      expect(stdout).toContain("做一个客户跟进系统，能记录客户、跟进和提醒");
      expect(stdout).toContain("一步步问我，然后开工");
      expect(stdout.indexOf("直接一句话开工")).toBeLessThan(stdout.indexOf("一步步问我，然后开工"));
      expect(stdout).not.toContain("已经不存在的产品");
      expect(stdout).not.toContain("打开最近产品");
      expect(stdout).not.toContain("打开我上次做的系统");
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("puts one-sentence product creation first on the empty home screen", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-empty-home-"));
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "home"],
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

      expect(stdout).toContain("老板开箱驾驶舱");
      expect(stdout).toContain("现在最建议做");
      expect(stdout).toContain("直接一句话开工");
      expect(stdout).toContain("做一个客户跟进系统，能记录客户、跟进和提醒");
      expect(stdout).not.toContain("ccli go");
      expect(stdout.indexOf("直接一句话开工")).toBeLessThan(stdout.indexOf("一步步问我，然后开工"));
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("routes confused first-time users to the boss home instead of help text", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-confused-home-"));
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "我不会用"],
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

      expect(stdout).toContain("老板开箱驾驶舱");
      expect(stdout).toContain("现在最建议做");
      expect(stdout).toContain("直接一句话开工");
      expect(stdout).toContain("做一个客户跟进系统，能记录客户、跟进和提醒");
      expect(stdout).not.toContain("ccli 使用帮助");

      const hardware = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "hardware", "我不会用", "--json"],
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
      expect(hardware.stdout).toContain("\"kind\": \"boss-home\"");
      expect(hardware.stdout).toContain("\"label\": \"直接一句话开工\"");
      expect(hardware.stdout).toContain("\"say\": \"做一个客户跟进系统，能记录客户、跟进和提醒\"");
      expect(hardware.stdout).not.toContain("\"kind\": \"control-help\"");
      expect(hardware.stdout).not.toContain("\"command\"");
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("keeps first-run readiness focused on seeing a product before setup", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-empty-ready-"));
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "ready"],
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

      expect(stdout).toContain("开箱准备向导");
      expect(stdout).toContain("现在先说：做一个客户跟进系统，能记录客户、跟进和提醒");
      expect(stdout).toContain("可以先生成第一个产品看到效果");
      expect(stdout).toContain("先处理：先看到第一个产品");
      expect(stdout).toContain("直接说：做一个客户跟进系统，能记录客户、跟进和提醒");
      expect(stdout.indexOf("先看到第一个产品")).toBeLessThan(stdout.indexOf("接上智能开发能力"));
      expect(stdout).not.toContain("现在先说：开始首次设置");
      expect(stdout).not.toContain("ccli go");
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("shows a boss report card after one-sentence product creation", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-one-shot-"));
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "做一个客户跟进系统，能记录客户、跟进和提醒"],
        {
          cwd: resolve("."),
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home
          },
          timeout: 60_000
        }
      );

      expect(stdout).toContain("第一个版本已处理完成");
      expect(stdout).toContain("老板交付卡");
      expect(stdout).toContain("打开当前产品");
      expect(stdout).toContain("怎么验收当前产品");
      expect(stdout).not.toContain("src/App.tsx");
      expect(stdout).not.toContain(".ccli/");
      await expect(readFile(join(cwd, "客户跟进系统", "package.json"), "utf8")).resolves.toContain("\"scripts\"");
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("creates products from natural boss shopping-style requests", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-boss-shopping-"));
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "我要一个客户管理系统"],
        {
          cwd: resolve("."),
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home
          },
          timeout: 60_000
        }
      );

      expect(stdout).toContain("已识别为新产品目标");
      expect(stdout).toContain("老板交付卡");
      expect(stdout).toContain("客户管理系统");
      expect(stdout).not.toContain("这次需求已处理完成");
      await expect(readFile(join(cwd, "客户管理系统", "package.json"), "utf8")).resolves.toContain("\"scripts\"");
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("recognizes shopping-style product requests on hardware", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-hardware-shopping-"));
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "hardware", "帮我弄个门店预约系统", "--json"],
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

      expect(stdout).toContain("\"kind\": \"create-product\"");
      expect(stdout).toContain("\"name\": \"门店预约系统\"");
      expect(stdout).toContain("确认生成首版产品");
      expect(stdout).not.toContain("\"kind\": \"fallback\"");
      expect(stdout).not.toContain("\"command\"");
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

  it("scans harness sharing risk without leaking sensitive text", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-scan-"));
    try {
      await writeFile(join(cwd, "CCLI.md"), "项目固定事实：OPENAI_API_KEY=sk-testsecretvalue1234567890\n", "utf8");
      await mkdir(join(cwd, ".ccli", "harness"), { recursive: true });
      await writeFile(
        join(cwd, ".ccli", "harness", "settings.json"),
        `${JSON.stringify({
          permissions: {
            autoApprove: ["读取项目说明", "发布到生产"],
            confirm: [],
            deny: []
          }
        })}\n`,
        "utf8"
      );

      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "harness", "--scan"],
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

      expect(stdout).toContain("支架共享扫描");
      expect(stdout).toContain("敏感信息");
      expect(stdout).toContain("自动权限");
      expect(stdout).toContain("执行前硬护栏");
      expect(stdout).not.toContain("sk-testsecretvalue");
      expect(stdout).not.toContain("CCLI.md");
      expect(stdout).not.toContain(".ccli/");
      expect(stdout).not.toMatch(/```/);
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("keeps harness status separate from sharing scans", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-status-"));
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "检查当前驾驭系统状态"],
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

      expect(stdout).toContain("驾驭系统已加载");
      expect(stdout).toContain("驾驭系统健康度");
      expect(stdout).not.toContain("支架共享扫描");
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("routes article-style harness study requests to a plain Chinese playbook", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-harness-article-"));
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          "--conditions",
          "source",
          "--import",
          "tsx",
          "apps/cli/src/index.ts",
          "--cwd",
          cwd,
          "研究怎么使用这篇文章的方法：Agent = Model + Harness，Claude 的 Harness Engineering 怎么落地到 ccli 程序"
        ],
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

      expect(stdout).toContain("驾驭实操剧本");
      expect(stdout).toContain("当前重点");
      expect(stdout).toContain("自动循环判断");
      expect(stdout).toContain("验证失败先回流修复");
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

  it("reports hardware background runs without leaking runtime details", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-hardware-run-"));
    try {
      const runDir = join(cwd, ".ccli", "hardware-runs");
      await mkdir(runDir, { recursive: true });
      const startedAt = "2026-06-18T12:00:00.000Z";
      const logFile = join(runDir, "20260618120000-finish.log");
      await writeFile(logFile, "后台处理中\n", "utf8");
      await writeFile(
        join(runDir, "20260618120000-finish.json"),
        `${JSON.stringify(
          {
            id: "20260618120000-finish",
            actionId: "finish-current",
            label: "确认交付并合并",
            startedAt,
            logFile,
            pid: process.pid
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "hardware", "给我一个进度汇报", "--json"],
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

      expect(stdout).toContain("后台动作正在处理");
      expect(stdout).toContain("确认交付并合并正在后台处理");
      expect(stdout).toContain("稍后再查进度");
      expect(stdout).toContain("下一步怎么办");
      expect(stdout).toContain("试用一下");
      expect(stdout).not.toContain("按清单验收");
      expect(stdout).not.toContain("撤回上次成果");
      expect(stdout).not.toContain(".ccli");
      expect(stdout).not.toContain("hardware-runs");
      expect(stdout).not.toContain("pid");
      expect(stdout).not.toContain(logFile);
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("finishes hardware one-sentence product creation in the background", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-hardware-create-"));
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home
    };
    try {
      const first = await execFileAsync(
        process.execPath,
        [
          "--conditions",
          "source",
          "--import",
          "tsx",
          "apps/cli/src/index.ts",
          "--cwd",
          cwd,
          "hardware",
          "做一个客户跟进系统，能记录客户、跟进和提醒",
          "--json"
        ],
        { cwd: resolve("."), env, timeout: 30_000 }
      );
      expect(first.stdout).toContain("确认生成首版产品");

      const confirmed = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "hardware", "确认", "--json"],
        { cwd: resolve("."), env, timeout: 30_000 }
      );
      expect(confirmed.stdout).toContain("action-started");
      expect(confirmed.stdout).toContain("给我一个进度汇报");

      let report = "";
      for (let index = 0; index < 25; index += 1) {
        await delay(1000);
        report = (
          await execFileAsync(
            process.execPath,
            ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "hardware", "给我一个进度汇报", "--json"],
            { cwd: resolve("."), env, timeout: 30_000 }
          )
        ).stdout;
        if (report.includes("刚完成一个后台动作") || report.includes("已经结束")) {
          break;
        }
      }

      expect(report).toContain("老板交付卡");
      expect(report).toContain("客户跟进系统");
      expect(report).toContain("打开当前产品");
      expect(report).toContain("怎么验收当前产品");
      expect(report).not.toContain("当前仍在处理");
      expect(report).not.toContain("hardware-runs");
      expect(report).not.toContain("pid");
      await expect(readFile(join(cwd, "客户跟进系统", "package.json"), "utf8")).resolves.toContain("\"scripts\"");
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  }, 60_000);

  it("gives a clear setup fallback when model authorization is missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "ccli-home-"));
    const cwd = await mkdtemp(join(tmpdir(), "ccli-setup-"));
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--conditions", "source", "--import", "tsx", "apps/cli/src/index.ts", "--cwd", cwd, "setup"],
        {
          cwd: resolve("."),
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            OPENAI_API_KEY: "",
            ANTHROPIC_API_KEY: "",
            GOOGLE_API_KEY: "",
            GEMINI_API_KEY: "",
            QWEN_API_KEY: "",
            DASHSCOPE_API_KEY: "",
            DEEPSEEK_API_KEY: "",
            KIMI_API_KEY: "",
            MOONSHOT_API_KEY: ""
          },
          timeout: 30_000
        }
      );

      expect(stdout).toContain("还没有完成模型授权");
      expect(stdout).toContain("接上智能开发能力");
      expect(stdout).toContain("直接说：试用一下");
      expect(stdout).toContain("直接说：给我几个产品模板");
      expect(stdout).toContain("授权码不适合通过语音或公共屏幕输入");
      expect(stdout).not.toContain("OPENAI_API_KEY");
      expect(stdout).not.toContain(".ccli");
      expect(stdout).not.toContain("config.json");
      expect(stdout).not.toMatch(/```/);
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
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

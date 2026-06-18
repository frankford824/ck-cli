#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import { TaskOrchestrator } from "@ccli/agent-core";
import { LocalMemoryStore } from "@ccli/memory";
import { SPECIALISTS, SPRINT_STEPS } from "@ccli/methodology";
import { ProductRenderer } from "@ccli/product-ui";
import { createDefaultProviderRegistry, loadCcliConfig, type CcliConfig } from "@ccli/providers";
import { ReviewerAgent } from "@ccli/review";
import { AuditSession, readLatestAuditSummary, readState } from "@ccli/session";
import { createTemplateProject, GitHubTool, GitTool } from "@ccli/tools";

const program = new Command();

program
  .name("ccli")
  .description("全中文、低学习成本的开发 CLI")
  .version("0.1.0")
  .option("--cwd <path>", "指定工作目录")
  .option("--expert", "显示专家细节")
  .option("--yes", "确认高影响动作");

program
  .command("new")
  .argument("<name>", "项目名称")
  .description("创建新的中文开发项目")
  .option("--install", "创建后安装依赖")
  .action(async (name: string, options: { install?: boolean }) => {
    await withCli(async ({ renderer, yes }) => {
      const target = resolve(cwdFromGlobal(), name);
      await mkdir(target, { recursive: true });
      const audit = await AuditSession.create({ cwd: target, task: `创建项目 ${name}` });
      print(renderer.progress("inspect", "正在创建新的工作区。"));
      await createTemplateProject(target, name, audit);
      await new GitTool().init({ cwd: target, audit, confirmed: true });

      if (options.install) {
        const confirmed = yes || (await confirmChinese("创建后需要安装依赖，会访问网络。是否继续？"));
        if (confirmed) {
          const { ShellTool } = await import("@ccli/tools");
          await new ShellTool().run("pnpm install", { cwd: target, audit, kind: "install", confirmed: true });
        }
      }

      print(renderer.render({ type: "done", message: "项目已创建，可以进入目录后继续用中文描述需求。", severity: "success" }));
    });
  });

program
  .command("start")
  .description("启动中文任务会话")
  .action(async () => {
    await withCli(async ({ renderer, cwd }) => {
      const state = await readState(cwd);
      if (state) {
        print(renderer.render({ type: "info", message: state.summary }));
      } else {
        print(renderer.render({ type: "info", message: "当前项目还没有任务记录。可以直接输入 ccli do 加上你的需求。" }));
      }
    });
  });

program
  .command("do")
  .argument("<requirement>", "中文需求")
  .description("根据中文需求自动推进开发任务")
  .option("--with-pr", "完成后尝试创建团队审查入口")
  .action(async (requirement: string, options: { withPr?: boolean }) => {
    await withCli(async ({ cwd, expert, yes }) => {
      const config = await loadCcliConfig(cwd);
      const registry = createDefaultProviderRegistry(config);
      await new TaskOrchestrator().run({
        cwd,
        requirement,
        expert,
        yes,
        withPr: Boolean(options.withPr),
        config,
        registry,
        onEvent: (_event, rendered) => print(rendered)
      });
    });
  });

program
  .command("status")
  .description("查看当前任务进度")
  .action(async () => {
    await withCli(async ({ renderer, cwd, expert }) => {
      const state = await readState(cwd);
      if (!state) {
        print(renderer.render({ type: "info", message: "当前没有任务记录。" }));
        return;
      }
      print(renderer.render({ type: state.status === "failed" ? "error" : "info", message: state.summary }));
      if (expert) {
        for (const step of state.steps) {
          print(`${step.status}: ${step.name} - ${step.message}`);
        }
      }
    });
  });

program
  .command("review")
  .description("独立审查当前变更")
  .action(async () => {
    await withCli(async ({ renderer, cwd }) => {
      const config = await loadCcliConfig(cwd);
      const registry = createDefaultProviderRegistry(config);
      const audit = await AuditSession.create({ cwd, task: "独立审查" });
      print(renderer.progress("review", "正在进行独立审查。"));
      const result = await new ReviewerAgent().review({
        cwd,
        audit,
        reviewer: registry.forRole("reviewer", config)
      });
      print(
        renderer.render({
          type: result.passed ? "done" : "risk",
          message: result.summary,
          severity: result.passed ? "success" : "warning"
        })
      );
    });
  });

program
  .command("pr")
  .description("推送当前分支并创建 GitHub Draft PR")
  .option("--title <title>", "审查标题")
  .option("--body <body>", "审查说明")
  .action(async (options: { title?: string; body?: string }) => {
    await withCli(async ({ renderer, cwd, yes }) => {
      const confirmed = yes || (await confirmChinese("这会把当前成果发送到远程仓库并创建团队审查入口。是否继续？"));
      if (!confirmed) {
        print(renderer.render({ type: "risk", message: "已取消交付动作。", severity: "warning" }));
        return;
      }

      const audit = await AuditSession.create({ cwd, task: "创建团队审查入口" });
      const git = new GitTool();
      print(renderer.progress("save", "正在发送当前成果。"));
      await git.pushCurrent({ cwd, audit, confirmed: true });
      const result = await new GitHubTool().createDraftPr(
        { cwd, audit, confirmed: true },
        {
          title: options.title ?? "ccli 自动交付",
          body: options.body ?? "本次交付由 ccli 创建，详细技术记录保存在本地审计日志。",
          confirmed: true
        }
      );
      print(renderer.render({ type: "pr", message: result.message, severity: result.created ? "success" : "warning" }));
      if (result.url) {
        print(result.url);
      }
    });
  });

program
  .command("audit")
  .description("查看最近一次审计摘要")
  .action(async () => {
    await withCli(async ({ renderer, cwd, expert }) => {
      const audit = await readLatestAuditSummary(cwd);
      if (!audit.entries.length) {
        print(renderer.render({ type: "audit", message: "还没有审计记录。" }));
        return;
      }

      print(renderer.render({ type: "audit", message: `最近一次任务记录了 ${audit.entries.length} 个后台步骤。` }));
      if (expert) {
        print(`audit file: ${audit.file ?? ""}`);
        for (const entry of audit.entries.slice(-20)) {
          print(`${entry.timestamp} ${entry.action} ${entry.summary}`);
        }
      }
    });
  });

program
  .command("roles")
  .description("查看内置专家流程")
  .action(async () => {
    await withCli(async ({ renderer, expert }) => {
      print(renderer.render({ type: "info", message: "ccli 会按确认目标、整理方案、实现、审查、验证、交付、沉淀经验推进任务。" }));
      if (expert) {
        for (const step of SPRINT_STEPS) {
          print(`${step.label}: ${step.userVisible} (${step.specialist})`);
        }
        for (const role of SPECIALISTS) {
          print(`${role.name}: ${role.responsibility}`);
        }
      }
    });
  });

program
  .command("design")
  .description("查看项目设计契约摘要")
  .action(async () => {
    await withCli(async ({ renderer, cwd, expert }) => {
      const content = await readFile(resolve(cwd, "DESIGN.md"), "utf8").catch(() => "");
      if (!content) {
        print(renderer.render({ type: "risk", message: "当前项目还没有设计契约。新项目会自动创建，也可以手动补充 DESIGN.md。", severity: "warning" }));
        return;
      }
      print(renderer.render({ type: "info", message: "当前项目已有设计契约，后续界面改动会优先遵守它。" }));
      if (expert) {
        print(content);
      }
    });
  });

const memory = program.command("memory").description("管理本地长期记忆");

memory
  .command("search")
  .argument("<query>", "搜索内容")
  .description("搜索当前项目的本地记忆")
  .action(async (query: string) => {
    await withCli(async ({ renderer, cwd, expert }) => {
      const hits = await new LocalMemoryStore(cwd).search(query, { limit: 5 });
      if (!hits.length) {
        print(renderer.render({ type: "info", message: "没有找到相关历史记忆。" }));
        return;
      }
      print(renderer.render({ type: "info", message: `找到 ${hits.length} 条相关历史记忆。` }));
      if (expert) {
        for (const hit of hits) {
          print(`${hit.score.toFixed(2)} ${hit.entry.wing}/${hit.entry.room}/${hit.entry.drawer}: ${hit.entry.text}`);
        }
      }
    });
  });

memory
  .command("remember")
  .argument("<text>", "需要沉淀的内容")
  .description("把一条中文经验写入当前项目记忆")
  .action(async (text: string) => {
    await withCli(async ({ renderer, cwd }) => {
      await new LocalMemoryStore(cwd).remember({
        wing: "项目",
        room: "用户记录",
        drawer: new Date().toISOString().slice(0, 10),
        kind: "user",
        text
      });
      print(renderer.render({ type: "done", message: "这条经验已写入本地项目记忆。", severity: "success" }));
    });
  });

const config = program.command("config").description("管理 ccli 配置");

config
  .command("init")
  .description("创建全局配置文件")
  .action(async () => {
    await withCli(async ({ renderer }) => {
      const path = resolve(homedir(), ".ccli", "config.json");
      await mkdir(resolve(path, ".."), { recursive: true });
      const content: CcliConfig = {
        language: "zh-CN",
        mode: "plain-user",
        automation: "high-with-guardrails",
        roles: {
          planner: { provider: "openai", model: "gpt-5" },
          builder: { provider: "anthropic", model: "claude-sonnet-4-5" },
          reviewer: { provider: "google", model: "gemini-3-pro" },
          presenter: { provider: "kimi", model: "kimi-latest" }
        }
      };
      await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, "utf8");
      print(renderer.render({ type: "done", message: "全局配置已创建。密钥请通过环境变量设置。", severity: "success" }));
    });
  });

config
  .command("show")
  .description("查看合并后的配置摘要")
  .action(async () => {
    await withCli(async ({ renderer, cwd, expert }) => {
      const loaded = await loadCcliConfig(cwd);
      print(renderer.render({ type: "info", message: "配置已读取。密钥不会在普通模式显示。" }));
      if (expert) {
        print(JSON.stringify(redactConfig(loaded), null, 2));
      }
    });
  });

program.parseAsync().catch((error: unknown) => {
  const expert = Boolean(program.opts<{ expert?: boolean }>().expert);
  const renderer = new ProductRenderer({ expert });
  print(renderer.error(error));
  process.exitCode = 1;
});

interface CliContext {
  cwd: string;
  expert: boolean;
  yes: boolean;
  renderer: ProductRenderer;
}

async function withCli(run: (context: CliContext) => Promise<void>): Promise<void> {
  const expert = Boolean(program.opts<{ expert?: boolean }>().expert);
  const yes = Boolean(program.opts<{ yes?: boolean }>().yes);
  const cwd = cwdFromGlobal();
  const renderer = new ProductRenderer({ expert });
  await run({ cwd, expert, yes, renderer });
}

function cwdFromGlobal(): string {
  const option = program.opts<{ cwd?: string }>().cwd;
  return resolve(option ?? process.cwd());
}

async function confirmChinese(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} 输入 yes 继续：`);
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

function print(message: string): void {
  process.stdout.write(`${message}\n`);
}

function redactConfig(configValue: CcliConfig): CcliConfig {
  return {
    ...configValue,
    providers: Object.fromEntries(
      Object.entries(configValue.providers ?? {}).map(([key, value]) => [
        key,
        { ...value, apiKey: value.apiKey ? "***" : undefined }
      ])
    )
  };
}

#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import { TaskOrchestrator } from "@ccli/agent-core";
import {
  hardwareManifest,
  healthSummary,
  renderHealthReport,
  renderNextActions,
  renderStarterIdeas,
  renderWelcome,
  starterIdeas,
  type NextAction,
  type NextActionPlan,
  type StarterIdea
} from "@ccli/experience";
import { analyzeHarnessReadiness, loadHarnessContext, readHarnessProgress, renderHarnessReadiness, renderHarnessSummary } from "@ccli/harness";
import { LocalMemoryStore } from "@ccli/memory";
import { SPECIALISTS, SPRINT_STEPS } from "@ccli/methodology";
import { ProductRenderer } from "@ccli/product-ui";
import { createDefaultProviderRegistry, loadCcliConfig, type CcliConfig } from "@ccli/providers";
import { ReviewerAgent } from "@ccli/review";
import { AuditSession, readLatestAuditSummary, readState, type CcliState } from "@ccli/session";
import { installHarnessSkills } from "@ccli/templates";
import { createTemplateProject, GitHubTool, GitTool, ProjectTool } from "@ccli/tools";

const program = new Command();

const PROVIDER_PRESETS = {
  openai: { label: "OpenAI", model: "gpt-5", env: ["OPENAI_API_KEY"] },
  anthropic: { label: "Anthropic Claude", model: "claude-sonnet-4-5", env: ["ANTHROPIC_API_KEY"] },
  google: { label: "Google Gemini", model: "gemini-3-pro", env: ["GOOGLE_API_KEY", "GEMINI_API_KEY"] },
  qwen: { label: "通义千问", model: "qwen3-coder-plus", env: ["QWEN_API_KEY", "DASHSCOPE_API_KEY"] },
  deepseek: { label: "DeepSeek", model: "deepseek-chat", env: ["DEEPSEEK_API_KEY"] },
  kimi: { label: "Kimi", model: "kimi-latest", env: ["KIMI_API_KEY", "MOONSHOT_API_KEY"] }
} as const;

type SupportedProviderId = keyof typeof PROVIDER_PRESETS;

const SETUP_ROLES = ["planner", "builder", "reviewer", "presenter"] as const;

program
  .name("ccli")
  .description("全中文、低学习成本的开发 CLI")
  .version("0.1.0")
  .option("--cwd <path>", "指定工作目录")
  .option("--expert", "显示专家细节")
  .option("--yes", "确认高影响动作");

program
  .argument("[request...]", "直接用中文描述想要的结果")
  .action(async (requestParts?: string[]) => {
    await withCli(async ({ renderer, cwd, expert, yes }) => {
      const request = requestParts?.join(" ").trim();
      if (!request) {
        print(renderWelcome());
        return;
      }

      const routed = await runNaturalLanguageIntent({ request, cwd, expert, yes, renderer });
      if (routed) {
        return;
      }

      await runRequirement({ cwd, expert, yes, requirement: request });
      print(renderer.render({ type: "done", message: "这次需求已处理完成。", severity: "success" }));
    });
  });

program
  .command("new")
  .argument("<name>", "项目名称")
  .description("创建新的中文开发项目")
  .option("--install", "创建后安装依赖")
  .action(async (name: string, options: { install?: boolean }) => {
    await withCli(async ({ renderer, cwd, yes }) => {
      const target = resolve(cwd, name);
      print(renderer.progress("inspect", "正在创建新的工作区。"));
      await createBossProject({ name, target, install: Boolean(options.install), yes, task: `创建项目 ${name}` });
      print(renderer.render({ type: "done", message: "项目已创建，可以进入目录后继续用中文描述需求。", severity: "success" }));
    });
  });

program
  .command("create")
  .alias("make")
  .argument("<idea...>", "一句话描述想做的产品")
  .description("按一句中文产品目标创建项目并立即开工")
  .option("--name <name>", "项目名称")
  .option("--install", "创建后安装依赖并启用更完整验证")
  .option("--preview", "创建后直接启动本地预览")
  .option("--open", "启动预览后自动打开浏览器")
  .option("--with-pr", "完成后尝试创建团队审查入口")
  .action(async (ideaParts: string[], options: { name?: string; install?: boolean; preview?: boolean; open?: boolean; withPr?: boolean }) => {
    await withCli(async ({ renderer, cwd, expert, yes }) => {
      const idea = ideaParts.join(" ").trim();
      if (!idea) {
        print(renderer.render({ type: "risk", message: "请先说清楚想做的产品目标。", severity: "warning" }));
        return;
      }
      await createProductFromIdea({
        cwd,
        idea,
        name: options.name,
        install: Boolean(options.install),
        preview: Boolean(options.preview),
        previewAutoInstall: false,
        previewOpenBrowser: Boolean(options.open),
        withPr: Boolean(options.withPr),
        expert,
        yes,
        renderer
      });
    });
  });

program
  .command("go")
  .alias("app")
  .argument("<idea...>", "一句话描述想做的产品")
  .description("一句话创建产品、完成首版并打开本地预览")
  .option("--name <name>", "项目名称")
  .option("--host <host>", "预览地址", "127.0.0.1")
  .option("--port <port>", "预览端口", "5173")
  .option("--no-preview", "只生成首版，不打开预览")
  .option("--no-open", "启动预览但不自动打开浏览器")
  .option("--with-pr", "完成后尝试创建团队审查入口")
  .action(async (ideaParts: string[], options: { name?: string; host?: string; port?: string; preview?: boolean; open?: boolean; withPr?: boolean }) => {
    await withCli(async ({ renderer, cwd, expert, yes }) => {
      const idea = ideaParts.join(" ").trim();
      if (!idea) {
        print(renderer.render({ type: "risk", message: "请直接说想做什么产品。", severity: "warning" }));
        return;
      }

      const port = Number(options.port ?? "5173");
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        print(renderer.render({ type: "risk", message: "预览端口不正确，请换一个 1 到 65535 之间的数字。", severity: "warning" }));
        return;
      }

      print(
        renderer.render({
          type: "info",
          message: options.preview === false ? "开始一键生成产品。" : "开始一键生成产品。完成后会直接打开本地预览。"
        })
      );
      await createProductFromIdea({
        cwd,
        idea,
        name: options.name,
        install: false,
        preview: options.preview !== false,
        previewAutoInstall: true,
        previewOpenBrowser: options.open !== false,
        previewHost: options.host ?? "127.0.0.1",
        previewPort: port,
        withPr: Boolean(options.withPr),
        expert,
        yes,
        renderer
      });
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
      await runRequirement({ cwd, expert, yes, requirement, withPr: Boolean(options.withPr) });
    });
  });

program
  .command("chat")
  .description("进入老板友好的中文对话模式")
  .action(async () => {
    await withCli(async ({ renderer, cwd, expert, yes }) => {
      print(renderer.render({ type: "info", message: "你可以直接说想要的结果。输入“退出”结束。" }));
      const rl = createInterface({ input, output });
      try {
        while (true) {
          const answer = (await rl.question("你想让产品变成什么样？ ")).trim();
          if (!answer || ["退出", "结束", "bye", "exit", "quit"].includes(answer.toLowerCase())) {
            print(renderer.render({ type: "done", message: "对话已结束。", severity: "success" }));
            return;
          }
          const routed = await runNaturalLanguageIntent({ request: answer, cwd, expert, yes, renderer });
          if (!routed) {
            await runRequirement({ cwd, expert, yes, requirement: answer });
          }
        }
      } finally {
        rl.close();
      }
    });
  });

program
  .command("doctor")
  .description("检查当前电脑是否适合直接使用 ccli")
  .action(async () => {
    await withCli(async ({ renderer, cwd, expert }) => {
      const report = healthSummary(await checkHealth(cwd));
      print(renderHealthReport(report, expert));
    });
  });

program
  .command("preview")
  .description("启动当前项目的本地预览")
  .option("--install", "缺少依赖时自动安装")
  .option("--host <host>", "预览地址", "127.0.0.1")
  .option("--port <port>", "预览端口", "5173")
  .option("--check", "只检查预览是否准备好，不启动")
  .option("--no-open", "启动预览但不自动打开浏览器")
  .action(async (options: { install?: boolean; host?: string; port?: string; check?: boolean; open?: boolean }) => {
    await withCli(async ({ renderer, cwd, yes }) => {
      const port = Number(options.port ?? "5173");
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        print(renderer.render({ type: "risk", message: "预览端口不正确，请换一个 1 到 65535 之间的数字。", severity: "warning" }));
        return;
      }

      const readiness = await previewReadiness(cwd);
      if (!readiness.canPreview) {
        print(renderer.render({ type: "risk", message: readiness.message, severity: "warning" }));
        return;
      }

      if (!readiness.hasDependencies) {
        if (!options.install) {
          print(renderer.render({ type: "risk", message: "当前项目还没有安装运行所需内容。你可以让 ccli 自动准备后再预览。", severity: "warning" }));
          return;
        }
        await ensureDependenciesForPreview({ cwd, renderer, yes });
      }

      if (options.check) {
        print(renderer.render({ type: "done", message: "当前项目已经可以启动本地预览。", severity: "success" }));
        return;
      }

      await startPreviewServer({
        cwd,
        renderer,
        host: options.host ?? "127.0.0.1",
        port,
        openBrowser: options.open !== false
      });
    });
  });

program
  .command("projects")
  .alias("apps")
  .description("查看已经创建过的产品")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (options: { json?: boolean }) => {
    await withCli(async ({ renderer, expert }) => {
      await renderKnownProjects({ renderer, expert, json: Boolean(options.json) });
    });
  });

program
  .command("next")
  .description("根据当前情况给出下一步建议")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (options: { json?: boolean }) => {
    await withCli(async ({ cwd }) => {
      const plan = await buildNextActionPlan(cwd);
      if (options.json) {
        print(JSON.stringify(plan, null, 2));
        return;
      }
      print(renderNextActions(plan));
    });
  });

program
  .command("ideas")
  .argument("[idea]", "产品场景编号或名称")
  .description("查看适合老板直接开工的产品场景")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .option("--name <name>", "项目名称")
  .option("--host <host>", "预览地址", "127.0.0.1")
  .option("--port <port>", "预览端口", "5173")
  .option("--no-preview", "只生成首版，不打开预览")
  .option("--no-open", "启动预览但不自动打开浏览器")
  .option("--with-pr", "完成后尝试创建团队审查入口")
  .action(
    async (
      ideaKey: string | undefined,
      options: { json?: boolean; name?: string; host?: string; port?: string; preview?: boolean; open?: boolean; withPr?: boolean }
    ) => {
      await withCli(async ({ renderer, cwd, expert, yes }) => {
        const ideas = starterIdeas();
        if (ideaKey) {
          await launchStarterIdea({
            key: ideaKey,
            ideas,
            cwd,
            renderer,
            expert,
            yes,
            name: options.name,
            preview: options.preview !== false,
            previewOpenBrowser: options.open !== false,
            previewHost: options.host ?? "127.0.0.1",
            previewPortText: options.port ?? "5173",
            withPr: Boolean(options.withPr)
          });
          return;
        }
        if (options.json) {
          print(JSON.stringify(ideas, null, 2));
          return;
        }
        print(renderStarterIdeas(ideas));
      });
    }
  );

program
  .command("open")
  .argument("[project]", "产品序号或名称")
  .description("打开已经创建过的产品预览")
  .option("--install", "缺少依赖时自动安装")
  .option("--host <host>", "预览地址", "127.0.0.1")
  .option("--port <port>", "预览端口", "5173")
  .option("--check", "只检查这个产品是否准备好，不启动")
  .option("--no-open", "启动预览但不自动打开浏览器")
  .action(async (projectKey: string | undefined, options: { install?: boolean; host?: string; port?: string; check?: boolean; open?: boolean }) => {
    await withCli(async ({ renderer, yes }) => {
      await openKnownProject({
        projectKey,
        renderer,
        yes,
        install: Boolean(options.install),
        check: Boolean(options.check),
        host: options.host ?? "127.0.0.1",
        portText: options.port ?? "5173",
        openBrowser: options.open !== false
      });
    });
  });

program
  .command("setup")
  .description("用中文完成首次设置")
  .option("--provider <name>", "模型服务：openai、anthropic、google、qwen、deepseek、kimi")
  .option("--api-key <key>", "模型授权码")
  .option("--skip-model", "暂时跳过模型授权")
  .option("--project <name>", "顺手创建第一个项目")
  .action(async (options: { provider?: string; apiKey?: string; skipModel?: boolean; project?: string }) => {
    await withCli(async ({ renderer, cwd }) => {
      print(renderer.render({ type: "info", message: "开始首次设置。只需要完成模型授权，就可以进入更完整的自动开发。" }));
      const rl = createInterface({ input, output });
      let healthCwd = cwd;
      try {
        const provider = options.skipModel ? undefined : await resolveSetupProvider(options.provider, rl);
        const apiKey = provider ? await resolveSetupApiKey(provider, options.apiKey, rl) : undefined;
        if (provider && apiKey) {
          await saveModelSetup(provider, apiKey);
          print(renderer.render({ type: "done", message: "模型授权已保存。后续项目会自动继承这次设置。", severity: "success" }));
        } else {
          print(renderer.render({ type: "risk", message: "已暂时跳过模型授权。现在仍可创建项目、记录需求和走本地流程。", severity: "warning" }));
        }

        const projectName = options.project ?? (input.isTTY ? (await rl.question("要不要顺手创建第一个项目？输入项目名，直接回车跳过：")).trim() : "");
        if (projectName) {
          const target = resolve(cwd, projectName);
          await createBossProject({
            name: projectName,
            target,
            install: false,
            yes: true,
            task: `首次设置创建项目 ${projectName}`
          });
          healthCwd = target;
          print(renderer.render({ type: "done", message: "第一个项目已创建。进入这个项目后，直接用中文描述想要的结果。", severity: "success" }));
        }

        const report = healthSummary(await checkHealth(healthCwd));
        print(renderHealthReport(report));
      } finally {
        rl.close();
      }
    });
  });

program
  .command("hardware")
  .description("查看未来智能硬件和语音交互协议")
  .action(async () => {
    await withCli(async ({ renderer, expert }) => {
      print(renderer.render({ type: "info", message: "ccli 已预留语音和智能硬件交互协议。" }));
      if (expert) {
        print(JSON.stringify(hardwareManifest(), null, 2));
      } else {
        print("硬件设备只需要传入文字或语音转写，接收中文朗读、屏幕提示、选项和产品清单。");
      }
    });
  });

program
  .command("skills")
  .description("补齐当前项目的中文开发技能")
  .option("--overwrite", "覆盖已有技能文件")
  .action(async (options: { overwrite?: boolean }) => {
    await withCli(async ({ renderer, cwd, expert }) => {
      await installSkillsForProject({ cwd, renderer, expert, overwrite: Boolean(options.overwrite) });
    });
  });

program
  .command("harness")
  .description("查看当前项目的智能体驾驭系统")
  .action(async () => {
    await withCli(async ({ renderer, cwd, expert }) => {
      const context = await loadHarnessContext(cwd);
      const progress = await readHarnessProgress(cwd);
      const readiness = analyzeHarnessReadiness(context, progress);
      print(renderer.render({ type: "info", message: "智能体驾驭系统已启用，会负责规则、护栏、验证反馈和进度记忆。" }));
      print(renderHarnessSummary(context));
      print(renderHarnessReadiness(readiness));
      if (progress) {
        print(renderer.render({ type: "info", message: `最近进度：${progress.summary} 下一步：${progress.nextAction}` }));
      }
      if (expert) {
        for (const item of readiness.items) {
          print(`${item.ready ? "已具备" : "缺少"}：${item.name}`);
          print(`  影响：${item.impact}`);
          print(`  建议：${item.nextAction}`);
        }
        for (const budget of context.toolBudget) {
          print(`阶段：${budget.userVisibleGoal}`);
          print(`  可用：${budget.allowedTools.join("、")}`);
          print(`  禁止：${budget.deniedActions.join("、")}`);
        }
      }
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
      const result = await new GitHubTool().createOrFindDraftPr(
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
  .command("ship")
  .description("自动推送、审查、创建或复用 PR，并可选合并")
  .option("--title <title>", "审查标题")
  .option("--body <body>", "审查说明")
  .option("--merge", "审查通过后自动合并")
  .option("--method <method>", "合并方式：squash、merge、rebase", "squash")
  .action(async (options: { title?: string; body?: string; merge?: boolean; method?: string }) => {
    await withCli(async ({ renderer, cwd, yes }) => {
      const confirmed = yes || (await confirmChinese("这会发送当前成果并准备团队审查入口。是否继续？"));
      if (!confirmed) {
        print(renderer.render({ type: "risk", message: "已取消交付动作。", severity: "warning" }));
        return;
      }

      const config = await loadCcliConfig(cwd);
      const registry = createDefaultProviderRegistry(config);
      const audit = await AuditSession.create({ cwd, task: "自动交付" });
      const git = new GitTool();
      const github = new GitHubTool();

      print(renderer.progress("save", "正在发送当前成果。"));
      await git.pushCurrent({ cwd, audit, confirmed: true });

      print(renderer.progress("review", "正在进行独立审查。"));
      const review = await new ReviewerAgent().review({
        cwd,
        audit,
        reviewer: registry.forRole("reviewer", config)
      });

      const title = options.title ?? "ccli 自动交付";
      const body = options.body ?? "本次交付由 ccli 创建，详细技术记录保存在本地审计日志。";
      const pr = await github.createOrFindDraftPr(
        { cwd, audit, confirmed: true },
        {
          title,
          body,
          draft: !options.merge,
          confirmed: true
        }
      );
      print(renderer.render({ type: "pr", message: pr.message, severity: pr.url ? "success" : "warning" }));
      if (pr.url) {
        print(pr.url);
      }

      if (pr.number) {
        const comment = await github.postReviewSummary({ cwd, audit, confirmed: true }, pr.number, reviewComment(title, review));
        print(renderer.render({ type: comment.posted ? "done" : "risk", message: comment.message, severity: comment.posted ? "success" : "warning" }));
      }

      if (!options.merge) {
        print(renderer.render({ type: "done", message: "团队审查入口已准备好，等待人工确认合并。", severity: "success" }));
        return;
      }

      if (!review.passed) {
        print(renderer.render({ type: "risk", message: "独立审查发现风险，已停止自动合并。", severity: "warning" }));
        return;
      }

      if (!pr.number) {
        print(renderer.render({ type: "risk", message: "没有可合并的团队审查入口，已停止自动合并。", severity: "warning" }));
        return;
      }

      if (pr.draft) {
        const ready = await github.markReadyForReview({ cwd, audit, confirmed: true }, pr.number);
        print(renderer.render({ type: ready.posted ? "done" : "risk", message: ready.message, severity: ready.posted ? "success" : "warning" }));
        if (!ready.posted) {
          return;
        }
      }

      const mergeConfirmed = yes || (await confirmChinese("独立审查已通过。现在会把成果合入主线。是否继续？"));
      if (!mergeConfirmed) {
        print(renderer.render({ type: "risk", message: "已取消自动合并。", severity: "warning" }));
        return;
      }

      const merge = await github.mergePr(
        { cwd, audit, confirmed: true },
        {
          number: pr.number,
          method: parseMergeMethod(options.method),
          commitTitle: title,
          commitMessage: body,
          confirmed: true
        }
      );
      print(renderer.render({ type: merge.merged ? "done" : "risk", message: merge.message, severity: merge.merged ? "success" : "warning" }));
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

async function runNaturalLanguageIntent(inputValue: {
  request: string;
  cwd: string;
  expert: boolean;
  yes: boolean;
  renderer: ProductRenderer;
}): Promise<boolean> {
  const request = inputValue.request.trim();
  if (isProjectListRequest(request)) {
    await renderKnownProjects({ renderer: inputValue.renderer, expert: inputValue.expert, json: false });
    return true;
  }

  if (isProjectOpenCheckRequest(request)) {
    await openKnownProject({
      projectKey: projectKeyFromNaturalRequest(request),
      renderer: inputValue.renderer,
      yes: inputValue.yes,
      install: true,
      check: true,
      host: "127.0.0.1",
      portText: "5173",
      openBrowser: false
    });
    return true;
  }

  if (isProjectOpenRequest(request)) {
    await openKnownProject({
      projectKey: projectKeyFromNaturalRequest(request),
      renderer: inputValue.renderer,
      yes: inputValue.yes,
      install: true,
      check: false,
      host: "127.0.0.1",
      portText: "5173",
      openBrowser: true
    });
    return true;
  }

  if (isNextActionRequest(request)) {
    print(renderNextActions(await buildNextActionPlan(inputValue.cwd)));
    return true;
  }

  const ideaKey = ideaKeyFromNaturalRequest(request);
  if (ideaKey) {
    await launchStarterIdea({
      key: ideaKey,
      ideas: starterIdeas(),
      cwd: inputValue.cwd,
      renderer: inputValue.renderer,
      expert: inputValue.expert,
      yes: inputValue.yes,
      preview: true,
      previewOpenBrowser: true,
      previewHost: "127.0.0.1",
      previewPortText: "5173",
      withPr: false
    });
    return true;
  }

  if (isIdeaCatalogRequest(request)) {
    print(renderStarterIdeas(starterIdeas()));
    return true;
  }

  if (isSkillInstallRequest(request)) {
    await installSkillsForProject({ cwd: inputValue.cwd, renderer: inputValue.renderer, expert: inputValue.expert, overwrite: false });
    return true;
  }

  if (isProductCreationRequest(request)) {
    print(inputValue.renderer.render({ type: "info", message: "已识别为新产品目标，开始一键生成并打开预览。" }));
    await createProductFromIdea({
      cwd: inputValue.cwd,
      idea: request,
      install: false,
      preview: true,
      previewAutoInstall: true,
      previewOpenBrowser: true,
      previewHost: "127.0.0.1",
      previewPort: 5173,
      withPr: false,
      expert: inputValue.expert,
      yes: inputValue.yes,
      renderer: inputValue.renderer
    });
    return true;
  }

  return false;
}

async function buildNextActionPlan(cwd: string): Promise<NextActionPlan> {
  const [projects, state, readiness] = await Promise.all([
    readProjectRegistry(),
    readState(cwd).catch(() => undefined),
    previewReadiness(cwd).catch(() => undefined)
  ]);

  const actions: NextAction[] = [];
  if (state?.status === "failed") {
    actions.push({
      id: "status",
      title: "先看失败影响",
      reason: "上一次任务没有完成，先看中文状态可以避免继续叠加问题。",
      say: "查看当前任务进度",
      command: "ccli status"
    });
    actions.push({
      id: "audit",
      title: "让系统保留问题线索",
      reason: "技术细节已经在本地审计记录里，专家模式可以追溯原因。",
      say: "查看最近审计摘要",
      command: "ccli audit --expert"
    });
  }

  if (readiness?.canPreview) {
    actions.push({
      id: "preview-current",
      title: "先打开当前产品",
      reason: "当前目录已经是可以预览的产品，先看效果最容易判断下一步。",
      say: "打开当前产品页面",
      command: readiness.hasDependencies ? "ccli preview" : "ccli preview --install"
    });
    actions.push({
      id: "improve-current",
      title: "继续改当前产品",
      reason: state?.status === "done" ? "最近一次任务已保存，可以继续用中文提出下一个改动。" : "当前项目已经具备产品结构，可以直接说想改哪里。",
      say: "把这个产品再改得更适合我的业务",
      command: "ccli chat"
    });
  }

  if (projects.length) {
    const latest = projects[0];
    actions.push({
      id: "open-latest",
      title: "打开最近产品",
      reason: `最近保存的产品是「${latest.name}」，先打开它可以直接接着验收或修改。`,
      say: "打开我上次做的系统",
      command: "ccli open"
    });
    actions.push({
      id: "project-list",
      title: "查看所有产品",
      reason: "如果你不确定要继续哪个产品，可以先看产品列表。",
      say: "查看我的产品",
      command: "ccli projects"
    });
  }

  const hasCurrentProduct = Boolean(readiness?.canPreview);
  actions.push({
    id: "starter-ideas",
    title: projects.length || hasCurrentProduct ? "新开一个产品" : "从模板直接开工",
    reason: hasCurrentProduct
      ? "如果当前产品先放一边，选一个模板可以快速开始新的业务方向。"
      : projects.length
        ? "如果这是一个新业务方向，选模板比从空白描述更快。"
        : "当前还没有产品，选一个常见场景最快能看到首版。",
    say: "给我几个产品模板",
    command: "ccli ideas"
  });

  actions.push({
    id: "doctor",
    title: "检查电脑环境",
    reason: "如果预览、安装或模型授权不稳定，先做一次中文体检。",
    say: "检查当前电脑是否准备好",
    command: "ccli doctor"
  });

  const unique = uniqueNextActions(actions).slice(0, 4);
  const summary = nextActionSummary({ state, canPreview: Boolean(readiness?.canPreview), projectCount: projects.length });
  return { summary, actions: unique };
}

function uniqueNextActions(actions: NextAction[]): NextAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) {
      return false;
    }
    seen.add(action.id);
    return true;
  });
}

function nextActionSummary(inputValue: { state?: CcliState; canPreview: boolean; projectCount: number }): string {
  if (inputValue.state?.status === "failed") {
    return "建议先处理上一次任务的问题，再继续开发。";
  }
  if (inputValue.canPreview) {
    return "建议先打开当前产品看效果，再决定要改哪里。";
  }
  if (inputValue.projectCount > 0) {
    return "你已经有产品记录，建议先打开最近产品继续。";
  }
  return "当前还没有产品，建议先从一个常见场景直接开工。";
}

async function launchStarterIdea(inputValue: {
  key: string;
  ideas: StarterIdea[];
  cwd: string;
  renderer: ProductRenderer;
  expert: boolean;
  yes: boolean;
  name?: string;
  preview: boolean;
  previewOpenBrowser: boolean;
  previewHost: string;
  previewPortText: string;
  withPr: boolean;
}): Promise<void> {
  const selected = resolveStarterIdea(inputValue.key, inputValue.ideas);
  if (!selected) {
    print(inputValue.renderer.render({ type: "risk", message: "没有找到这个产品场景。可以先查看产品场景库。", severity: "warning" }));
    print(renderStarterIdeas(inputValue.ideas));
    return;
  }
  const port = Number(inputValue.previewPortText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    print(inputValue.renderer.render({ type: "risk", message: "预览端口不正确，请换一个 1 到 65535 之间的数字。", severity: "warning" }));
    return;
  }

  print(inputValue.renderer.render({ type: "info", message: `已选择：${selected.title}。开始生成首版产品。` }));
  await createProductFromIdea({
    cwd: inputValue.cwd,
    idea: selected.say,
    name: inputValue.name ?? selected.title,
    install: false,
    preview: inputValue.preview,
    previewAutoInstall: true,
    previewOpenBrowser: inputValue.previewOpenBrowser,
    previewHost: inputValue.previewHost,
    previewPort: port,
    withPr: inputValue.withPr,
    expert: inputValue.expert,
    yes: inputValue.yes,
    renderer: inputValue.renderer
  });
}

function resolveStarterIdea(key: string, ideas: StarterIdea[]): StarterIdea | undefined {
  const trimmed = key.trim();
  const index = Number(normalizeChineseNumber(trimmed));
  if (Number.isInteger(index) && index >= 1 && index <= ideas.length) {
    return ideas[index - 1];
  }
  const normalized = trimmed.toLowerCase();
  return (
    ideas.find((idea) => idea.id === normalized) ??
    ideas.find((idea) => idea.title === trimmed) ??
    ideas.find((idea) => idea.title.includes(trimmed)) ??
    ideas.find((idea) => idea.say.includes(trimmed)) ??
    ideas.find((idea) => idea.id.includes(normalized))
  );
}

async function installSkillsForProject(inputValue: { cwd: string; renderer: ProductRenderer; expert: boolean; overwrite: boolean }): Promise<void> {
  const result = await installHarnessSkills({ root: inputValue.cwd, overwrite: inputValue.overwrite });
  if (result.written.length) {
    print(inputValue.renderer.render({ type: "done", message: `已补齐 ${result.written.length} 个中文开发技能。`, severity: "success" }));
  } else {
    print(inputValue.renderer.render({ type: "info", message: "当前项目已经具备内置中文开发技能。" }));
  }

  const context = await loadHarnessContext(inputValue.cwd);
  const progress = await readHarnessProgress(inputValue.cwd);
  print(renderHarnessReadiness(analyzeHarnessReadiness(context, progress)));

  if (inputValue.expert) {
    if (result.written.length) {
      print(`已写入：${result.written.join("、")}`);
    }
    if (result.skipped.length) {
      print(`已保留：${result.skipped.join("、")}`);
    }
  }
}

async function renderKnownProjects(inputValue: { renderer: ProductRenderer; expert: boolean; json: boolean }): Promise<void> {
  const projects = await readProjectRegistry();
  if (inputValue.json) {
    print(JSON.stringify(projects.map((project, index) => projectSummary(project, index)), null, 2));
    return;
  }
  if (!projects.length) {
    print(inputValue.renderer.render({ type: "info", message: "还没有保存过产品。可以先直接说想做什么产品。" }));
    return;
  }
  print(inputValue.renderer.render({ type: "info", message: `已找到 ${projects.length} 个产品。` }));
  for (const [index, project] of projects.entries()) {
    const recent = project.lastOpenedAt ? `最近打开：${formatShortDate(project.lastOpenedAt)}` : `创建时间：${formatShortDate(project.createdAt)}`;
    print(`${index + 1}. ${project.name}。${recent}`);
    if (inputValue.expert) {
      print(`   ${project.path}`);
    }
  }
}

async function openKnownProject(inputValue: {
  projectKey?: string;
  renderer: ProductRenderer;
  yes: boolean;
  install: boolean;
  check: boolean;
  host: string;
  portText: string;
  openBrowser: boolean;
}): Promise<void> {
  const projects = await readProjectRegistry();
  if (!projects.length) {
    print(inputValue.renderer.render({ type: "info", message: "还没有保存过产品。可以先直接说想做什么产品。" }));
    return;
  }
  const project = resolveProjectSelection(projects, inputValue.projectKey);
  if (!project) {
    print(inputValue.renderer.render({ type: "risk", message: "没有找到这个产品。可以先查看产品列表。", severity: "warning" }));
    return;
  }
  const port = Number(inputValue.portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    print(inputValue.renderer.render({ type: "risk", message: "预览端口不正确，请换一个 1 到 65535 之间的数字。", severity: "warning" }));
    return;
  }
  const readiness = await previewReadiness(project.path);
  if (!readiness.canPreview) {
    print(inputValue.renderer.render({ type: "risk", message: readiness.message, severity: "warning" }));
    return;
  }
  if (!readiness.hasDependencies) {
    if (!inputValue.install) {
      print(inputValue.renderer.render({ type: "risk", message: "这个产品还没有准备好本地运行内容。你可以让 ccli 自动准备后再打开。", severity: "warning" }));
      return;
    }
    await ensureDependenciesForPreview({ cwd: project.path, renderer: inputValue.renderer, yes: inputValue.yes });
  }
  await touchProjectRegistry(project.id);
  if (inputValue.check) {
    print(inputValue.renderer.render({ type: "done", message: `${project.name} 已经可以打开。`, severity: "success" }));
    return;
  }
  print(inputValue.renderer.render({ type: "info", message: `正在打开 ${project.name}。` }));
  await startPreviewServer({
    cwd: project.path,
    renderer: inputValue.renderer,
    host: inputValue.host,
    port,
    openBrowser: inputValue.openBrowser
  });
}

function isProjectListRequest(request: string): boolean {
  return /(?:查看|看看|列出|显示|管理).*(?:我的)?(?:产品|项目|应用|系统|列表)/.test(request) || /我的(?:产品|项目|应用|系统)/.test(request);
}

function isProjectOpenRequest(request: string): boolean {
  return /(?:打开|启动|预览|继续|看看).*(?:上次|最近|之前|产品|项目|应用|系统)/.test(request);
}

function isProjectOpenCheckRequest(request: string): boolean {
  return (
    /(?:检查|确认|看看).*(?:能不能|能否|是否|可以)?.*(?:打开|启动|预览).*(?:上次|最近|之前|产品|项目|应用|系统)/.test(request) ||
    /(?:检查|确认|看看).*(?:上次|最近|之前|产品|项目|应用|系统).*(?:能不能|能否|是否|可以)?.*(?:打开|启动|预览)/.test(request)
  );
}

function isNextActionRequest(request: string): boolean {
  return /(?:下一步|接下来|现在).*(?:怎么办|做什么|干嘛|该做|建议)/.test(request) ||
    /(?:我该|该我|帮我).*(?:做什么|干嘛|下一步|接下来)/.test(request) ||
    /(?:给我|看看|推荐).*(?:下一步|后续|接下来).*(?:建议|动作)?/.test(request);
}

function isIdeaCatalogRequest(request: string): boolean {
  return /(?:给我|看看|查看|推荐|列出|有什么).*(?:产品)?(?:模板|场景|灵感|案例|能做什么|可以做什么)/.test(request) ||
    /(?:产品)?(?:模板|场景|灵感|案例).*(?:给我|看看|查看|推荐|列出)/.test(request) ||
    /不知道(?:做|开发|创建)什么/.test(request);
}

function ideaKeyFromNaturalRequest(request: string): string | undefined {
  if (!/(?:做|创建|开发|生成|选择|选|启动|用|开始)/.test(request)) {
    return undefined;
  }
  const numbered = request.match(/(?:第\s*)?([一二三四五六123456])\s*(?:个|号|款)?(?:模板|场景|产品|方案)?/);
  if (numbered && /(?:第|模板|场景|产品|方案)/.test(request)) {
    return numbered[1];
  }
  if (!/(?:模板|场景|产品场景|方案)/.test(request)) {
    return undefined;
  }
  const keywordMap: Array<[string, string]> = [
    ["客户|销售|跟进", "customer"],
    ["预约|排班|门店|到店", "booking"],
    ["库存|仓库|补货|出库|入库", "inventory"],
    ["订单|发货|物流|售后", "orders"],
    ["财务|收支|收入|支出|回款|现金流", "finance"],
    ["内容|发布|素材|品牌|文章", "content"]
  ];
  return keywordMap.find(([pattern]) => new RegExp(pattern).test(request))?.[1];
}

function isSkillInstallRequest(request: string): boolean {
  return /(?:补齐|安装|初始化|修复|创建).*(?:开发)?(?:技能|skill|skills)/i.test(request) || /(?:技能|skill|skills).*(?:补齐|安装|初始化|修复|创建)/i.test(request);
}

function isProductCreationRequest(request: string): boolean {
  return /(?:一键)?(?:做一个|做个|创建一个|创建个|开发一个|开发个|生成一个|生成个|搭建一个|搭建个)/.test(request) &&
    /(?:系统|应用|产品|平台|网站|工具|看板|管理|预约|客户|订单|库存|页面|小程序|CRM|crm)/.test(request);
}

function projectKeyFromNaturalRequest(request: string): string | undefined {
  const key = request
    .replace(/^(?:请|帮我|我要|我想|想要)?(?:打开|启动|预览|继续|看看|检查|确认)/, "")
    .replace(/(?:我)?(?:上次|最近|之前|刚才|最后)(?:做的|创建的)?/g, "")
    .replace(/(?:能不能|能否|是否|可以|打开|启动|预览|检查|确认|我的|这个|那个|一下|吧|产品|项目|应用|系统|页面)/g, "")
    .trim();
  return key.length >= 2 ? key : undefined;
}

function normalizeChineseNumber(value: string): string {
  const cleaned = value.replace(/[第个号款模板场景产品方案\s]/g, "");
  const map: Record<string, string> = {
    一: "1",
    二: "2",
    三: "3",
    四: "4",
    五: "5",
    六: "6"
  };
  return map[cleaned] ?? cleaned;
}

interface PreviewReadiness {
  canPreview: boolean;
  hasDependencies: boolean;
  manager?: "pnpm" | "npm" | "yarn" | "bun";
  message: string;
}

interface KnownProject {
  id: string;
  name: string;
  idea?: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
}

async function previewReadiness(cwd: string): Promise<PreviewReadiness> {
  const project = new ProjectTool();
  const scripts = await project.packageScripts(cwd);
  const manager = await project.detectPackageManager(cwd);
  if (!existsSync(resolve(cwd, "package.json")) || !manager) {
    return {
      canPreview: false,
      hasDependencies: false,
      message: "当前目录还不是可以预览的 Web 项目。可以先创建一个新产品项目。"
    };
  }
  if (!scripts.dev) {
    return {
      canPreview: false,
      hasDependencies: existsSync(resolve(cwd, "node_modules")),
      manager,
      message: "当前项目没有本地预览入口。可以继续让 ccli 为这个项目补上 Web 预览能力。"
    };
  }
  return {
    canPreview: true,
    hasDependencies: existsSync(resolve(cwd, "node_modules")),
    manager,
    message: "当前项目可以启动本地预览。"
  };
}

async function ensureDependenciesForPreview(inputValue: { cwd: string; renderer: ProductRenderer; yes: boolean }): Promise<void> {
  if (existsSync(resolve(inputValue.cwd, "node_modules"))) {
    return;
  }
  const confirmed = inputValue.yes || (await confirmChinese("预览前需要准备项目运行内容，会访问网络。是否继续？"));
  if (!confirmed) {
    throw new Error("还没有准备项目运行内容，已停止预览。");
  }
  const project = new ProjectTool();
  const manager = (await project.detectPackageManager(inputValue.cwd)) ?? "pnpm";
  const command = manager === "npm" ? "npm install" : manager === "yarn" ? "yarn install" : manager === "bun" ? "bun install" : "pnpm install";
  const audit = await AuditSession.create({ cwd: inputValue.cwd, task: "准备本地预览" });
  const { ShellTool } = await import("@ccli/tools");
  print(inputValue.renderer.render({ type: "validate", message: "正在准备本地预览所需内容。" }));
  const reportInstallProgress = createInstallProgressReporter(inputValue.renderer);
  const result = await new ShellTool().run(command, {
    cwd: inputValue.cwd,
    audit,
    kind: "install",
    confirmed: true,
    timeoutMs: 300_000,
    onOutput: reportInstallProgress
  });
  if (result.exitCode !== 0) {
    throw new Error("本地预览准备失败，技术细节已记录到审计日志。");
  }
}

async function startPreviewServer(inputValue: {
  cwd: string;
  renderer: ProductRenderer;
  host: string;
  port: number;
  openBrowser: boolean;
}): Promise<void> {
  const readiness = await previewReadiness(inputValue.cwd);
  if (!readiness.canPreview || !readiness.manager) {
    print(inputValue.renderer.render({ type: "risk", message: readiness.message, severity: "warning" }));
    return;
  }

  const url = `http://${inputValue.host}:${inputValue.port}`;
  const command = previewCommand(readiness.manager, inputValue.host, inputValue.port);
  print(inputValue.renderer.render({ type: "info", message: "正在启动本地预览。" }));

  await new Promise<void>((resolvePreview, rejectPreview) => {
    const child = spawn(command, {
      cwd: inputValue.cwd,
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let announced = false;
    let outputBuffer = "";
    let settled = false;
    const readyTimer = setTimeout(() => {
      if (!announced) {
        child.kill("SIGTERM");
        settle(() => rejectPreview(new Error("本地预览启动超时。")));
      }
    }, 45_000);

    const cleanup = () => {
      clearTimeout(readyTimer);
      process.off("SIGINT", stopPreview);
      process.off("SIGTERM", stopPreview);
    };

    const settle = (finish: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      finish();
    };

    const stopPreview = () => {
      child.kill("SIGTERM");
    };

    const announce = () => {
      if (announced) {
        return;
      }
      announced = true;
      clearTimeout(readyTimer);
      print(
        inputValue.renderer.render({
          type: "done",
          message: inputValue.openBrowser ? `本地预览已启动，正在打开浏览器。地址：${url}` : `本地预览已启动。打开 ${url}`,
          severity: "success"
        })
      );
      if (inputValue.openBrowser) {
        void openUrlInBrowser(url).then((opened) => {
          print(
            inputValue.renderer.render({
              type: opened ? "done" : "risk",
              message: opened ? "浏览器已打开，可以直接查看页面。" : "没有自动打开浏览器，请手动打开上面的地址。",
              severity: opened ? "success" : "warning"
            })
          );
        });
      }
      print("保持这个窗口打开即可继续预览。结束预览时按 Ctrl+C。");
    };

    process.once("SIGINT", stopPreview);
    process.once("SIGTERM", stopPreview);

    const onData = (chunk: Buffer) => {
      outputBuffer = `${outputBuffer}${chunk.toString("utf8")}`.slice(-4000);
      if (/local:|ready in|localhost|127\.0\.0\.1/i.test(outputBuffer)) {
        announce();
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (error) => {
      settle(() => rejectPreview(error));
    });
    child.on("close", (code) => {
      if (!announced && code !== 0) {
        settle(() => rejectPreview(new Error("本地预览没有启动成功。")));
        return;
      }
      settle(resolvePreview);
    });
  });
}

function previewCommand(manager: "pnpm" | "npm" | "yarn" | "bun", host: string, port: number): string {
  const args = `--host ${shellQuote(host)} --port ${port} --strictPort`;
  if (manager === "npm") {
    return `npm run dev -- ${args}`;
  }
  if (manager === "yarn") {
    return `yarn dev ${args}`;
  }
  if (manager === "bun") {
    return `bun run dev -- ${args}`;
  }
  return `pnpm dev -- ${args}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function openUrlInBrowser(url: string): Promise<boolean> {
  for (const candidate of browserOpenCandidates(url)) {
    const opened = await runBrowserOpenCommand(candidate.command, candidate.args);
    if (opened) {
      return true;
    }
  }
  return false;
}

function browserOpenCandidates(url: string): Array<{ command: string; args: string[] }> {
  if (process.platform === "win32") {
    return [{ command: "cmd.exe", args: ["/c", "start", "", url] }];
  }
  if (process.platform === "darwin") {
    return [{ command: "open", args: [url] }];
  }
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    return [
      { command: "cmd.exe", args: ["/c", "start", "", url] },
      { command: "wslview", args: [url] },
      { command: "xdg-open", args: [url] }
    ];
  }
  return [{ command: "xdg-open", args: [url] }];
}

async function runBrowserOpenCommand(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolveOpen) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      windowsHide: true
    });
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolveOpen(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle(false);
    }, 3_000);
    child.on("error", () => settle(false));
    child.on("close", (code) => settle(code === 0));
  });
}

function createInstallProgressReporter(renderer: ProductRenderer): (chunk: string) => void {
  let lastReportAt = Date.now();
  return (chunk: string) => {
    const now = Date.now();
    if (now - lastReportAt < 12_000) {
      return;
    }
    lastReportAt = now;
    const message = /ECONNRESET|retry|Request took|download/i.test(chunk)
      ? "网络下载较慢，仍在准备本地预览。"
      : "本地预览仍在准备中。";
    print(renderer.render({ type: "validate", message }));
  };
}

async function createProductFromIdea(inputValue: {
  cwd: string;
  idea: string;
  name?: string;
  install: boolean;
  preview: boolean;
  previewAutoInstall: boolean;
  previewOpenBrowser: boolean;
  previewHost?: string;
  previewPort?: number;
  withPr: boolean;
  expert: boolean;
  yes: boolean;
  renderer: ProductRenderer;
}): Promise<string> {
  const name = inputValue.name?.trim() || projectNameFromIdea(inputValue.idea);
  const target = resolve(inputValue.cwd, name);
  print(inputValue.renderer.render({ type: "inspect", message: "正在为这个产品目标准备新项目。" }));
  await createBossProject({
    name,
    target,
    install: inputValue.install,
    yes: inputValue.yes,
    task: `创建产品 ${name}`
  });
  print(inputValue.renderer.render({ type: "plan", message: "项目已准备好，开始按你的目标推进第一轮开发。" }));
  await runRequirement({
    cwd: target,
    expert: inputValue.expert,
    yes: inputValue.yes,
    requirement: inputValue.idea,
    withPr: inputValue.withPr
  });
  await rememberProject({
    name,
    idea: inputValue.idea,
    path: target
  });
  print(inputValue.renderer.render({ type: "done", message: "第一个版本已处理完成。后续可以继续用中文提需求。", severity: "success" }));
  if (inputValue.preview) {
    await ensureDependenciesForPreview({
      cwd: target,
      renderer: inputValue.renderer,
      yes: inputValue.previewAutoInstall ? true : inputValue.yes
    });
    await startPreviewServer({
      cwd: target,
      renderer: inputValue.renderer,
      host: inputValue.previewHost ?? "127.0.0.1",
      port: inputValue.previewPort ?? 5173,
      openBrowser: inputValue.previewOpenBrowser
    });
  }
  return target;
}

async function rememberProject(inputValue: { name: string; idea: string; path: string }): Promise<KnownProject> {
  const projects = await readProjectRegistry();
  const now = new Date().toISOString();
  const projectPath = resolve(inputValue.path);
  const existing = projects.find((project) => resolve(project.path) === projectPath);
  const next: KnownProject = {
    id: existing?.id ?? projectIdFromName(inputValue.name, now),
    name: inputValue.name,
    idea: inputValue.idea,
    path: projectPath,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastOpenedAt: existing?.lastOpenedAt
  };
  const merged = [next, ...projects.filter((project) => project.id !== next.id && resolve(project.path) !== projectPath)].slice(0, 100);
  await writeProjectRegistry(merged);
  return next;
}

async function touchProjectRegistry(id: string): Promise<void> {
  const projects = await readProjectRegistry();
  const now = new Date().toISOString();
  const updated = projects.map((project) =>
    project.id === id ? { ...project, updatedAt: now, lastOpenedAt: now } : project
  );
  await writeProjectRegistry(sortProjects(updated));
}

async function readProjectRegistry(): Promise<KnownProject[]> {
  try {
    const parsed = JSON.parse(await readFile(projectRegistryPath(), "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return sortProjects(parsed.filter(isKnownProject));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    return [];
  }
}

async function writeProjectRegistry(projects: KnownProject[]): Promise<void> {
  const path = projectRegistryPath();
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(sortProjects(projects), null, 2)}\n`, "utf8");
  await chmod(path, 0o600).catch(() => undefined);
}

function resolveProjectSelection(projects: KnownProject[], key: string | undefined): KnownProject | undefined {
  if (!key?.trim()) {
    return projects[0];
  }
  const trimmed = key.trim();
  const index = Number(trimmed);
  if (Number.isInteger(index) && index >= 1 && index <= projects.length) {
    return projects[index - 1];
  }
  const normalized = trimmed.toLowerCase();
  return (
    projects.find((project) => project.id === trimmed) ??
    projects.find((project) => project.name === trimmed) ??
    projects.find((project) => project.name.toLowerCase().includes(normalized))
  );
}

function projectSummary(project: KnownProject, index: number) {
  return {
    number: index + 1,
    id: project.id,
    name: project.name,
    summary: project.idea,
    lastOpenedAt: project.lastOpenedAt,
    updatedAt: project.updatedAt
  };
}

function sortProjects(projects: KnownProject[]): KnownProject[] {
  return [...projects].sort((left, right) => projectTime(right) - projectTime(left));
}

function projectTime(project: KnownProject): number {
  return Date.parse(project.lastOpenedAt ?? project.updatedAt ?? project.createdAt) || 0;
}

function isKnownProject(value: unknown): value is KnownProject {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const project = value as Partial<KnownProject>;
  return Boolean(project.id && project.name && project.path && project.createdAt && project.updatedAt);
}

function projectRegistryPath(): string {
  return resolve(homedir(), ".ccli", "projects.json");
}

function projectIdFromName(name: string, timestamp: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "project";
  return `${slug}-${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  const datePart = date.toISOString().slice(0, 10);
  const timePart = date.toTimeString().slice(0, 5);
  return `${datePart} ${timePart}`;
}

async function createBossProject(inputValue: {
  name: string;
  target: string;
  install: boolean;
  yes: boolean;
  task: string;
}): Promise<void> {
  await ensureProjectTargetReady(inputValue.target);
  await mkdir(inputValue.target, { recursive: true });
  const audit = await AuditSession.create({ cwd: inputValue.target, task: inputValue.task });
  await createTemplateProject(inputValue.target, inputValue.name, audit);
  await new GitTool().init({ cwd: inputValue.target, audit, confirmed: true });

  if (inputValue.install) {
    const confirmed = inputValue.yes || (await confirmChinese("创建后需要安装依赖，会访问网络。是否继续？"));
    if (confirmed) {
      const { ShellTool } = await import("@ccli/tools");
      await new ShellTool().run("pnpm install", {
        cwd: inputValue.target,
        audit,
        kind: "install",
        confirmed: true
      });
    }
  }
}

async function ensureProjectTargetReady(target: string): Promise<void> {
  const entries = await readdir(target).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });

  if (entries?.length) {
    throw new Error("这个项目名已经被使用。请换一个名称，或在空目录中创建。");
  }
}

function projectNameFromIdea(idea: string): string {
  const firstClause = idea
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .split(/[，。；;,.!?！？\n]/)[0]
    .replace(/^(帮我|请|我想|我要|想要|需要|做一个|做个|创建一个|创建个|开发一个|开发个|生成一个|生成个|搭建一个|搭建个|做|创建|开发|生成|搭建)/, "")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff_-]+/gu, "")
    .slice(0, 18);
  return firstClause || `我的应用-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
}

async function resolveSetupProvider(
  requested: string | undefined,
  rl: ReturnType<typeof createInterface>
): Promise<SupportedProviderId | undefined> {
  if (requested) {
    const normalized = normalizeProviderId(requested);
    if (!normalized) {
      throw new Error("暂不支持这个模型服务。可以选择 OpenAI、Anthropic、Google、Qwen、DeepSeek 或 Kimi。");
    }
    return normalized;
  }

  if (!input.isTTY) {
    return undefined;
  }

  print("请选择你已经有授权的模型服务：");
  for (const [index, provider] of providerEntries().entries()) {
    print(`${index + 1}. ${provider[1].label}`);
  }
  print("0. 稍后再说");

  const answer = (await rl.question("输入序号或名称：")).trim();
  if (!answer || answer === "0") {
    return undefined;
  }

  const byNumber = Number(answer);
  if (Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= providerEntries().length) {
    return providerEntries()[byNumber - 1][0];
  }

  const normalized = normalizeProviderId(answer);
  if (!normalized) {
    throw new Error("没有识别这个模型服务。请重新运行首次设置。");
  }
  return normalized;
}

async function resolveSetupApiKey(
  provider: SupportedProviderId,
  requested: string | undefined,
  rl: ReturnType<typeof createInterface>
): Promise<string | undefined> {
  if (requested?.trim()) {
    return requested.trim();
  }
  if (!input.isTTY) {
    return undefined;
  }

  const label = PROVIDER_PRESETS[provider].label;
  const value = (await rl.question(`请粘贴 ${label} 授权码，直接回车跳过：`)).trim();
  return value || undefined;
}

async function saveModelSetup(provider: SupportedProviderId, apiKey: string): Promise<void> {
  const current = await readGlobalConfig();
  const preset = PROVIDER_PRESETS[provider];
  const next: CcliConfig = {
    language: "zh-CN",
    mode: "plain-user",
    automation: "high-with-guardrails",
    ...current,
    providers: {
      ...current.providers,
      [provider]: {
        ...current.providers?.[provider],
        apiKey
      }
    },
    roles: {
      ...current.roles,
      ...Object.fromEntries(SETUP_ROLES.map((role) => [role, { provider, model: preset.model }]))
    }
  };

  const path = globalConfigPath();
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await chmod(path, 0o600).catch(() => undefined);
}

async function readGlobalConfig(): Promise<CcliConfig> {
  try {
    return JSON.parse(await readFile(globalConfigPath(), "utf8")) as CcliConfig;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function globalConfigPath(): string {
  return resolve(homedir(), ".ccli", "config.json");
}

function normalizeProviderId(value: string): SupportedProviderId | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "claude") return "anthropic";
  if (normalized === "gemini") return "google";
  if (normalized === "tongyi" || normalized === "dashscope" || normalized === "aliyun") return "qwen";
  if (normalized === "moonshot") return "kimi";
  return providerEntries().find(([id]) => id === normalized)?.[0];
}

function providerEntries(): Array<[SupportedProviderId, (typeof PROVIDER_PRESETS)[SupportedProviderId]]> {
  return Object.entries(PROVIDER_PRESETS) as Array<[SupportedProviderId, (typeof PROVIDER_PRESETS)[SupportedProviderId]]>;
}

async function runRequirement(options: {
  cwd: string;
  expert: boolean;
  yes: boolean;
  requirement: string;
  withPr?: boolean;
}): Promise<void> {
  const config = await loadCcliConfig(options.cwd);
  const registry = createDefaultProviderRegistry(config);
  await new TaskOrchestrator().run({
    cwd: options.cwd,
    requirement: options.requirement,
    expert: options.expert,
    yes: options.yes,
    withPr: Boolean(options.withPr),
    config,
    registry,
    onEvent: (_event, rendered) => print(rendered)
  });
}

async function checkHealth(cwd: string) {
  const config = await loadCcliConfig(cwd).catch(() => ({} as CcliConfig));
  const nodeReady = await commandOk("node", ["--version"]);
  const gitReady = await commandOk("git", ["--version"]);
  const pnpmReady = await commandOk("pnpm", ["--version"]);
  const ghReady = await commandOk("gh", ["auth", "status", "--hostname", "github.com"], 20_000);
  const inProject = existsSync(resolve(cwd, "package.json")) || existsSync(resolve(cwd, ".git"));
  const modelReadiness = assessModelReadiness(config);

  return [
    {
      name: "基础运行环境",
      status: nodeReady ? ("ready" as const) : ("action-needed" as const),
      userMessage: nodeReady ? "已经可以运行 ccli。" : "还缺少运行 ccli 的基础环境。",
      fix: "安装 Node.js 20 或更高版本。"
    },
    {
      name: "项目保存能力",
      status: gitReady ? ("ready" as const) : ("action-needed" as const),
      userMessage: gitReady ? "可以保存每次成果。" : "还不能保存和追踪成果。",
      fix: "安装 Git。"
    },
    {
      name: "本地构建能力",
      status: pnpmReady ? ("ready" as const) : ("action-needed" as const),
      userMessage: pnpmReady ? "可以安装依赖并验证项目。" : "还不能完整安装和验证项目。",
      fix: "运行 corepack enable，或安装 pnpm。"
    },
    {
      name: "团队交付能力",
      status: ghReady ? ("ready" as const) : ("optional" as const),
      userMessage: ghReady ? "可以自动创建、审查和合并团队交付。" : "暂时只能在本地工作，配置后可自动交付到 GitHub。",
      fix: "运行 gh auth login。"
    },
    {
      name: "当前工作区",
      status: inProject ? ("ready" as const) : ("optional" as const),
      userMessage: inProject ? "已经在一个可工作的项目里。" : "当前目录还不像一个项目，可以先创建新项目。",
      fix: "运行 ccli new 我的应用。"
    },
    {
      name: "智能开发能力",
      status: modelReadiness.ready ? ("ready" as const) : modelReadiness.partial ? ("optional" as const) : ("action-needed" as const),
      userMessage: modelReadiness.ready
        ? "已经检测到模型授权，可以进入更完整的自动开发。"
        : modelReadiness.partial
          ? "已经有部分模型设置；完成首次设置后，规划、开发和审查会更稳定。"
          : "还没有检测到模型授权；现在仍可创建项目、记录需求和走本地流程。",
      fix: "运行 ccli setup。"
    }
  ];
}

function assessModelReadiness(config: CcliConfig): { ready: boolean; partial: boolean } {
  const requiredRoles = ["planner", "builder", "reviewer"] as const;
  const ready = requiredRoles.every((role) => {
    const selection = config.roles?.[role];
    return Boolean(selection && providerHasKey(selection.provider, config));
  });
  const partial =
    ready ||
    Object.keys(config.roles ?? {}).length > 0 ||
    Object.keys(config.providers ?? {}).some((provider) => providerHasKey(provider, config)) ||
    providerEntries().some(([provider]) => providerHasKey(provider, config));
  return { ready, partial };
}

function providerHasKey(provider: string, config: CcliConfig): boolean {
  if (config.providers?.[provider]?.apiKey) {
    return true;
  }
  const preset = PROVIDER_PRESETS[provider as SupportedProviderId];
  return Boolean(preset?.env.some((name) => process.env[name]));
}

async function commandOk(command: string, args: string[], timeoutMs = 10_000): Promise<boolean> {
  return new Promise((resolveCommand) => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolveCommand(false);
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveCommand(code === 0);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolveCommand(false);
    });
  });
}

function reviewComment(title: string, review: Awaited<ReturnType<ReviewerAgent["review"]>>): string {
  const risks = review.risks.length ? review.risks.map((risk) => `- ${risk}`).join("\n") : "未发现明显风险。";
  const validation = review.validation === "passed" ? "自动验证已通过。" : review.validation === "failed" ? "自动验证没有全部通过。" : "当前没有可自动执行的验证脚本。";
  return [`## ccli 自动审查`, "", `交付：${title}`, "", `结论：${review.summary}`, "", `验证：${validation}`, "", `风险：`, risks].join("\n");
}

function parseMergeMethod(method?: string): "squash" | "merge" | "rebase" {
  if (method === "merge" || method === "rebase" || method === "squash") {
    return method;
  }
  return "squash";
}

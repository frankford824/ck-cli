#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import { TaskOrchestrator } from "@ccli/agent-core";
import {
  createAcceptanceGuide,
  createBossApprovalReceipt,
  createBossBrief,
  createBossBriefFromAnswers,
  createBossHome,
  createBossQuestionCard,
  createBossReportCard,
  createExperienceEvent,
  createHardwareResponse,
  createResumeGuide,
  createSetupGuide,
  hardwareExamples,
  hardwareManifest,
  hardwareSchema,
  healthSummary,
  installSuccessCard,
  renderAcceptanceGuide,
  renderBossApprovalReceipt,
  renderBossBrief,
  renderBossHome,
  renderBossQuestionCard,
  renderBossReportCard,
  renderHealthReport,
  renderInstallSuccess,
  renderNextActions,
  renderResumeGuide,
  renderSetupGuide,
  renderStarterIdeas,
  renderWelcome,
  speechText,
  starterIdeas,
  toPublicExperienceData,
  toPublicHardwareResponse,
  type BossApprovalReceipt,
  type BossBrief,
  type BossClarificationAnswers,
  type BossQuestionCard,
  type ExperienceAction,
  type HardwareResponse,
  type BossReportCard,
  type HealthReport,
  type NextAction,
  type NextActionPlan,
  type ResumeGuide,
  type SetupGuide,
  type StarterIdea
} from "@ccli/experience";
import {
  analyzeHarnessReadiness,
  analyzeHarnessPlaybook,
  analyzeHarnessRoadmap,
  loadHarnessContext,
  readHarnessProgress,
  recordHarnessLesson,
  renderHarnessMethod,
  renderHarnessPlaybook,
  renderHarnessProfile,
  renderHarnessReadiness,
  renderHarnessRoadmap,
  renderHarnessSummary
} from "@ccli/harness";
import { LocalMemoryStore } from "@ccli/memory";
import { SPECIALISTS, SPRINT_STEPS } from "@ccli/methodology";
import { ProductRenderer } from "@ccli/product-ui";
import { createDefaultProviderRegistry, loadCcliConfig, type CcliConfig } from "@ccli/providers";
import { ReviewerAgent } from "@ccli/review";
import { AuditSession, readLatestAuditSummary, readState, type CcliState } from "@ccli/session";
import { installHarnessScaffold, installHarnessSkills } from "@ccli/templates";
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
const HARDWARE_PENDING_ACTION_TTL_MS = 10 * 60 * 1000;

interface HardwarePendingAction {
  action: ExperienceAction;
  sourceUtterance: string;
  createdAt: string;
  expiresAt: string;
}

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
        print(renderBossHome(await buildBossHome(cwd)));
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
  .command("launch")
  .aliases(["work", "from-brief"])
  .description("按已保存业务简报生成首版产品")
  .option("--name <name>", "项目名称")
  .option("--host <host>", "预览地址", "127.0.0.1")
  .option("--port <port>", "预览端口", "5173")
  .option("--no-preview", "只生成首版，不打开预览")
  .option("--no-open", "启动预览但不自动打开浏览器")
  .option("--with-pr", "完成后尝试创建团队审查入口")
  .action(async (options: { name?: string; host?: string; port?: string; preview?: boolean; open?: boolean; withPr?: boolean }) => {
    await withCli(async ({ renderer, cwd, expert, yes }) => {
      const port = Number(options.port ?? "5173");
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        print(renderer.render({ type: "risk", message: "预览端口不正确，请换一个 1 到 65535 之间的数字。", severity: "warning" }));
        return;
      }
      await launchFromBossBrief({
        cwd,
        renderer,
        expert,
        yes,
        name: options.name,
        preview: options.preview !== false,
        previewAutoInstall: true,
        previewOpenBrowser: options.open !== false,
        previewHost: options.host ?? "127.0.0.1",
        previewPort: port,
        withPr: Boolean(options.withPr)
      });
    });
  });

program
  .command("wizard")
  .aliases(["coach", "guide"])
  .argument("[idea...]", "一句话描述想做的产品")
  .description("老板开工向导：问几句就生成业务简报")
  .option("--no-launch", "只保存业务简报，不进入首版生成")
  .option("--host <host>", "预览地址", "127.0.0.1")
  .option("--port <port>", "预览端口", "5173")
  .option("--no-preview", "生成首版但不打开预览")
  .option("--no-open", "启动预览但不自动打开浏览器")
  .option("--with-pr", "完成后尝试创建团队审查入口")
  .action(
    async (
      ideaParts: string[] | undefined,
      options: { launch?: boolean; host?: string; port?: string; preview?: boolean; open?: boolean; withPr?: boolean }
    ) => {
      await withCli(async ({ renderer, cwd, expert, yes }) => {
        const port = Number(options.port ?? "5173");
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          print(renderer.render({ type: "risk", message: "预览端口不正确，请换一个 1 到 65535 之间的数字。", severity: "warning" }));
          return;
        }

        await runBossWizard({
          cwd,
          renderer,
          expert,
          yes,
          idea: ideaParts?.join(" ").trim(),
          launch: options.launch !== false,
          preview: options.preview !== false,
          previewAutoInstall: true,
          previewOpenBrowser: options.open !== false,
          previewHost: options.host ?? "127.0.0.1",
          previewPort: port,
          withPr: Boolean(options.withPr)
        });
      });
    }
  );

program
  .command("try")
  .alias("demo")
  .description("安全试用：创建一个演示产品并打开页面")
  .option("--name <name>", "试用产品名称")
  .option("--host <host>", "预览地址", "127.0.0.1")
  .option("--port <port>", "预览端口", "5173")
  .option("--no-preview", "只生成试用产品，不打开预览")
  .option("--no-open", "启动预览但不自动打开浏览器")
  .action(async (options: { name?: string; host?: string; port?: string; preview?: boolean; open?: boolean }) => {
    await withCli(async ({ renderer, expert }) => {
      const port = Number(options.port ?? "5173");
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        print(renderer.render({ type: "risk", message: "预览端口不正确，请换一个 1 到 65535 之间的数字。", severity: "warning" }));
        return;
      }
      await runTryDemo({
        renderer,
        expert,
        name: options.name,
        preview: options.preview !== false,
        previewOpenBrowser: options.open !== false,
        previewHost: options.host ?? "127.0.0.1",
        previewPort: port
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
        print(renderer.render({ type: "info", message: "当前项目还没有任务记录。可以直接说你想让产品变成什么样。" }));
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
  .command("installed")
  .description("显示安装完成后的中文开箱卡")
  .option("--json", "输出给安装器或硬件使用的结构化结果")
  .action(async (options: { json?: boolean }) => {
    const card = installSuccessCard();
    if (options.json) {
      printPublicJson(card);
      return;
    }
    print(renderInstallSuccess(card));
  });

program
  .command("ready")
  .alias("onboard")
  .description("查看老板开箱准备向导")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (options: { json?: boolean }) => {
    await withCli(async ({ cwd }) => {
      const guide = await buildSetupGuide(cwd);
      if (options.json) {
        printPublicJson(guide);
        return;
      }
      print(renderSetupGuide(guide));
    });
  });

program
  .command("home")
  .alias("dashboard")
  .description("打开老板开箱驾驶舱")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (options: { json?: boolean }) => {
    await withCli(async ({ cwd }) => {
      const home = await buildBossHome(cwd);
      if (options.json) {
        printPublicJson(home);
        return;
      }
      print(renderBossHome(home));
    });
  });

program
  .command("report")
  .aliases(["summary", "card"])
  .description("生成老板交付汇报卡")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (options: { json?: boolean }) => {
    await withCli(async ({ cwd }) => {
      const card = await buildBossReportCard(cwd);
      if (options.json) {
        printPublicJson(card);
        return;
      }
      print(renderBossReportCard(card));
    });
  });

program
  .command("brief")
  .aliases(["contract", "spec"])
  .argument("[goal...]", "老板一句话业务目标")
  .description("整理或查看老板业务简报")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (goalParts: string[] | undefined, options: { json?: boolean }) => {
    await withCli(async ({ cwd, renderer }) => {
      const goal = goalParts?.join(" ").trim();
      const result = await buildOrSaveBossBrief(cwd, goal);
      if (!result.brief) {
        print(renderer.render({ type: "info", message: "还没有业务简报。可以直接说：整理业务简报：后面加你的产品目标。" }));
        return;
      }
      if (options.json) {
        printPublicJson(result.brief);
        return;
      }
      if (result.saved) {
        print(renderer.render({ type: "done", message: "业务简报已保存，后续开发和验收会围绕它推进。", severity: "success" }));
      } else if (result.usedLatest && result.workspace) {
        print(renderer.render({ type: "info", message: `已接上最近产品：${productWorkspaceName(result.workspace)}。` }));
      }
      print(renderBossBrief(result.brief));
    });
  });

program
  .command("questions")
  .aliases(["ask", "clarify"])
  .argument("[goal...]", "老板一句话业务目标")
  .description("生成老板需求追问卡")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (goalParts: string[] | undefined, options: { json?: boolean }) => {
    await withCli(async ({ cwd }) => {
      const goal = goalParts?.join(" ").trim();
      const card = await buildBossQuestionCard(cwd, goal);
      if (options.json) {
        printPublicJson(card);
        return;
      }
      print(renderBossQuestionCard(card));
    });
  });

program
  .command("answers")
  .aliases(["answer", "intake"])
  .argument("[answer...]", "老板对追问卡的回答")
  .description("把老板回答整理并保存为业务简报")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (answerParts: string[] | undefined, options: { json?: boolean }) => {
    await withCli(async ({ cwd, renderer }) => {
      const answer = answerParts?.join(" ").trim();
      if (!answer) {
        print(renderer.render({ type: "info", message: "请直接说回答，例如：我的回答是：销售每天用；第一眼看待跟进客户；首版能新增客户并提醒。" }));
        return;
      }
      const result = await buildOrSaveBossBriefFromAnswers(cwd, answer);
      if (options.json) {
        printPublicJson({ brief: result.brief, answers: result.answers, saved: result.saved });
        return;
      }
      print(renderer.render({ type: "done", message: "老板回答已整理成业务简报，后续开发和验收会围绕它推进。", severity: "success" }));
      print(renderBossBrief(result.brief));
    });
  });

program
  .command("accept")
  .alias("check")
  .description("生成老板验收清单")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (options: { json?: boolean }) => {
    await withCli(async ({ cwd }) => {
      const guide = await buildAcceptanceGuide(cwd);
      if (options.json) {
        printPublicJson(guide);
        return;
      }
      print(renderAcceptanceGuide(guide));
    });
  });

program
  .command("approve")
  .aliases(["signoff", "pass"])
  .argument("[note...]", "老板验收备注")
  .description("记录老板验收通过凭证")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (noteParts: string[] | undefined, options: { json?: boolean }) => {
    await withCli(async ({ cwd, renderer }) => {
      const receipt = await recordBossApproval(cwd, noteParts?.join(" ").trim());
      if (options.json) {
        printPublicJson(receipt);
        return;
      }
      print(renderer.render({ type: "done", message: "老板验收通过已记录，后续交付会带上这份凭证。", severity: "success" }));
      print(renderBossApprovalReceipt(receipt));
    });
  });

program
  .command("approval")
  .alias("receipt")
  .description("查看老板验收凭证")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (options: { json?: boolean }) => {
    await withCli(async ({ cwd, renderer }) => {
      const receipt = await readBossApprovalForCurrentProduct(cwd);
      if (!receipt) {
        print(renderer.render({ type: "info", message: "还没有老板验收凭证。看完页面后，可以说：记录验收通过。" }));
        return;
      }
      if (options.json) {
        printPublicJson(receipt);
        return;
      }
      print(renderBossApprovalReceipt(receipt));
    });
  });

program
  .command("revise")
  .alias("change")
  .argument("[feedback...]", "老板验收后的修改意见")
  .description("按老板验收反馈继续修改当前产品")
  .action(async (feedbackParts: string[] | undefined) => {
    await withCli(async ({ renderer, cwd, expert, yes }) => {
      await handleRevisionRequest({
        cwd,
        renderer,
        expert,
        yes,
        feedback: feedbackParts?.join(" ").trim() ?? ""
      });
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

      const workspace = await resolveProductWorkspace(cwd);
      const targetCwd = workspace?.cwd ?? cwd;
      if (workspace?.usedLatest) {
        print(renderer.render({ type: "info", message: `已接上最近产品：${productWorkspaceName(workspace)}。` }));
      }

      const readiness = await previewReadiness(targetCwd);
      if (!readiness.canPreview) {
        print(renderer.render({ type: "risk", message: readiness.message, severity: "warning" }));
        return;
      }

      if (!readiness.hasDependencies) {
        if (!options.install) {
          print(renderer.render({ type: "risk", message: "当前项目还没有安装运行所需内容。你可以让 ccli 自动准备后再预览。", severity: "warning" }));
          return;
        }
        await ensureDependenciesForPreview({ cwd: targetCwd, renderer, yes });
      }

      if (options.check) {
        print(renderer.render({ type: "done", message: "当前项目已经可以启动本地预览。", severity: "success" }));
        return;
      }

      await startPreviewServer({
        cwd: targetCwd,
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
        printPublicJson(plan);
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
          printPublicJson(ideas);
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
      await runSetupWizard({ cwd, renderer, ...options });
    });
  });

program
  .command("hardware")
  .argument("[utterance...]", "语音转写后的中文请求")
  .description("查看未来智能硬件和语音交互协议")
  .option("--json", "输出给硬件使用的结构化响应")
  .option("--schema", "输出硬件协议字段说明")
  .option("--examples", "输出硬件协议示例")
  .action(async (utteranceParts: string[] | undefined, options: { json?: boolean; schema?: boolean; examples?: boolean }) => {
    await withCli(async ({ renderer, cwd, expert }) => {
      if (options.schema) {
        print(JSON.stringify(hardwareSchema(), null, 2));
        return;
      }
      if (options.examples) {
        print(JSON.stringify(hardwareExamples(), null, 2));
        return;
      }
      const utterance = utteranceParts?.join(" ").trim();
      if (utterance) {
        const response = await hardwareResponseForUtterance({ cwd, utterance });
        if (options.json) {
          print(JSON.stringify(response, null, 2));
          return;
        }
        print(speechText(response.event));
        if (response.event.choices?.length) {
          print("");
          for (const [index, choice] of response.event.choices.entries()) {
            print(`${index + 1}. ${choice}`);
          }
        }
        return;
      }

      if (options.json) {
        print(JSON.stringify(await buildHardwareHomeResponse(cwd), null, 2));
        return;
      }

      print(renderer.render({ type: "info", message: "ccli 已预留语音和智能硬件交互协议。" }));
      if (expert) {
        print(JSON.stringify(hardwareManifest(), null, 2));
      } else {
        print("硬件设备只需要传入文字或语音转写，接收中文朗读、屏幕提示、选项、产品清单、场景库和下一步建议。");
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
  .option("--init", "为当前项目补齐完整驾驭支架")
  .option("--method", "查看驾驭方法怎么用")
  .option("--playbook", "查看今天怎么按驾驭方法推进任务")
  .option("--roadmap", "查看 14 步驾驭路线图")
  .option("--overwrite", "覆盖已有支架文件")
  .action(async (options: { init?: boolean; method?: boolean; playbook?: boolean; roadmap?: boolean; overwrite?: boolean }) => {
    await withCli(async ({ renderer, cwd, expert }) => {
      if (options.method) {
        print(renderHarnessMethod());
        return;
      }
      if (options.playbook) {
        const context = await loadHarnessContext(cwd);
        const progress = await readHarnessProgress(cwd);
        print(renderHarnessPlaybook(analyzeHarnessPlaybook(context, progress)));
        return;
      }
      if (options.roadmap) {
        const context = await loadHarnessContext(cwd);
        const progress = await readHarnessProgress(cwd);
        print(renderHarnessRoadmap(analyzeHarnessRoadmap(context, progress)));
        return;
      }
      if (options.init) {
        await initializeHarnessForProject({
          cwd,
          renderer,
          expert,
          overwrite: Boolean(options.overwrite)
        });
        return;
      }
      const context = await loadHarnessContext(cwd);
      const progress = await readHarnessProgress(cwd);
      const readiness = analyzeHarnessReadiness(context, progress);
      print(renderer.render({ type: "info", message: "智能体驾驭系统已启用，会负责规则、护栏、验证反馈和进度记忆。" }));
      print(renderHarnessSummary(context));
      print(renderHarnessProfile(context));
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
  .command("learn")
  .argument("<lesson...>", "希望以后记住或避免的经验")
  .description("把一次踩坑或偏好沉淀为项目经验")
  .option("--impact <impact>", "这件事会造成什么影响")
  .option("--prevention <prevention>", "以后应该怎么避免")
  .action(async (lessonParts: string[], options: { impact?: string; prevention?: string }) => {
    await withCli(async ({ renderer, cwd, expert }) => {
      await rememberUserLesson({
        cwd,
        renderer,
        expert,
        lesson: lessonParts.join(" "),
        impact: options.impact,
        prevention: options.prevention
      });
    });
  });

program
  .command("resume")
  .alias("continue")
  .description("继续上次任务现场")
  .option("--json", "输出给硬件或自动化使用的结构化结果")
  .action(async (options: { json?: boolean }) => {
    await withCli(async ({ cwd }) => {
      const guide = await buildResumeGuide(cwd);
      if (options.json) {
        printPublicJson(guide);
        return;
      }
      print(renderResumeGuide(guide));
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
      const harness = await loadHarnessContext(cwd);
      const git = new GitTool();
      print(renderer.progress("save", "正在发送当前成果。"));
      await git.pushCurrent({ cwd, audit, confirmed: true, harness });
      const result = await new GitHubTool().createOrFindDraftPr(
        { cwd, audit, confirmed: true, harness },
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
      await runDeliveryFlow({ cwd, renderer, yes, ...options });
    });
  });

program
  .command("finish")
  .alias("deliver")
  .description("验收满意后准备交付")
  .option("--method <method>", "合并方式：squash、merge、rebase", "squash")
  .action(async (options: { method?: string }) => {
    await withCli(async ({ renderer, cwd, yes }) => {
      await runDeliveryFlow({
        cwd,
        renderer,
        yes,
        merge: true,
        useLatestProduct: true,
        method: options.method,
        title: "老板验收通过",
        body: "老板已确认当前效果满意，ccli 自动执行审查、交付和合并。"
      });
    });
  });

program
  .command("undo")
  .alias("rollback")
  .description("撤回上次保存的成果")
  .action(async () => {
    await withCli(async ({ renderer, cwd, yes }) => {
      await runUndoFlow({ cwd, renderer, yes, useLatestProduct: true });
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

function printPublicJson(value: unknown): void {
  print(JSON.stringify(toPublicExperienceData(value), null, 2));
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

function choicesFromActions(actions: ExperienceAction[]): string[] {
  return actions.map((action) => action.label);
}

function utteranceAction(id: string, label: string, say: string, description?: string, requiresConfirmation = false): ExperienceAction {
  return { id, label, kind: "utterance", say, description, requiresConfirmation };
}

function commandAction(id: string, label: string, command: string, description?: string, requiresConfirmation = false): ExperienceAction {
  return { id, label, kind: "command", command, description, requiresConfirmation };
}

function nextPlanActions(plan: NextActionPlan): ExperienceAction[] {
  return plan.actions.map((action) => utteranceAction(action.id, action.title, action.say, action.reason));
}

async function buildHardwareHomeResponse(cwd: string): Promise<HardwareResponse> {
  const home = await buildBossHome(cwd);
  const actions = nextPlanActions({ summary: home.summary, actions: home.actions });
  return toPublicHardwareResponse(createHardwareResponse(
    createExperienceEvent({
      surface: "hardware",
      tone: "asking",
      say: `${home.readiness} ${home.summary}`,
      screen: renderBossHome(home),
      choices: choicesFromActions(actions),
      actions
    }),
    { kind: "boss-home", home }
  ));
}

function questionCardActions(card: BossQuestionCard): ExperienceAction[] {
  return card.actions.map((action) =>
    utteranceAction(action.id, action.title, action.say, action.reason, action.id === "start-product")
  );
}

function bossWizardHardwareActions(card: BossQuestionCard): ExperienceAction[] {
  const actions = [
    utteranceAction("answer-now", "我来回答", hardwareAnswerExample(card), "按三个问题直接回答，ccli 会整理成业务简报。"),
    ...questionCardActions(card).filter((action) => action.id !== "ideas"),
    utteranceAction("safe-demo", "先安全试用", "试用一下")
  ];
  return actions.slice(0, 4);
}

function hardwareAnswerExample(card: BossQuestionCard): string {
  const audience = card.questions[0]?.examples[0] ?? "老板和一线同事";
  const firstScreen = card.questions[1]?.examples[0] ?? "最重要的业务重点";
  const passCondition = card.questions[2]?.examples[0] ?? "能看懂重点并完成核心动作";
  const goal = card.goal ? `目标：${card.goal}；` : "";
  return `我的回答是：${goal}使用者：${audience}；第一眼最想看到：${firstScreen}；首版通过条件：${passCondition}`;
}

function controlRecoveryActions(): ExperienceAction[] {
  return [
    utteranceAction("home", "回到开箱首页", "打开开箱首页"),
    utteranceAction("next", "下一步怎么办", "下一步怎么办"),
    utteranceAction("ideas", "给我几个产品模板", "给我几个产品模板")
  ];
}

function controlCancelledScreen(): string {
  return [
    "已停止这次口令。",
    "没有开始新的开发任务。",
    "",
    "你可以说：",
    "下一步怎么办",
    "打开开箱首页",
    "给我几个产品模板"
  ].join("\n");
}

function controlHelpScreen(): string {
  return [
    "你可以直接这样说：",
    "试用一下",
    "下一步怎么办",
    "给我几个产品模板",
    "打开当前产品页面",
    "怎么验收当前产品",
    "我想改一下：首页重点不够明显",
    "我满意，准备交付"
  ].join("\n");
}

function hardwareWelcomeScreen(): string {
  return [
    "ccli 中文开发管家",
    "",
    "你只需要说想做什么产品，或者说下一步怎么办。",
    "",
    "可以直接说：",
    "下一步怎么办",
    "给我几个产品模板",
    "一步步问我，然后开工",
    "试用一下",
    "打开我上次做的系统"
  ].join("\n");
}

function setupGuideActions(guide: SetupGuide): ExperienceAction[] {
  const primary = guide.steps.find((step) => step.primary) ?? guide.steps[0];
  const actions: ExperienceAction[] = [];
  if (primary?.id === "model" && primary.command) {
    actions.push(commandAction(primary.id, primary.title, primary.command, primary.reason, primary.status !== "ready"));
  } else if (primary) {
    actions.push(utteranceAction(primary.id, primary.title, primary.say, primary.reason));
  }
  actions.push(utteranceAction("ideas", "给我几个产品模板", "给我几个产品模板"));
  actions.push(utteranceAction("next", "下一步怎么办", "下一步怎么办"));
  return uniqueExperienceActions(actions);
}

function uniqueExperienceActions(actions: ExperienceAction[]): ExperienceAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) {
      return false;
    }
    seen.add(action.id);
    return true;
  });
}

async function rememberHardwarePendingAction(cwd: string, sourceUtterance: string, actions?: ExperienceAction[]): Promise<void> {
  const candidates = actions?.filter((action) => action.requiresConfirmation) ?? [];
  if (candidates.length !== 1) {
    return;
  }
  const now = Date.now();
  const pending: HardwarePendingAction = {
    action: candidates[0],
    sourceUtterance,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + HARDWARE_PENDING_ACTION_TTL_MS).toISOString()
  };
  const path = hardwarePendingActionPath(cwd);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(pending, null, 2)}\n`, "utf8");
}

async function readHardwarePendingAction(cwd: string): Promise<HardwarePendingAction | undefined> {
  try {
    const pending = JSON.parse(await readFile(hardwarePendingActionPath(cwd), "utf8")) as HardwarePendingAction;
    if (!pending.action || new Date(pending.expiresAt).getTime() <= Date.now()) {
      await clearHardwarePendingAction(cwd);
      return undefined;
    }
    return pending;
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function clearHardwarePendingAction(cwd: string): Promise<void> {
  await unlink(hardwarePendingActionPath(cwd)).catch((error: unknown) => {
    if (!isNotFoundError(error)) {
      throw error;
    }
  });
}

function hardwarePendingActionPath(cwd: string): string {
  return resolve(cwd, ".ccli", "hardware-pending-action.json");
}

function confirmedHardwareAction(action: ExperienceAction): ExperienceAction {
  return { ...action, requiresConfirmation: false };
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function hardwareResponseForUtterance(inputValue: { cwd: string; utterance: string }) {
  const utterance = inputValue.utterance.trim();
  const finalize = async <T>(response: HardwareResponse<T>) => {
    await rememberHardwarePendingAction(inputValue.cwd, utterance, response.event.actions);
    return toPublicHardwareResponse(response);
  };

  if (isHardwareConfirmRequest(utterance)) {
    const pending = await readHardwarePendingAction(inputValue.cwd);
    await clearHardwarePendingAction(inputValue.cwd);
    if (!pending) {
      const actions = controlRecoveryActions();
      return toPublicHardwareResponse(createHardwareResponse(
        createExperienceEvent({
          surface: "hardware",
          tone: "warning",
          say: "现在没有等待确认的动作。你可以重新说下一步怎么办。",
          screen: "没有等待确认的动作。\n可以说：下一步怎么办\n也可以说：打开开箱首页",
          choices: choicesFromActions(actions),
          actions
        }),
        { kind: "confirmation-empty" }
      ));
    }
    const action = confirmedHardwareAction(pending.action);
    return toPublicHardwareResponse(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "success",
        say: `已确认：${action.label}。`,
        screen: `已确认：${action.label}\n可以继续完成这一步。`,
        choices: [action.label],
        actions: [action]
      }),
      { kind: "action-confirmed", action, sourceUtterance: pending.sourceUtterance, createdAt: pending.createdAt }
    ));
  }

  await clearHardwarePendingAction(inputValue.cwd);

  if (!utterance) {
    const welcome = hardwareWelcomeScreen();
    const actions = [
      utteranceAction("next", "下一步怎么办", "下一步怎么办"),
      utteranceAction("ideas", "给我几个产品模板", "给我几个产品模板"),
      utteranceAction("open-latest", "打开我上次做的系统", "打开我上次做的系统")
    ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "calm",
        say: "你可以说下一步怎么办，或者说给我几个产品模板。",
        screen: welcome,
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "welcome" }
    ));
  }

  if (isCancelRequest(utterance)) {
    const actions = controlRecoveryActions();
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "calm",
        say: "已停止这次口令。你可以重新说下一步怎么办，或者回到开箱首页。",
        screen: controlCancelledScreen(),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "control-cancelled", utterance }
    ));
  }

  if (isHelpRequest(utterance)) {
    const actions = controlRecoveryActions();
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "你只需要说想做什么。也可以说下一步怎么办、给我几个产品模板、打开当前产品页面。",
        screen: controlHelpScreen(),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "control-help" }
    ));
  }

  if (isTryDemoRequest(utterance)) {
    const actions = [
      commandAction("start-demo", "开始安全试用", "ccli try", "会在本机试用区创建演示产品，并尝试打开本地页面。", true),
      utteranceAction("ideas", "先看产品模板", "给我几个产品模板"),
      utteranceAction("next", "下一步怎么办", "下一步怎么办")
    ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "可以先安全试用一遍。确认后会创建一个演示产品，不会改当前项目。",
        screen: "安全试用\n确认后会在本机试用区创建演示产品，并打开页面让你验收。",
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "try-demo" }
    ));
  }

  if (isUndoRequest(utterance)) {
    const actions = [
      commandAction("confirm-undo", "确认撤回上次成果", "ccli undo --yes", "会撤回上次保存的成果，并生成一条新的保存记录。", true),
      utteranceAction("acceptance", "先看验收清单", "怎么验收当前产品"),
      utteranceAction("cancel", "先不撤回", "取消")
    ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "可以撤回上次保存的成果。这个动作会改变当前产品，需要确认。",
        screen: "撤回上次成果\n确认后会撤回上次保存的成果，并生成一条新的保存记录。",
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "undo-confirmation" }
    ));
  }

  if (isWizardRequest(utterance)) {
    const idea = wizardIdeaFromNaturalRequest(utterance);
    const card = await buildBossQuestionCard(inputValue.cwd, idea);
    const actions = bossWizardHardwareActions(card);
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "我先问三个问题。你可以一次说完答案，我会整理成可开工的业务简报。",
        screen: renderBossQuestionCard(card),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "boss-wizard", idea, card, answerExample: hardwareAnswerExample(card) }
    ));
  }

  if (isAnswerRequest(utterance)) {
    const answer = answerTextFromNaturalRequest(utterance);
    if (!answer) {
      const actions = [
        utteranceAction("question-card", "先看追问卡", "帮我澄清需求"),
        utteranceAction("example-answer", "给一个回答例子", "我的回答是：销售每天用；第一眼看待跟进客户；首版能新增客户并提醒")
      ];
      return finalize(createHardwareResponse(
        createExperienceEvent({
          surface: "hardware",
          tone: "warning",
          say: "请直接说你的回答，例如谁每天用、第一眼看什么、怎样算首版通过。",
          screen: "还没有收到可整理的回答。\n可以说：我的回答是：销售每天用；第一眼看待跟进客户；首版能新增客户并提醒。",
          choices: choicesFromActions(actions),
          actions
        }),
        { kind: "brief-card", saved: false }
      ));
    }
    const result = await buildOrSaveBossBriefFromAnswers(inputValue.cwd, answer);
    const actions = [
      commandAction("launch-from-brief", "开始生成首版", "ccli launch --yes", "按这份业务简报生成首版产品。", true),
      utteranceAction("question-card", "继续追问", "帮我澄清需求"),
      utteranceAction("acceptance", "按清单验收", "怎么验收当前产品")
    ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "success",
        say: result.brief.summary,
        screen: renderBossBrief(result.brief),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "brief-card", brief: result.brief, answers: result.answers, saved: true }
    ));
  }

  if (isBriefLaunchRequest(utterance)) {
    const workspace = await resolveProductWorkspace(inputValue.cwd);
    const targetCwd = workspace?.cwd ?? inputValue.cwd;
    const brief = await readBossBrief(targetCwd).catch(() => undefined);
    if (!brief) {
      const actions = [
        utteranceAction("question-card", "先澄清需求", "帮我澄清需求"),
        utteranceAction("brief-card", "整理业务简报", "整理业务简报：做一个客户管理系统，能记录跟进和提醒")
      ];
      return finalize(createHardwareResponse(
        createExperienceEvent({
          surface: "hardware",
          tone: "warning",
          say: "还没有业务简报。先说帮我澄清需求，或者整理业务简报。",
          screen: "还没有可开工的业务简报。\n可以说：帮我澄清需求\n也可以说：整理业务简报：做一个客户管理系统，能记录跟进和提醒",
          choices: choicesFromActions(actions),
          actions
        }),
        { kind: "create-product", ready: false }
      ));
    }
    const name = brief.productName ?? projectNameFromIdea(brief.goal);
    const command = "ccli launch --yes";
    const actions = [
      commandAction("confirm-launch-from-brief", "确认按简报生成首版", command, `将按「${name}」业务简报生成首版产品。`, true),
      utteranceAction("brief-card", "再看业务简报", "查看业务简报"),
      utteranceAction("cancel", "先不开始", "取消")
    ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: `已找到${name}的业务简报。确认后可以开始生成首版。`,
        screen: `${name}\n目标：${brief.goal}\n确认后会按业务简报生成首版产品。`,
        choices: choicesFromActions(actions),
        actions
      }),
      {
        kind: "create-product",
        idea: brief.goal,
        name,
        command,
        fromBrief: true
      }
    ));
  }

  if (isQuestionRequest(utterance)) {
    const card = await buildBossQuestionCard(inputValue.cwd, questionGoalFromNaturalRequest(utterance));
    const actions = questionCardActions(card);
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: card.readyEnough ? "calm" : "asking",
        say: card.summary,
        screen: renderBossQuestionCard(card),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "question-card", card }
    ));
  }

  if (isSetupStartRequest(utterance) || isSetupGuideRequest(utterance)) {
    const guide = await buildSetupGuide(inputValue.cwd);
    const actions = setupGuideActions(guide);
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: guide.summary,
        screen: renderSetupGuide(guide),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "setup-guide", guide }
    ));
  }

  if (isResumeRequest(utterance)) {
    const guide = await buildResumeGuide(inputValue.cwd);
    const actions = nextPlanActions({ summary: guide.summary, actions: guide.actions });
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: guide.summary,
        screen: renderResumeGuide(guide),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "resume-guide", guide }
    ));
  }

  if (isReportRequest(utterance)) {
    const card = await buildBossReportCard(inputValue.cwd);
    const actions = nextPlanActions({ summary: card.summary, actions: card.actions });
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: card.status === "needs-attention" ? "warning" : card.status === "empty" ? "asking" : "calm",
        say: card.summary,
        screen: renderBossReportCard(card),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "report-card", card }
    ));
  }

  if (isBriefRequest(utterance)) {
    const result = await buildOrSaveBossBrief(inputValue.cwd, briefGoalFromNaturalRequest(utterance));
    const actions = result.brief
      ? [
          commandAction("launch-from-brief", "开始生成首版", "ccli launch --yes", "按这份业务简报生成首版产品。", true),
          utteranceAction("revise-brief", "补充要求", "我想改一下：目标用户和验收标准再写清楚"),
          utteranceAction("acceptance", "按清单验收", "怎么验收当前产品")
        ]
      : [
          utteranceAction("example-brief", "整理一个示例简报", "整理业务简报：做一个客户管理系统，能记录跟进和提醒"),
          utteranceAction("ideas", "先看产品模板", "给我几个产品模板")
        ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: result.brief ? "asking" : "warning",
        say: result.brief ? result.brief.summary : "还没有业务简报。请说整理业务简报，后面加你的产品目标。",
        screen: result.brief ? renderBossBrief(result.brief) : "还没有业务简报。\n可以说：整理业务简报：做一个客户管理系统，能记录跟进和提醒",
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "brief-card", brief: result.brief, saved: result.saved }
    ));
  }

  if (isApprovalRequest(utterance)) {
    const receipt = await recordBossApproval(inputValue.cwd, approvalNoteFromNaturalRequest(utterance));
    const actions = nextPlanActions({ summary: receipt.summary, actions: receipt.actions });
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "success",
        say: receipt.summary,
        screen: renderBossApprovalReceipt(receipt),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "approval-receipt", receipt }
    ));
  }

  if (isSatisfiedDeliveryRequest(utterance)) {
    const actions = [
      commandAction("confirm-delivery", "确认交付并合并", "ccli finish --yes", "会发送成果、进行独立审查，并在审查通过后合并。", true),
      utteranceAction("acceptance", "再看验收清单", "怎么验收当前产品"),
      utteranceAction("change", "我还想改", "我想改一下：")
    ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: "我理解你已经满意，准备交付。这个动作会发送成果并合入主线，需要确认。",
        screen: "准备交付\n确认后会发送成果、独立审查，并在审查通过后合并。",
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "delivery-confirmation" }
    ));
  }

  if (isRevisionRequest(utterance)) {
    const feedback = revisionFeedbackFromNaturalRequest(utterance);
    const actions = feedback
      ? [
          commandAction(
            "confirm-revision",
            "确认开始修改",
            `ccli revise ${JSON.stringify(feedback)}`,
            "会按这条验收反馈继续修改当前产品。",
            true
          ),
          utteranceAction("acceptance", "先看验收清单", "怎么验收当前产品"),
          utteranceAction("next", "下一步怎么办", "下一步怎么办")
        ]
      : [
          utteranceAction("example", "给一个修改例子", "我想改一下：首页太乱，重点不够明显"),
          utteranceAction("acceptance", "先看验收清单", "怎么验收当前产品")
        ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: feedback ? "asking" : "warning",
        say: feedback ? "已收到修改意见。确认后会继续修改当前产品。" : "请直接说想改哪里，例如首页太乱、按钮不明显。",
        screen: feedback ? `修改意见：${feedback}\n确认后会继续修改当前产品。` : "请直接说想改哪里。\n例如：我想改一下：首页太乱，重点不够明显。",
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "revision-request", feedback }
    ));
  }

  if (isAcceptanceRequest(utterance)) {
    const guide = await buildAcceptanceGuide(inputValue.cwd);
    const actions = [
      utteranceAction("change", "我想改一下", "我想改一下：", "继续提出修改要求"),
      commandAction("ship", "我满意，准备交付", "ccli finish --yes", "会发送成果、创建审查入口并在审查通过后合并", true),
      utteranceAction("next", "下一步怎么办", "下一步怎么办")
    ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: guide.summary,
        screen: renderAcceptanceGuide(guide),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "acceptance-guide", guide }
    ));
  }

  if (isHomeRequest(utterance)) {
    const home = await buildBossHome(inputValue.cwd);
    const actions = nextPlanActions({ summary: home.summary, actions: home.actions });
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: `${home.readiness} ${home.summary}`,
        screen: renderBossHome(home),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "boss-home", home }
    ));
  }

  if (isNextActionRequest(utterance)) {
    const plan = await buildNextActionPlan(inputValue.cwd);
    const actions = nextPlanActions(plan);
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: plan.summary,
        screen: renderNextActions(plan),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "next-action", plan }
    ));
  }

  if (isIdeaCatalogRequest(utterance) || ideaKeyFromNaturalRequest(utterance)) {
    const ideas = starterIdeas();
    const selectedKey = ideaKeyFromNaturalRequest(utterance);
    const selected = selectedKey ? resolveStarterIdea(selectedKey, ideas) : undefined;
    const say = selected
      ? `已选中${selected.title}。如果确认，可以让我开始生成这个产品。`
      : "我给你列出几个常见产品场景，你可以直接说做第几个模板。";
    const actions = selected
      ? [
          utteranceAction("confirm-idea", "开始生成这个产品", selected.say, selected.outcome, true),
          utteranceAction("change-idea", "换一个模板", "给我几个产品模板"),
          utteranceAction("next", "下一步怎么办", "下一步怎么办")
        ]
      : ideas.map((idea, index) =>
          utteranceAction(`idea-${idea.id}`, `做第 ${index + 1} 个模板`, `做第 ${index + 1} 个模板`, idea.title, true)
        );
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say,
        screen: selected ? `${selected.title}\n${selected.outcome}\n直接说：${selected.say}` : renderStarterIdeas(ideas),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "idea-catalog", ideas, selected }
    ));
  }

  if (isProjectListRequest(utterance)) {
    const projects = await readProjectRegistry();
    const screen = projects.length
      ? projects.map((project, index) => `${index + 1}. ${project.name}`).join("\n")
      : "还没有保存过产品。";
    const actions = projects.length
      ? [
          utteranceAction("open-latest", "打开我上次做的系统", "打开我上次做的系统"),
          utteranceAction("next", "下一步怎么办", "下一步怎么办")
        ]
      : [utteranceAction("ideas", "给我几个产品模板", "给我几个产品模板")];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: projects.length ? "calm" : "asking",
        say: projects.length ? `已找到 ${projects.length} 个产品。` : "还没有产品，可以先从模板开工。",
        screen,
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "project-catalog", projects: projects.map((project, index) => projectSummary(project, index)) }
    ));
  }

  if (isCurrentPreviewRequest(utterance) || isCurrentPreviewCheckRequest(utterance)) {
    const workspace = await resolveProductWorkspace(inputValue.cwd);
    const targetCwd = workspace?.cwd ?? inputValue.cwd;
    const readiness = await previewReadiness(targetCwd);
    const canOpen = readiness.canPreview && readiness.hasDependencies;
    const actions = readiness.canPreview
      ? [
          commandAction("preview-current", "打开当前产品页面", readiness.hasDependencies ? "ccli preview" : "ccli preview --install", readiness.message, true),
          utteranceAction("next", "下一步怎么办", "下一步怎么办")
        ]
      : [
          utteranceAction("ideas", "给我几个产品模板", "给我几个产品模板"),
          utteranceAction("next", "下一步怎么办", "下一步怎么办")
        ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: readiness.canPreview ? "asking" : "warning",
        say: canOpen ? "当前产品可以打开。如果确认，可以启动本地预览。" : readiness.message,
        screen: canOpen ? `当前产品可以打开。\n${workspace?.usedLatest ? `已接上最近产品：${productWorkspaceName(workspace)}。\n` : ""}确认后会启动本地预览。` : readiness.message,
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "preview-current", readiness }
    ));
  }

  if (isProjectOpenRequest(utterance)) {
    const projects = await readProjectRegistry();
    const latest = projects[0];
    const actions = latest
      ? [
          commandAction("open-latest", "打开最近产品", "ccli open", latest.name, true),
          utteranceAction("project-list", "查看我的产品", "查看我的产品"),
          utteranceAction("next", "下一步怎么办", "下一步怎么办")
        ]
      : [utteranceAction("ideas", "给我几个产品模板", "给我几个产品模板")];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: latest ? "asking" : "warning",
        say: latest ? `最近的产品是${latest.name}。如果确认，可以打开它。` : "还没有可以打开的产品。",
        screen: latest ? `${latest.name}\n确认后会打开最近产品。` : "还没有产品，可以先说给我几个产品模板。",
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "open-project", latest: latest ? projectSummary(latest, 0) : undefined }
    ));
  }

  if (isDoctorRequest(utterance)) {
    const report = healthSummary(await checkHealth(inputValue.cwd));
    const actions = [
      utteranceAction("home", "回到开箱首页", "打开开箱首页"),
      utteranceAction("next", "下一步怎么办", "下一步怎么办")
    ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: report.items.some((item) => item.status === "action-needed") ? "warning" : "success",
        say: report.summary,
        screen: renderHealthReport(report),
        choices: choicesFromActions(actions),
        actions
      }),
      { kind: "health-check", report }
    ));
  }

  if (isProductCreationRequest(utterance)) {
    const shouldCreate = await shouldCreateProductFromNaturalRequest(inputValue.cwd, utterance);
    if (!shouldCreate) {
      const workspace = await resolveCurrentProductWorkspace(inputValue.cwd);
      const productName = workspace ? productWorkspaceName(workspace) : "当前产品";
      const command = `ccli do ${shellQuote(utterance)}`;
      const actions = [
        commandAction("update-current-product", "修改当前产品", command, `会在「${productName}」里按这句话继续改。`, true),
        utteranceAction("new-product", "新开一个产品", `新建一个${projectNameFromIdea(utterance)}`),
        utteranceAction("next", "下一步怎么办", "下一步怎么办")
      ];
      return finalize(createHardwareResponse(
        createExperienceEvent({
          surface: "hardware",
          tone: "asking",
          say: `我理解这是要继续修改${productName}。如果确认，可以按这句话改当前产品。`,
          screen: `${productName}\n需求：${utterance}\n确认后会修改当前产品，不会新建项目。`,
          choices: choicesFromActions(actions),
          actions
        }),
        {
          kind: "update-current-product",
          requirement: utterance,
          productName,
          command
        }
      ));
    }

    const name = projectNameFromIdea(utterance);
    const command = `ccli go ${shellQuote(utterance)}`;
    const actions = [
      commandAction("confirm-create-product", "确认生成首版产品", command, `将创建「${name}」并开始生成首版。`, true),
      utteranceAction("ideas", "换一个模板", "给我几个产品模板"),
      utteranceAction("next", "下一步怎么办", "下一步怎么办")
    ];
    return finalize(createHardwareResponse(
      createExperienceEvent({
        surface: "hardware",
        tone: "asking",
        say: `我理解你想做${name}。如果确认，可以开始生成首版产品。`,
        screen: `${name}\n目标：${utterance}\n确认后会创建项目、生成首版并准备预览。`,
        choices: choicesFromActions(actions),
        actions
      }),
      {
        kind: "create-product",
        idea: utterance,
        name,
        command
      }
    ));
  }

  const actions = [
    utteranceAction("next", "下一步怎么办", "下一步怎么办"),
    utteranceAction("ideas", "给我几个产品模板", "给我几个产品模板"),
    utteranceAction("projects", "查看我的产品", "查看我的产品")
  ];
  return finalize(createHardwareResponse(
    createExperienceEvent({
      surface: "hardware",
      tone: "asking",
      say: "我还不能确定你的意思。你可以说下一步怎么办，或者给我几个产品模板。",
      screen: "可用说法：\n下一步怎么办\n给我几个产品模板\n查看我的产品\n打开我上次做的系统",
      choices: choicesFromActions(actions),
      actions
    }),
    { kind: "fallback", utterance }
  ));
}

async function runNaturalLanguageIntent(inputValue: {
  request: string;
  cwd: string;
  expert: boolean;
  yes: boolean;
  renderer: ProductRenderer;
}): Promise<boolean> {
  const request = inputValue.request.trim();
  if (isCancelRequest(request)) {
    print(inputValue.renderer.render({ type: "info", message: "已停止这次口令，没有开始新的开发任务。" }));
    print(controlCancelledScreen());
    return true;
  }

  if (isHelpRequest(request)) {
    print(inputValue.renderer.render({ type: "info", message: "你只需要说清楚想要的结果，ccli 会把开发、验证和交付接住。" }));
    print(renderBossHome(await buildBossHome(inputValue.cwd)));
    return true;
  }

  if (isSetupStartRequest(request)) {
    await runSetupWizard({ cwd: inputValue.cwd, renderer: inputValue.renderer });
    return true;
  }

  if (isWizardRequest(request)) {
    if (!input.isTTY) {
      print(inputValue.renderer.render({ type: "info", message: "当前环境不能逐步提问，已先生成需求追问卡。要进入问答式开工，请在终端运行：ccli wizard。" }));
      print(renderBossQuestionCard(await buildBossQuestionCard(inputValue.cwd, wizardIdeaFromNaturalRequest(request))));
      return true;
    }
    await runBossWizard({
      cwd: inputValue.cwd,
      renderer: inputValue.renderer,
      expert: inputValue.expert,
      yes: inputValue.yes,
      idea: wizardIdeaFromNaturalRequest(request),
      launch: true,
      preview: true,
      previewAutoInstall: true,
      previewOpenBrowser: true,
      previewHost: "127.0.0.1",
      previewPort: 5173,
      withPr: false
    });
    return true;
  }

  if (isAnswerRequest(request)) {
    const answer = answerTextFromNaturalRequest(request);
    if (!answer) {
      print(inputValue.renderer.render({ type: "info", message: "请直接说回答，例如：我的回答是：销售每天用；第一眼看待跟进客户；首版能新增客户并提醒。" }));
      return true;
    }
    const result = await buildOrSaveBossBriefFromAnswers(inputValue.cwd, answer);
    print(inputValue.renderer.render({ type: "done", message: "老板回答已整理成业务简报，后续开发和验收会围绕它推进。", severity: "success" }));
    print(renderBossBrief(result.brief));
    return true;
  }

  if (isQuestionRequest(request)) {
    print(renderBossQuestionCard(await buildBossQuestionCard(inputValue.cwd, questionGoalFromNaturalRequest(request))));
    return true;
  }

  if (isSetupGuideRequest(request)) {
    print(renderSetupGuide(await buildSetupGuide(inputValue.cwd)));
    return true;
  }

  if (isResumeRequest(request)) {
    print(renderResumeGuide(await buildResumeGuide(inputValue.cwd)));
    return true;
  }

  if (isReportRequest(request)) {
    print(renderBossReportCard(await buildBossReportCard(inputValue.cwd)));
    return true;
  }

  if (isBriefLaunchRequest(request)) {
    await launchFromBossBrief({
      cwd: inputValue.cwd,
      renderer: inputValue.renderer,
      expert: inputValue.expert,
      yes: inputValue.yes,
      preview: true,
      previewAutoInstall: true,
      previewOpenBrowser: true,
      previewHost: "127.0.0.1",
      previewPort: 5173,
      withPr: false
    });
    return true;
  }

  if (isBriefRequest(request)) {
    const result = await buildOrSaveBossBrief(inputValue.cwd, briefGoalFromNaturalRequest(request));
    if (!result.brief) {
      print(inputValue.renderer.render({ type: "info", message: "还没有业务简报。可以直接说：整理业务简报：后面加你的产品目标。" }));
      return true;
    }
    if (result.saved) {
      print(inputValue.renderer.render({ type: "done", message: "业务简报已保存，后续开发和验收会围绕它推进。", severity: "success" }));
    }
    print(renderBossBrief(result.brief));
    return true;
  }

  if (isApprovalRequest(request)) {
    const receipt = await recordBossApproval(inputValue.cwd, approvalNoteFromNaturalRequest(request));
    print(inputValue.renderer.render({ type: "done", message: "老板验收通过已记录，后续交付会带上这份凭证。", severity: "success" }));
    print(renderBossApprovalReceipt(receipt));
    return true;
  }

  if (isTryDemoRequest(request)) {
    await runTryDemo({
      renderer: inputValue.renderer,
      expert: inputValue.expert,
      preview: true,
      previewOpenBrowser: true,
      previewHost: "127.0.0.1",
      previewPort: 5173
    });
    return true;
  }

  if (isUndoRequest(request)) {
    await runUndoFlow({
      cwd: inputValue.cwd,
      renderer: inputValue.renderer,
      yes: inputValue.yes,
      useLatestProduct: true
    });
    return true;
  }

  if (isProjectListRequest(request)) {
    await renderKnownProjects({ renderer: inputValue.renderer, expert: inputValue.expert, json: false });
    return true;
  }

  if (isCurrentPreviewCheckRequest(request)) {
    await checkCurrentPreview({ cwd: inputValue.cwd, renderer: inputValue.renderer });
    return true;
  }

  if (isCurrentPreviewRequest(request)) {
    await openCurrentPreview({ cwd: inputValue.cwd, renderer: inputValue.renderer, yes: inputValue.yes });
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

  if (isDoctorRequest(request)) {
    const report = healthSummary(await checkHealth(inputValue.cwd));
    print(renderHealthReport(report, inputValue.expert));
    return true;
  }

  if (isSatisfiedDeliveryRequest(request)) {
    await runDeliveryFlow({
      cwd: inputValue.cwd,
      renderer: inputValue.renderer,
      yes: inputValue.yes,
      merge: true,
      useLatestProduct: true,
      title: "老板验收通过",
      body: "老板已确认当前效果满意，ccli 自动执行审查、交付和合并。"
    });
    return true;
  }

  if (isRevisionRequest(request)) {
    await handleRevisionRequest({
      cwd: inputValue.cwd,
      renderer: inputValue.renderer,
      expert: inputValue.expert,
      yes: inputValue.yes,
      feedback: revisionFeedbackFromNaturalRequest(request)
    });
    return true;
  }

  if (isAcceptanceRequest(request)) {
    print(renderAcceptanceGuide(await buildAcceptanceGuide(inputValue.cwd)));
    return true;
  }

  if (isHomeRequest(request)) {
    print(renderBossHome(await buildBossHome(inputValue.cwd)));
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

  if (isHarnessInitRequest(request)) {
    await initializeHarnessForProject({ cwd: inputValue.cwd, renderer: inputValue.renderer, expert: inputValue.expert, overwrite: false });
    return true;
  }

  if (isHarnessRoadmapRequest(request)) {
    const context = await loadHarnessContext(inputValue.cwd);
    const progress = await readHarnessProgress(inputValue.cwd);
    print(renderHarnessRoadmap(analyzeHarnessRoadmap(context, progress)));
    return true;
  }

  if (isHarnessPlaybookRequest(request)) {
    const context = await loadHarnessContext(inputValue.cwd);
    const progress = await readHarnessProgress(inputValue.cwd);
    print(renderHarnessPlaybook(analyzeHarnessPlaybook(context, progress)));
    return true;
  }

  if (isHarnessMethodRequest(request)) {
    print(renderHarnessMethod());
    return true;
  }

  if (isHarnessStatusRequest(request)) {
    const context = await loadHarnessContext(inputValue.cwd);
    const progress = await readHarnessProgress(inputValue.cwd);
    print(renderHarnessSummary(context));
    print(renderHarnessProfile(context));
    print(renderHarnessReadiness(analyzeHarnessReadiness(context, progress)));
    return true;
  }

  if (isSkillInstallRequest(request)) {
    await installSkillsForProject({ cwd: inputValue.cwd, renderer: inputValue.renderer, expert: inputValue.expert, overwrite: false });
    return true;
  }

  if (isLessonMemoryRequest(request)) {
    await rememberUserLesson({ cwd: inputValue.cwd, renderer: inputValue.renderer, expert: inputValue.expert, lesson: lessonFromNaturalRequest(request) });
    return true;
  }

  if (await shouldCreateProductFromNaturalRequest(inputValue.cwd, request)) {
    const preview = input.isTTY;
    print(inputValue.renderer.render({ type: "info", message: preview ? "已识别为新产品目标，开始一键生成并打开预览。" : "已识别为新产品目标，开始一键生成首版。" }));
    await createProductFromIdea({
      cwd: inputValue.cwd,
      idea: request,
      install: false,
      preview,
      previewAutoInstall: true,
      previewOpenBrowser: preview,
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

async function buildBossHome(cwd: string) {
  const [healthItems, nextPlan] = await Promise.all([checkHealth(cwd), buildNextActionPlan(cwd)]);
  const health: HealthReport = healthSummary(healthItems);
  return createBossHome({
    health,
    nextPlan,
    ideas: starterIdeas()
  });
}

async function buildBossReportCard(cwd: string): Promise<BossReportCard> {
  const [projects, workspace] = await Promise.all([readProjectRegistry(), resolveProductWorkspace(cwd)]);
  const targetCwd = workspace?.cwd ?? cwd;
  const [progress, state, readiness, audit, nextPlan, brief, approval] = await Promise.all([
    readHarnessProgress(targetCwd).catch(() => undefined),
    readState(targetCwd).catch(() => undefined),
    previewReadiness(targetCwd).catch(() => undefined),
    readLatestAuditSummary(targetCwd).catch(() => ({ entries: [] })),
    buildNextActionPlan(targetCwd).catch(() => ({ summary: "先看当前结果，再决定下一步。", actions: [] })),
    readBossBrief(targetCwd).catch(() => undefined),
    readBossApproval(targetCwd).catch(() => undefined)
  ]);
  const current = workspace?.project ?? projectForCwd(projects, targetCwd);
  const latest = workspace?.usedLatest ? workspace.project : undefined;
  const project = current ?? latest ?? projects[0];
  const hasProduct = Boolean(current || latest || readiness?.canPreview || progress || state);
  return createBossReportCard({
    productName: brief?.productName ?? current?.name ?? latest?.name ?? (readiness?.canPreview ? productWorkspaceName({ cwd: targetCwd, project, usedLatest: false }) : project?.name),
    goal: brief?.goal ?? current?.idea ?? latest?.idea ?? project?.idea,
    progress,
    state,
    canPreview: Boolean(readiness?.canPreview),
    nextActions: hasProduct ? reportCardActions(nextPlan.actions, Boolean(readiness?.canPreview), hasProduct) : undefined,
    auditSummary: audit.entries.length ? "最近处理过程已保存，可追溯。" : undefined,
    approvalSummary: approval ? `老板已在 ${formatShortDate(approval.approvedAt)} 记录验收通过。` : undefined
  });
}

async function buildBossQuestionCard(cwd: string, goal?: string): Promise<BossQuestionCard> {
  const workspace = await resolveProductWorkspace(cwd);
  const targetCwd = workspace?.cwd ?? cwd;
  const brief = await readBossBrief(targetCwd).catch(() => undefined);
  const normalizedGoal = goal?.trim();
  return createBossQuestionCard({
    goal: normalizedGoal || brief?.goal || workspace?.project?.idea,
    productName: brief?.productName ?? workspace?.project?.name ?? (normalizedGoal ? projectNameFromIdea(normalizedGoal) : undefined),
    brief
  });
}

async function recordBossApproval(cwd: string, note?: string): Promise<BossApprovalReceipt> {
  const workspace = await resolveProductWorkspace(cwd);
  const targetCwd = workspace?.cwd ?? cwd;
  const guide = await buildAcceptanceGuide(targetCwd);
  const receipt = createBossApprovalReceipt({
    productName: guide.productName,
    goal: guide.goal,
    checks: guide.checks,
    note,
    approvedAt: new Date().toISOString()
  });
  await writeBossApproval(targetCwd, receipt);
  return receipt;
}

async function readBossApprovalForCurrentProduct(cwd: string): Promise<BossApprovalReceipt | undefined> {
  const workspace = await resolveProductWorkspace(cwd);
  const targetCwd = workspace?.cwd ?? cwd;
  return readBossApproval(targetCwd);
}

interface BossBriefResult {
  brief?: BossBrief;
  saved: boolean;
  workspace?: ProductWorkspace;
  usedLatest: boolean;
  targetCwd: string;
}

interface BossAnswerResult {
  brief: BossBrief;
  answers: BossClarificationAnswers;
  saved: boolean;
  workspace?: ProductWorkspace;
  usedLatest: boolean;
  targetCwd: string;
}

interface ParsedBossAnswers extends BossClarificationAnswers {
  goal?: string;
  productName?: string;
}

interface BriefLaunchOptions {
  cwd: string;
  renderer: ProductRenderer;
  expert: boolean;
  yes: boolean;
  name?: string;
  preview: boolean;
  previewAutoInstall: boolean;
  previewOpenBrowser: boolean;
  previewHost: string;
  previewPort: number;
  withPr: boolean;
}

interface BossWizardOptions {
  cwd: string;
  renderer: ProductRenderer;
  expert: boolean;
  yes: boolean;
  idea?: string;
  launch: boolean;
  preview: boolean;
  previewAutoInstall: boolean;
  previewOpenBrowser: boolean;
  previewHost: string;
  previewPort: number;
  withPr: boolean;
}

async function buildOrSaveBossBrief(cwd: string, goal?: string): Promise<BossBriefResult> {
  const workspace = await resolveProductWorkspace(cwd);
  const targetCwd = workspace?.cwd ?? cwd;
  const normalizedGoal = goal?.trim();
  if (normalizedGoal) {
    const brief = createBossBrief({
      goal: normalizedGoal,
      productName: workspace?.project?.name ?? projectNameFromIdea(normalizedGoal),
      updatedAt: new Date().toISOString()
    });
    await writeBossBrief(targetCwd, brief);
    return { brief, saved: true, workspace, usedLatest: Boolean(workspace?.usedLatest), targetCwd };
  }

  const existing = await readBossBrief(targetCwd);
  if (existing) {
    return { brief: existing, saved: false, workspace, usedLatest: Boolean(workspace?.usedLatest), targetCwd };
  }

  if (workspace?.project?.idea) {
    return {
      brief: createBossBrief({
        goal: workspace.project.idea,
        productName: workspace.project.name,
        updatedAt: workspace.project.updatedAt
      }),
      saved: false,
      workspace,
      usedLatest: Boolean(workspace.usedLatest),
      targetCwd
    };
  }

  return { saved: false, workspace, usedLatest: Boolean(workspace?.usedLatest), targetCwd };
}

async function buildOrSaveBossBriefFromAnswers(cwd: string, answerText: string): Promise<BossAnswerResult> {
  const workspace = await resolveProductWorkspace(cwd);
  const targetCwd = workspace?.cwd ?? cwd;
  const existing = await readBossBrief(targetCwd).catch(() => undefined);
  const parsed = parseBossAnswerText(answerText);
  const goal = parsed.goal ?? existing?.goal ?? workspace?.project?.idea ?? goalFromAnswers(parsed);
  const productName = parsed.productName ?? existing?.productName ?? workspace?.project?.name ?? projectNameFromIdea(goal);
  const brief = createBossBriefFromAnswers({
    goal,
    productName,
    answers: parsed,
    updatedAt: new Date().toISOString()
  });
  await writeBossBrief(targetCwd, brief);
  return {
    brief,
    answers: parsed,
    saved: true,
    workspace,
    usedLatest: Boolean(workspace?.usedLatest),
    targetCwd
  };
}

async function runBossWizard(inputValue: BossWizardOptions): Promise<void> {
  const existing = await buildOrSaveBossBrief(inputValue.cwd).catch(() => undefined);
  if (existing?.usedLatest && existing.workspace) {
    print(inputValue.renderer.render({ type: "info", message: `已接上最近产品：${productWorkspaceName(existing.workspace)}。` }));
  }

  print(inputValue.renderer.render({ type: "info", message: "老板开工向导会问 4 个业务问题，然后生成一份可直接开工的业务简报。" }));
  const scriptedAnswers = input.isTTY ? [] : await readWizardScriptedAnswers();
  const rl = input.isTTY ? createInterface({ input, output }) : undefined;
  try {
    const existingBrief = existing?.brief;
    const goal = cleanWizardAnswer(inputValue.idea) ?? (await askWizardText(rl, scriptedAnswers, "你想做什么产品？", existingBrief?.goal));
    if (!goal) {
      print(inputValue.renderer.render({ type: "risk", message: "还不知道要做什么产品。可以重新运行开工向导，再用一句话描述目标。", severity: "warning" }));
      return;
    }

    const audience = await askWizardText(rl, scriptedAnswers, "谁每天会用？", existingBrief?.audience ?? "老板和一线同事");
    const firstScreen = await askWizardText(rl, scriptedAnswers, "打开后第一眼最想看到什么？", firstScreenDefault(existingBrief));
    const passCondition = await askWizardText(rl, scriptedAnswers, "什么情况算首版通过？", passConditionDefault(existingBrief));
    const result = await buildOrSaveBossBriefFromAnswers(
      inputValue.cwd,
      wizardAnswerText({ goal, audience, firstScreen, passCondition })
    );

    print(inputValue.renderer.render({ type: "done", message: "开工信息已整理成业务简报。", severity: "success" }));
    print(renderBossBrief(result.brief));

    if (!inputValue.launch) {
      print(inputValue.renderer.render({ type: "info", message: "业务简报已保存。要开工时直接说：按简报生成首版。" }));
      return;
    }

    const shouldLaunch = inputValue.yes || (await askWizardYes(rl, scriptedAnswers, "现在直接生成首版吗？"));
    if (!shouldLaunch) {
      print(inputValue.renderer.render({ type: "info", message: "业务简报已保存。确认后再说：按简报生成首版。" }));
      return;
    }

    await launchFromBossBrief({
      cwd: inputValue.cwd,
      renderer: inputValue.renderer,
      expert: inputValue.expert,
      yes: inputValue.yes,
      preview: inputValue.preview,
      previewAutoInstall: inputValue.previewAutoInstall,
      previewOpenBrowser: inputValue.previewOpenBrowser,
      previewHost: inputValue.previewHost,
      previewPort: inputValue.previewPort,
      withPr: inputValue.withPr
    });
  } finally {
    rl?.close();
  }
}

async function askWizardText(
  rl: ReturnType<typeof createInterface> | undefined,
  scriptedAnswers: string[],
  question: string,
  fallback?: string
): Promise<string> {
  if (scriptedAnswers.length) {
    return cleanWizardAnswer(scriptedAnswers.shift()) ?? cleanWizardAnswer(fallback) ?? "";
  }
  if (!rl) {
    return cleanWizardAnswer(fallback) ?? "";
  }
  const suffix = fallback ? `（直接回车用：${fallback}）` : "";
  const answer = await rl.question(`${question}${suffix} `).catch(() => "");
  return cleanWizardAnswer(answer) ?? cleanWizardAnswer(fallback) ?? "";
}

async function askWizardYes(
  rl: ReturnType<typeof createInterface> | undefined,
  scriptedAnswers: string[],
  question: string
): Promise<boolean> {
  if (scriptedAnswers.length) {
    return scriptedAnswers.shift()?.trim().toLowerCase() === "yes";
  }
  if (!rl) {
    return false;
  }
  const answer = await rl.question(`${question} 输入 yes 继续，直接回车只保存：`).catch(() => "");
  return answer.trim().toLowerCase() === "yes";
}

async function readWizardScriptedAnswers(): Promise<string[]> {
  let content = "";
  for await (const chunk of input) {
    content += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  }
  return content.split(/\r?\n/).map((line) => line.trim());
}

function wizardAnswerText(inputValue: {
  goal: string;
  audience: string;
  firstScreen: string;
  passCondition: string;
}): string {
  return [
    `目标：${inputValue.goal}`,
    `使用者：${inputValue.audience}`,
    `第一眼最想看到：${inputValue.firstScreen}`,
    `首版通过条件：${inputValue.passCondition}`
  ].join("；");
}

function cleanWizardAnswer(value?: string): string | undefined {
  const cleaned = value?.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned : undefined;
}

function firstScreenDefault(brief?: BossBrief): string {
  return (
    brief?.mustHaves.find((item) => /首屏|第一眼|打开后/.test(item))?.replace(/^首屏优先呈现[：:]/, "").replace(/。$/, "") ??
    brief?.acceptance.find((item) => /第一眼|打开后/.test(item))?.replace(/^打开后第一眼能看到[：:]/, "").replace(/。$/, "") ??
    "最重要的业务状态和下一步动作"
  );
}

function passConditionDefault(brief?: BossBrief): string {
  return (
    brief?.acceptance.find((item) => /首版通过条件|验收标准/.test(item))?.replace(/^首版通过条件[：:]/, "").replace(/。$/, "") ??
    "老板打开后能判断是否满意，并知道下一步怎么处理"
  );
}

async function launchFromBossBrief(inputValue: BriefLaunchOptions): Promise<string | undefined> {
  const workspace = await resolveProductWorkspace(inputValue.cwd);
  const targetCwd = workspace?.cwd ?? inputValue.cwd;
  const brief = await readBossBrief(targetCwd).catch(() => undefined);
  if (!brief) {
    print(inputValue.renderer.render({ type: "risk", message: "还没有业务简报。可以先说：帮我澄清需求，或者整理业务简报。", severity: "warning" }));
    return undefined;
  }

  const readiness = await previewReadiness(targetCwd).catch(() => undefined);
  const canContinueExisting = Boolean(readiness?.canPreview);
  if (workspace?.usedLatest) {
    print(inputValue.renderer.render({ type: "info", message: `已接上最近产品：${productWorkspaceName(workspace)}。` }));
  }

  if (canContinueExisting) {
    print(inputValue.renderer.render({ type: "plan", message: "开始按业务简报推进当前产品。" }));
    await runRequirement({
      cwd: targetCwd,
      expert: inputValue.expert,
      yes: inputValue.yes,
      requirement: brief.goal,
      withPr: inputValue.withPr
    });
    if (workspace?.project) {
      await touchProjectRegistry(workspace.project.id);
    }
    print(inputValue.renderer.render({ type: "done", message: "已按业务简报处理当前产品。", severity: "success" }));
    if (inputValue.preview) {
      await ensureDependenciesForPreview({
        cwd: targetCwd,
        renderer: inputValue.renderer,
        yes: inputValue.previewAutoInstall ? true : inputValue.yes
      });
      await startPreviewServer({
        cwd: targetCwd,
        renderer: inputValue.renderer,
        host: inputValue.previewHost,
        port: inputValue.previewPort,
        openBrowser: inputValue.previewOpenBrowser
      });
    }
    return targetCwd;
  }

  print(inputValue.renderer.render({ type: "info", message: "开始按业务简报创建首版产品。" }));
  return createProductFromIdea({
    cwd: targetCwd,
    idea: brief.goal,
    name: inputValue.name ?? brief.productName,
    brief,
    install: false,
    preview: inputValue.preview,
    previewAutoInstall: inputValue.previewAutoInstall,
    previewOpenBrowser: inputValue.previewOpenBrowser,
    previewHost: inputValue.previewHost,
    previewPort: inputValue.previewPort,
    withPr: inputValue.withPr,
    expert: inputValue.expert,
    yes: inputValue.yes,
    renderer: inputValue.renderer
  });
}

async function readBossBrief(cwd: string): Promise<BossBrief | undefined> {
  try {
    return JSON.parse(await readFile(bossBriefPath(cwd), "utf8")) as BossBrief;
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function writeBossBrief(cwd: string, brief: BossBrief): Promise<void> {
  const path = bossBriefPath(cwd);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(brief, null, 2)}\n`, "utf8");
  await chmod(path, 0o600).catch(() => undefined);
}

function bossBriefPath(cwd: string): string {
  return resolve(cwd, ".ccli", "brief.json");
}

async function readBossApproval(cwd: string): Promise<BossApprovalReceipt | undefined> {
  try {
    return JSON.parse(await readFile(bossApprovalPath(cwd), "utf8")) as BossApprovalReceipt;
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function writeBossApproval(cwd: string, receipt: BossApprovalReceipt): Promise<void> {
  const path = bossApprovalPath(cwd);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await chmod(path, 0o600).catch(() => undefined);
}

function bossApprovalPath(cwd: string): string {
  return resolve(cwd, ".ccli", "approval.json");
}

function reportCardActions(baseActions: NextAction[], canPreview: boolean, hasProduct: boolean): NextAction[] {
  if (!hasProduct) {
    return baseActions;
  }
  const bossActions: NextAction[] = [];
  if (canPreview) {
    bossActions.push({
      id: "preview-current",
      title: "打开当前产品",
      reason: "先看真实页面，最容易判断是否满意。",
      say: "打开当前产品页面"
    });
  }
  bossActions.push(
    {
      id: "accept-current",
      title: "按清单验收",
      reason: "用老板能看懂的标准判断是否满意。",
      say: "怎么验收当前产品"
    },
    {
      id: "revise-current",
      title: "继续修改",
      reason: "不满意可以直接说具体要改哪里。",
      say: "我想改一下：首页重点不够明显"
    },
    {
      id: "undo-current",
      title: "撤回上次成果",
      reason: "如果最近一次改动方向错了，可以撤回最近保存的成果。",
      say: "撤回上次改动"
    },
    {
      id: "finish-current",
      title: "准备交付",
      reason: "如果已经满意，可以进入审查和交付。",
      say: "我满意，准备交付"
    },
    {
      id: "next",
      title: "让系统给下一步",
      reason: "如果还没判断好，先让 ccli 根据当前状态推荐。",
      say: "下一步怎么办"
    }
  );
  return uniqueNextActions([...bossActions, ...baseActions]).slice(0, 5);
}

async function buildSetupGuide(cwd: string) {
  return createSetupGuide(healthSummary(await checkHealth(cwd)));
}

async function buildResumeGuide(cwd: string): Promise<ResumeGuide> {
  const [progress, state, readiness] = await Promise.all([
    readHarnessProgress(cwd).catch(() => undefined),
    readState(cwd).catch(() => undefined),
    previewReadiness(cwd).catch(() => undefined)
  ]);
  return createResumeGuide({
    progress,
    state,
    canPreview: Boolean(readiness?.canPreview)
  });
}

async function runSetupWizard(inputValue: {
  cwd: string;
  renderer: ProductRenderer;
  provider?: string;
  apiKey?: string;
  skipModel?: boolean;
  project?: string;
}): Promise<void> {
  print(inputValue.renderer.render({ type: "info", message: "开始首次设置。只需要完成模型授权，就可以进入更完整的自动开发。" }));
  const rl = createInterface({ input, output });
  let healthCwd = inputValue.cwd;
  try {
    const provider = inputValue.skipModel ? undefined : await resolveSetupProvider(inputValue.provider, rl);
    const apiKey = provider ? await resolveSetupApiKey(provider, inputValue.apiKey, rl) : undefined;
    if (provider && apiKey) {
      await saveModelSetup(provider, apiKey);
      print(inputValue.renderer.render({ type: "done", message: "模型授权已保存。后续项目会自动继承这次设置。", severity: "success" }));
    } else {
      print(inputValue.renderer.render({ type: "risk", message: "已暂时跳过模型授权。现在仍可创建项目、记录需求和走本地流程。", severity: "warning" }));
    }

    const projectName = inputValue.project ?? (input.isTTY ? (await rl.question("要不要顺手创建第一个项目？输入项目名，直接回车跳过：")).trim() : "");
    if (projectName) {
      const target = resolve(inputValue.cwd, projectName);
      await createBossProject({
        name: projectName,
        target,
        install: false,
        yes: true,
        task: `首次设置创建项目 ${projectName}`
      });
      healthCwd = target;
      print(inputValue.renderer.render({ type: "done", message: "第一个项目已创建。进入这个项目后，直接用中文描述想要的结果。", severity: "success" }));
    }

    print(renderHealthReport(healthSummary(await checkHealth(healthCwd))));
  } finally {
    rl.close();
  }
}

async function buildAcceptanceGuide(cwd: string) {
  const [projects, workspace] = await Promise.all([readProjectRegistry(), resolveProductWorkspace(cwd)]);
  const targetCwd = workspace?.cwd ?? cwd;
  const [readiness, brief] = await Promise.all([
    previewReadiness(targetCwd).catch(() => undefined),
    readBossBrief(targetCwd).catch(() => undefined)
  ]);
  const current = workspace?.project ?? projectForCwd(projects, targetCwd);
  const project = current ?? projects[0];
  return createAcceptanceGuide({
    productName: brief?.productName ?? current?.name ?? (readiness?.canPreview ? "当前产品" : project?.name),
    goal: brief?.goal ?? current?.idea ?? project?.idea,
    firstCheck: brief?.acceptance[0],
    canPreview: readiness?.canPreview
  });
}

async function buildNextActionPlan(cwd: string): Promise<NextActionPlan> {
  const [projects, state, readiness, brief] = await Promise.all([
    readProjectRegistry(),
    readState(cwd).catch(() => undefined),
    previewReadiness(cwd).catch(() => undefined),
    readBossBrief(cwd).catch(() => undefined)
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

  if (brief && !readiness?.canPreview) {
    actions.push({
      id: "launch-from-brief",
      title: "按简报生成首版",
      reason: "业务目标和验收标准已经准备好，可以直接开工。",
      say: "按简报生成首版",
      command: "ccli launch"
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
      id: "accept-current",
      title: "按清单验收",
      reason: "打开页面后，用老板能看懂的清单判断是否满意，不需要懂代码。",
      say: "怎么验收当前产品",
      command: "ccli accept"
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
  if (!projects.length && !hasCurrentProduct) {
    actions.push({
      id: "boss-wizard",
      title: "先问清楚业务目标",
      reason: "用几句中文把目标用户、首屏重点和验收标准固定下来，后面开发更稳。",
      say: "一步步问我，然后开工",
      command: "ccli wizard"
    });
    actions.push({
      id: "harness-init",
      title: "补齐驾驭支架",
      reason: "先放好项目规则、权限护栏、验证反馈和进度记忆，避免长任务跑偏。",
      say: "补齐驾驭系统",
      command: "ccli harness --init"
    });
    actions.push({
      id: "try-demo",
      title: "先安全试用一遍",
      reason: "不用模型授权，也不改当前目录，先看到一套演示产品是否能跑起来。",
      say: "试用一下",
      command: "ccli try"
    });
  }

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
  const summary = nextActionSummary({ state, canPreview: Boolean(readiness?.canPreview), projectCount: projects.length, hasBrief: Boolean(brief) });
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

function nextActionSummary(inputValue: { state?: CcliState; canPreview: boolean; projectCount: number; hasBrief: boolean }): string {
  if (inputValue.state?.status === "failed") {
    return "建议先处理上一次任务的问题，再继续开发。";
  }
  if (inputValue.canPreview) {
    return "建议先打开当前产品看效果，再决定要改哪里。";
  }
  if (inputValue.hasBrief) {
    return "业务简报已经准备好，建议直接按简报生成首版。";
  }
  if (inputValue.projectCount > 0) {
    return "你已经有产品记录，建议先打开最近产品继续。";
  }
  return "当前还没有产品，建议先用开工向导问清楚业务目标，再决定生成首版或安全试用。";
}

async function runTryDemo(inputValue: {
  renderer: ProductRenderer;
  expert: boolean;
  name?: string;
  preview: boolean;
  previewOpenBrowser: boolean;
  previewHost: string;
  previewPort: number;
}): Promise<void> {
  const demoRoot = resolve(homedir(), ".ccli", "tryouts");
  const name = inputValue.name?.trim() || defaultTryDemoName();
  const idea = "做一个客户管理系统，能记录跟进、提醒回访、老板能看高意向客户";
  await mkdir(demoRoot, { recursive: true });
  print(inputValue.renderer.render({ type: "info", message: "开始安全试用。演示产品会放在本机试用区，不会改当前项目。" }));
  const target = await createProductFromIdea({
    cwd: demoRoot,
    idea,
    name,
    install: false,
    preview: inputValue.preview,
    previewAutoInstall: true,
    previewOpenBrowser: inputValue.previewOpenBrowser,
    previewHost: inputValue.previewHost,
    previewPort: inputValue.previewPort,
    withPr: false,
    expert: inputValue.expert,
    yes: true,
    renderer: inputValue.renderer
  });
  print(
    inputValue.renderer.render({
      type: "done",
      message: "安全试用产品已生成。后续可以说“打开我上次做的系统”继续查看，也可以直接说自己的真实业务目标。",
      severity: "success"
    })
  );
  if (inputValue.expert) {
    print(`试用项目位置：${target}`);
  }
}

function defaultTryDemoName(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const suffix = Math.random().toString(36).slice(2, 5);
  return `ccli试用客户跟进-${stamp}-${suffix}`;
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

async function initializeHarnessForProject(inputValue: { cwd: string; renderer: ProductRenderer; expert: boolean; overwrite: boolean }): Promise<void> {
  const result = await installHarnessScaffold({
    root: inputValue.cwd,
    overwrite: inputValue.overwrite,
    projectName: projectNameFromCwd(inputValue.cwd)
  });
  if (result.written.length) {
    print(inputValue.renderer.render({ type: "done", message: `已搭好 ${result.written.length} 个驾驭支架文件。`, severity: "success" }));
  } else {
    print(inputValue.renderer.render({ type: "info", message: "当前项目已经具备完整驾驭支架。" }));
  }

  const context = await loadHarnessContext(inputValue.cwd);
  const progress = await readHarnessProgress(inputValue.cwd);
  print(renderHarnessSummary(context));
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

async function rememberUserLesson(inputValue: {
  cwd: string;
  renderer: ProductRenderer;
  expert: boolean;
  lesson: string;
  impact?: string;
  prevention?: string;
}): Promise<void> {
  const lesson = inputValue.lesson.trim();
  if (!lesson) {
    print(inputValue.renderer.render({ type: "risk", message: "请直接说希望以后记住或避免什么。", severity: "warning" }));
    return;
  }

  const result = await recordHarnessLesson(inputValue.cwd, {
    symptom: lesson,
    impact: inputValue.impact ?? "这会影响用户对结果的判断。",
    prevention: inputValue.prevention ?? `以后遇到类似情况，先按这条经验检查：${lesson}`,
    source: "用户明确沉淀的经验"
  });
  print(inputValue.renderer.render({ type: result.written ? "done" : "info", message: result.message, severity: result.written ? "success" : "info" }));
  if (inputValue.expert) {
    print(`经验库：${result.path}`);
  }
}

async function handleRevisionRequest(inputValue: {
  cwd: string;
  renderer: ProductRenderer;
  expert: boolean;
  yes: boolean;
  feedback: string;
}): Promise<void> {
  const feedback = inputValue.feedback.trim();
  if (!feedback) {
    print(
      inputValue.renderer.render({
        type: "info",
        message: "请直接说想改哪里。例如：我想改一下：首页太乱，重点不够明显。"
      })
    );
    return;
  }

  const workspace = await resolveProductWorkspace(inputValue.cwd);
  if (!workspace) {
    print(inputValue.renderer.render({ type: "risk", message: "还没有找到可修改的产品。可以先说“试用一下”或“给我几个产品模板”。", severity: "warning" }));
    return;
  }
  print(inputValue.renderer.render({ type: "info", message: "已收到验收修改意见，开始继续修改当前产品。" }));
  if (workspace.usedLatest) {
    print(inputValue.renderer.render({ type: "info", message: `已接上最近产品：${productWorkspaceName(workspace)}。` }));
  }
  await runRequirement({
    cwd: workspace.cwd,
    expert: inputValue.expert,
    yes: inputValue.yes,
    requirement: `根据老板验收反馈继续修改当前产品：${feedback}`
  });
  print(renderAcceptanceGuide(await buildAcceptanceGuide(workspace.cwd)));
}

async function runDeliveryFlow(inputValue: {
  cwd: string;
  renderer: ProductRenderer;
  yes: boolean;
  title?: string;
  body?: string;
  merge?: boolean;
  method?: string;
  useLatestProduct?: boolean;
}): Promise<void> {
  const workspace = inputValue.useLatestProduct ? await resolveProductWorkspace(inputValue.cwd) : undefined;
  if (inputValue.useLatestProduct && !workspace) {
    print(inputValue.renderer.render({ type: "risk", message: "还没有找到可交付的产品。可以先说“试用一下”或“给我几个产品模板”。", severity: "warning" }));
    return;
  }
  const cwd = workspace?.cwd ?? inputValue.cwd;
  if (workspace?.usedLatest) {
    print(inputValue.renderer.render({ type: "info", message: `已接上最近产品：${productWorkspaceName(workspace)}。` }));
  }

  const confirmed = inputValue.yes || (await confirmChinese("这会发送当前成果并准备团队审查入口。是否继续？"));
  if (!confirmed) {
    print(inputValue.renderer.render({ type: "risk", message: "已取消交付动作。", severity: "warning" }));
    return;
  }

  let approval = await readBossApproval(cwd).catch(() => undefined);
  if (!approval) {
    approval = await recordBossApproval(cwd, "老板确认当前效果满意，进入交付。");
    print(inputValue.renderer.render({ type: "done", message: "已记录老板验收通过凭证。", severity: "success" }));
  }

  const config = await loadCcliConfig(cwd);
  const registry = createDefaultProviderRegistry(config);
  const audit = await AuditSession.create({ cwd, task: "自动交付" });
  const harness = await loadHarnessContext(cwd);
  const git = new GitTool();
  const github = new GitHubTool();

  print(inputValue.renderer.progress("save", "正在发送当前成果。"));
  await git.pushCurrent({ cwd, audit, confirmed: true, harness });

  print(inputValue.renderer.progress("review", "正在进行独立审查。"));
  const review = await new ReviewerAgent().review({
    cwd,
    audit,
    reviewer: registry.forRole("reviewer", config)
  });

  const title = inputValue.title ?? "ccli 自动交付";
  const body = appendApprovalToPrBody(inputValue.body ?? "本次交付由 ccli 创建，详细技术记录保存在本地审计日志。", approval);
  const pr = await github.createOrFindDraftPr(
    { cwd, audit, confirmed: true, harness },
    {
      title,
      body,
      draft: !inputValue.merge,
      confirmed: true
    }
  );
  print(inputValue.renderer.render({ type: "pr", message: pr.message, severity: pr.url ? "success" : "warning" }));
  if (pr.url) {
    print(pr.url);
  }

  if (pr.number) {
    const comment = await github.postReviewSummary({ cwd, audit, confirmed: true, harness }, pr.number, reviewComment(title, review));
    print(inputValue.renderer.render({ type: comment.posted ? "done" : "risk", message: comment.message, severity: comment.posted ? "success" : "warning" }));
  }

  if (!inputValue.merge) {
    print(inputValue.renderer.render({ type: "done", message: "团队审查入口已准备好，等待人工确认合并。", severity: "success" }));
    return;
  }

  if (!review.passed) {
    print(inputValue.renderer.render({ type: "risk", message: "独立审查发现风险，已停止自动合并。", severity: "warning" }));
    return;
  }

  if (!pr.number) {
    print(inputValue.renderer.render({ type: "risk", message: "没有可合并的团队审查入口，已停止自动合并。", severity: "warning" }));
    return;
  }

  if (pr.draft) {
    const ready = await github.markReadyForReview({ cwd, audit, confirmed: true, harness }, pr.number);
    print(inputValue.renderer.render({ type: ready.posted ? "done" : "risk", message: ready.message, severity: ready.posted ? "success" : "warning" }));
    if (!ready.posted) {
      return;
    }
  }

  const mergeConfirmed = inputValue.yes || (await confirmChinese("独立审查已通过。现在会把成果合入主线。是否继续？"));
  if (!mergeConfirmed) {
    print(inputValue.renderer.render({ type: "risk", message: "已取消自动合并。", severity: "warning" }));
    return;
  }

  const merge = await github.mergePr(
    { cwd, audit, confirmed: true, harness },
    {
      number: pr.number,
      method: parseMergeMethod(inputValue.method),
      commitTitle: title,
      commitMessage: body,
      confirmed: true
    }
  );
  print(inputValue.renderer.render({ type: merge.merged ? "done" : "risk", message: merge.message, severity: merge.merged ? "success" : "warning" }));
}

function appendApprovalToPrBody(body: string, approval?: BossApprovalReceipt): string {
  if (!approval) {
    return body;
  }
  const lines = [
    body.trim(),
    "",
    "## 老板验收凭证",
    "",
    approval.summary,
    approval.goal ? `目标：${approval.goal}` : undefined,
    `通过时间：${formatShortDate(approval.approvedAt)}`,
    approval.note ? `备注：${approval.note}` : undefined,
    "",
    "验收依据：",
    ...approval.proof.slice(0, 5).map((item) => `- ${item}`)
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

async function runUndoFlow(inputValue: {
  cwd: string;
  renderer: ProductRenderer;
  yes: boolean;
  useLatestProduct?: boolean;
}): Promise<void> {
  const workspace = inputValue.useLatestProduct ? await resolveProductWorkspace(inputValue.cwd) : undefined;
  if (inputValue.useLatestProduct && !workspace) {
    print(inputValue.renderer.render({ type: "risk", message: "还没有找到可撤回的产品。可以先说“试用一下”或“给我几个产品模板”。", severity: "warning" }));
    return;
  }
  const cwd = workspace?.cwd ?? inputValue.cwd;
  if (workspace?.usedLatest) {
    print(inputValue.renderer.render({ type: "info", message: `已接上最近产品：${productWorkspaceName(workspace)}。` }));
  }

  const audit = await AuditSession.create({ cwd, task: "撤回上次成果" });
  const git = new GitTool();
  const last = await git.lastCommit(cwd);
  if (!last) {
    print(inputValue.renderer.render({ type: "info", message: "还没有可以撤回的已保存成果。" }));
    return;
  }

  const confirmed =
    inputValue.yes ||
    (await confirmChinese("这会撤回上次保存的成果，并生成一条新的保存记录。是否继续？"));
  if (!confirmed) {
    print(inputValue.renderer.render({ type: "risk", message: "已取消撤回动作。", severity: "warning" }));
    return;
  }

  print(inputValue.renderer.progress("save", "正在撤回上次成果。"));
  const result = await git.revertLastCommit({ cwd, audit, confirmed: true });
  print(inputValue.renderer.render({ type: result.reverted ? "done" : "info", message: result.message, severity: result.reverted ? "success" : "info" }));
  if (result.reverted) {
    print(renderAcceptanceGuide(await buildAcceptanceGuide(cwd)));
  }
}

async function renderKnownProjects(inputValue: { renderer: ProductRenderer; expert: boolean; json: boolean }): Promise<void> {
  const projects = await readProjectRegistry();
  if (inputValue.json) {
    printPublicJson(projects.map((project, index) => projectSummary(project, index)));
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

async function checkCurrentPreview(inputValue: { cwd: string; renderer: ProductRenderer }): Promise<void> {
  const workspace = await resolveProductWorkspace(inputValue.cwd);
  const targetCwd = workspace?.cwd ?? inputValue.cwd;
  if (workspace?.usedLatest) {
    print(inputValue.renderer.render({ type: "info", message: `已接上最近产品：${productWorkspaceName(workspace)}。` }));
  }
  const readiness = await previewReadiness(targetCwd);
  if (!readiness.canPreview) {
    print(inputValue.renderer.render({ type: "risk", message: readiness.message, severity: "warning" }));
    return;
  }
  const message = readiness.hasDependencies
    ? "当前产品已经可以打开。"
    : "当前产品有本地预览入口，但还需要准备运行内容。直接说“打开当前产品页面”即可继续。";
  print(inputValue.renderer.render({ type: readiness.hasDependencies ? "done" : "info", message, severity: readiness.hasDependencies ? "success" : "info" }));
}

async function openCurrentPreview(inputValue: { cwd: string; renderer: ProductRenderer; yes: boolean }): Promise<void> {
  const workspace = await resolveProductWorkspace(inputValue.cwd);
  const targetCwd = workspace?.cwd ?? inputValue.cwd;
  if (workspace?.usedLatest) {
    print(inputValue.renderer.render({ type: "info", message: `已接上最近产品：${productWorkspaceName(workspace)}。` }));
  }
  const readiness = await previewReadiness(targetCwd);
  if (!readiness.canPreview) {
    print(inputValue.renderer.render({ type: "risk", message: readiness.message, severity: "warning" }));
    return;
  }
  if (!readiness.hasDependencies) {
    await ensureDependenciesForPreview({ cwd: targetCwd, renderer: inputValue.renderer, yes: inputValue.yes });
  }
  await startPreviewServer({
    cwd: targetCwd,
    renderer: inputValue.renderer,
    host: "127.0.0.1",
    port: 5173,
    openBrowser: true
  });
}

function isProjectListRequest(request: string): boolean {
  return (
    /(?:查看|看看|列出|显示).*(?:我的)?(?:产品|项目|应用|系统|列表)/.test(request) ||
    /管理我的(?:产品|项目|应用|系统)/.test(request) ||
    /我的(?:产品|项目|应用|系统)/.test(request)
  );
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

function isCurrentPreviewCheckRequest(request: string): boolean {
  if (/(?:上次|最近|之前)/.test(request)) {
    return false;
  }
  return /(?:检查|确认|看看|测试).*(?:当前|这个|本地).*(?:产品|项目|页面|系统).*(?:能不能|能否|是否|可以)?.*(?:打开|启动|预览)/.test(request) ||
    /(?:当前|这个|本地).*(?:产品|项目|页面|系统).*(?:能不能|能否|是否|可以)?.*(?:打开|启动|预览)/.test(request);
}

function isCurrentPreviewRequest(request: string): boolean {
  if (/(?:上次|最近|之前)/.test(request)) {
    return false;
  }
  return /(?:打开|启动|预览|看看).*(?:当前|这个|本地).*(?:产品|项目|页面|系统)/.test(request) ||
    /(?:打开|启动|预览|看看).*(?:页面|效果)/.test(request) ||
    /(?:当前|这个|本地).*(?:产品|项目|页面|系统).*(?:打开|启动|预览|看看)/.test(request);
}

function isDoctorRequest(request: string): boolean {
  return /(?:检查|诊断|体检|看看).*(?:电脑|环境|配置|准备好|能不能用|能否使用|是否可用)/.test(request) ||
    /(?:电脑|环境|配置).*(?:检查|诊断|体检|准备好|能不能用|能否使用|是否可用)/.test(request);
}

function isCancelRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "");
  return (
    /^(?:取消|停一下|暂停|停止|算了|先不做了|不做了|别做了|不用了|退出|结束|返回)$/.test(normalized) ||
    /^(?:先)?(?:取消|停止|暂停)(?:这次|当前|刚才)?(?:任务|操作|口令|命令|动作|交付|合并|发布|修改|生成|开发)?$/.test(normalized) ||
    /^(?:别|不要)(?:继续|执行|开始|开发|生成|交付|合并|发布|修改)$/.test(normalized)
  );
}

function isHardwareConfirmRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  return /^(?:确认|确认执行|继续|继续执行|是的|对|对的|好的|好|可以|就这个|开始吧|执行吧|没问题|yes|ok)$/.test(normalized);
}

function isHelpRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  return /^(?:帮助|help|使用说明|新手帮助|我不会用|教我用|怎么操作|能做什么|可以做什么)$/.test(normalized);
}

function isSetupStartRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  return /^(?:开始首次设置|进入首次设置|运行首次设置|启动首次设置|开始设置|开始setup|setup)$/.test(normalized);
}

function isSetupGuideRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  return (
    /(?:开箱准备|准备向导|设置向导|准备好了吗|能开始了吗|还差什么|怎么设置|怎么配置|配置模型|模型授权|接入模型|接上模型)/.test(normalized) ||
    /^(?:ready|onboard)$/.test(normalized)
  );
}

function isWizardRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  return (
    /(?:老板开工向导|开工向导|业务开工向导|产品开工向导|老板向导|问答开工|问完开工|问我然后开工|一步步问我|一步步带我开工|带我开工)/.test(normalized) ||
    /^(?:wizard|coach|guide)$/.test(normalized)
  );
}

function isResumeRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  return (
    /(?:继续上次任务|继续刚才任务|恢复上次任务|恢复刚才任务|接着上次|接着刚才|继续上次|继续刚才|恢复现场|接回现场|上次做到哪|刚才做到哪|上次进度|刚才进度)/.test(normalized) ||
    /^(?:resume|continue)$/.test(normalized)
  );
}

function isReportRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  return (
    /(?:汇报|报告|总结|进度卡|交付卡|老板汇报|交付说明|当前结果|成果摘要|现在做到哪|现在进展|做到哪了|做得怎么样|目前情况|当前情况)/.test(normalized) ||
    /^(?:report|summary|card)$/.test(normalized)
  );
}

function isAnswerRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  return (
    /(?:我的回答|回答是|答案是|回答追问|回答需求|整理我的回答|沉淀我的回答|使用者是|用户是|谁每天用|第一眼看|首版通过|首版能|验收标准是)/.test(normalized) ||
    /^(?:answers|answer|intake)$/.test(normalized)
  );
}

function isBriefLaunchRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  return (
    /(?:按|根据|用)?(?:业务简报|需求简报|产品简报|老板简报|简报|回答|这些回答|上面回答).*(?:开始|开工|生成首版|做首版|生成产品|创建产品|开做)/.test(normalized) ||
    /(?:开始|开工|生成首版|做首版|生成产品|创建产品|开做).*(?:业务简报|需求简报|产品简报|老板简报|简报|回答|这些回答|上面回答)/.test(normalized) ||
    /^(?:开始做|开始开工|开始生成首版|生成首版|按回答生成首版|按简报开工|按简报生成首版|launch|work|frombrief)$/.test(normalized)
  );
}

function isQuestionRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  return (
    /(?:追问|问我几个问题|澄清需求|需求澄清|需求还差什么|这个需求清楚吗|需求清楚吗|还需要问什么|把需求问清楚|需求问清楚|想法还差什么|产品还差什么)/.test(normalized) ||
    /^(?:questions|question|clarify|ask)$/.test(normalized)
  );
}

function isBriefRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  return (
    /(?:业务简报|需求简报|产品简报|老板简报|需求契约|业务契约|产品契约|整理需求|整理想法|梳理需求|梳理想法|验收标准是什么|首版要做什么)/.test(normalized) ||
    /^(?:brief|spec|contract)$/.test(normalized)
  );
}

function isApprovalRequest(request: string): boolean {
  const normalized = request.replace(/[，。！？!?,.\s]/g, "").toLowerCase();
  if (/(?:交付|发布|合并|上线|提交|ship|finish|merge|deploy)/.test(normalized)) {
    return false;
  }
  return (
    /(?:记录|保存|生成|创建)?(?:老板)?(?:验收通过|确认通过|检查通过|效果通过|已经验收|已验收|看过了满意|看过满意|确认满意|可以通过|认可当前效果)/.test(normalized) ||
    /^(?:approve|approval|signoff|pass)$/.test(normalized)
  );
}

function approvalNoteFromNaturalRequest(request: string): string | undefined {
  const cleaned = request
    .replace(/^(?:请|帮我|麻烦)?/, "")
    .replace(/^(?:记录|保存|生成|创建)?(?:老板)?(?:验收通过|确认通过|检查通过|效果通过|已经验收|已验收|确认满意|可以通过|认可当前效果)[：:\s]*/g, "")
    .replace(/^(?:我|老板)?(?:看过了|看过)(?:，|,)?(?:满意|可以|通过)?[：:\s]*/g, "")
    .trim();
  if (!cleaned || cleaned === request.trim()) {
    return undefined;
  }
  return cleaned;
}

function briefGoalFromNaturalRequest(request: string): string | undefined {
  if (!isBriefRequest(request)) {
    return undefined;
  }
  const cleaned = request
    .replace(/^(?:请|帮我|麻烦|给我)?/, "")
    .replace(/^(?:整理|生成|创建|写|做|梳理)(?:一份|一个|一下)?(?:老板|业务|需求|产品)?(?:简报|契约|说明|brief|spec|contract)?[：:\s]*/i, "")
    .replace(/^(?:把|将)?(?:我的)?(?:需求|想法|产品目标|业务目标)(?:整理|梳理|变成|写成)(?:成)?(?:一份|一个)?(?:老板|业务|需求|产品)?(?:简报|契约|说明)?[：:\s]*/i, "")
    .replace(/^(?:业务|需求|产品)?(?:简报|契约|说明|brief|spec|contract)[：:\s]*/i, "")
    .trim();
  if (!cleaned || cleaned === request.trim() || /^(?:看一下|查看|显示|打开|是什么|呢|吗|吧)?$/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function questionGoalFromNaturalRequest(request: string): string | undefined {
  if (!isQuestionRequest(request)) {
    return undefined;
  }
  const afterColon = request.split(/[：:]/).slice(1).join(":").trim();
  const cleaned = (afterColon || request)
    .replace(/^(?:请|帮我|麻烦|给我)?/, "")
    .replace(/^(?:追问我几个问题|问我几个问题|帮我澄清需求|澄清需求|需求澄清|需求还差什么|这个需求清楚吗|需求清楚吗|还需要问什么|帮我把需求问清楚|把需求问清楚|需求问清楚|想法还差什么|产品还差什么|questions|question|clarify|ask)[：:\s]*/i, "")
    .replace(/^(?:关于|围绕)?(?:我的)?(?:需求|想法|产品|业务目标)[：:\s]*/i, "")
    .trim();
  if (!cleaned || cleaned === request.trim() || /^(?:看一下|查看|显示|打开|是什么|呢|吗|吧)?$/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function wizardIdeaFromNaturalRequest(request: string): string | undefined {
  if (!isWizardRequest(request)) {
    return undefined;
  }
  const afterColon = request.split(/[：:]/).slice(1).join(":").trim();
  const cleaned = (afterColon || request)
    .replace(/^(?:请|帮我|麻烦|给我)?/, "")
    .replace(/^(?:打开|进入|启动|运行|开始)?(?:老板开工向导|开工向导|业务开工向导|产品开工向导|老板向导|问答开工|问完开工|问我然后开工|一步步问我|一步步带我开工|带我开工|wizard|coach|guide)[：:\s]*/i, "")
    .replace(/^(?:关于|围绕)?(?:我的)?(?:需求|想法|产品|业务目标)[：:\s]*/i, "")
    .trim();
  if (!cleaned || cleaned === request.trim() || /^(?:看一下|查看|显示|打开|是什么|呢|吗|吧)?$/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function answerTextFromNaturalRequest(request: string): string | undefined {
  if (!isAnswerRequest(request)) {
    return undefined;
  }
  const cleaned = request
    .replace(/^(?:请|帮我|麻烦|给我)?/, "")
    .replace(/^(?:把|将)?(?:我的)?(?:回答|答案|追问回答|需求回答)(?:是)?(?:整理|沉淀|保存|变成|写成)?(?:为|成)?(?:业务简报|需求简报|简报)?[：:\s]*/i, "")
    .replace(/^(?:我的)?(?:回答|答案)(?:是)?[：:\s]*/i, "")
    .replace(/^(?:answers|answer|intake)[：:\s]*/i, "")
    .trim();
  if (!cleaned || cleaned === request.trim() && /^(?:answers|answer|intake)$/i.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function parseBossAnswerText(value: string): ParsedBossAnswers {
  const text = stripAnswerIntro(value);
  const clauses = splitAnswerClauses(text);
  const parsed: ParsedBossAnswers = {
    goal: extractAnswerPart(text, /(?:目标|需求|想法|要做|产品)[是为:：\s]*([^；;。\n]+?)(?=[；;。\n]|使用者|用户|谁每天|第一眼|首屏|打开后|首版|通过|验收|$)/),
    productName: extractAnswerPart(text, /(?:产品名|产品名称|系统名|名字|名称)[是为:：\s]*([^；;。\n]+?)(?=[；;。\n]|目标|需求|使用者|用户|谁每天|第一眼|首屏|打开后|首版|通过|验收|$)/),
    audience: extractAnswerPart(text, /(?:谁每天会用|谁每天用|每天用|使用者|用户|给谁用|谁用)[是为:：\s]*([^；;。\n]+?)(?=[；;。\n]|第一眼|首屏|打开后|首版|通过|验收|$)/),
    firstScreen: extractAnswerPart(text, /(?:第一眼最想看到|第一眼看到|第一眼看|第一眼|首屏看到|首屏看|打开后先看到|打开后第一眼)[是为:：\s]*([^；;。\n]+?)(?=[；;。\n]|首版|通过|验收|$)/),
    passCondition: extractAnswerPart(text, /(?:什么情况算首版通过|首版通过条件|首版算通过|首版通过|首版能|通过标准|验收标准|怎样算通过|怎么才算通过)[是为:：\s]*([^；;。\n]+)$/)
  };

  const unlabeled = clauses
    .filter((clause) => !/^(?:目标|需求|想法|要做|产品|产品名|产品名称|系统名|名字|名称)[是为:：\s]/.test(clause))
    .map(stripAnswerLabel)
    .filter((clause) => clause.length >= 2);
  parsed.audience ??= unlabeled[0];
  parsed.firstScreen ??= unlabeled[1];
  parsed.passCondition ??= unlabeled[2];
  parsed.goal = cleanAnswerPart(parsed.goal);
  parsed.productName = cleanAnswerPart(parsed.productName);
  parsed.audience = cleanAudienceAnswer(parsed.audience);
  parsed.firstScreen = cleanAnswerPart(parsed.firstScreen);
  parsed.passCondition = cleanAnswerPart(parsed.passCondition);
  return parsed;
}

function splitAnswerClauses(value: string): string[] {
  return value
    .split(/[；;\n。]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function stripAnswerIntro(value: string): string {
  return value
    .replace(/^(?:请|帮我|麻烦|给我)?/, "")
    .replace(/^(?:把|将)?(?:我的)?(?:回答|答案|追问回答|需求回答)(?:是)?(?:整理|沉淀|保存|变成|写成)?(?:为|成)?(?:业务简报|需求简报|简报)?[：:\s]*/i, "")
    .replace(/^(?:我的)?(?:回答|答案)(?:是)?[：:\s]*/i, "")
    .trim();
}

function stripAnswerLabel(value: string): string {
  return value
    .replace(/^(?:目标|需求|想法|要做|产品|产品名|产品名称|系统名|名字|名称|谁每天会用|谁每天用|每天用|使用者|用户|给谁用|谁用|第一眼最想看到|第一眼看到|第一眼看|第一眼|首屏看到|首屏看|打开后先看到|打开后第一眼|什么情况算首版通过|首版通过条件|首版算通过|首版通过|首版能|通过标准|验收标准|怎样算通过|怎么才算通过)[是为:：\s]*/i, "")
    .trim();
}

function extractAnswerPart(value: string, pattern: RegExp): string | undefined {
  const matched = value.match(pattern)?.[1]?.trim();
  return matched || undefined;
}

function cleanAnswerPart(value?: string): string | undefined {
  return value?.replace(/^[是为:：\s]+/, "").replace(/[。；;]+$/g, "").trim() || undefined;
}

function cleanAudienceAnswer(value?: string): string | undefined {
  return cleanAnswerPart(value)
    ?.replace(/(?:会|每天|经常|主要)*用$/g, "")
    .trim() || undefined;
}

function goalFromAnswers(answers: BossClarificationAnswers): string {
  const firstScreen = answers.firstScreen ? `，第一眼看到${answers.firstScreen}` : "";
  const passCondition = answers.passCondition ? `，首版要做到${answers.passCondition}` : "";
  return `做一个业务产品${firstScreen}${passCondition}`;
}

function isAcceptanceRequest(request: string): boolean {
  return /(?:怎么|如何|怎样).*(?:验收|确认效果|看效果|判断好坏|交付前)/.test(request) ||
    /(?:验收|验收清单|确认效果|检查效果|通过标准|交付前).*(?:产品|项目|页面|系统|清单|看什么|怎么做)?/.test(request) ||
    /(?:当前|这个|本地).*(?:产品|项目|页面|系统).*(?:验收|确认效果|检查效果|通过标准)/.test(request);
}

function isSatisfiedDeliveryRequest(request: string): boolean {
  return /(?:我|老板)?(?:满意|通过|可以|确认|认可).*(?:交付|发布|合并|上线|提交)/.test(request) ||
    /(?:验收|检查|效果).*(?:通过|满意|可以).*(?:交付|发布|合并|上线|提交)?/.test(request) ||
    /(?:准备|开始|执行|自动).*(?:交付|发布|合并|上线)/.test(request);
}

function isRevisionRequest(request: string): boolean {
  return /(?:我想|我要|需要|帮我|继续|再).*(?:改一下|修改|调整|优化)/.test(request) ||
    /(?:不满意|不通过|不好用|看不懂|太乱|不清楚)/.test(request) ||
    /(?:把|将).*(?:改成|改得|调整成|优化成)/.test(request);
}

function revisionFeedbackFromNaturalRequest(request: string): string {
  return request
    .replace(/^(?:请|帮我|麻烦)?/, "")
    .replace(/^(?:我想|我要|需要|继续|再)?(?:改一下|修改|调整|优化)(?:当前|这个|本地)?(?:产品|项目|页面|系统)?[：:\s]*/g, "")
    .replace(/^(?:我想|我要|需要|继续|再)?(?:把|将)?(?:当前|这个|本地)?(?:产品|项目|页面|系统)?(?:改成|改得|调整成|优化成)?[：:\s]*/g, "")
    .replace(/^(?:不满意|不通过)[：:\s]*/g, "")
    .trim();
}

function isHomeRequest(request: string): boolean {
  return /(?:开箱|首页|主页|驾驶舱|工作台|新手|第一次用|刚开始|上手|怎么开始|如何开始|从哪开始|怎么用|如何用|入口)/.test(request) ||
    /(?:我要|我想|帮我).*(?:开始|上手|开工)/.test(request);
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

function isHarnessInitRequest(request: string): boolean {
  return /(?:初始化|补齐|搭建|启用|安装).*(?:驾驭系统|harness|智能体支架|开发支架|项目指南|项目规则)/i.test(request) ||
    /(?:驾驭系统|harness|智能体支架|开发支架).*(?:初始化|补齐|搭建|启用|安装)/i.test(request);
}

function isTryDemoRequest(request: string): boolean {
  return /^(?:我想|我要|帮我|给我|先)?\s*(?:安全)?(?:试用|体验|演示|demo|try)(?:一下|一遍|看看|流程|产品|系统|开箱)?\s*$/i.test(request) ||
    /(?:安全试用|开箱演示|演示产品|试用一下|体验一下|跑个演示|开个演示|先体验)/i.test(request) ||
    /(?:先|给我|帮我).*(?:开|做|跑|生成).*(?:演示|demo)/i.test(request) ||
    /(?:不用|不想).*(?:配置|授权|模型).*(?:先)?(?:体验|试用|看看)/i.test(request);
}

function isUndoRequest(request: string): boolean {
  return /(?:撤回|撤销|回退|还原|恢复).*(?:上次|刚才|刚刚|最近).*(?:成果|改动|修改|保存|版本)?/.test(request) ||
    /(?:上次|刚才|刚刚|最近).*(?:改错|不要|不想要|做错|效果不对)/.test(request) ||
    /^(?:undo|rollback|revert)$/i.test(request.trim());
}

function isHarnessMethodRequest(request: string): boolean {
  return /(?:怎么|如何|方法|原理|介绍|说明|使用).*(?:驾驭|harness|智能体支架|开发支架)/i.test(request) ||
    /(?:驾驭|harness|智能体支架|开发支架).*(?:怎么|如何|方法|原理|介绍|说明|使用)/i.test(request);
}

function isHarnessPlaybookRequest(request: string): boolean {
  return /(?:实操|落地|怎么用|如何用|今天|日常|剧本|步骤).*(?:驾驭|harness|智能体支架|开发支架)/i.test(request) ||
    /(?:驾驭|harness|智能体支架|开发支架).*(?:实操|落地|怎么用|如何用|今天|日常|剧本|步骤)/i.test(request);
}

function isHarnessRoadmapRequest(request: string): boolean {
  return /(?:路线图|14\s*步|十四步|路线|roadmap).*(?:驾驭|harness|智能体支架|开发支架)/i.test(request) ||
    /(?:驾驭|harness|智能体支架|开发支架).*(?:路线图|14\s*步|十四步|路线|roadmap)/i.test(request);
}

function isHarnessStatusRequest(request: string): boolean {
  return /(?:查看|检查|评估|体检|状态).*(?:驾驭系统|harness|智能体支架|开发支架)/i.test(request) ||
    /(?:驾驭系统|harness|智能体支架|开发支架).*(?:查看|检查|评估|体检|状态)/i.test(request);
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

function isLessonMemoryRequest(request: string): boolean {
  return /^(?:请|帮我|麻烦)?(?:记住|记一下|记下来|保存|沉淀).+/.test(request) ||
    /(?:记住|记一下|以后|下次|别再|不要再|避免).*(?:不要|别|避免|记住|这样|同样|再犯|踩坑|问题|错误|偏好)/.test(request) ||
    /(?:把|将).*(?:经验|教训|规则|偏好).*(?:记住|保存|沉淀|写入)/.test(request);
}

function lessonFromNaturalRequest(request: string): string {
  return request
    .replace(/^(?:请|帮我|麻烦)?(?:把|将)?/, "")
    .replace(/^[：:\s]+/, "")
    .replace(/(?:记住|记一下|保存|沉淀|写入)(?:这个|这条)?(?:经验|教训|规则|偏好)?/g, "")
    .replace(/^[：:\s]+/, "")
    .replace(/(?:以后|下次)(?:请|要)?/g, "以后")
    .trim() || request.trim();
}

function isProductCreationRequest(request: string): boolean {
  return /(?:一键)?(?:做一个|做个|创建一个|创建个|开发一个|开发个|生成一个|生成个|搭建一个|搭建个|新建一个|新建个|新开一个|新开个)/.test(request) &&
    /(?:系统|应用|产品|平台|网站|工具|看板|管理|预约|客户|订单|库存|页面|小程序|CRM|crm)/.test(request);
}

function isExplicitNewProductRequest(request: string): boolean {
  return (
    /(?:新建|新开|另起|从零|重新)(?:一个|个)?.*(?:系统|应用|产品|平台|网站|工具|看板|小程序|CRM|crm)/.test(request) ||
    /(?:做一个|做个|创建一个|创建个|开发一个|开发个|生成一个|生成个|搭建一个|搭建个|新建一个|新建个|新开一个|新开个).*(?:系统|应用|产品|平台|网站|工具|看板|小程序|CRM|crm)/.test(request)
  );
}

async function shouldCreateProductFromNaturalRequest(cwd: string, request: string): Promise<boolean> {
  if (!isProductCreationRequest(request)) {
    return false;
  }
  if (isExplicitNewProductRequest(request)) {
    return true;
  }
  return !(await resolveCurrentProductWorkspace(cwd));
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

interface ProductWorkspace {
  cwd: string;
  project?: KnownProject;
  usedLatest: boolean;
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
  brief?: BossBrief;
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
  await writeBossBrief(
    target,
    inputValue.brief
      ? {
          ...inputValue.brief,
          productName: name,
          updatedAt: new Date().toISOString()
        }
      : createBossBrief({
          goal: inputValue.idea,
          productName: name,
          updatedAt: new Date().toISOString()
        })
  );
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

function projectForCwd(projects: KnownProject[], cwd: string): KnownProject | undefined {
  const currentPath = resolve(cwd);
  return projects.find((project) => {
    const projectPath = resolve(project.path);
    return currentPath === projectPath || currentPath.startsWith(`${projectPath}/`);
  });
}

async function resolveProductWorkspace(cwd: string): Promise<ProductWorkspace | undefined> {
  const current = await resolveCurrentProductWorkspace(cwd);
  if (current) {
    return current;
  }

  const projects = await readProjectRegistry();
  const latest = projects.find((project) => existsSync(project.path));
  return latest ? { cwd: latest.path, project: latest, usedLatest: true } : undefined;
}

async function resolveCurrentProductWorkspace(cwd: string): Promise<ProductWorkspace | undefined> {
  const projects = await readProjectRegistry();
  const current = projectForCwd(projects, cwd);
  if (current) {
    return { cwd: current.path, project: current, usedLatest: false };
  }

  const readiness = await previewReadiness(cwd).catch(() => undefined);
  return readiness?.canPreview ? { cwd, usedLatest: false } : undefined;
}

function productWorkspaceName(workspace: ProductWorkspace): string {
  return workspace.project?.name ?? projectNameFromCwd(workspace.cwd);
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
  const harness = await loadHarnessContext(inputValue.target);
  await new GitTool().initStandalone({ cwd: inputValue.target, audit, confirmed: true, harness });

  if (inputValue.install) {
    const confirmed = inputValue.yes || (await confirmChinese("创建后需要安装依赖，会访问网络。是否继续？"));
    if (confirmed) {
      const { ShellTool } = await import("@ccli/tools");
      await new ShellTool().run("pnpm install", {
        cwd: inputValue.target,
        audit,
        kind: "install",
        confirmed: true,
        harness
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
    .replace(/^(帮我|请|我想|我要|想要|需要|做一个|做个|创建一个|创建个|开发一个|开发个|生成一个|生成个|搭建一个|搭建个|新建一个|新建个|新开一个|新开个|另起一个|另起个|从零做一个|从零做个|做|创建|开发|生成|搭建|新建|新开|另起)/, "")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff_-]+/gu, "")
    .slice(0, 18);
  return firstClause || `我的应用-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
}

function projectNameFromCwd(cwd: string): string {
  return basename(resolve(cwd)) || "当前项目";
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

import { describe, expect, it } from "vitest";
import {
  createAcceptanceGuide,
  createBossApprovalReceipt,
  createBossBrief,
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
  renderAcceptanceGuide,
  renderBossApprovalReceipt,
  renderBossBrief,
  renderBossHome,
  renderBossQuestionCard,
  renderBossReportCard,
  renderNextActions,
  renderResumeGuide,
  renderSetupGuide,
  renderStarterIdeas,
  renderWelcome,
  speechText,
  starterIdeas
} from "../src/index.js";

describe("experience", () => {
  it("renders boss-friendly welcome copy", () => {
    const text = renderWelcome();

    expect(text).toContain("中文开发管家");
    expect(text).toContain("ccli home");
    expect(text).toContain("ccli ready");
    expect(text).toContain("ccli setup");
    expect(text).toContain("ccli try");
    expect(text).toContain("ccli questions");
    expect(text).toContain("ccli brief");
    expect(text).toContain("ccli next");
    expect(text).toContain("ccli go");
    expect(text).toContain("ccli ideas");
    expect(text).toContain("ccli ideas 3");
    expect(text).toContain("ccli projects");
    expect(text).toContain("ccli open");
    expect(text).toContain("打开我上次做的系统");
    expect(text).toContain("ccli create");
    expect(text).toContain("ccli preview");
    expect(text).toContain("ccli chat");
    expect(text).toContain("下一步怎么办");
    expect(text).toContain("试用一下");
    expect(text).toContain("帮我澄清需求");
    expect(text).toContain("整理业务简报");
    expect(text).toContain("给我几个产品模板");
    expect(text).toContain("做第 3 个模板");
    expect(text).not.toContain("diff");
  });

  it("renders starter ideas for boss users", () => {
    const ideas = starterIdeas();
    const text = renderStarterIdeas(ideas);

    expect(ideas.length).toBeGreaterThanOrEqual(6);
    expect(text).toContain("客户跟进系统");
    expect(text).toContain("库存预警看板");
    expect(text).toContain("直接说");
    expect(text).toContain("先验收");
  });

  it("summarizes health checks in plain Chinese", () => {
    const report = healthSummary([
      { name: "运行环境", status: "ready", userMessage: "可以正常使用。" },
      { name: "模型", status: "action-needed", userMessage: "还需要配置。", fix: "运行 ccli config init" }
    ]);

    expect(report.summary).toContain("1 项");
  });

  it("renders a setup guide from health checks", () => {
    const guide = createSetupGuide(
      healthSummary([
        { name: "智能开发能力", status: "action-needed", userMessage: "还没有检测到模型授权。" },
        { name: "当前工作区", status: "optional", userMessage: "当前目录还不像一个项目。" },
        { name: "本地构建能力", status: "ready", userMessage: "可以安装依赖并验证项目。" },
        { name: "团队交付能力", status: "optional", userMessage: "暂时只能在本地工作。" }
      ])
    );
    const text = renderSetupGuide(guide);

    expect(guide.nextSay).toBe("开始首次设置");
    expect(guide.steps[0].primary).toBe(true);
    expect(text).toContain("开箱准备向导");
    expect(text).toContain("先处理：接上智能开发能力");
    expect(text).toContain("直接说：开始首次设置");
    expect(text).not.toContain("diff");
  });

  it("renders a resume guide for interrupted work", () => {
    const guide = createResumeGuide({
      progress: {
        task: "添加登录页面",
        currentStage: "validate",
        updatedAt: "2026-06-18T10:00:00.000Z",
        summary: "正在验证是否正常。",
        nextAction: "进入独立审查。",
        validation: "passed"
      },
      state: {
        status: "done",
        summary: "本次成果已保存。"
      },
      canPreview: true
    });
    const text = renderResumeGuide(guide);

    expect(guide.summary).toContain("可以先打开页面验收");
    expect(guide.actions.some((action) => action.id === "preview-current")).toBe(true);
    expect(text).toContain("继续上次任务");
    expect(text).toContain("添加登录页面");
    expect(text).toContain("直接说：打开当前产品页面");
    expect(text).not.toContain("stack");
  });

  it("renders next actions for guided usage", () => {
    const text = renderNextActions({
      summary: "建议先打开最近产品。",
      actions: [
        {
          id: "open",
          title: "打开最近产品",
          reason: "你已经创建过产品，可以先看看效果。",
          say: "打开我上次做的系统",
          command: "ccli open"
        }
      ]
    });

    expect(text).toContain("建议先打开最近产品");
    expect(text).toContain("直接说");
    expect(text).toContain("也可以执行");
  });

  it("renders a boss home without exposing commands", () => {
    const home = createBossHome({
      health: healthSummary([
        { name: "运行环境", status: "ready", userMessage: "可以正常使用。" },
        { name: "模型授权", status: "action-needed", userMessage: "还需要设置。" }
      ]),
      nextPlan: {
        summary: "当前还没有产品，建议先从一个常见场景直接开工。",
        actions: [
          {
            id: "ideas",
            title: "从模板直接开工",
            reason: "选一个常见场景最快能看到首版。",
            say: "给我几个产品模板",
            command: "ccli ideas"
          }
        ]
      },
      ideas: starterIdeas()
    });
    const text = renderBossHome(home);

    expect(text).toContain("老板开箱驾驶舱");
    expect(text).toContain("现在最建议做");
    expect(text).toContain("直接说");
    expect(text).toContain("常见开工模板");
    expect(text).not.toContain("ccli ideas");
    expect(home.primary.command).toBe("ccli ideas");
  });

  it("renders a boss brief as a non-technical contract", () => {
    const brief = createBossBrief({
      productName: "客户跟进系统",
      goal: "做一个客户管理系统，能记录跟进和提醒",
      updatedAt: "2026-06-18T10:00:00.000Z"
    });
    const text = renderBossBrief(brief);

    expect(text).toContain("老板业务简报");
    expect(text).toContain("客户跟进系统");
    expect(text).toContain("使用者");
    expect(text).toContain("首版必须做到");
    expect(text).toContain("验收标准");
    expect(text).toContain("直接说：做一个客户管理系统，能记录跟进和提醒");
    expect(brief.acceptance.some((item) => item.includes("高意向"))).toBe(true);
    expect(text).not.toContain("diff");
    expect(text).not.toContain("stack");
    expect(text).not.toContain("```");
  });

  it("renders a boss question card before writing a brief", () => {
    const card = createBossQuestionCard({
      productName: "客户跟进系统",
      goal: "做一个客户管理系统，能记录跟进和提醒"
    });
    const text = renderBossQuestionCard(card);

    expect(card.readyEnough).toBe(true);
    expect(card.questions).toHaveLength(3);
    expect(text).toContain("老板需求追问卡");
    expect(text).toContain("谁每天会用这个产品");
    expect(text).toContain("打开后第一眼最想看到什么");
    expect(text).toContain("什么情况算首版通过");
    expect(text).toContain("整理业务简报");
    expect(text).toContain("直接说：做一个客户管理系统，能记录跟进和提醒");
    expect(text).not.toContain("diff");
    expect(text).not.toContain("stack");
    expect(text).not.toContain("```");
  });

  it("renders a boss approval receipt for sign-off", () => {
    const receipt = createBossApprovalReceipt({
      productName: "客户跟进系统",
      goal: "记录客户、跟进和提醒",
      checks: createAcceptanceGuide({
        productName: "客户跟进系统",
        goal: "记录客户、跟进和提醒",
        canPreview: true
      }).checks,
      note: "首屏和提醒逻辑可以",
      approvedAt: "2026-06-18T10:00:00.000Z"
    });
    const text = renderBossApprovalReceipt(receipt);

    expect(text).toContain("老板验收凭证");
    expect(text).toContain("已记录为验收通过");
    expect(text).toContain("客户跟进系统");
    expect(text).toContain("验收依据");
    expect(text).toContain("直接说：我满意，准备交付");
    expect(text).not.toContain("diff");
    expect(text).not.toContain("stack");
    expect(text).not.toContain("```");
  });

  it("renders a boss report card for non-technical delivery status", () => {
    const card = createBossReportCard({
      productName: "客户跟进系统",
      goal: "记录客户、跟进和提醒",
      progress: {
        task: "生成首版客户跟进系统",
        currentStage: "review",
        updatedAt: "2026-06-18T10:00:00.000Z",
        summary: "首版页面已生成，可以先看是否一眼能懂。",
        validation: "passed"
      },
      state: {
        status: "done",
        summary: "本次成果已保存。"
      },
      canPreview: true
    });
    const text = renderBossReportCard(card);

    expect(card.status).toBe("ready");
    expect(text).toContain("老板交付卡");
    expect(text).toContain("客户跟进系统");
    expect(text).toContain("当前重点");
    expect(text).toContain("看得见的依据");
    expect(text).toContain("直接说：打开当前产品页面");
    expect(text).toContain("直接说：我满意，准备交付");
    expect(text).not.toContain("diff");
    expect(text).not.toContain("stack");
    expect(text).not.toContain("```");
  });

  it("renders an acceptance guide for non-technical review", () => {
    const guide = createAcceptanceGuide({
      productName: "库存看板",
      goal: "做一个库存看板，能看低库存、今日出库和生成补货提醒",
      canPreview: true
    });
    const text = renderAcceptanceGuide(guide);

    expect(text).toContain("库存看板");
    expect(text).toContain("按这几项看一遍");
    expect(text).toContain("第一眼是否看懂");
    expect(text).toContain("不满意直接说");
    expect(text).toContain("我满意，准备交付");
    expect(text).not.toContain("diff");
  });

  it("keeps a future hardware protocol explicit", () => {
    const event = createExperienceEvent({
      tone: "success",
      say: "已完成",
      surface: "voice",
      actions: [{ id: "next", label: "下一步", kind: "utterance", say: "下一步怎么办" }]
    });
    const response = createHardwareResponse(event, { ok: true });

    expect(speechText(event)).toBe("已完成");
    expect(response.protocol).toBe("ccli-experience-protocol");
    expect(response.event.say).toBe("已完成");
    expect(response.event.actions?.[0]?.label).toBe("下一步");
    expect(hardwareManifest().output).toContain("speech");
    expect(hardwareManifest().output).toContain("action-button");
    expect(hardwareManifest().output).toContain("boss-home");
    expect(hardwareManifest().output).toContain("setup-guide");
    expect(hardwareManifest().output).toContain("resume-guide");
    expect(hardwareManifest().output).toContain("action-confirmed");
    expect(hardwareManifest().output).toContain("confirmation-empty");
    expect(hardwareManifest().output).toContain("control-help");
    expect(hardwareManifest().output).toContain("control-cancelled");
    expect(hardwareManifest().output).toContain("question-card");
    expect(hardwareManifest().output).toContain("brief-card");
    expect(hardwareManifest().output).toContain("approval-receipt");
    expect(hardwareManifest().output).toContain("report-card");
    expect(hardwareManifest().output).toContain("acceptance-guide");
    expect(hardwareManifest().output).toContain("revision-request");
    expect(hardwareManifest().output).toContain("delivery-confirmation");
    expect(hardwareManifest().output).toContain("try-demo");
    expect(hardwareManifest().output).toContain("undo-confirmation");
    expect(hardwareManifest().output).toContain("project-catalog");
    expect(hardwareManifest().output).toContain("idea-catalog");
    expect(hardwareManifest().output).toContain("next-action");
  });

  it("exposes hardware schema and examples for device integration", () => {
    const schema = hardwareSchema();
    const examples = hardwareExamples();

    expect(schema.protocol).toBe("ccli-experience-protocol");
    expect(schema.kinds).toContain("boss-home");
    expect(schema.kinds).toContain("setup-guide");
    expect(schema.kinds).toContain("resume-guide");
    expect(schema.kinds).toContain("action-confirmed");
    expect(schema.kinds).toContain("confirmation-empty");
    expect(schema.kinds).toContain("control-help");
    expect(schema.kinds).toContain("control-cancelled");
    expect(schema.kinds).toContain("question-card");
    expect(schema.kinds).toContain("brief-card");
    expect(schema.kinds).toContain("approval-receipt");
    expect(schema.kinds).toContain("report-card");
    expect(schema.kinds).toContain("revision-request");
    expect(schema.kinds).toContain("delivery-confirmation");
    expect(schema.kinds).toContain("try-demo");
    expect(schema.kinds).toContain("undo-confirmation");
    expect(schema.response.event.actions[0].requiresConfirmation).toContain("必须确认");
    expect(examples.some((example) => example.data?.kind === "boss-home")).toBe(true);
    expect(examples.some((example) => example.data?.kind === "setup-guide")).toBe(true);
    expect(examples.some((example) => example.data?.kind === "resume-guide")).toBe(true);
    expect(examples.some((example) => example.data?.kind === "question-card")).toBe(true);
    expect(examples.some((example) => example.data?.kind === "brief-card")).toBe(true);
    expect(examples.some((example) => example.data?.kind === "approval-receipt")).toBe(true);
    expect(examples.some((example) => example.data?.kind === "report-card")).toBe(true);
    expect(examples.some((example) => example.data?.kind === "action-confirmed")).toBe(true);
    expect(examples.some((example) => example.data?.kind === "try-demo")).toBe(true);
    expect(examples.some((example) => example.data?.kind === "undo-confirmation")).toBe(true);
    expect(examples.some((example) => example.data?.kind === "control-cancelled")).toBe(true);
    expect(examples.some((example) => example.event.actions?.some((action) => action.requiresConfirmation))).toBe(true);
  });
});

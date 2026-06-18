import { describe, expect, it } from "vitest";
import {
  createBossHome,
  createExperienceEvent,
  createHardwareResponse,
  hardwareManifest,
  healthSummary,
  renderBossHome,
  renderNextActions,
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
    expect(text).toContain("ccli setup");
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
    expect(hardwareManifest().output).toContain("project-catalog");
    expect(hardwareManifest().output).toContain("idea-catalog");
    expect(hardwareManifest().output).toContain("next-action");
  });
});

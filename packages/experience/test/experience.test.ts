import { describe, expect, it } from "vitest";
import { createExperienceEvent, hardwareManifest, healthSummary, renderStarterIdeas, renderWelcome, speechText, starterIdeas } from "../src/index.js";

describe("experience", () => {
  it("renders boss-friendly welcome copy", () => {
    const text = renderWelcome();

    expect(text).toContain("中文开发管家");
    expect(text).toContain("ccli setup");
    expect(text).toContain("ccli go");
    expect(text).toContain("ccli ideas");
    expect(text).toContain("ccli ideas 3");
    expect(text).toContain("ccli projects");
    expect(text).toContain("ccli open");
    expect(text).toContain("打开我上次做的系统");
    expect(text).toContain("ccli create");
    expect(text).toContain("ccli preview");
    expect(text).toContain("ccli chat");
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

  it("keeps a future hardware protocol explicit", () => {
    const event = createExperienceEvent({ tone: "success", say: "已完成", surface: "voice" });

    expect(speechText(event)).toBe("已完成");
    expect(hardwareManifest().output).toContain("speech");
    expect(hardwareManifest().output).toContain("project-catalog");
    expect(hardwareManifest().output).toContain("idea-catalog");
  });
});

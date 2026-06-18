import { describe, expect, it } from "vitest";
import { createExperienceEvent, hardwareManifest, healthSummary, renderWelcome, speechText } from "../src/index.js";

describe("experience", () => {
  it("renders boss-friendly welcome copy", () => {
    const text = renderWelcome();

    expect(text).toContain("中文开发管家");
    expect(text).toContain("ccli setup");
    expect(text).toContain("ccli go");
    expect(text).toContain("ccli projects");
    expect(text).toContain("ccli open");
    expect(text).toContain("ccli create");
    expect(text).toContain("ccli preview");
    expect(text).toContain("ccli chat");
    expect(text).not.toContain("diff");
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
  });
});

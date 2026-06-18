import { describe, expect, it } from "vitest";
import { forcingQuestions, sprintPlanLabels, SPECIALISTS } from "../src/index.js";

describe("methodology", () => {
  it("provides gstack-inspired specialist workflow in Chinese", () => {
    expect(SPECIALISTS.map((role) => role.id)).toContain("ceo");
    expect(sprintPlanLabels()).toEqual(["确认真正目标", "整理实现方案", "实现功能", "独立审查", "验证结果", "保存并交付", "沉淀经验"]);
    expect(forcingQuestions("添加登录")).toHaveLength(6);
  });
});

export interface SpecialistRole {
  id: string;
  name: string;
  responsibility: string;
}

export interface SprintStep {
  id: string;
  label: string;
  userVisible: string;
  specialist: string;
}

export const SPECIALISTS: SpecialistRole[] = [
  {
    id: "ceo",
    name: "产品负责人",
    responsibility: "确认真正目标、压缩范围、避免做无效功能。"
  },
  {
    id: "designer",
    name: "设计负责人",
    responsibility: "维护视觉方向、交互清晰度和普通用户可理解性。"
  },
  {
    id: "eng-manager",
    name: "工程负责人",
    responsibility: "拆解实现路径、控制风险、保证改动可交付。"
  },
  {
    id: "qa",
    name: "质量负责人",
    responsibility: "检查验证结果、回归风险和用户可见问题。"
  },
  {
    id: "release-manager",
    name: "交付负责人",
    responsibility: "整理交付说明、保存成果、准备团队审查入口。"
  },
  {
    id: "doc-engineer",
    name: "文档负责人",
    responsibility: "把决策、约束和交付结果沉淀为中文记录。"
  }
];

export const SPRINT_STEPS: SprintStep[] = [
  { id: "think", label: "Think", userVisible: "确认真正目标", specialist: "ceo" },
  { id: "plan", label: "Plan", userVisible: "整理实现方案", specialist: "eng-manager" },
  { id: "build", label: "Build", userVisible: "实现功能", specialist: "eng-manager" },
  { id: "review", label: "Review", userVisible: "独立审查", specialist: "qa" },
  { id: "test", label: "Test", userVisible: "验证结果", specialist: "qa" },
  { id: "ship", label: "Ship", userVisible: "保存并交付", specialist: "release-manager" },
  { id: "reflect", label: "Reflect", userVisible: "沉淀经验", specialist: "doc-engineer" }
];

export function forcingQuestions(requirement: string): string[] {
  return [
    `这个需求真正想改善的用户结果是什么？${requirement ? "" : ""}`,
    "如果只能做一半，哪一半最有价值？",
    "有没有更简单的替代方案能达到同样效果？",
    "完成后普通用户如何判断它真的变好了？",
    "这次改动最可能破坏什么？",
    "哪些内容应该延后，避免范围失控？"
  ];
}

export function sprintPlanLabels(): string[] {
  return SPRINT_STEPS.map((step) => step.userVisible);
}

export function specialistPrompt(): string {
  return SPECIALISTS.map((role) => `${role.name}：${role.responsibility}`).join("\n");
}

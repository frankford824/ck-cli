import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface WebTemplateOptions {
  name: string;
  root: string;
}

export interface InstallSkillOptions {
  root: string;
  overwrite?: boolean;
}

export interface InstallHarnessScaffoldOptions extends InstallSkillOptions {
  projectName?: string;
}

export interface InstallSkillResult {
  written: string[];
  skipped: string[];
}

export async function createWebAppTemplate(options: WebTemplateOptions): Promise<string[]> {
  const files = webTemplateFiles(options.name);
  const written: string[] = [];

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(options.root, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
    written.push(relativePath);
  }

  return written;
}

export async function installHarnessSkills(options: InstallSkillOptions): Promise<InstallSkillResult> {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const [relativePath, content] of Object.entries(harnessSkillFiles())) {
    const absolutePath = join(options.root, relativePath);
    if (!options.overwrite && existsSync(absolutePath)) {
      skipped.push(relativePath);
      continue;
    }
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
    written.push(relativePath);
  }

  return { written, skipped };
}

export async function installHarnessScaffold(options: InstallHarnessScaffoldOptions): Promise<InstallSkillResult> {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const [relativePath, content] of Object.entries(harnessScaffoldFiles(options.projectName))) {
    const absolutePath = join(options.root, relativePath);
    if (!options.overwrite && existsSync(absolutePath)) {
      skipped.push(relativePath);
      continue;
    }
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
    written.push(relativePath);
  }

  return { written, skipped };
}

export function harnessSkillFiles(): Record<string, string> {
  return {
    ".ccli/skills/office-hours.md": `# 产品追问技能

用于开工前压缩范围、澄清目标和发现更简单方案。

固定追问：

1. 真正要改善的用户结果是什么？
2. 如果只能做一半，哪一半最有价值？
3. 有没有更简单的替代方案？
4. 完成后用户如何判断它变好了？
5. 最可能破坏什么？
6. 哪些内容应该延后？
`,
    ".ccli/skills/qa.md": `# 质量审查技能

用于交付前检查结果、风险和验证覆盖。

审查重点：

- 用户目标是否真的完成。
- 是否存在明显回归风险。
- 是否有自动验证结果。
- 普通用户是否能理解完成状态。
`,
    ".ccli/skills/frontend-design.md": `# 前端设计技能

用于新增页面、重塑页面或明显影响用户界面的改动。

设计原则：

- 先确定具体主题、目标用户和页面唯一任务。
- 所有视觉选择都要服务主题，不使用无关的模板化默认风格。
- 先做设计计划，再实现：色彩、字体、布局、标志性元素。
- 只在一个地方大胆，其他部分保持克制。
- 文案从用户角度命名动作，不暴露系统实现。
- 错误、空状态和加载状态都要给用户明确方向。
- 移动端、键盘焦点和减少动态效果偏好必须可用。

设计自查：

1. 这个页面是否换一个行业也几乎一样？如果是，重做视觉方向。
2. 结构元素是否表达真实信息，而不是装饰？
3. 动效是否服务理解，而不是制造热闹？
4. 文案是否用普通人认识的词？
5. 是否有一个能被记住但不喧宾夺主的标志性元素？
`
  };
}

export function harnessRuntimeFiles(projectName = "当前项目"): Record<string, string> {
  return {
    ".ccli/harness/settings.json": `${JSON.stringify(
      {
        version: 1,
        mode: "plain-user-autonomous",
        principle: "便宜且可撤回的动作自动执行；昂贵、不可逆、远程、发布、密钥和生产动作必须中文确认。",
        modelRoles: {
          planner: "强推理模型",
          builder: "代码能力强的模型",
          reviewer: "与开发不同的模型或独立上下文",
          presenter: "快速中文呈现模型"
        },
        permissions: {
          autoApprove: ["读取项目说明", "搜索文件", "小范围编辑", "运行常见验证", "格式整理", "写入本地进度"],
          confirm: ["删除大量文件", "修改密钥或部署配置", "数据库迁移", "运行远程脚本", "推送分支", "创建或合并审查入口", "发布或生产操作"],
          deny: ["强制覆盖主线历史", "无确认发布", "读取或外传密钥", "破坏性清理命令"]
        }
      },
      null,
      2
    )}\n`,
    ".ccli/harness/hooks.json": `${JSON.stringify(
      {
        version: 1,
        hooks: [
          {
            id: "dangerous-action-gate",
            when: "before-tool",
            description: "执行工具前检查删除、密钥、远程脚本、发布、生产和主线覆盖风险",
            blocks: true
          },
          {
            id: "quality-feedback",
            when: "after-edit",
            description: "改动后优先运行格式、测试、构建或预览检查，并把失败摘要反馈给开发代理",
            blocks: false
          },
          {
            id: "review-before-ship",
            when: "after-validation",
            description: "交付前必须经过独立审查代理，审查风险、验证结果和未覆盖项",
            blocks: true
          },
          {
            id: "session-memory-writer",
            when: "session-end",
            description: "任务结束或中断前写入进度、已确认事实和下一步",
            blocks: false
          }
        ]
      },
      null,
      2
    )}\n`,
    ".ccli/harness/agents/reviewer.md": `# 独立审查代理

用途：在开发代理完成后，用新的上下文检查结果，不为实现过程辩护。

必须检查：

- 用户目标是否真的完成。
- 自动验证是否通过，失败时影响是什么。
- 是否涉及删除、密钥、部署、数据库、远程脚本、推送、合并或生产数据。
- 普通用户能不能用中文理解完成内容、风险和下一步。

输出只写中文结论、风险和建议，不展示代码块、命令、路径或堆栈。

项目：${projectName}
`,
    ".ccli/harness/agents/eval-runner.md": `# 验证执行代理

用途：把改动后的验证结果变成开发代理能修复、普通用户能理解的反馈。

固定流程：

1. 先判断项目是否有测试、构建、格式检查或本地预览。
2. 优先运行现有验证，不临时发明复杂流程。
3. 验证失败时，只保留失败影响、最可能原因和下一步修复方向。
4. 同类失败最多先自动修复一次，避免无限循环。
5. 原始输出只进入本地审计日志。
`,
    ".ccli/harness/ROADMAP.md": `# 驾驭路线图

这份路线图把 Harness Engineering 落到 ccli 的中文开发流程里。

## 基础层

1. 先定义单个智能体的运行环境：模型、工具、权限、上下文。
2. 把支架集中在项目里：项目指南、规则、技能、代理说明和记忆都能被稳定读取。
3. 分清支架、循环和长期系统：先让一次人工触发的任务稳定，再考虑自动循环。
4. 摆脱空白默认配置：不要让模型每次重新猜项目边界。
5. 保持长期事实短小：稳定事实放项目指南，流程步骤放技能。

## 控制层

6. 固定权限档案：低风险动作自动，高影响动作中文确认。
7. 使用独立审查代理：开发和评估分开。
8. 把反复流程沉淀成技能：前端设计、验收检查、业务追问都可复用。
9. 用确定性规则拦截风险：删除、密钥、发布、生产和主线覆盖不能靠模型自觉。

## 复利层

10. 先稳定人工触发，再进入循环：循环只能放大已有支架。
11. 复杂任务交给不同角色协作：研究、开发、验证、审查分开处理。
12. 把状态写入本地记忆：中断后能继续。
13. 把踩坑变成下一轮输入：用户说“以后不要再这样”时沉淀经验。
14. 把有效支架打包复用：一个项目跑稳后，新项目继承同样规则和护栏。

当前项目：${projectName}
`
  };
}

export function harnessScaffoldFiles(projectName = "当前项目"): Record<string, string> {
  return {
    ...harnessSkillFiles(),
    ".ccli/config.json": `${JSON.stringify(
      {
        language: "zh-CN",
        mode: "plain-user",
        automation: "high-with-guardrails"
      },
      null,
      2
    )}\n`,
    ...harnessRuntimeFiles(projectName),
    "AGENTS.md": `# ccli 项目指南

这个文件会被 ccli 的 Harness 稳定读取，用来约束每一次自动开发。

## 固定目标

- 所有用户可见内容使用简体中文。
- 默认只向普通用户展示任务、进度、风险、选择和结果。
- 技术细节只进入本地审计日志或专家模式。

## 协作规则

- 先理解用户想要的结果，再决定实现方式。
- 每次会话优先完成一个明确任务，不把多个目标混在一起。
- 开发前先了解当前状态，开发后必须验证并交给独立审查。
- 生成和评估分离：开发代理负责实现，审查代理负责挑风险。
- 每次改动尽量小而完整。
- 验证失败时先让系统自动修复一次，再提示用户风险。
- 删除、密钥、发布、部署和生产数据相关动作必须经过中文确认。
`,
    "DESIGN.md": `# 设计契约

## 产品目标

${projectName} 由 ccli 维护。所有后续改动都应该优先服务普通用户能理解、能判断、能使用的结果。

## 目标用户

非技术用户和业务负责人。他们不应该被要求理解代码、命令、接口或部署细节。

## 体验原则

- 第一屏直接呈现可用产品，不做空洞介绍。
- 文案用用户能理解的业务语言命名动作。
- 每次交付都要能被打开、验收、继续修改。
`,
    ".ccli/harness/README.md": `# Harness 说明

Harness 是 ccli 驾驭模型的外部支架。它负责固定规则、限制工具、记录进度、触发验证和保留审计。

默认目标：让普通用户只感知中文产品结果，不需要理解代码、命令、分支或 PR。

关键反馈闭环：实现后先自动验证；验证失败时把问题反馈给开发代理；用户需要看效果时用本地预览确认页面结果。

使用方式：先用项目指南固定规则，再让系统按阶段少量使用工具；每次验证失败都沉淀成下一轮自动修复输入，任务中断时从本地进度继续。
`,
    ".ccli/harness/rules/product.md": `# 产品规则

- 先说明用户能得到什么结果。
- 界面、交互和交付说明都使用普通人认识的词。
- 不把模型的原始语言、技术术语或错误堆栈展示给普通用户。
- 如果必须让用户选择，只描述影响和风险，不展示命令。
`,
    ".ccli/harness/rules/safety.md": `# 安全规则

- 小范围读取、搜索、编辑和验证可以自动执行。
- 删除大量文件、修改密钥、修改部署配置、数据库迁移、远程脚本、推送、合并、发布和生产操作必须确认。
- 自动修复最多先尝试一次，避免无限循环。
- 所有工具调用和模型原始结果必须进入本地审计记录。
`,
    ".ccli/harness/feature-list.json": `${JSON.stringify(
      {
        project: projectName,
        rule: "每次会话只选择一个最重要的任务推进，完成前不扩大范围。",
        features: [
          {
            id: "first-visible-outcome",
            title: "先做一个普通用户能看懂的可见结果",
            priority: 1,
            status: "pending",
            acceptance: ["能打开", "能看懂", "能说出下一步要改什么"]
          }
        ]
      },
      null,
      2
    )}\n`,
    ".ccli/harness/init-check.json": `${JSON.stringify(
      {
        purpose: "每次长任务开始前先确认当前项目是否处于可继续状态。",
        steps: [
          "读取项目指南、设计契约、规则、技能和项目记忆",
          "读取最近进度和最近提交记录",
          "如果项目能预览，先确认当前产品可以打开",
          "如果有自动验证脚本，先运行验证再开始新功能",
          "只选择任务清单里当前最重要的一项推进"
        ]
      },
      null,
      2
    )}\n`,
    ".ccli/harness/agent-memory/STATE.md": `# 项目状态

当前还没有长期任务状态。

ccli 会把每次任务的短期进度写入本地 .ccli/progress.json，把可复用经验写入项目记忆。
`,
    ".ccli/harness/agent-memory/LESSONS.md": `# 失败经验库

这里记录已经发生过的问题，以及以后如何避免。

当用户说“以后不要再这样”或运行 ccli learn 时，ccli 会把经验写到这里，并在后续任务开始前读取。
`
  };
}

export function webTemplateFiles(name: string): Record<string, string> {
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "ccli-app";

  return {
    "package.json": `${JSON.stringify(
      {
        name: safeName,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "tsc -b && vite build",
          preview: "vite preview",
          test: "vitest run"
        },
        dependencies: {
          "@vitejs/plugin-react": "^5.0.0",
          vite: "^7.0.0",
          typescript: "^5.8.3",
          react: "^19.1.0",
          "react-dom": "^19.1.0"
        },
        devDependencies: {
          "@types/react": "^19.1.8",
          "@types/react-dom": "^19.1.6",
          vitest: "^3.2.4"
        }
      },
      null,
      2
    )}\n`,
    "index.html": `<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "tsconfig.json": `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          useDefineForClassFields: true,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          allowJs: false,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          module: "ESNext",
          moduleResolution: "Bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx"
        },
        include: ["src"]
      },
      null,
      2
    )}\n`,
    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()]
});
`,
    "src/main.tsx": `import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
    "src/App.tsx": `const actions = ["描述需求", "确认效果", "交付审查"];

export function App() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">中文开发工作台</p>
        <h1>${escapeJs(name)}</h1>
        <p className="summary">
          这里是由 ccli 创建的 Web 应用。你可以继续用中文描述想要的页面、功能或业务流程。
        </p>
      </section>

      <section className="panel" aria-label="工作流程">
        {actions.map((action, index) => (
          <div className="step" key={action}>
            <span>{index + 1}</span>
            <strong>{action}</strong>
          </div>
        ))}
      </section>
    </main>
  );
}
`,
    "src/styles.css": `:root {
  color: #17212b;
  background: #f6f8fb;
  font-family:
    Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

.page {
  min-height: 100vh;
  display: grid;
  align-content: center;
  gap: 28px;
  padding: 56px;
  box-sizing: border-box;
}

.hero {
  max-width: 760px;
}

.eyebrow {
  margin: 0 0 12px;
  color: #0f7a5f;
  font-weight: 700;
}

h1 {
  margin: 0;
  font-size: 48px;
  line-height: 1.08;
}

.summary {
  margin: 18px 0 0;
  max-width: 680px;
  color: #465461;
  font-size: 18px;
  line-height: 1.7;
}

.panel {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  max-width: 860px;
}

.step {
  min-height: 96px;
  border: 1px solid #d8e0e8;
  border-radius: 8px;
  background: #ffffff;
  display: grid;
  align-content: center;
  gap: 10px;
  padding: 18px;
}

.step span {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #0f7a5f;
  color: white;
  display: grid;
  place-items: center;
  font-weight: 700;
}

@media (max-width: 720px) {
  .page {
    padding: 28px;
  }

  h1 {
    font-size: 34px;
  }

  .panel {
    grid-template-columns: 1fr;
  }
}
`,
    ".ccli/config.json": `${JSON.stringify(
      {
        language: "zh-CN",
        mode: "plain-user",
        automation: "high-with-guardrails"
      },
      null,
      2
    )}\n`,
    ...harnessRuntimeFiles(name),
    "AGENTS.md": `# ccli 项目指南

这个文件会被 ccli 的 Harness 稳定读取，用来约束每一次自动开发。

## 固定目标

- 所有用户可见内容使用简体中文。
- 默认只向普通用户展示任务、进度、风险、选择和结果。
- 技术细节只进入本地审计日志或专家模式。

## 协作规则

- 先理解用户想要的结果，再决定实现方式。
- 每次会话优先完成一个明确任务，不把多个目标混在一起。
- 开发前先了解当前状态，开发后必须验证并交给独立审查。
- 生成和评估分离：开发代理负责实现，审查代理负责挑风险。
- 每次改动尽量小而完整。
- 验证失败时先让系统自动修复一次，再提示用户风险。
- 删除、密钥、发布、部署和生产数据相关动作必须经过中文确认。
`,
    ".ccli/harness/README.md": `# Harness 说明

Harness 是 ccli 驾驭模型的外部支架。它负责固定规则、限制工具、记录进度、触发验证和保留审计。

默认目标：让普通用户只感知中文产品结果，不需要理解代码、命令、分支或 PR。

关键反馈闭环：实现后先自动验证；验证失败时把问题反馈给开发代理；用户需要看效果时用本地预览确认页面结果。

使用方式：先用项目指南固定规则，再让系统按阶段少量使用工具；每次验证失败都沉淀成下一轮自动修复输入，任务中断时从本地进度继续。
`,
    ".ccli/harness/feature-list.json": `${JSON.stringify(
      {
        project: name,
        rule: "每次会话只选择一个最重要的任务推进，完成前不扩大范围。",
        features: [
          {
            id: "first-visible-outcome",
            title: "先做一个普通用户能看懂的可见结果",
            priority: 1,
            status: "pending",
            acceptance: ["能打开", "能看懂", "能说出下一步要改什么"]
          }
        ]
      },
      null,
      2
    )}\n`,
    ".ccli/harness/init-check.json": `${JSON.stringify(
      {
        purpose: "每次长任务开始前先确认当前项目是否处于可继续状态。",
        steps: [
          "读取项目指南、设计契约、规则、技能和项目记忆",
          "读取最近进度和最近提交记录",
          "如果项目能预览，先确认当前产品可以打开",
          "如果有自动验证脚本，先运行验证再开始新功能",
          "只选择任务清单里当前最重要的一项推进"
        ]
      },
      null,
      2
    )}\n`,
    ".ccli/harness/rules/product.md": `# 产品规则

- 先说明用户能得到什么结果。
- 界面、交互和交付说明都使用普通人认识的词。
- 不把模型的原始语言、技术术语或错误堆栈展示给普通用户。
- 如果必须让用户选择，只描述影响和风险，不展示命令。
`,
    ".ccli/harness/rules/safety.md": `# 安全规则

- 小范围读取、搜索、编辑和验证可以自动执行。
- 删除大量文件、修改密钥、修改部署配置、数据库迁移、远程脚本、推送、合并、发布和生产操作必须确认。
- 自动修复最多先尝试一次，避免无限循环。
- 所有工具调用和模型原始结果必须进入本地审计记录。
`,
    ".ccli/harness/agent-memory/STATE.md": `# 项目状态

当前还没有长期任务状态。

ccli 会把每次任务的短期进度写入本地 .ccli/progress.json，把可复用经验写入项目记忆。
`,
    ".ccli/harness/agent-memory/LESSONS.md": `# 失败经验库

这里记录已经发生过的问题，以及以后如何避免。

当用户说“以后不要再这样”或运行 ccli learn 时，ccli 会把经验写到这里，并在后续任务开始前读取。
`,
    "DESIGN.md": `# 设计契约

## 产品目标

这个项目由 ccli 创建。所有后续改动都应该优先服务普通用户能理解、能判断、能使用的结果。

## 目标用户

非技术用户和业务负责人。他们不应该被要求理解代码、命令、接口或部署细节。

## 体验原则

- 页面文字使用简体中文。
- 默认隐藏技术术语。
- 关键动作要让用户知道影响，而不是暴露实现细节。
- 视觉风格保持清晰、克制、可扫描。

## 信息架构

首屏直接呈现可用产品，不做空泛营销页。

## 交互原则

用户输入自然语言目标，系统负责拆解、执行、验证和交付。

## 视觉系统

默认采用浅色、清爽、工作型界面。卡片圆角不超过 8px。

每次新增重要页面前，先形成紧凑的设计计划：色彩、字体、布局、一个能被记住的标志性元素。不要套用与主题无关的默认风格。

## 可访问性

文本需要易读，移动端不重叠，按钮和状态必须有清晰反馈。

## 验收标准

普通用户不需要查看代码也能判断本次改动是否完成。

## 延后事项

复杂动画、多主题、桌面端和 IDE 插件不属于首版默认范围。
`,
    ...harnessSkillFiles(),
    ".ccli/design-systems/default.json": `${JSON.stringify(
      {
        name: "ccli-default",
        principles: ["中文优先", "隐藏技术复杂度", "清晰克制", "移动端可用"],
        colors: {
          background: "#f6f8fb",
          text: "#17212b",
          primary: "#0f7a5f",
          surface: "#ffffff"
        },
        radius: 8
      },
      null,
      2
    )}\n`,
    ".gitignore": `node_modules/
dist/
.env
.env.*
!.env.example
.ccli/audit/
.ccli/state.json
.ccli/progress.json
.ccli/hardware-pending-action.json
.ccli/approval.json
.ccli/memory.jsonl
`
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeJs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

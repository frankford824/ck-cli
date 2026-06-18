import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface WebTemplateOptions {
  name: string;
  root: string;
}

export async function createWebAppTemplate(options: WebTemplateOptions): Promise<string[]> {
  const files = webTemplateFiles(options.name);
  const written: string[] = [];

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(options.root, relativePath);
    await mkdir(join(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
    written.push(relativePath);
  }

  return written;
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
        automation: "high-with-guardrails",
        roles: {
          planner: { provider: "openai", model: "gpt-5" },
          builder: { provider: "anthropic", model: "claude-sonnet-4-5" },
          reviewer: { provider: "google", model: "gemini-3-pro" },
          presenter: { provider: "kimi", model: "kimi-latest" }
        }
      },
      null,
      2
    )}\n`,
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
`,
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

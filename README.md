# ccli

`ccli` 是一个全中文、低学习成本的开发 CLI 原型。它面向普通用户：默认只展示任务、进度、风险、选择和结果，不展示代码、命令、diff、路径和堆栈。

## 首版能力

- 创建 Vite + React + TypeScript Web 应用模板。
- 用中文需求驱动任务流程。
- 自动建立 git 分支、执行开发代理、验证代理、独立审查代理。
- 所有技术细节写入 `.ccli/audit/*.jsonl`，普通界面默认隐藏。
- 支持 OpenAI、Anthropic、Google Gemini、Qwen、DeepSeek、Kimi 的原生 provider 适配入口。
- 高风险操作由策略层拦截，推送和 PR 创建需要确认或显式 `--yes`。
- 借鉴 MemPalace：内置本地项目记忆 `.ccli/memory.jsonl`，用于沉淀任务、决策、审查和设计经验。
- 借鉴 gstack：内置“确认目标、整理方案、实现、审查、验证、交付、沉淀经验”的专家流程。
- 借鉴 open-design：新项目默认生成 `DESIGN.md`、`.ccli/skills/` 和 `.ccli/design-systems/`。
- 借鉴 Anthropic frontend-design skill：新项目默认带中文前端设计技能，开发代理会读取设计契约和技能约束。

## 开发

```bash
pnpm install
pnpm build
pnpm test
pnpm dev --help
```

## 常用命令

```bash
ccli new demo
ccli do "添加一个登录页面"
ccli status
ccli review
ccli pr --yes
ccli ship --yes
ccli ship --merge --yes
ccli audit --expert
ccli roles --expert
ccli design --expert
ccli memory search "登录页面" --expert
```

## 自动交付

`ccli ship` 会把当前分支发送到远程仓库，运行独立审查，复用或创建 PR，并把审查摘要发布到 PR。默认不会自动合并。

```bash
ccli ship --yes
```

如果需要审查通过后自动合并，显式加入：

```bash
ccli ship --merge --yes
```

自动合并仍受硬护栏保护：审查不通过、找不到 PR、缺少 GitHub Token 或未登录 GitHub CLI 时都会停止。

## 配置

全局配置位于 `~/.ccli/config.json`，项目配置位于 `.ccli/config.json`。密钥优先从环境变量读取。

```json
{
  "roles": {
    "planner": { "provider": "openai", "model": "gpt-5" },
    "builder": { "provider": "anthropic", "model": "claude-sonnet-4-5" },
    "reviewer": { "provider": "google", "model": "gemini-3-pro" },
    "presenter": { "provider": "kimi", "model": "kimi-latest" }
  }
}
```

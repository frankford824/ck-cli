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

## 一键安装

合并到 `main` 后，普通用户可以直接执行：

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/frankford824/ck-cli/main/install.sh | bash
```

Windows PowerShell：

```powershell
irm https://raw.githubusercontent.com/frankford824/ck-cli/main/install.ps1 | iex
```

安装完成后验证：

```bash
ccli --help
ccli
ccli roles
```

如果要在 PR 分支上提前试用：

```bash
CCLI_REF=codex/initial-ccli-implementation bash -c "$(curl -fsSL https://raw.githubusercontent.com/frankford824/ck-cli/codex/initial-ccli-implementation/install.sh)"
```

Windows PowerShell：

```powershell
$env:CCLI_REF="codex/initial-ccli-implementation"; irm https://raw.githubusercontent.com/frankford824/ck-cli/codex/initial-ccli-implementation/install.ps1 | iex
```

前置要求：

- Git
- Node.js 20 或更高版本
- pnpm，安装器会优先通过 corepack 自动启用，必要时回退到 npm 安装

默认安装位置：

- macOS / Linux：`~/.ccli/ck-cli`，启动器在 `~/.local/bin/ccli`
- Windows：`%LOCALAPPDATA%\ccli\ck-cli`，启动器在 `%LOCALAPPDATA%\ccli\bin\ccli.cmd`

卸载：

```bash
curl -fsSL https://raw.githubusercontent.com/frankford824/ck-cli/main/uninstall.sh | bash
```

Windows PowerShell：

```powershell
irm https://raw.githubusercontent.com/frankford824/ck-cli/main/uninstall.ps1 | iex
```

## 开发

```bash
pnpm install
pnpm build
pnpm test
pnpm dev --help
```

## 常用命令

```bash
ccli
ccli doctor
ccli chat
ccli "给订单页面增加导出按钮"
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
ccli hardware --expert
```

## 老板上手方式

安装后直接输入：

```bash
ccli
```

它会显示中文欢迎页和下一步建议。你也可以不用学命令，直接说目标：

```bash
ccli "把首页改得更像高端咨询公司"
```

如果想连续沟通：

```bash
ccli chat
```

如果不确定电脑是否配置好：

```bash
ccli doctor
```

`doctor` 只用中文说明哪些能力已经就绪、哪些需要处理。普通模式不会显示命令、路径、堆栈或底层错误。

## 智能硬件预留

`ccli hardware` 会输出面向语音和智能硬件的交互协议摘要。后续硬件只需要把语音转成文字交给 ccli，并接收三类输出：

- 中文朗读内容
- 屏幕提示内容
- 可选按钮/选择项

协议不暴露代码、命令、路径和堆栈，保证用户体验保持普通中文产品语义。

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

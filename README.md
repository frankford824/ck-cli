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
- 已有项目可用 `ccli skills` 一键补齐中文产品追问、质量审查和前端设计技能。
- 借鉴 Harness Engineering：内置确定性项目指南、阶段工具预算、验证失败反馈闭环、`.ccli/progress.json` 进度落盘和失败经验库。
- 没有模型授权时，也会先生成可运行的中文首版业务页面，而不是只留下技术草稿。
- 离线首版会按客户、预约、库存、订单、财务、内容等常见场景生成不同业务工作台。
- `ccli home` 提供老板开箱驾驶舱：当前状态、最建议动作、可选动作和常见模板放在一个中文首页。
- `ccli go` 提供一键开箱路径：一句话创建产品、生成首版、准备运行内容并打开本地预览。
- `ccli ideas` 提供老板可直接开工的产品场景库，支持按编号或名称直接生成产品，也支持硬件读取结构化场景。
- `ccli next` 会根据当前项目、最近产品和任务状态给出下一步建议，也支持硬件读取结构化建议。
- 本机项目库会记住创建过的产品，后续可用 `ccli projects` 查看、`ccli open` 打开最近产品。

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
ccli
ccli home
ccli ready
ccli resume
ccli setup
ccli go "做一个客户管理系统，能记录跟进和提醒" --no-preview
ccli doctor
ccli preview --install --check
```

如果要在 PR 分支上提前试用：

```bash
CCLI_REF=你的分支名 bash -c "$(curl -fsSL https://raw.githubusercontent.com/frankford824/ck-cli/你的分支名/install.sh)"
```

Windows PowerShell：

```powershell
$env:CCLI_REF="你的分支名"; irm https://raw.githubusercontent.com/frankford824/ck-cli/你的分支名/install.ps1 | iex
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
ccli home
ccli ready
ccli setup
ccli next
ccli go "做一个客户管理系统"
ccli ideas
ccli ideas 3
ccli "做第 3 个模板"
ccli "打开我上次做的系统"
ccli projects
ccli open
ccli create "做一个客户管理系统"
ccli preview --install
ccli doctor
ccli chat
ccli "给订单页面增加导出按钮"
ccli new demo
ccli do "添加一个登录页面"
ccli preview --install
ccli status
ccli resume
ccli review
ccli pr --yes
ccli ship --yes
ccli ship --merge --yes
ccli audit --expert
ccli roles --expert
ccli design --expert
ccli skills
ccli harness
ccli harness --init
ccli harness --method
ccli learn "以后按钮在手机上也要清楚好点击"
ccli harness --expert
ccli "取消"
ccli memory search "登录页面" --expert
ccli hardware --expert
ccli hardware "下一步怎么办" --json
```

## 老板上手方式

安装后直接输入：

```bash
ccli home
```

它会把当前状态、最建议动作、可选动作和常见开工模板放在同一个中文首页。

首页里的“直接说”都可以直接输入或语音转写，例如：

```bash
ccli "打开当前产品页面"
ccli "怎么验收当前产品"
ccli "我想改一下：首页太乱，重点不够明显"
ccli "检查当前电脑是否准备好"
```

首次设置可以继续输入：

```bash
ccli setup
```

不知道下一步做什么时：

```bash
ccli next
ccli "下一步怎么办"
```

不知道先做什么时：

```bash
ccli ideas
```

选中后直接开工：

```bash
ccli ideas 3
ccli ideas inventory
```

也可以直接说：

```bash
ccli "给我几个产品模板"
ccli "做第 3 个模板"
```

它会用中文带你完成首次设置：选择模型服务、保存授权、可选创建第一个项目。设置完成后，最快的方式是一句话生成产品并直接打开本地页面：

```bash
ccli go "做一个客户管理系统，能记录客户、跟进和提醒"
```

如果只想先生成项目、不打开页面，也可以用：

```bash
ccli create "做一个客户管理系统，能记录客户、跟进和提醒"
```

看到页面后，用中文验收清单判断是否满意：

```bash
ccli accept
ccli "怎么验收当前产品"
```

不满意就直接说想改哪里；满意后再说“我满意，准备交付”。

也可以显式提交修改意见：

```bash
ccli revise "首页太乱，重点不够明显"
```

满意后的交付也可以显式执行：

```bash
ccli finish
ccli "我满意，准备交付"
```

如果已经在项目里，也可以不用学命令，直接说目标：

```bash
ccli "把首页改得更像高端咨询公司"
```

如果想找回或打开以前做过的产品，也可以直接说中文：

```bash
ccli "查看我的产品"
ccli "打开我上次做的系统"
ccli "检查我上次做的系统能不能打开"
ccli "继续上次任务"
ccli "打开客户管理"
```

如果想连续沟通：

```bash
ccli chat
```

如果不确定电脑是否配置好：

```bash
ccli ready
ccli doctor
```

`ready` 会按老板能理解的顺序说明还差什么、先说哪句话；`doctor` 会检查底层准备项。普通模式不会显示命令、路径、堆栈或底层错误。

## 首次设置

`ccli setup` 是老板友好的开箱入口。它会做三件事：

- 保存一次模型授权，后续项目自动继承。
- 把规划、开发、审查角色默认绑定到同一个可用模型服务，避免普通用户理解多模型配置。
- 可选创建第一个 Web 项目。

也可以非交互设置：

```bash
ccli setup --provider openai --api-key "你的授权码" --project 我的应用
```

支持的模型服务：OpenAI、Anthropic、Google、Qwen、DeepSeek、Kimi。

## 一键开箱体验

`ccli go` 是给普通老板准备的最快入口：

```bash
ccli go "做一个门店预约系统，客户能选时间，老板能看预约"
```

它会自动完成：

- 创建新的中文 Web 项目。
- 按你的目标生成首版业务工作台，常见场景会自动匹配客户、预约、库存、订单、财务或内容管理结构。
- 自动验证并保存本次成果。
- 准备本地运行内容。
- 直接打开浏览器查看本地预览页面。

网络较慢时，ccli 会继续用中文提示准备进度。预览打开后保持窗口不关即可查看页面，结束时按 Ctrl+C。

如果只是想生成首版，不立刻打开页面：

```bash
ccli go "做一个门店预约系统" --no-preview
```

如果在远程服务器、自动化环境或未来硬件壳层里运行，只想启动预览但不自动打开浏览器：

```bash
ccli go "做一个门店预约系统" --no-open
```

## 我的产品库

ccli 会把通过 `go` 或 `create` 创建过的产品保存到本机项目库。老板不用记目录，后续直接查看或打开：

```bash
ccli projects
ccli open
```

`ccli open` 默认打开最近使用的产品。如果想打开列表中的指定产品：

```bash
ccli open 2
ccli open 客户管理
```

如果只想确认这个产品是否已经可以打开：

```bash
ccli open 1 --install --check
```

远程服务器或硬件壳层只想拿到产品清单时：

```bash
ccli projects --json
```

同样的能力也支持直接中文意图，适合语音输入：

```bash
ccli "查看我的产品"
ccli "打开我上次做的系统"
ccli "检查我上次做的系统能不能打开"
```

## 一句话创建产品

`ccli create` 会把一句中文目标变成一个新项目，并立刻推进第一轮开发：

```bash
ccli create "做一个门店预约系统，客户能选时间，老板能看预约"
```

它会自动完成：

- 生成中文 Web 应用项目。
- 建立本地保存记录。
- 读取全局模型授权。
- 按你的产品目标执行第一轮规划、开发、验证和审查。
- 如果暂时没有模型授权，也会先生成一个可运行的业务页面。

如果想指定项目名：

```bash
ccli create "做一个门店预约系统" --name 门店预约
```

如果希望创建后立即安装依赖并启用更完整验证：

```bash
ccli create "做一个门店预约系统" --install
```

如果希望创建后直接看到页面：

```bash
ccli create "做一个门店预约系统" --preview --yes
```

## 本地预览

`ccli preview` 会用中文帮普通用户判断当前项目能不能打开页面。缺少运行内容时，它不会直接报一堆技术错误，而是提示下一步：

```bash
ccli preview --install
```

如果只想检查是否已经准备好：

```bash
ccli preview --check
```

启动成功后，ccli 会默认尝试打开浏览器，并同时显示本地预览地址和结束方式；底层启动细节仍保留在专家模式和审计记录里。

如果只想启动服务、不自动打开浏览器：

```bash
ccli preview --install --no-open
```

## 驾驭系统

ccli 把智能体理解成“模型 + 驾驭系统”。模型负责规划、开发和审查；驾驭系统负责把模型限制在稳定流程里：

- 启动任务时读取 `AGENTS.md`、`CLAUDE.md`、`CCLI.md`、`.ccli/harness/` 和 `.ccli/skills/`。
- 每个阶段只暴露少量工具语义，减少模型选择噪音。
- `ccli harness --init` 会为已有项目补齐项目指南、产品规则、安全规则、任务清单、开工检查、长期状态和失败经验库。
- 自动验证失败时，把失败摘要交回开发代理，最多先自动修复一次。
- 每个阶段写入 `.ccli/progress.json`，长任务或上下文丢失后可以接管。
- 每次踩坑都可以写入 `.ccli/harness/agent-memory/LESSONS.md`，后续任务开始前会自动读取。
- 本地预览作为用户可理解的反馈闭环，让“看见页面”成为验证的一部分。
- `ccli skills` 会给已有项目补齐可复用中文开发技能；直接说“补齐开发技能”也可以触发。
- `ccli harness` 会给出中文健康度、已具备能力、缺口和下一步建议。
- `ccli learn` 会把一句“以后不要再这样”沉淀成项目经验。
- 所有原始工具结果和模型细节仍进入 `.ccli/audit/*.jsonl`。

补齐当前项目的中文开发技能：

```bash
ccli skills
```

为已有项目搭好完整驾驭支架：

```bash
ccli harness --init
```

查看当前项目的驾驭系统：

```bash
ccli harness
```

普通用户会看到当前项目是否已经具备稳定规则、护栏、验证反馈、独立审查和进度记忆；缺什么就按中文建议补什么。

查看这套方法怎么用：

```bash
ccli harness --method
```

沉淀一条经验：

```bash
ccli learn "以后新增按钮时，手机上也必须清楚、好点击"
```

也可以直接自然语言输入：

```bash
ccli "记住：以后不要再把技术错误直接展示给普通用户"
```

查看专家细节：

```bash
ccli harness --expert
```

## 智能硬件预留

`ccli hardware` 会输出面向语音和智能硬件的交互协议摘要。后续硬件只需要把语音转成文字交给 ccli，并接收中文结果：

- 中文朗读内容
- 屏幕提示内容
- 可选按钮/选择项
- 结构化按钮动作，包含说法、命令、说明和是否需要确认
- 产品清单
- 老板开箱驾驶舱，可用 `ccli home --json` 读取
- 开箱准备向导，可用 `ccli ready --json` 读取
- 任务恢复向导，可用 `ccli resume --json` 读取
- 老板验收清单，可用 `ccli accept --json` 读取
- 产品场景库，可用 `ccli ideas --json` 读取
- 下一步建议，可用 `ccli next --json` 读取
- 协议字段说明，可用 `ccli hardware --schema` 读取
- 协议示例，可用 `ccli hardware --examples` 读取
- 语音桥接响应，可用 `ccli hardware "下一步怎么办" --json` 读取
- 控制口令，可用 `ccli hardware "取消" --json` 或 `ccli hardware "帮助" --json` 读取
- 二次确认口令，可在高影响动作后继续调用 `ccli hardware "确认" --json` 读取 `action-confirmed`

协议不暴露代码、命令、路径和堆栈，保证用户体验保持普通中文产品语义。

示例：

```bash
ccli hardware "下一步怎么办" --json
ccli hardware "开箱准备" --json
ccli hardware "继续上次任务" --json
ccli hardware "取消" --json
ccli hardware "帮助" --json
ccli hardware "我第一次用怎么开始" --json
ccli hardware "怎么验收当前产品" --json
ccli hardware "我想改一下：首页太乱，重点不够明显" --json
ccli hardware "我满意，准备交付" --json
ccli hardware "确认" --json
ccli hardware "给我几个产品模板" --json
ccli hardware "做一个库存看板，能看低库存" --json
ccli hardware "查看我的产品" --json
ccli hardware --schema
ccli hardware --examples
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

全局配置位于 `~/.ccli/config.json`，项目配置位于 `.ccli/config.json`。普通用户优先使用 `ccli setup`，专家用户也可以手动维护配置。密钥优先从全局配置或环境变量读取。

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

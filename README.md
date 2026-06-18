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
- 借鉴 Harness Engineering：内置确定性项目指南、阶段工具预算、验证失败反馈闭环、`.ccli/progress.json` 进度落盘、失败经验库和自动循环就绪检查。
- 没有模型授权时，也会先生成可运行的中文首版业务页面，而不是只留下技术草稿。
- 离线首版会按客户、预约、库存、订单、财务、内容等常见场景生成不同业务工作台。
- 直接运行 `ccli` 就进入老板开箱驾驶舱；`ccli home` 也可打开同一首页，首屏优先推荐“一句话开工”，同时给出向导、试用和模板。
- `ccli wizard` 提供老板开工向导：问 4 个业务问题，自动沉淀业务简报，并可确认后直接生成首版。
- `ccli questions` 提供老板需求追问卡：把模糊想法变成 3 个普通用户能回答的问题。
- `ccli answers` 会把老板对追问卡的回答直接沉淀成业务简报。
- `ccli brief` 提供老板业务简报：把一句话想法整理成目标、使用者、首版范围和验收标准。
- `ccli approve` 提供老板验收凭证：记录“我已看过并通过”，交付时自动带上凭证。
- `ccli report` 提供老板交付卡：把当前产品、目标、进展依据和下一步说法压成一页中文汇报。
- `ccli try` 提供安全试用入口：不用模型授权、不改当前目录，直接生成一个演示产品并可打开页面。
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

安装完成后，安装器会直接显示中文开箱卡。普通用户只需要重新打开终端，输入 `ccli`，或者直接说“打开开箱首页”“一步步问我，然后开工”“试用一下”。

如果要做完整验收，可以再运行：

```bash
ccli installed
ccli
ccli "一步步问我，然后开工"
ccli "试用一下"
ccli "下一步怎么办"
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

- Node.js 可选；没有 Node.js 20 或更高版本时，安装器会自动准备 ccli 自带运行环境
- pnpm 可选；安装器会优先通过 corepack 自动启用，必要时回退到 npm 安装
- Git 可选；有 Git 时安装器会用 Git 更新，没有 Git 时会自动下载源码包

默认安装位置：

- macOS / Linux：`~/.ccli/ck-cli`，启动器在 `~/.local/bin/ccli`
- Windows：`%LOCALAPPDATA%\ccli\ck-cli`，启动器在 `%LOCALAPPDATA%\ccli\bin\ccli.cmd`
- 如果自动准备运行环境，会放在用户目录下的 ccli 本地目录，不需要单独配置系统 Node.js

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
ccli installed
ccli questions "做一个客户管理系统"
ccli answers "销售每天用；第一眼看待跟进客户；首版能新增客户并提醒"
ccli launch
ccli brief "做一个客户管理系统"
ccli report
ccli ready
ccli setup
ccli try
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
ccli brief
ccli report
ccli approval
ccli undo
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
ccli harness --playbook
ccli harness --context
ccli harness --scan
ccli harness --loop
ccli learn "以后按钮在手机上也要清楚好点击"
ccli harness --expert
ccli "取消"
ccli memory search "登录页面" --expert
ccli hardware --expert
ccli hardware "帮我澄清需求：做一个客户管理系统，能记录跟进和提醒" --json
ccli hardware "我的回答是：销售每天用；第一眼看待跟进客户；首版能新增客户并提醒" --json
ccli hardware "按简报生成首版" --json
ccli hardware "整理业务简报：做一个客户管理系统，能记录跟进和提醒" --json
ccli hardware "记录验收通过：首屏和提醒逻辑可以" --json
ccli hardware "给我一个进度汇报" --json
ccli hardware "下一步怎么办" --json
```

## 老板上手方式

安装后直接输入：

```bash
ccli wizard
```

它会像助理一样问 4 个业务问题：想做什么、谁每天用、第一眼看什么、怎样算首版通过。回答后会自动保存业务简报；输入“确认”后可以直接生成首版。

如果已经有一句话想法，也可以直接带上：

```bash
ccli wizard "做一个客户管理系统，能记录跟进和提醒"
```

如果只想先保存简报，不马上开工：

```bash
ccli wizard "做一个客户管理系统，能记录跟进和提醒" --no-launch
```

如果想先看当前状态和可选动作：

```bash
ccli home
```

它会把当前状态、最建议动作、可选动作和常见开工模板放在同一个中文首页。

如果想法还很粗，可以先让 ccli 像产品经理一样追问 3 个关键问题：

```bash
ccli questions "做一个客户管理系统，能记录跟进和提醒"
ccli "帮我澄清需求：做一个客户管理系统，能记录跟进和提醒"
```

它只问“谁每天用、第一眼看什么、怎样算首版通过”，不会要求用户理解代码、数据库或技术方案。

回答完以后可以直接说：

```bash
ccli answers "销售每天用；第一眼看待跟进客户；首版能新增客户并提醒"
ccli "我的回答是：销售每天用；第一眼看待跟进客户；首版能新增客户并提醒"
```

它会把回答保存成业务简报，后续开发、汇报和验收都会围绕这份回答推进。

确认简报准确后，可以直接按简报生成首版：

```bash
ccli launch
ccli "按简报生成首版"
```

这一步会读取已保存的业务简报；如果当前还不是产品项目，会自动创建新产品，如果已经是产品项目，会按简报继续推进当前产品。

如果想先把口头想法变成外包合同一样清楚的目标，可以输入：

```bash
ccli brief "做一个客户管理系统，能记录跟进和提醒"
ccli "整理业务简报：做一个客户管理系统，能记录跟进和提醒"
```

它会生成产品目标、使用者、要解决的问题、首版必须做到、验收标准和暂不做的边界。后续 `ccli report` 和 `ccli accept` 会优先围绕这份简报说明。

想给自己或团队看当前做到哪，可以输入：

```bash
ccli report
ccli "给我一个进度汇报"
ccli "现在做到哪了"
```

它只展示产品、目标、当前重点、看得见的依据和下一句该说什么，不要求用户理解代码、分支或命令。

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

想先安全试用、不改当前目录时：

```bash
ccli try
ccli "试用一下"
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

不满意就直接说想改哪里；满意时可以先记录验收凭证：

```bash
ccli approve "首屏和提醒逻辑可以"
ccli "记录验收通过：首屏和提醒逻辑可以"
ccli approval
```

`approve` 只记录老板已验收，不会自动交付、发布或合并。确认要交付时再说“我满意，准备交付”。

也可以显式提交修改意见：

```bash
ccli revise "首页太乱，重点不够明显"
```

如果刚才改错了，可以撤回上次保存的成果：

```bash
ccli undo
ccli "撤回上次改动"
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

即使当前不在产品目录里，`ccli preview`、`ccli accept`、`ccli revise` 和 `ccli finish` 也会优先接上当前产品；当前目录不是产品时，会自动接最近做过的产品。

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

如果暂时没有授权码，`ccli setup` 会给出中文下一步：先安全试用、查看产品模板，或回到电脑终端粘贴授权码；智能硬件不会要求用户通过语音读出授权码。

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

普通用户不需要记命令。空目录里可以直接说目标：

```bash
ccli "做一个门店预约系统，客户能选时间，老板能看预约"
```

如果当前已经在一个产品项目里，类似“做一个登录页面”会默认继续修改当前产品；如果明确说“新建一个客户管理系统”，才会另起新产品。

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
- 内置 14 步驾驭路线图：先稳住单次任务，再补权限、审查、技能、钩子和记忆，最后再上循环自动化。
- `ccli harness --init` 会为已有项目补齐项目指南、权限档案、确定性钩子、审查代理、产品规则、安全规则、任务清单、开工检查、长期状态和失败经验库。
- `.ccli/harness/settings.json` 固定自动、确认和禁止动作；`.ccli/harness/hooks.json` 会在后台动作前后执行检查，拦截危险动作并记录质量反馈。
- `.ccli/harness/agents/` 保存独立审查代理和验证执行代理说明，让开发和评估分开。
- 自动验证失败时，把失败摘要交回开发代理，最多先自动修复一次。
- 每个阶段写入 `.ccli/progress.json`，长任务或上下文丢失后可以接管。
- 每次踩坑都可以写入 `.ccli/harness/agent-memory/LESSONS.md`，后续任务开始前会自动读取。
- 本地预览作为用户可理解的反馈闭环，让“看见页面”成为验证的一部分。
- `ccli skills` 会给已有项目补齐可复用中文开发技能；直接说“补齐开发技能”也可以触发。
- `ccli harness` 会给出中文健康度、已具备能力、缺口和下一步建议。
- `ccli harness --playbook` 会把 Harness Engineering 变成当天可执行剧本：开工前定边界、阶段工具收敛、验证失败回流、独立复核、结束写现场和经验沉淀。
- `ccli harness --context` 会检查长期事实是否过长，提示哪些内容应该拆到技能、规则或记忆里。
- `ccli harness --scan` 会在共享支架、复用到新项目或开启自动循环前，扫描疑似密钥、过宽权限和缺失护栏。
- `ccli harness --roadmap` 会按 14 步路线评估当前项目：哪些已具备、哪些先补、哪些后续再做。
- `ccli harness --loop` 会先判断项目是否适合自动循环：范围、节奏、完成标准、必须停下来的情况都会用中文说明。
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

查看今天怎么按这套方法推进任务：

```bash
ccli harness --playbook
```

检查长期上下文是否需要瘦身：

```bash
ccli harness --context
```

共享或自动循环前扫描支架风险：

```bash
ccli harness --scan
```

查看 14 步驾驭路线图：

```bash
ccli harness --roadmap
```

检查是否适合自动循环：

```bash
ccli harness --loop
```

也可以直接说：

```bash
ccli "补齐驾驭系统"
ccli "检查当前驾驭系统状态"
ccli "驾驭系统怎么用"
ccli "给我驾驭实操剧本"
ccli "共享前扫描驾驭系统风险"
ccli "查看驾驭路线图"
ccli "检查自动循环是否就绪"
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
- 结构化按钮动作，只包含中文说法、说明和是否需要确认
- 产品清单
- 硬件开机首屏，可用 `ccli hardware --json` 读取动态老板开箱驾驶舱
- 老板开箱驾驶舱，可用 `ccli home --json` 读取结构化首页数据
- 老板开工向导，可用 `ccli hardware "开工向导：做一个客户管理系统" --json` 获取可朗读的追问卡和回答入口
- 老板需求追问卡，可用 `ccli questions --json` 读取
- 老板回答沉淀，可用 `ccli answers --json` 读取
- 按业务简报开工，可用 `ccli hardware "按简报生成首版" --json` 获取确认动作
- 老板业务简报，可用 `ccli brief --json` 读取
- 老板验收凭证，可用 `ccli approval --json` 读取
- 老板交付卡，可用 `ccli report --json` 读取
- 开箱准备向导，可用 `ccli ready --json` 读取
- 任务恢复向导，可用 `ccli resume --json` 读取
- 老板验收清单，可用 `ccli accept --json` 读取
- 产品场景库，可用 `ccli ideas --json` 读取
- 下一步建议，可用 `ccli next --json` 读取
- 协议字段说明，可用 `ccli hardware --schema` 读取
- 协议示例，可用 `ccli hardware --examples` 读取
- 语音桥接响应，可用 `ccli hardware "下一步怎么办" --json` 读取
- 控制口令，可用 `ccli hardware "取消" --json` 或 `ccli hardware "帮助" --json` 读取
- 二次确认口令，可在高影响动作后继续调用 `ccli hardware "确认" --json`，确认后会返回 `action-started` 或 `action-confirmed`
- 后台动作状态，可在确认后继续调用 `ccli hardware "给我一个进度汇报" --json`，只返回中文进度、影响和下一步，不暴露运行细节

协议不暴露代码、命令、路径和堆栈；硬件按钮只需要把 `say` 里的中文说法作为下一句输入回传，保证用户体验保持普通中文产品语义。老板和硬件可读的 `--json` 输出都会走公开净化层，不返回后台命令。

示例：

```bash
ccli hardware "下一步怎么办" --json
ccli hardware "帮我澄清需求：做一个客户管理系统，能记录跟进和提醒" --json
ccli hardware "我的回答是：销售每天用；第一眼看待跟进客户；首版能新增客户并提醒" --json
ccli hardware "按简报生成首版" --json
ccli hardware "整理业务简报：做一个客户管理系统，能记录跟进和提醒" --json
ccli hardware "记录验收通过：首屏和提醒逻辑可以" --json
ccli hardware "给我一个进度汇报" --json
ccli hardware "开箱准备" --json
ccli hardware "继续上次任务" --json
ccli hardware "取消" --json
ccli hardware "帮助" --json
ccli hardware "试用一下" --json
ccli hardware "我第一次用怎么开始" --json
ccli hardware "怎么验收当前产品" --json
ccli hardware "我想改一下：首页太乱，重点不够明显" --json
ccli hardware "撤回上次改动" --json
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

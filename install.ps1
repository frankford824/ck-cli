$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:CCLI_REPO_URL) { $env:CCLI_REPO_URL } else { "https://github.com/frankford824/ck-cli.git" }
$Ref = if ($env:CCLI_REF) { $env:CCLI_REF } else { "main" }
$InstallDir = if ($env:CCLI_HOME) { $env:CCLI_HOME } else { Join-Path $env:LOCALAPPDATA "ccli\ck-cli" }
$BinDir = if ($env:CCLI_BIN_DIR) { $env:CCLI_BIN_DIR } else { Join-Path $env:LOCALAPPDATA "ccli\bin" }
$PnpmVersion = if ($env:CCLI_PNPM_VERSION) { $env:CCLI_PNPM_VERSION } else { "10.27.0" }

function Write-Step($Message) {
  Write-Host $Message
}

function Stop-Install($Message) {
  Write-Error "安装失败：$Message"
  exit 1
}

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Stop-Install "缺少 $Name，请先安装后重试。"
  }
}

function Test-NodeVersion {
  Require-Command "node"
  $Major = node -p "Number(process.versions.node.split('.')[0])"
  if ([int]$Major -lt 20) {
    Stop-Install "需要 Node.js 20 或更高版本。"
  }
}

function Ensure-Pnpm {
  if (Get-Command "pnpm" -ErrorAction SilentlyContinue) {
    return
  }

  if (Get-Command "corepack" -ErrorAction SilentlyContinue) {
    Write-Step "正在启用 pnpm。"
    try { corepack enable | Out-Null } catch {}
    try { corepack prepare "pnpm@$PnpmVersion" --activate | Out-Null } catch {}
  }

  if (Get-Command "pnpm" -ErrorAction SilentlyContinue) {
    return
  }

  if (Get-Command "npm" -ErrorAction SilentlyContinue) {
    Write-Step "正在安装 pnpm。"
    npm install -g "pnpm@$PnpmVersion" | Out-Null
  }

  if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
    Stop-Install "无法自动安装 pnpm，请手动安装 pnpm 后重试。"
  }
}

function Checkout-Repo {
  $Parent = Split-Path -Parent $InstallDir
  New-Item -ItemType Directory -Force -Path $Parent | Out-Null

  if (Test-Path (Join-Path $InstallDir ".git")) {
    Write-Step "正在更新 ccli。"
    git -C $InstallDir fetch --prune origin
    git -C $InstallDir checkout $Ref
    try { git -C $InstallDir pull --ff-only origin $Ref } catch {}
    return
  }

  if (Test-Path $InstallDir) {
    Stop-Install "$InstallDir 已存在但不是 git 仓库。请移走后重试。"
  }

  Write-Step "正在下载 ccli。"
  git clone --depth 1 --branch $Ref $RepoUrl $InstallDir
}

function Build-Cli {
  Write-Step "正在安装依赖。"
  pnpm -C $InstallDir install --frozen-lockfile
  Write-Step "正在构建 ccli。"
  pnpm -C $InstallDir build
}

function Write-Shim {
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $CmdPath = Join-Path $BinDir "ccli.cmd"
  $CliPath = Join-Path $InstallDir "apps\cli\dist\index.js"
  "@echo off`r`nnode `"$CliPath`" %*`r`n" | Set-Content -Encoding ASCII -Path $CmdPath
}

Require-Command "git"
Test-NodeVersion
Ensure-Pnpm
Checkout-Repo
Build-Cli
Write-Shim

Write-Step "ccli 已安装到 $InstallDir"
Write-Step "启动器已写入 $BinDir\ccli.cmd"

$PathParts = ($env:PATH -split ";") | Where-Object { $_ }
if ($PathParts -notcontains $BinDir) {
  Write-Step "提示：$BinDir 当前不在 PATH 中。可以执行："
  Write-Step "[Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$BinDir', 'User')"
}

Write-Step "验证命令：ccli --help"

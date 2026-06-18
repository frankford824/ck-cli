$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:CCLI_REPO_URL) { $env:CCLI_REPO_URL } else { "https://github.com/frankford824/ck-cli.git" }
$Ref = if ($env:CCLI_REF) { $env:CCLI_REF } else { "main" }
$InstallDir = if ($env:CCLI_HOME) { $env:CCLI_HOME } else { Join-Path $env:LOCALAPPDATA "ccli\ck-cli" }
$BinDir = if ($env:CCLI_BIN_DIR) { $env:CCLI_BIN_DIR } else { Join-Path $env:LOCALAPPDATA "ccli\bin" }
$PnpmVersion = if ($env:CCLI_PNPM_VERSION) { $env:CCLI_PNPM_VERSION } else { "10.27.0" }
$ArchiveUrl = if ($env:CCLI_ARCHIVE_URL) { $env:CCLI_ARCHIVE_URL } else { "" }

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
    Require-Command "git"
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
  if (Get-Command "git" -ErrorAction SilentlyContinue) {
    git clone --depth 1 --branch $Ref $RepoUrl $InstallDir
    return
  }

  Download-Archive
}

function Download-Archive {
  $Url = Resolve-ArchiveUrl
  $TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ccli-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
  try {
    $ZipPath = Join-Path $TempRoot "ccli.zip"
    Invoke-WebRequest -Uri $Url -OutFile $ZipPath
    Expand-Archive -Path $ZipPath -DestinationPath $TempRoot -Force
    $Extracted = Get-ChildItem -Path $TempRoot -Directory | Select-Object -First 1
    if (-not $Extracted) {
      Stop-Install "下载内容不完整，请稍后重试。"
    }
    Move-Item -Path $Extracted.FullName -Destination $InstallDir
  } finally {
    Remove-Item -Path $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Resolve-ArchiveUrl {
  if ($ArchiveUrl) {
    return $ArchiveUrl
  }

  $Normalized = $RepoUrl -replace "\.git$", ""
  if ($Normalized -match "^git@github\.com:(.+)$") {
    $Normalized = "https://github.com/$($Matches[1])"
  }

  if ($Normalized -notmatch "^https://github\.com/") {
    Stop-Install "当前电脑没有 Git，自定义下载来源需要设置 CCLI_ARCHIVE_URL。"
  }

  return "$Normalized/archive/refs/heads/$Ref.zip"
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

function Show-SuccessCard {
  $CliPath = Join-Path $InstallDir "apps\cli\dist\index.js"
  try {
    node $CliPath installed
  } catch {
    Write-Step "安装完成。现在可以直接输入 ccli 打开开箱首页。"
  }
}

Test-NodeVersion
Ensure-Pnpm
Checkout-Repo
Build-Cli
Write-Shim

Write-Step ""
Show-SuccessCard

$PathParts = ($env:PATH -split ";") | Where-Object { $_ }
if ($PathParts -notcontains $BinDir) {
  Write-Step ""
  Write-Step "还差一步：当前终端还找不到 ccli。可以执行："
  Write-Step "[Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$BinDir', 'User')"
  Write-Step "然后重新打开终端，输入：ccli"
}

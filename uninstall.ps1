$ErrorActionPreference = "Stop"

$InstallDir = if ($env:CCLI_HOME) { $env:CCLI_HOME } else { Join-Path $env:LOCALAPPDATA "ccli\ck-cli" }
$BinDir = if ($env:CCLI_BIN_DIR) { $env:CCLI_BIN_DIR } else { Join-Path $env:LOCALAPPDATA "ccli\bin" }
$CmdPath = Join-Path $BinDir "ccli.cmd"

if (Test-Path $CmdPath) {
  Remove-Item -Force $CmdPath
}

if (Test-Path $InstallDir) {
  Remove-Item -Recurse -Force $InstallDir
}

Write-Host "ccli 已卸载。"

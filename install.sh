#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${CCLI_REPO_URL:-https://github.com/frankford824/ck-cli.git}"
REF="${CCLI_REF:-main}"
INSTALL_DIR="${CCLI_HOME:-$HOME/.ccli/ck-cli}"
BIN_DIR="${CCLI_BIN_DIR:-$HOME/.local/bin}"
PNPM_VERSION="${CCLI_PNPM_VERSION:-10.27.0}"

log() {
  printf '%s\n' "$1"
}

fail() {
  printf '安装失败：%s\n' "$1" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少 $1，请先安装后重试。"
}

check_node() {
  need_command node
  node -e 'const major = Number(process.versions.node.split(".")[0]); if (major < 20) process.exit(1)' \
    || fail "需要 Node.js 20 或更高版本。"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return
  fi

  if command -v corepack >/dev/null 2>&1; then
    log "正在启用 pnpm。"
    corepack enable >/dev/null 2>&1 || true
    corepack prepare "pnpm@${PNPM_VERSION}" --activate >/dev/null 2>&1 || true
  fi

  if command -v pnpm >/dev/null 2>&1; then
    return
  fi

  if command -v npm >/dev/null 2>&1; then
    log "正在安装 pnpm。"
    npm install -g "pnpm@${PNPM_VERSION}" >/dev/null
  fi

  command -v pnpm >/dev/null 2>&1 || fail "无法自动安装 pnpm，请手动安装 pnpm 后重试。"
}

checkout_repo() {
  mkdir -p "$(dirname "$INSTALL_DIR")"

  if [ -d "$INSTALL_DIR/.git" ]; then
    log "正在更新 ccli。"
    git -C "$INSTALL_DIR" fetch --prune origin
    git -C "$INSTALL_DIR" checkout "$REF"
    git -C "$INSTALL_DIR" pull --ff-only origin "$REF" || true
    return
  fi

  if [ -e "$INSTALL_DIR" ]; then
    fail "$INSTALL_DIR 已存在但不是 git 仓库。请移走后重试。"
  fi

  log "正在下载 ccli。"
  git clone --depth 1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR"
}

build_cli() {
  log "正在安装依赖。"
  pnpm -C "$INSTALL_DIR" install --frozen-lockfile
  log "正在构建 ccli。"
  pnpm -C "$INSTALL_DIR" build
}

write_shim() {
  mkdir -p "$BIN_DIR"
  cat >"$BIN_DIR/ccli" <<EOF
#!/usr/bin/env sh
exec node "$INSTALL_DIR/apps/cli/dist/index.js" "\$@"
EOF
  chmod +x "$BIN_DIR/ccli"
}

show_success_card() {
  node "$INSTALL_DIR/apps/cli/dist/index.js" installed || {
    log "安装完成。现在可以直接输入 ccli 打开开箱首页。"
  }
}

main() {
  need_command git
  check_node
  ensure_pnpm
  checkout_repo
  build_cli
  write_shim

  log ""
  show_success_card
  if ! printf '%s' ":$PATH:" | grep -Fq ":$BIN_DIR:"; then
    log ""
    log "还差一步：当前终端还找不到 ccli。可以执行："
    log "  export PATH=\"$BIN_DIR:\$PATH\""
    log "然后输入：ccli"
  fi
}

main "$@"

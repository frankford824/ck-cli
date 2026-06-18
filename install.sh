#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${CCLI_REPO_URL:-https://github.com/frankford824/ck-cli.git}"
REF="${CCLI_REF:-main}"
INSTALL_DIR="${CCLI_HOME:-$HOME/.ccli/ck-cli}"
BIN_DIR="${CCLI_BIN_DIR:-$HOME/.local/bin}"
PNPM_VERSION="${CCLI_PNPM_VERSION:-10.27.0}"
NODE_MAJOR="${CCLI_NODE_MAJOR:-22}"
NODE_DIR="${CCLI_NODE_HOME:-$HOME/.ccli/node-v${NODE_MAJOR}}"
NODE_CMD="node"

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

node_ready() {
  command -v "$1" >/dev/null 2>&1 || return 1
  "$1" -e 'const major = Number(process.versions.node.split(".")[0]); if (major < 20) process.exit(1)' >/dev/null 2>&1
}

ensure_node() {
  if node_ready node; then
    NODE_CMD="$(command -v node)"
    return
  fi

  if [ -x "$NODE_DIR/bin/node" ] && node_ready "$NODE_DIR/bin/node"; then
    NODE_CMD="$NODE_DIR/bin/node"
    export PATH="$NODE_DIR/bin:$PATH"
    return
  fi

  log "正在准备 ccli 运行环境。"
  install_node_runtime
  NODE_CMD="$NODE_DIR/bin/node"
  export PATH="$NODE_DIR/bin:$PATH"
  node_ready "$NODE_CMD" || fail "无法准备 ccli 运行环境，请安装 Node.js 20 或更高版本后重试。"
}

install_node_runtime() {
  mkdir -p "$(dirname "$NODE_DIR")"
  rm -rf "$NODE_DIR"

  if command -v curl >/dev/null 2>&1; then
    downloader="curl -fsSL"
  elif command -v wget >/dev/null 2>&1; then
    downloader="wget -qO-"
  else
    fail "当前电脑缺少下载工具。请安装 curl 或 wget 后重试。"
  fi

  node_base_url="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  node_platform="$(node_platform)"
  node_file="$($downloader "$node_base_url/SHASUMS256.txt" | awk -v platform="$node_platform" '$2 ~ ("-" platform "\\.(tar\\.xz|tar\\.gz)$") { print $2; exit }')"
  [ -n "$node_file" ] || fail "没有找到适合当前电脑的 Node.js 安装包。"

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT
  archive_path="$tmp_dir/$node_file"
  $downloader "$node_base_url/$node_file" >"$archive_path"
  case "$node_file" in
    *.tar.xz)
      tar -xJf "$archive_path" -C "$tmp_dir" || fail "无法解压 ccli 运行环境。"
      ;;
    *.tar.gz)
      tar -xzf "$archive_path" -C "$tmp_dir" || fail "无法解压 ccli 运行环境。"
      ;;
    *)
      fail "不支持的 ccli 运行环境安装包。"
      ;;
  esac

  extracted="$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [ -n "$extracted" ] || fail "ccli 运行环境下载内容不完整，请稍后重试。"
  mv "$extracted" "$NODE_DIR"
}

node_platform() {
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64)
      arch="x64"
      ;;
    arm64|aarch64)
      arch="arm64"
      ;;
    *)
      fail "暂不支持当前电脑架构：$arch。"
      ;;
  esac

  case "$os" in
    Linux)
      printf 'linux-%s\n' "$arch"
      ;;
    Darwin)
      printf 'darwin-%s\n' "$arch"
      ;;
    *)
      fail "暂不支持当前系统：$os。"
      ;;
  esac
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
    need_command git
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
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR"
    return
  fi

  download_archive
}

download_archive() {
  need_command tar
  if command -v curl >/dev/null 2>&1; then
    downloader="curl -fsSL"
  elif command -v wget >/dev/null 2>&1; then
    downloader="wget -qO-"
  else
    fail "当前电脑缺少下载工具。请安装 curl 或 wget 后重试。"
  fi

  archive_url="$(archive_url)"
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT
  $downloader "$archive_url" | tar -xz -C "$tmp_dir"
  extracted="$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [ -n "$extracted" ] || fail "下载内容不完整，请稍后重试。"
  mv "$extracted" "$INSTALL_DIR"
}

archive_url() {
  if [ -n "${CCLI_ARCHIVE_URL:-}" ]; then
    printf '%s\n' "$CCLI_ARCHIVE_URL"
    return
  fi

  normalized="${REPO_URL%.git}"
  case "$normalized" in
    git@github.com:*)
      normalized="https://github.com/${normalized#git@github.com:}"
      ;;
  esac

  case "$normalized" in
    https://github.com/*)
      printf '%s/archive/refs/heads/%s.tar.gz\n' "$normalized" "$REF"
      ;;
    *)
      fail "当前电脑没有 Git，自定义下载来源需要设置 CCLI_ARCHIVE_URL。"
      ;;
  esac
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
exec "$NODE_CMD" "$INSTALL_DIR/apps/cli/dist/index.js" "\$@"
EOF
  chmod +x "$BIN_DIR/ccli"
}

show_success_card() {
  "$NODE_CMD" "$INSTALL_DIR/apps/cli/dist/index.js" installed || {
    log "安装完成。现在可以直接输入 ccli 打开开箱首页。"
  }
}

main() {
  ensure_node
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

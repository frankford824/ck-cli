#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${CCLI_HOME:-$HOME/.ccli/ck-cli}"
BIN_DIR="${CCLI_BIN_DIR:-$HOME/.local/bin}"

rm -f "$BIN_DIR/ccli"
rm -rf "$INSTALL_DIR"

printf '%s\n' "ccli 已卸载。"

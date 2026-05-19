#!/usr/bin/env bash
# .specify/setup.sh — TDK thin bootstrap
# Installs prerequisites (git, jq, yq, bun) then delegates to setup.ts.
set -euo pipefail

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      echo "Usage: bash .specify/setup.sh [--skip-venv] [--skip-config] [--skip-plugins] [--force] [--help]"
      echo "Bootstrap installs prerequisites then delegates to setup.ts for steps 2-5."
      exit 0 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;  Darwin*) echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;  *) echo "unknown" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;  aarch64|arm64) echo "arm64" ;;
    *) echo "$(uname -m)" ;;
  esac
}

auto_install_jq() {
  local os="$1"
  echo -e "  ${CYAN}→ Installing jq...${NC}"
  case "$os" in
    linux)  sudo apt-get update -qq && sudo apt-get install -y -qq jq ;;
    macos)  brew install jq ;;
    *)      echo -e "  ${RED}✗ Auto-install not supported. Install: https://jqlang.github.io/jq/download/${NC}"; return 1 ;;
  esac
}

auto_install_yq() {
  local os="$1" arch="$2"
  echo -e "  ${CYAN}→ Installing yq...${NC}"
  local yq_os="linux"; [[ "$os" == "macos" ]] && yq_os="darwin"
  sudo wget -qO /usr/local/bin/yq "https://github.com/mikefarah/yq/releases/latest/download/yq_${yq_os}_${arch}" \
    && sudo chmod +x /usr/local/bin/yq
}

auto_install_bun() {
  echo -e "  ${CYAN}→ Installing bun...${NC}"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
}

OS="$(detect_os)"; ARCH="$(detect_arch)"
command -v git &>/dev/null || { echo -e "${RED}✗ git required. Install: https://git-scm.com${NC}"; exit 1; }

if [[ "$OS" == "windows" ]]; then
  command -v jq &>/dev/null || { echo -e "${RED}✗ jq required. Install: https://jqlang.github.io/jq/download/${NC}"; exit 1; }
  command -v yq &>/dev/null || { echo -e "${RED}✗ yq required. Install: https://github.com/mikefarah/yq#install${NC}"; exit 1; }
else
  command -v jq &>/dev/null || auto_install_jq "$OS" || exit 1
  command -v yq &>/dev/null || auto_install_yq "$OS" "$ARCH" || exit 1
fi
command -v bun &>/dev/null || auto_install_bun || exit 1
echo -e "${GREEN}✓ Prerequisites OK${NC}"

TS_DIR="$SCRIPT_DIR/scripts/ts"
if [[ -f "$TS_DIR/package.json" ]]; then
  (cd "$TS_DIR" && bun install --frozen-lockfile 2>&1) || (cd "$TS_DIR" && bun install --no-save 2>&1) || {
    echo -e "${RED}✗ bun install failed${NC}"; exit 1;
  }
fi

exec bun "$SCRIPT_DIR/scripts/ts/src/commands/setup/setup.ts" "$@"

#!/usr/bin/env bash
# .specify/setup.sh — TDK thin bootstrap
# Installs prerequisites (git, bun) then delegates to setup.ts.
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

auto_install_bun() {
  echo -e "  ${CYAN}→ Installing bun...${NC}"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
}

command -v git &>/dev/null || { echo -e "${RED}✗ git required. Install: https://git-scm.com${NC}"; exit 1; }
command -v bun &>/dev/null || auto_install_bun || exit 1
echo -e "${GREEN}✓ Prerequisites OK${NC}"

TS_DIR="$SCRIPT_DIR/scripts/ts"
if [[ -f "$TS_DIR/package.json" ]]; then
  (cd "$TS_DIR" && bun install --frozen-lockfile 2>&1) || (cd "$TS_DIR" && bun install --no-save 2>&1) || {
    echo -e "${RED}✗ bun install failed${NC}"; exit 1;
  }
fi

exec bun "$SCRIPT_DIR/scripts/ts/src/commands/setup/setup.ts" "$@"

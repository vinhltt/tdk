#!/usr/bin/env bash
# bootstrap.sh — prepare a TDK source checkout.
#
# Installs a repo-pinned Bun into $REPO_ROOT/.tdk/bun and runs a frozen install
# in both source packages. Nothing outside this checkout is read or written:
# ~/.bun, shell profiles, and the user-global Bun cache are never touched.
#
# This file must stay PARSEABLE under Bash 3.2 so the version gate below can
# print on shells too old to run distribute.sh. Do not introduce declare -A,
# ${v^^}, ${v,,}, mapfile, readarray, &>>, [[ -v ]], negative array indices,
# ;;& or namerefs here.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUN_DIR="$REPO_ROOT/.tdk/bun"
BUN_BIN="$BUN_DIR/bin/bun"
INSTALLER_HOME="$REPO_ROOT/.tdk/installer-home"
PIN_FILE="$REPO_ROOT/.bun-version"
INSTALLER_URL="https://bun.sh/install"
INSTALLER_TIMEOUT=300
PROBE_TIMEOUT=30
PACKAGES=".specify/scripts/ts packages/tdk-setup"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
ASSUME_YES=0

die() { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }
step() { echo -e "${CYAN}→ $*${NC}"; }

usage() {
  echo "Usage:"
  echo "  bash bootstrap.sh          Prepare this checkout (asks for consent)"
  echo "  bash bootstrap.sh --yes    Same, with non-interactive consent"
  echo "  bash bootstrap.sh --help   Show this message"
}

for arg in "$@"; do
  case "$arg" in
    --help|-h) usage; exit 0 ;;
    --yes|-y) ASSUME_YES=1 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

# distribute.sh uses namerefs and uppercase parameter expansion, so preparing a
# checkout this shell cannot then distribute would be worse than failing here.
if [ "${BASH_VERSINFO[0]}" -lt 4 ] || { [ "${BASH_VERSINFO[0]}" -eq 4 ] && [ "${BASH_VERSINFO[1]}" -lt 3 ]; }; then
  die "Bash 4.3+ required, found ${BASH_VERSION}.
  distribute.sh uses namerefs (local -n, Bash 4.3+) and uppercase parameter expansion (Bash 4.0+).
  Upgrade with your package manager, or 'brew install bash' on macOS, then re-run with the new shell."
fi

case "${OSTYPE:-}" in
  msys*|mingw*|cygwin*)
    die "Git Bash / MSYS is not supported. Install Bun manually from https://bun.sh/docs/installation, then run distribute.sh directly." ;;
esac

[ -f "$PIN_FILE" ] || die "Missing .bun-version at $PIN_FILE"
PIN="$(cat "$PIN_FILE")"
if ! [[ "$PIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  die "Invalid .bun-version: expected a single bare semver line such as 1.3.14"
fi

have() { command -v "$1" >/dev/null 2>&1; }
have curl || die "curl is required to fetch the Bun installer"
have unzip || die "unzip is required — the Bun installer extracts a zip archive"

TIMEOUT_BIN=""
if have timeout; then TIMEOUT_BIN="timeout"; elif have gtimeout; then TIMEOUT_BIN="gtimeout"; fi
[ -n "$TIMEOUT_BIN" ] || die "timeout or gtimeout is required (GNU coreutils) to bound the installer"

# distribute.sh hashes payload files; without one of these it cannot run.
have sha256sum || have shasum || die "sha256sum or shasum is required"

# ---------------------------------------------------------------------------
# Nothing above this line touches the network or writes a file. Keep it so.
# ---------------------------------------------------------------------------

if [ "$ASSUME_YES" -ne 1 ]; then
  [ -t 0 ] || die "Not an interactive shell. Re-run with --yes to consent non-interactively."
  echo "bootstrap.sh will:"
  echo "  1. Download and run the official Bun installer from $INSTALLER_URL"
  echo "     into $BUN_DIR."
  echo "     It is remote code that changes over time. No checksum or signature is verified;"
  echo "     only the version the installed binary reports is compared against $PIN."
  echo "  2. Run 'bun install --frozen-lockfile' in $PACKAGES."
  echo "     Both fetch from the npm registry and may execute package lifecycle scripts."
  echo ""
  echo "Your ~/.bun, shell profiles, and global Bun cache are not read or written."
  printf 'Proceed? [y/N] '
  if ! read -r reply; then die "Aborted."; fi
  case "$reply" in
    y|Y|yes|Yes|YES) ;;
    *) die "Aborted." ;;
  esac
fi

bun_version() {
  "$TIMEOUT_BIN" "$PROBE_TIMEOUT" "$BUN_BIN" --version 2>/dev/null || echo "unknown"
}

# Two states only: present and at the pin, or reacquire. A mismatched, corrupt,
# or unprobeable binary is our own directory, so discarding it harms nothing and
# needs no second prompt.
if [ -x "$BUN_BIN" ] && [ "$(bun_version)" = "$PIN" ]; then
  step "Reusing repo-local Bun $PIN"
else
  step "Installing Bun $PIN into $BUN_DIR"
  rm -rf "$BUN_DIR" "$INSTALLER_HOME"
  mkdir -p "$INSTALLER_HOME"
  # The installer appends to shell profiles chosen from $HOME, $SHELL and
  # $XDG_CONFIG_HOME, and caches under $BUN_INSTALL. All four are redirected
  # into this checkout, and the whole installer is bounded because its own
  # nested archive download is not covered by curl's --max-time.
  curl -fsSL --max-time 60 "$INSTALLER_URL" \
    | HOME="$INSTALLER_HOME" SHELL=/bin/sh XDG_CONFIG_HOME="$INSTALLER_HOME/.config" BUN_INSTALL="$BUN_DIR" \
      "$TIMEOUT_BIN" "$INSTALLER_TIMEOUT" bash -s "bun-v$PIN" \
    || die "Bun installer failed. Remove and retry: rm -rf .tdk/bun && bash bootstrap.sh"
  rm -rf "$INSTALLER_HOME"

  actual="$(bun_version)"
  if [ ! -x "$BUN_BIN" ] || [ "$actual" != "$PIN" ]; then
    die "Bun installation could not be confirmed.
  destination: $BUN_DIR
  expected:    $PIN
  actual:      $actual
  Remove and retry: rm -rf .tdk/bun && bash bootstrap.sh"
  fi
fi

# Exported so both installs keep their package cache under .tdk/bun/install/cache
# instead of the user-global ~/.bun.
export BUN_INSTALL="$BUN_DIR"

pending="$PACKAGES"
for package in $PACKAGES; do
  pending="${pending#$package}"
  step "bun install --frozen-lockfile ($package)"
  if ! ( cd "$REPO_ROOT/$package" && "$BUN_BIN" install --frozen-lockfile ); then
    # Never report an unreached package as successful or skipped-ok.
    for skipped in $pending; do echo "  $skipped: not attempted" >&2; done
    die "Dependency install failed in $package. Fix the reported error and re-run bash bootstrap.sh"
  fi
done

echo -e "${GREEN}✓ Checkout ready${NC}"
echo ""
echo "Export the repo-local runtime, then distribute:"
echo "  export TDK_ROOT=\"$REPO_ROOT\""
echo "  export BUN_INSTALL=\"\$TDK_ROOT/.tdk/bun\""
echo "  export PATH=\"\$BUN_INSTALL/bin:\$PATH\""
echo "  bash \"\$TDK_ROOT/distribute.sh\" <target-project>"

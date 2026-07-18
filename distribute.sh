#!/usr/bin/env bash
# distribute.sh — Distribute/update TDK from source to a target project
#
# One-way sync of root-relative paths from distribute.json to a target project.
# Explicit harness mutation should use `bun src/index.ts install <target> --harness claude`
# from the tdk-setup package (packages/tdk-setup).
# Uses distribute.json include/exclude rules.
# Compares files by release manifest when available. Prefix/force modes use
# rendered/full classification but retain manifest-backed ownership proof.
# Always shows dry-run summary first, then asks for confirmation before writing.
#
# Usage:
#   bash distribute.sh [target-project-path] [OPTIONS]
#
# If no target path is given, the script will prompt interactively.
#
# OPTIONS:
#   --dry-run         Show diff only, skip confirmation and writing
#   --yes             Skip confirmation prompt (auto-approve)
#   --prefix PREFIX   Brand safe .specify payload text (example: sample -> sample-/SAMPLE)
#   --force           Refresh checksum-proven managed files (skip MD5 comparison)
#   --no-delete       Skip orphan removal (don't delete files missing from source)
#   --yes-delete      Auto-approve file deletions (skip 'type delete' prompt)
#   --log-file PATH   Tee all output to a file (ANSI colors stripped in file)
#   --help            Show this help message
#
# Examples:
#   bash distribute.sh                                      # interactive
#   bash distribute.sh /path/to/my-project                  # sync paths from distribute.json
#   bash distribute.sh /path/to/my-project --dry-run        # preview changes
#   bash distribute.sh /path/to/my-project --prefix sample --dry-run
#   # Then run tdk-setup install with the same prefix for .claude/.codex harness output

set -euo pipefail
# ERR trap: only fires on unexpected failures (not inside || && if contexts per bash spec)
trap 'echo -e "${RED:-}[$(date +%H:%M:%S)] ERROR (exit $?) at line $LINENO: $BASH_COMMAND${NC:-}" >&2' ERR

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ─── Logging ─────────────────────────────────────────────────────────────────
LOG_FILE=""
ts() { printf "[%s] " "$(date +%H:%M:%S)"; }
log() { ts; echo -e "$@"; }
log_dim() { ts; echo -e "${DIM}$*${NC}"; }

# ─── Defaults ─────────────────────────────────────────────────────────────────
DRY_RUN=false
AUTO_YES=false
FORCE=false
NO_DELETE=false
AUTO_YES_DELETE=false
TARGET_PATH=""
BRAND_PREFIX=""
BRAND_WORD=""
BRAND_WORD_UPPER=""
SOURCE_PREFIX="tdk-"

normalize_prefix() {
    local value="$1"
    [[ "$value" != *- ]] && value="$value-"
    if [[ ! "$value" =~ ^[a-z0-9][a-z0-9-]*-$ ]]; then
        echo -e "${RED}Invalid --prefix value: $1${NC}" >&2
        echo -e "${RED}Use lowercase letters, numbers, and hyphens only, for example: sample or sample-${NC}" >&2
        return 1
    fi
    printf '%s' "$value"
}

# ─── Args ─────────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)      DRY_RUN=true ;;
        --yes|-y)       AUTO_YES=true ;;
        --prefix)
            shift
            BRAND_PREFIX="${1:-}"
            if [[ -z "$BRAND_PREFIX" ]]; then
                echo -e "${RED}--prefix requires a value${NC}" >&2
                exit 1
            fi
            ;;
        --prefix=*)
            BRAND_PREFIX="${1#*=}"
            if [[ -z "$BRAND_PREFIX" ]]; then
                echo -e "${RED}--prefix requires a value${NC}" >&2
                exit 1
            fi
            ;;
        --force)        FORCE=true ;;
        --no-delete)    NO_DELETE=true ;;
        --yes-delete)   AUTO_YES_DELETE=true ;;
        --log-file)
            shift
            LOG_FILE="${1:-}"
            if [[ -z "$LOG_FILE" ]]; then
                echo -e "${RED}--log-file requires a path argument${NC}" >&2
                exit 1
            fi
            ;;
        --help|-h)
            sed -n '2,/^$/{ s/^# //; s/^#$//; p }' "$0"
            exit 0
            ;;
        -*)
            echo -e "${RED}Unknown option: $1${NC}" >&2
            exit 1
            ;;
        *)
            if [[ -z "$TARGET_PATH" ]]; then
                TARGET_PATH="$1"
            else
                echo -e "${RED}Unexpected argument: $1${NC}" >&2
                exit 1
            fi
            ;;
    esac
    shift
done

if [[ -n "$BRAND_PREFIX" ]]; then
    if ! BRAND_PREFIX="$(normalize_prefix "$BRAND_PREFIX")"; then
        exit 1
    fi
    BRAND_WORD="${BRAND_PREFIX%-}"
    BRAND_WORD_UPPER="${BRAND_WORD^^}"
fi

# ─── Log file tee setup ─────────────────────────────────────────────────────
if [[ -n "$LOG_FILE" ]]; then
    exec > >(tee >(sed -e 's/\x1b\[[0-9;]*[a-zA-Z]//g' -e 's/\r[^\n]*\r//g' -e 's/\r//g' >> "$LOG_FILE")) 2>&1
    log_dim "Logging to: $LOG_FILE"
fi

# ─── Interactive prompt if no target path ─────────────────────────────────────
if [[ -z "$TARGET_PATH" ]]; then
    while true; do
        echo -e "${BOLD}${CYAN}TDK Distribute${NC}"
        echo ""
        read -r -p "$(echo -e "${WHITE}Enter target project path (or 'q' to quit): ${NC}")" TARGET_PATH

        if [[ "$TARGET_PATH" == "q" || "$TARGET_PATH" == "quit" || "$TARGET_PATH" == "exit" ]]; then
            echo "Cancelled."
            exit 0
        fi
        if [[ -z "$TARGET_PATH" ]]; then
            echo -e "${RED}Path cannot be empty.${NC}"
            echo ""
            continue
        fi
        if [[ ! -d "$TARGET_PATH" ]]; then
            echo -e "${RED}Directory not found: $TARGET_PATH${NC}"
            echo ""
            TARGET_PATH=""
            continue
        fi
        break
    done
fi

# ─── Resolve paths ───────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$SCRIPT_DIR"
SOURCE_SPECIFY="$SOURCE_ROOT/.specify"

DISTRIBUTE_CONFIG="$SOURCE_ROOT/distribute.json"
RELEASE_MANIFEST_REL=".specify/release-manifest.json"
SOURCE_RELEASE_MANIFEST="$SOURCE_ROOT/$RELEASE_MANIFEST_REL"
DIFF_RELEASE_MANIFESTS_TS_SCRIPT="$SOURCE_ROOT/.claude/skills/tdk-bump/scripts/diff-release-manifests.ts"

if [[ ! -d "$SOURCE_SPECIFY" ]]; then
    echo -e "${RED}Error: source .specify/ not found at $SOURCE_SPECIFY${NC}" >&2
    exit 1
fi

TARGET_ROOT="$(cd "$TARGET_PATH" 2>/dev/null && pwd || echo "$TARGET_PATH")"

if [[ ! -d "$TARGET_ROOT" ]]; then
    echo -e "${RED}Error: target directory not found: $TARGET_ROOT${NC}" >&2
    exit 1
fi

TARGET_RELEASE_MANIFEST="$TARGET_ROOT/$RELEASE_MANIFEST_REL"

PYTHON_BIN=""
RENDER_TMP_DIR=""
if [[ -n "$BRAND_PREFIX" ]]; then
    PYTHON_BIN="$(command -v python3 2>/dev/null || true)"
    if [[ -z "$PYTHON_BIN" ]]; then
        echo -e "${RED}Error: --prefix requires python3 for payload text rewrite${NC}" >&2
        exit 1
    fi
    RENDER_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tdk-distribute.XXXXXX")"
    trap '[[ -n "${RENDER_TMP_DIR:-}" && -d "$RENDER_TMP_DIR" ]] && rm -rf "$RENDER_TMP_DIR"' EXIT
fi

# ─── Tool detection ──────────────────────────────────────────────────────────
log_dim "MD5 tool: $(command -v md5sum 2>/dev/null || command -v md5 2>/dev/null || echo 'python fallback')"
log_dim "JSON parser: $(command -v bun 2>/dev/null || command -v node 2>/dev/null || command -v python3 2>/dev/null || command -v python 2>/dev/null || echo 'not found')"

# ─── Interactive option prompts (TTY only) ───────────────────────────────────
is_interactive() { [[ -t 0 ]]; }

if is_interactive; then
    if ! $FORCE; then
        read -r -p "$(echo -e "${WHITE}Force refresh checksum-proven managed files? [y/N]: ${NC}")" ans
        [[ "$ans" == [yY]* ]] && FORCE=true
    fi
fi

scope_description() {
    printf "paths from distribute.json"
}

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║              TDK Distribute                       ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${WHITE}Source:${NC}  $SOURCE_ROOT"
echo -e "  ${WHITE}Target:${NC}  $TARGET_ROOT"
echo -e "  ${WHITE}Scope:${NC}   $(scope_description)"
if [[ -n "$BRAND_PREFIX" ]]; then
    echo -e "  ${WHITE}Next:${NC}    cd \"$SOURCE_ROOT/packages/tdk-setup\" && bun src/index.ts install \"$TARGET_ROOT\" --harness claude --all-plugins --prefix $BRAND_WORD --dry-run"
else
    echo -e "  ${WHITE}Next:${NC}    cd \"$SOURCE_ROOT/packages/tdk-setup\" && bun src/index.ts install \"$TARGET_ROOT\" --harness claude --plugins tdk-core --dry-run"
fi
if [[ -n "$BRAND_PREFIX" ]]; then
    echo -e "  ${WHITE}Brand:${NC}   safe .specify payload text tdk-/tdk/TDK -> $BRAND_PREFIX/$BRAND_WORD/$BRAND_WORD_UPPER"
    echo -e "  ${DIM}         plugins/, codex-plugins/, schemas/, tests, and filename/path refs stay source-identical${NC}"
fi
$FORCE && echo -e "  ${YELLOW}Mode:    --force (refresh checksum-proven managed files)${NC}"
$NO_DELETE && echo -e "  ${YELLOW}Mode:    --no-delete (skip orphan removal)${NC}"
echo ""

DISTRIBUTE_INCLUDES=()
DISTRIBUTE_EXCLUDES=()

read_json_array() {
    local config_file="$1" query_path="$2"
    local js='
const fs = require("fs");
const configFile = process.argv[1];
const queryPath = process.argv[2];
const data = JSON.parse(fs.readFileSync(configFile, "utf8"));
let value = data;
for (const part of queryPath.split(".")) {
  value = value?.[part];
}
if (!Array.isArray(value)) {
  console.error(`Missing array in ${configFile}: ${queryPath}`);
  process.exit(2);
}
for (const entry of value) {
  if (typeof entry !== "string" || entry.length === 0) {
    console.error(`Invalid array entry in ${configFile}: ${queryPath}`);
    process.exit(3);
  }
  console.log(entry);
}
'
    if command -v bun &>/dev/null; then
        bun -e "$js" "$config_file" "$query_path"
    elif command -v node &>/dev/null; then
        node -e "$js" "$config_file" "$query_path"
    elif command -v python3 &>/dev/null; then
        python3 - "$config_file" "$query_path" <<'PY'
import json
import sys

config_file, query_path = sys.argv[1], sys.argv[2]
with open(config_file, "r", encoding="utf-8") as handle:
    value = json.load(handle)
for part in query_path.split("."):
    value = value.get(part) if isinstance(value, dict) else None
if not isinstance(value, list):
    print(f"Missing array in {config_file}: {query_path}", file=sys.stderr)
    sys.exit(2)
for entry in value:
    if not isinstance(entry, str) or not entry:
        print(f"Invalid array entry in {config_file}: {query_path}", file=sys.stderr)
        sys.exit(3)
    print(entry)
PY
    elif command -v python &>/dev/null; then
        python - "$config_file" "$query_path" <<'PY'
import json
import sys

config_file, query_path = sys.argv[1], sys.argv[2]
with open(config_file, "r") as handle:
    value = json.load(handle)
for part in query_path.split("."):
    value = value.get(part) if isinstance(value, dict) else None
if not isinstance(value, list):
    print("Missing array in %s: %s" % (config_file, query_path), file=sys.stderr)
    sys.exit(2)
for entry in value:
    if not isinstance(entry, str) or not entry:
        print("Invalid array entry in %s: %s" % (config_file, query_path), file=sys.stderr)
        sys.exit(3)
    print(entry)
PY
    else
        echo "Error: distribute.json requires bun, node, python3, or python for parsing" >&2
        return 127
    fi
}

load_json_array() {
    local array_name="$1" query_path="$2" output line
    local -n target_array="$array_name"

    if ! output="$(read_json_array "$DISTRIBUTE_CONFIG" "$query_path")"; then
        echo -e "${RED}Error: failed to read $query_path from $DISTRIBUTE_CONFIG${NC}" >&2
        exit 1
    fi

    target_array=()
    while IFS= read -r line; do
        [[ -n "$line" ]] && target_array+=("$line")
    done <<< "$output"
    return 0
}

if [[ ! -f "$DISTRIBUTE_CONFIG" ]]; then
    echo -e "${RED}Error: distribute config not found: $DISTRIBUTE_CONFIG${NC}" >&2
    exit 1
fi

log_dim "Reading distribute.json..."
load_json_array DISTRIBUTE_INCLUDES "ship"
load_json_array DISTRIBUTE_EXCLUDES "doNotShip"

log_dim "  Config: $DISTRIBUTE_CONFIG"
log_dim "  ship: ${DISTRIBUTE_INCLUDES[*]}"
log_dim "  do-not-ship: ${DISTRIBUTE_EXCLUDES[*]}"

echo ""

if [[ ! -f "$SOURCE_RELEASE_MANIFEST" ]]; then
    echo -e "${RED}Error: source release manifest not found: $SOURCE_RELEASE_MANIFEST${NC}" >&2
    echo -e "${RED}Run: bun .claude/skills/tdk-bump/scripts/generate-release-manifest.ts --project-root \"$SOURCE_ROOT\" --write${NC}" >&2
    exit 1
fi

# ─── Utility: cross-platform MD5 ─────────────────────────────────────────────
file_md5() {
    local result
    if command -v md5sum &>/dev/null; then
        result=$(md5sum "$1" | cut -d' ' -f1)
    elif command -v md5 &>/dev/null; then
        result=$(md5 -q "$1")
    else
        result=$(python3 -c "import hashlib; print(hashlib.md5(open(r'$1','rb').read()).hexdigest())" 2>/dev/null) || \
        result=$(python  -c "import hashlib; print(hashlib.md5(open(r'$1','rb').read()).hexdigest())" 2>/dev/null) || {
            echo -e "${RED}[$(date +%H:%M:%S)] ERROR: No MD5 tool available for: $1${NC}" >&2
            echo "ERROR"
            return 1
        }
    fi
    echo "$result"
}

file_sha256() {
    local result
    if command -v sha256sum &>/dev/null; then
        result=$(sha256sum "$1" | cut -d' ' -f1)
    elif command -v shasum &>/dev/null; then
        result=$(shasum -a 256 "$1" | cut -d' ' -f1)
    else
        result=$(python3 -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$1" 2>/dev/null) || \
        result=$(python -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$1" 2>/dev/null) || {
            echo -e "${RED}Error: no SHA-256 tool available for: $1${NC}" >&2
            return 1
        }
    fi
    printf '%s\n' "$result"
}

assert_safe_target_path() {
    local rel="$1" current="$TARGET_ROOT" segment
    local -a path_segments=()
    if [[ -z "$rel" || "$rel" == /* || "$rel" == *\\* || "$rel" == *//* ]]; then
        echo -e "${RED}Error: invalid release manifest path: $rel${NC}" >&2
        return 1
    fi
    IFS='/' read -r -a path_segments <<< "$rel"
    for segment in "${path_segments[@]}"; do
        if [[ -z "$segment" || "$segment" == "." || "$segment" == ".." ]]; then
            echo -e "${RED}Error: invalid release manifest path: $rel${NC}" >&2
            return 1
        fi
        current="$current/$segment"
        if [[ -L "$current" ]]; then
            echo -e "${RED}Error: release manifest path has symlink component: $rel${NC}" >&2
            return 1
        fi
    done
    case "$current" in
        "$TARGET_ROOT"/*) return 0 ;;
        *)
            echo -e "${RED}Error: release manifest path escapes target root: $rel${NC}" >&2
            return 1
            ;;
    esac
}

declare -A TARGET_MANIFEST_SHA=()
MANIFEST_DIFF_DELETED=()
MANIFEST_DIFF_OUTPUT=""
TARGET_MANIFEST_SNAPSHOT_SHA=""

verify_target_preimage() {
    local rel="$1" expected_sha="$2" target_rel target actual_sha
    target_rel="$(target_relative_path "$SOURCE_ROOT" "$rel")"
    target="$TARGET_ROOT/$target_rel"
    assert_safe_target_path "$target_rel" || return 1
    if [[ -z "$expected_sha" || ! -f "$target" || -L "$target" ]]; then
        echo -e "${RED}Error: checksum proof failed for managed target: $rel${NC}" >&2
        return 1
    fi
    actual_sha="$(file_sha256 "$target")" || return 1
    if [[ "$actual_sha" != "$expected_sha" ]]; then
        echo -e "${RED}Error: checksum proof failed for managed target: $rel${NC}" >&2
        return 1
    fi
}

verify_new_target_absent() {
    local rel="$1" target_rel target
    target_rel="$(target_relative_path "$SOURCE_ROOT" "$rel")"
    target="$TARGET_ROOT/$target_rel"
    assert_safe_target_path "$target_rel" || return 1
    if [[ -e "$target" || -L "$target" ]]; then
        echo -e "${RED}Error: new managed target already exists without ownership proof: $rel${NC}" >&2
        return 1
    fi
}

preflight_distribution_mutations() {
    local rel
    for rel in "${SYNC_NEW[@]}"; do
        [[ "$rel" == "$RELEASE_MANIFEST_REL" ]] && continue
        if [[ -n "${TARGET_MANIFEST_SHA[$rel]:-}" ]]; then
            verify_target_preimage "$rel" "${TARGET_MANIFEST_SHA[$rel]}" || return 1
        else
            verify_new_target_absent "$rel" || return 1
        fi
    done
    for rel in "${SYNC_UPDATED[@]}"; do
        [[ "$rel" == "$RELEASE_MANIFEST_REL" ]] && continue
        verify_target_preimage "$rel" "${TARGET_MANIFEST_SHA[$rel]:-}" || return 1
    done
    for rel in "${SYNC_DELETED[@]}"; do
        verify_target_preimage "$rel" "${TARGET_MANIFEST_SHA[$rel]:-}" || return 1
    done
    for rel in "${SYNC_UNCHANGED[@]}"; do
        [[ "$rel" == "$RELEASE_MANIFEST_REL" ]] && continue
        [[ -z "${TARGET_MANIFEST_SHA[$rel]:-}" ]] || \
            verify_target_preimage "$rel" "${TARGET_MANIFEST_SHA[$rel]}" || return 1
    done
}

snapshot_target_release_manifest() {
    assert_safe_target_path "$RELEASE_MANIFEST_REL" || return 1
    if [[ -L "$TARGET_RELEASE_MANIFEST" || ! -f "$TARGET_RELEASE_MANIFEST" ]]; then
        echo -e "${RED}Error: target release manifest must be a regular non-symlink file${NC}" >&2
        return 1
    fi
    TARGET_MANIFEST_SNAPSHOT_SHA="$(file_sha256 "$TARGET_RELEASE_MANIFEST")" || return 1
}

has_payload_text_extension() {
    case "$1" in
        *.md|*.mdx|*.txt|*.json|*.yaml|*.yml|*.tpl|*.sh|*.svg|*.excalidraw) return 0 ;;
        *) return 1 ;;
    esac
}

has_scripts_ts_text_extension() {
    case "$1" in
        *.ts|*.json|*.md|*.txt|*.yaml|*.yml) return 0 ;;
        *) return 1 ;;
    esac
}

is_scripts_ts_rewrite_candidate() {
    local rel_path="$1"
    case "$rel_path" in
        scripts/ts/tests/*) return 1 ;;
        scripts/ts/*) has_scripts_ts_text_extension "$rel_path"; return ;;
        *) return 1 ;;
    esac
}

is_payload_rewrite_candidate() {
    local rel_path="$1"
    if is_scripts_ts_rewrite_candidate "$rel_path"; then
        return 0
    fi
    case "$rel_path" in
        setup.sh|CHANGELOG.md|.specify*.example) return 0 ;;
        plugins/*|codex-plugins/*|scripts/*|schemas/*) return 1 ;;
        docs/assets/*) has_payload_text_extension "$rel_path"; return ;;
        docs/*|templates/*|claude-rules/*) has_payload_text_extension "$rel_path"; return ;;
        *) return 1 ;;
    esac
}

should_rewrite_source_file() {
    local source_dir="$1" rel_path="$2"
    local specify_rel
    [[ -n "$BRAND_PREFIX" && "$source_dir" == "$SOURCE_ROOT" ]] || return 1
    case "$rel_path" in
        .specify/*) specify_rel="${rel_path#.specify/}" ;;
        *) return 1 ;;
    esac
    is_payload_rewrite_candidate "$specify_rel"
}

target_relative_path() {
    local source_dir="$1" rel_path="$2"
    printf '%s\n' "$rel_path"
}

payload_text_rewrite() {
    local source_file="$1"
    "$PYTHON_BIN" - "$SOURCE_PREFIX" "$BRAND_PREFIX" "$source_file" <<'PY'
import pathlib
import re
import sys

source_prefix = sys.argv[1]
target_prefix = sys.argv[2]
source_file = pathlib.Path(sys.argv[3])
source_brand = source_prefix[:-1] if source_prefix.endswith("-") else source_prefix
target_brand = target_prefix[:-1] if target_prefix.endswith("-") else target_prefix

text = source_file.read_text(encoding="utf-8")
protected = []

def protect(pattern):
    global text
    def replace(match):
        protected.append(match.group(0))
        return f"\ue000{len(protected) - 1}\ue001"
    text = re.sub(pattern, replace, text)

# These references point to plugin paths that distribute intentionally does not rename.
protect(r"\.specify/(?:codex-)?plugins/[^\s\"'`)\]}]+")
protect(r"\.specify/cache/tdk-[^\s\"'`)\]}]+")

# These references point to files/paths that distribute intentionally does not rename.
protect(r"(?:(?:\.{1,2}|[A-Za-z0-9_.-]+)/)+[^\s\"'`)\]}]*tdk-[^\s\"'`)\]}]*")
protect(r"(?:[A-Za-z0-9_.-]+/)*tdk-[^\s\"'`)\]}]+\.(?:md|mdx|png|svg|excalidraw|json|yaml|yml|tpl|ts|sh)")
protect(r"(['\"])" + re.escape(source_prefix) + r"[A-Za-z0-9_-]+\1(?=\s*:)")

def rewrite_anchor_fragment(fragment):
    if source_prefix and target_prefix:
        fragment = re.sub(
            r"(^|-)" + re.escape(source_prefix),
            lambda match: f"{match.group(1)}{target_prefix}",
            fragment,
        )
    if source_brand and target_brand:
        fragment = re.sub(
            r"(^|-)" + re.escape(source_brand.lower()) + r"(?=$|-)",
            lambda match: f"{match.group(1)}{target_brand.lower()}",
            fragment,
        )
        fragment = re.sub(
            r"(^|-)" + re.escape(source_brand.upper()) + r"(?=$|-)",
            lambda match: f"{match.group(1)}{target_brand.upper()}",
            fragment,
        )
    return fragment

def rewrite_markdown_link_fragment(match):
    return f"{match.group(1)}{rewrite_anchor_fragment(match.group(2))}{match.group(3)}"

text = re.sub(r"(\]\([^\s)]*#)([^)\s]+)(\))", rewrite_markdown_link_fragment, text)

text = re.sub(r"(?<![a-z0-9-])" + re.escape(source_prefix), target_prefix, text)
if source_brand and target_brand:
    text = re.sub(r"(?<![\w${-])" + re.escape(source_brand.lower()) + r"(?![\w-])", target_brand.lower(), text)
    text = re.sub(r"(?<![\w${-])" + re.escape(source_brand.upper()) + r"(?![\w-])", target_brand.upper(), text)

for index, value in enumerate(protected):
    text = text.replace(f"\ue000{index}\ue001", value)

sys.stdout.write(text)
PY
}

copy_source_mode() {
    local src="$1" dst="$2" mode
    mode="$(stat -c '%a' "$src" 2>/dev/null || stat -f '%Lp' "$src" 2>/dev/null || true)"
    [[ -n "$mode" ]] && chmod "$mode" "$dst" 2>/dev/null || true
}

render_source_to_path() {
    local src="$1" source_dir="$2" rel_path="$3" out="$4"
    if should_rewrite_source_file "$source_dir" "$rel_path"; then
        payload_text_rewrite "$src" > "$out"
    else
        cp -f "$src" "$out"
    fi
}

rendered_source_md5() {
    local src="$1" source_dir="$2" rel_path="$3"
    if should_rewrite_source_file "$source_dir" "$rel_path"; then
        local tmp
        tmp="$(mktemp "$RENDER_TMP_DIR/md5.XXXXXX")"
        render_source_to_path "$src" "$source_dir" "$rel_path" "$tmp"
        file_md5 "$tmp"
        rm -f "$tmp"
    else
        file_md5 "$src"
    fi
}

# ─── Utility: check exclude match ────────────────────────────────────────────
is_excluded() {
    local rel_path="$1"; shift
    local pattern
    for pattern in "$@"; do
        if [[ "$pattern" == */ ]]; then
            # Directory excludes are root-anchored; cache dirs remain basename-matched.
            local dir="${pattern%/}"
            if [[ "$dir" == _*_cache__ ]]; then
                [[ "$rel_path" == "$dir" || "$rel_path" == "$dir/"* || "$rel_path" == *"/$dir/"* ]] && return 0
            else
                [[ "$rel_path" == "$dir" || "$rel_path" == "$dir/"* ]] && return 0
            fi
        else
            [[ "$rel_path" == "$pattern" ]] && return 0
        fi
    done
    return 1
}

# ─── Collect files by include/exclude rules ───────────────────────────────────
# Outputs relative paths (one per line) from source_dir matching rules
collect_files() {
    local source_dir="$1"; shift
    local -a includes=()
    local -a excludes=()

    while [[ $# -gt 0 && "$1" != "--" ]]; do includes+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    excludes=("$@")

    for pattern in "${includes[@]}"; do
        local target="$source_dir/${pattern%/}"
        if [[ -f "$target" ]]; then
            if is_excluded "$pattern" "${excludes[@]}"; then
                log_dim "  [exclude] $pattern" >&2
            else
                log_dim "  [include] $pattern (file)" >&2
                echo "$pattern"
            fi
        elif [[ -d "$target" ]]; then
            log_dim "  [include] $pattern/ (directory)" >&2
            while IFS= read -r -d '' file; do
                local rel="${file#$source_dir/}"
                if is_excluded "$rel" "${excludes[@]}"; then
                    log_dim "    [exclude] $rel" >&2
                else
                    echo "$rel"
                fi
            done < <(find "$target" -type f -print0 2>/dev/null | sort -z)
        else
            log_dim "  [skip] $pattern (not found)" >&2
        fi
    done
}

# ─── Collect orphan files in target not present in source ────────────────────
collect_target_orphans() {
    local source_dir="$1" target_dir="$2"; shift 2
    local -a includes=() excludes=()
    while [[ $# -gt 0 && "$1" != "--" ]]; do includes+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    excludes=("$@")

    local source_files mapped_targets
    source_files=$(collect_files "$source_dir" "${includes[@]}" -- "${excludes[@]}")
    mapped_targets=$(
        while IFS= read -r source_rel; do
            [[ -z "$source_rel" ]] && continue
            target_relative_path "$source_dir" "$source_rel"
        done <<< "$source_files"
    )

    for pattern in "${includes[@]}"; do
        local target="$target_dir/${pattern%/}"
        if [[ -d "$target" ]]; then
            while IFS= read -r -d '' file; do
                local rel="${file#$target_dir/}"
                if is_excluded "$rel" "${excludes[@]}"; then
                    continue
                fi
                if ! grep -Fxq "$rel" <<< "$mapped_targets"; then
                    echo "$rel"
                fi
            done < <(find "$target" -type f -print0 2>/dev/null | sort -z)
        elif [[ -f "$target" ]]; then
            if is_excluded "${pattern%/}" "${excludes[@]}"; then
                continue
            fi
            if ! grep -Fxq "${pattern%/}" <<< "$mapped_targets"; then
                echo "${pattern%/}"
            fi
        fi
    done
}

# ─── Classify files into new/updated/unchanged/deleted ──────────────────────
# Sets global arrays: G_NEW, G_UPDATED, G_UNCHANGED, G_DELETED
G_NEW=()
G_UPDATED=()
G_UNCHANGED=()
G_DELETED=()

classify_files() {
    local source_dir="$1"
    local target_dir="$2"
    shift 2

    G_NEW=()
    G_UPDATED=()
    G_UNCHANGED=()
    G_DELETED=()

    local -a saved_includes=() saved_excludes=()
    while [[ $# -gt 0 && "$1" != "--" ]]; do saved_includes+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    saved_excludes=("$@")

    local files
    files=$(collect_files "$source_dir" "${saved_includes[@]}" -- "${saved_excludes[@]}")

    local total count=0
    total=$(echo "$files" | grep -c . 2>/dev/null || echo 0)

    while IFS= read -r rel; do
        [[ -z "$rel" ]] && continue
        ((count+=1))
        printf "\r${DIM}  [%d/%d] Comparing...${NC}" "$count" "$total" >&2
        local src="$source_dir/$rel"
        local target_rel
        target_rel="$(target_relative_path "$source_dir" "$rel")"
        local dst="$target_dir/$target_rel"

        if [[ ! -f "$dst" ]]; then
            G_NEW+=("$rel")
            log_dim "  [NEW] $rel"
        elif $FORCE; then
            G_UPDATED+=("$rel")
            log_dim "  [FORCE] $rel → UPDATED"
        else
            local src_md5 dst_md5
            src_md5=$(rendered_source_md5 "$src" "$source_dir" "$rel")
            dst_md5=$(file_md5 "$dst")
            if [[ "$src_md5" != "$dst_md5" ]]; then
                G_UPDATED+=("$rel")
                log_dim "  [MD5] $rel: $src_md5 ≠ $dst_md5 → UPDATED"
            else
                G_UNCHANGED+=("$rel")
                log_dim "  [MD5] $rel: $src_md5 → UNCHANGED"
            fi
        fi
    done <<< "$files"
    printf "\r%*s\r" 50 "" >&2

    if ! $NO_DELETE; then
        local orphans
        orphans=$(collect_target_orphans "$source_dir" "$target_dir" \
                    "${saved_includes[@]}" -- "${saved_excludes[@]}")
        while IFS= read -r rel; do
            [[ -z "$rel" ]] && continue
            G_DELETED+=("$rel")
            log_dim "  [ORPHAN] $rel → DELETED"
        done <<< "$orphans"
    fi
}

classify_target_without_release_manifest() {
    local source_dir="$1"
    local target_dir="$2"
    shift 2

    G_NEW=()
    G_UPDATED=()
    G_UNCHANGED=()
    G_DELETED=()

    local -a saved_includes=() saved_excludes=()
    while [[ $# -gt 0 && "$1" != "--" ]]; do saved_includes+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    saved_excludes=("$@")

    local files
    files=$(collect_files "$source_dir" "${saved_includes[@]}" -- "${saved_excludes[@]}")
    while IFS= read -r rel; do
        [[ -z "$rel" ]] && continue
        local target_rel
        target_rel="$(target_relative_path "$source_dir" "$rel")"
        if [[ -f "$target_dir/$target_rel" ]]; then
            G_UPDATED+=("$rel")
            log_dim "  [BOOTSTRAP] $rel → UPDATED"
        else
            G_NEW+=("$rel")
            log_dim "  [BOOTSTRAP] $rel → NEW"
        fi
    done <<< "$files"
}

append_release_manifest_copy_state() {
    if [[ ! -f "$TARGET_RELEASE_MANIFEST" ]]; then
        G_NEW+=("$RELEASE_MANIFEST_REL")
    elif [[ "$(file_md5 "$SOURCE_RELEASE_MANIFEST")" != "$(file_md5 "$TARGET_RELEASE_MANIFEST")" ]]; then
        G_UPDATED+=("$RELEASE_MANIFEST_REL")
    else
        G_UNCHANGED+=("$RELEASE_MANIFEST_REL")
    fi
}

validate_release_manifest_root() {
    local root="$1" label="$2" stderr_file
    stderr_file="$(mktemp "${TMPDIR:-/tmp}/tdk-release-manifest-validate.XXXXXX")"
    if ! bun "$DIFF_RELEASE_MANIFESTS_TS_SCRIPT" --validate-root "$root" 2>"$stderr_file"; then
        cat "$stderr_file" >&2
        rm -f "$stderr_file"
        echo -e "${RED}Error: invalid $label release manifest${NC}" >&2
        return 1
    fi
    rm -f "$stderr_file"
}

load_release_manifest_diff() {
    local source_dir="$1"
    local target_dir="$2"
    local output stderr_file
    TARGET_MANIFEST_SHA=()
    MANIFEST_DIFF_DELETED=()
    stderr_file="$(mktemp "${TMPDIR:-/tmp}/tdk-release-manifest-diff.XXXXXX")"
    if ! output="$(bun "$DIFF_RELEASE_MANIFESTS_TS_SCRIPT" \
        --source-root "$source_dir" \
        --target-root "$target_dir" \
        --output tsv 2>"$stderr_file")"; then
        cat "$stderr_file" >&2
        rm -f "$stderr_file"
        exit 1
    fi
    rm -f "$stderr_file"

    MANIFEST_DIFF_OUTPUT="$output"
    while IFS=$'\t' read -r action rel expected_sha; do
        [[ -z "$action" || -z "$rel" ]] && continue
        if [[ -n "$expected_sha" ]]; then
            TARGET_MANIFEST_SHA["$rel"]="$expected_sha"
        fi
        if [[ "$action" == "deleted" ]]; then
            MANIFEST_DIFF_DELETED+=("$rel")
        fi
    done <<< "$output"
}

classify_with_release_manifest_diff() {
    local source_dir="$1"
    local target_dir="$2"

    G_NEW=()
    G_UPDATED=()
    G_UNCHANGED=()
    G_DELETED=()

    load_release_manifest_diff "$source_dir" "$target_dir"
    while IFS=$'\t' read -r action rel expected_sha; do
        [[ -z "$action" || -z "$rel" ]] && continue
        case "$action" in
            new) G_NEW+=("$rel"); log_dim "  [MANIFEST] $rel → NEW" ;;
            updated) G_UPDATED+=("$rel"); log_dim "  [MANIFEST] $rel → UPDATED" ;;
            unchanged) G_UNCHANGED+=("$rel"); log_dim "  [MANIFEST] $rel → UNCHANGED" ;;
            deleted) G_DELETED+=("$rel"); log_dim "  [MANIFEST] $rel → DELETED" ;;
            *)
                echo -e "${RED}Error: unknown release manifest action: $action${NC}" >&2
                exit 1
                ;;
        esac
    done <<< "$MANIFEST_DIFF_OUTPUT"

    if $NO_DELETE; then
        G_DELETED=()
    fi
    append_release_manifest_copy_state
}

classify_distribution_files() {
    local source_dir="$1"
    local target_dir="$2"
    shift 2

    if ! command -v bun &>/dev/null; then
        echo -e "${RED}Error: release manifest validation requires bun${NC}" >&2
        exit 1
    fi
    if [[ ! -f "$DIFF_RELEASE_MANIFESTS_TS_SCRIPT" ]]; then
        echo -e "${RED}Error: release manifest diff script not found: $DIFF_RELEASE_MANIFESTS_TS_SCRIPT${NC}" >&2
        exit 1
    fi
    validate_release_manifest_root "$source_dir" "source" || exit 1

    if [[ -e "$TARGET_RELEASE_MANIFEST" || -L "$TARGET_RELEASE_MANIFEST" ]]; then
        snapshot_target_release_manifest || exit 1
    fi

    if [[ ! -f "$TARGET_RELEASE_MANIFEST" ]]; then
        log_dim "Target release manifest missing; first ship will not delete target orphans"
        classify_target_without_release_manifest "$source_dir" "$target_dir" "$@"
    elif [[ -n "$BRAND_PREFIX" || "$FORCE" == true ]]; then
        load_release_manifest_diff "$source_dir" "$target_dir"
        log_dim "Using rendered/full classification with release-manifest ownership proof"
        classify_files "$source_dir" "$target_dir" "$@"
        if $NO_DELETE; then
            G_DELETED=()
        else
            G_DELETED=("${MANIFEST_DIFF_DELETED[@]}")
        fi
    else
        log_dim "Using release manifest fast path"
        classify_with_release_manifest_diff "$source_dir" "$target_dir"
    fi
}

# ─── Component-level diffs via bun run manifest (TS implementation) ──────────────
CHECKSUMS_TS_SCRIPT="$SOURCE_SPECIFY/scripts/ts/src/commands/manifest/compute.ts"

show_skill_diffs() {
    if [[ ! -f "$CHECKSUMS_TS_SCRIPT" ]] || ! command -v bun &>/dev/null; then
        log_dim "Component comparison skipped (compute.ts or bun not available)"
        return
    fi

    log "${BOLD}${CYAN}━━━ Source Component State (vs manifest.json) ━━━━━━━━${NC}"
    log_dim "  Compares source files against stored hashes in manifest.json"

    local src_json
    src_json=$(bun "$CHECKSUMS_TS_SCRIPT" --project-root "$SOURCE_ROOT" --output json 2>/dev/null) || {
        log_dim "  Could not compute source manifest"
        return
    }

    python3 -c "
import json, sys
data = json.loads(sys.argv[1])
any_change = False
for plugin_name, plugin_data in sorted(data.items()):
    new_f = plugin_data.get('new_files', [])
    changed_f = plugin_data.get('changed_files', [])
    removed_f = plugin_data.get('removed_files', [])
    unchanged_f = plugin_data.get('unchanged_files', [])
    if new_f or changed_f or removed_f:
        any_change = True
        print(f'  \033[1m{plugin_name}\033[0m')
        for f in new_f:
            print(f'    \033[0;32m+ {f}\033[0m')
        for f in changed_f:
            print(f'    \033[1;33m~ {f}\033[0m')
        for f in removed_f:
            print(f'    \033[0;31m- {f}\033[0m')
    elif unchanged_f:
        print(f'  \033[2m{plugin_name}: {len(unchanged_f)} files unchanged\033[0m')
if not any_change:
    print('  \033[2mAll files match manifest.json\033[0m')
" "$src_json"
    echo ""
}

# ─── Print classification report for a section ───────────────────────────────
print_section() {
    local label="$1"
    local -n new_arr=$2
    local -n upd_arr=$3
    local -n unch_arr=$4
    local -n del_arr=$5

    echo -e "${BOLD}${label}${NC}"

    if [[ ${#new_arr[@]} -gt 0 ]]; then
        echo -e "  ${GREEN}NEW (${#new_arr[@]}):${NC}"
        for f in "${new_arr[@]}"; do echo -e "    ${GREEN}+ $f${NC}"; done
    fi
    if [[ ${#upd_arr[@]} -gt 0 ]]; then
        echo -e "  ${YELLOW}UPDATED (${#upd_arr[@]}):${NC}"
        for f in "${upd_arr[@]}"; do echo -e "    ${YELLOW}~ $f${NC}"; done
    fi
    if [[ ${#del_arr[@]} -gt 0 ]]; then
        echo -e "  ${RED}DELETED (${#del_arr[@]}):${NC}"
        for f in "${del_arr[@]}"; do echo -e "    ${RED}- $f${NC}"; done
    fi
    if [[ ${#unch_arr[@]} -gt 0 ]]; then
        echo -e "  ${DIM}UNCHANGED (${#unch_arr[@]})${NC}"
    fi
    if [[ ${#new_arr[@]} -eq 0 && ${#upd_arr[@]} -eq 0 && ${#del_arr[@]} -eq 0 ]]; then
        echo -e "  ${DIM}Nothing to sync${NC}"
    fi
    echo ""
}

# ─── Phase 1: Dry-run — classify all files ────────────────────────────────────
log "${BOLD}${CYAN}━━━ Analyzing changes ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Classify root-relative files from distribute.json
classify_distribution_files "$SOURCE_ROOT" "$TARGET_ROOT" "${DISTRIBUTE_INCLUDES[@]}" -- "${DISTRIBUTE_EXCLUDES[@]}"
SYNC_NEW=("${G_NEW[@]}")
SYNC_UPDATED=("${G_UPDATED[@]}")
SYNC_UNCHANGED=("${G_UNCHANGED[@]}")
SYNC_DELETED=("${G_DELETED[@]}")
print_section "Distributed files" SYNC_NEW SYNC_UPDATED SYNC_UNCHANGED SYNC_DELETED

# Show skill-level diffs
show_skill_diffs

# ─── Phase 2: Summary totals ─────────────────────────────────────────────────
TOTAL_NEW=${#SYNC_NEW[@]}
TOTAL_UPDATED=${#SYNC_UPDATED[@]}
TOTAL_UNCHANGED=${#SYNC_UNCHANGED[@]}
TOTAL_DELETED=${#SYNC_DELETED[@]}
TOTAL_CHANGES=$(( TOTAL_NEW + TOTAL_UPDATED + TOTAL_DELETED ))

if ! preflight_distribution_mutations; then
    echo -e "${RED}Distribution preflight failed. No files were changed.${NC}" >&2
    exit 1
fi

log "${BOLD}${CYAN}━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${GREEN}New:${NC}       $TOTAL_NEW files"
echo -e "  ${YELLOW}Updated:${NC}   $TOTAL_UPDATED files"
echo -e "  ${RED}Deleted:${NC}   $TOTAL_DELETED files"
echo -e "  ${DIM}Unchanged: $TOTAL_UNCHANGED files${NC}"
[[ $TOTAL_DELETED -gt 0 ]] && echo -e "  ${RED}  ⚠ Marked files will be REMOVED from target${NC}"
echo ""

# ─── Nothing to do? ──────────────────────────────────────────────────────────
if [[ $TOTAL_CHANGES -eq 0 ]]; then
    echo -e "${GREEN}Target is already up to date. Nothing to sync.${NC}"
    exit 0
fi

# ─── Dry-run exits here ──────────────────────────────────────────────────────
if $DRY_RUN; then
    echo -e "${YELLOW}Dry-run complete. No files were written.${NC}"
    echo -e "${WHITE}Run without --dry-run to apply changes.${NC}"
    exit 0
fi

# ─── Phase 3: Confirmation ───────────────────────────────────────────────────
if ! $AUTO_YES; then
    echo -e -n "${WHITE}Proceed with sync to ${BOLD}$TARGET_ROOT${NC}${WHITE}? [y/N] ${NC}"
    read -r confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" && "$confirm" != "yes" ]]; then
        echo -e "${YELLOW}Cancelled.${NC}"
        exit 0
    fi
    echo ""
fi

# ─── Phase 3b: Separate delete confirmation ─────────────────────────────────
if [[ $TOTAL_DELETED -gt 0 ]] && ! $AUTO_YES_DELETE; then
    echo -e "${RED}⚠ $TOTAL_DELETED files will be permanently DELETED from target.${NC}"
    echo -e -n "${WHITE}Type 'delete' to confirm removal: ${NC}"
    read -r delete_confirm
    if [[ "$delete_confirm" != "delete" ]]; then
        echo -e "${YELLOW}Deletions skipped. Only new/updated files will be synced.${NC}"
        SYNC_DELETED=()
        TOTAL_DELETED=0
    fi
    echo ""
fi

# ─── Phase 4: Execute sync ───────────────────────────────────────────────────
log "${BOLD}${CYAN}━━━ Syncing files ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

ERROR_COUNT=0
ERRORS=()
COPIED_COUNT=0
DELETED_COUNT=0
ROLLBACK_ROOT=""
TRANSACTION_NEW=()
TRANSACTION_UPDATED=()
TRANSACTION_DELETED=()
declare -A TRANSACTION_OUTPUT_SHA=()

prepare_distribution_rollback() {
    local rel target_rel target backup
    ROLLBACK_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/tdk-distribute-rollback.XXXXXX")" || return 1

    for rel in "${SYNC_NEW[@]}"; do
        [[ "$rel" == "$RELEASE_MANIFEST_REL" ]] && continue
        verify_new_target_absent "$rel" || return 1
    done
    for rel in "${SYNC_UPDATED[@]}" "${SYNC_DELETED[@]}"; do
        [[ -z "$rel" || "$rel" == "$RELEASE_MANIFEST_REL" ]] && continue
        verify_target_preimage "$rel" "${TARGET_MANIFEST_SHA[$rel]:-}" || return 1
        target_rel="$(target_relative_path "$SOURCE_ROOT" "$rel")"
        target="$TARGET_ROOT/$target_rel"
        backup="$ROLLBACK_ROOT/$rel"
        mkdir -p "$(dirname "$backup")" || return 1
        cp -p "$target" "$backup" || return 1
    done
}

rollback_distribution_mutations() {
    local rel target_rel target backup dst_dir tmp rollback_failed=false
    for rel in "${TRANSACTION_NEW[@]}"; do
        target_rel="$(target_relative_path "$SOURCE_ROOT" "$rel")"
        target="$TARGET_ROOT/$target_rel"
        if [[ ! -e "$target" && ! -L "$target" ]]; then
            continue
        fi
        if ! verify_target_preimage "$rel" "${TRANSACTION_OUTPUT_SHA[$rel]:-}"; then
            rollback_failed=true
            continue
        fi
        rm -f "$target" || rollback_failed=true
        dst_dir="$(dirname "$target")"
        while [[ "$dst_dir" != "$TARGET_ROOT" ]] && rmdir "$dst_dir" 2>/dev/null; do
            dst_dir="$(dirname "$dst_dir")"
        done
    done
    for rel in "${TRANSACTION_UPDATED[@]}"; do
        if ! verify_target_preimage "$rel" "${TRANSACTION_OUTPUT_SHA[$rel]:-}"; then
            rollback_failed=true
            continue
        fi
        target_rel="$(target_relative_path "$SOURCE_ROOT" "$rel")"
        target="$TARGET_ROOT/$target_rel"
        backup="$ROLLBACK_ROOT/$rel"
        dst_dir="$(dirname "$target")"
        if ! assert_safe_target_path "$target_rel" || ! mkdir -p "$dst_dir"; then
            rollback_failed=true
            continue
        fi
        if ! tmp="$(mktemp "$dst_dir/.distribute-rollback.XXXXXX")"; then
            rollback_failed=true
            continue
        fi
        if cp -p "$backup" "$tmp" && \
            verify_target_preimage "$rel" "${TRANSACTION_OUTPUT_SHA[$rel]:-}" && \
            mv -f "$tmp" "$target"; then
            continue
        fi
        rm -f "$tmp"
        rollback_failed=true
    done
    for rel in "${TRANSACTION_DELETED[@]}"; do
        target_rel="$(target_relative_path "$SOURCE_ROOT" "$rel")"
        target="$TARGET_ROOT/$target_rel"
        backup="$ROLLBACK_ROOT/$rel"
        dst_dir="$(dirname "$target")"
        if ! assert_safe_target_path "$target_rel" || [[ -e "$target" || -L "$target" ]] || ! mkdir -p "$dst_dir"; then
            rollback_failed=true
            continue
        fi
        if ! tmp="$(mktemp "$dst_dir/.distribute-rollback.XXXXXX")"; then
            rollback_failed=true
            continue
        fi
        if cp -p "$backup" "$tmp" && ln "$tmp" "$target" && rm "$tmp"; then
            continue
        fi
        rm -f "$tmp"
        rollback_failed=true
    done
    rm -rf "$ROLLBACK_ROOT"
    ROLLBACK_ROOT=""
    if $rollback_failed; then
        echo -e "${RED}Error: distribution rollback was incomplete; inspect the target before rerunning.${NC}" >&2
        return 1
    fi
    echo -e "${YELLOW}Payload changes rolled back; the previous release manifest remains authoritative.${NC}"
}

finish_distribution_transaction() {
    [[ -z "$ROLLBACK_ROOT" ]] || rm -rf "$ROLLBACK_ROOT"
    ROLLBACK_ROOT=""
}

# Copy a single file with logging
copy_one() {
    local src="$1" dst="$2" rel="$3" label="$4" action="$5" expected_sha="${6:-}"
    local dst_dir tmp rendered_sha copied=false
    dst_dir=$(dirname "$dst")

    if [[ "${TDK_DISTRIBUTE_FAIL_AT:-}" == "$rel" ]]; then
        ERRORS+=("injected copy failure: $rel")
        ((ERROR_COUNT+=1))
        echo -e "  ${RED}✗ [$label] $rel (injected failure)${NC}"
        return
    fi

    if ! mkdir -p "$dst_dir" 2>/dev/null; then
        ERRORS+=("mkdir failed: $dst_dir")
        ((ERROR_COUNT+=1))
        echo -e "  ${RED}✗ [$label] $rel${NC}"
        return
    fi

    if [[ "$action" == "new" ]]; then
        if ! verify_new_target_absent "$rel"; then
            ERRORS+=("new target proof failed: $rel")
            ((ERROR_COUNT+=1))
            return
        fi
    elif ! verify_target_preimage "$rel" "$expected_sha"; then
        ERRORS+=("update proof failed: $rel")
        ((ERROR_COUNT+=1))
        return
    fi

    if ! tmp="$(mktemp "$dst_dir/.distribute.XXXXXX")"; then
        ERRORS+=("temporary file creation failed: $rel")
        ((ERROR_COUNT+=1))
        return
    fi
    if render_source_to_path "$src" "$SOURCE_ROOT" "$rel" "$tmp" 2>/dev/null && \
        copy_source_mode "$src" "$tmp" && rendered_sha="$(file_sha256 "$tmp")"; then
        if [[ "$action" == "new" ]]; then
            if ! verify_new_target_absent "$rel"; then
                rm -f "$tmp"
                ERRORS+=("new target changed before copy: $rel")
                ((ERROR_COUNT+=1))
                return
            fi
        else
            if ! verify_target_preimage "$rel" "$expected_sha"; then
                rm -f "$tmp"
                ERRORS+=("managed target changed before copy: $rel")
                ((ERROR_COUNT+=1))
                return
            fi
        fi
        mv -f "$tmp" "$dst" 2>/dev/null && copied=true
    fi
    $copied || rm -f "$tmp" 2>/dev/null || true

    if $copied; then
        TRANSACTION_OUTPUT_SHA["$rel"]="$rendered_sha"
        if [[ "$action" == "new" ]]; then
            TRANSACTION_NEW+=("$rel")
        else
            TRANSACTION_UPDATED+=("$rel")
        fi
        ((COPIED_COUNT+=1))
        echo -e "  ${GREEN}✓${NC} [$label] $rel"
    else
        ERRORS+=("copy failed: $rel")
        ((ERROR_COUNT+=1))
        echo -e "  ${RED}✗ [$label] $rel${NC}"
    fi
}

# Delete a single file with logging
delete_one() {
    local dst="$1" rel="$2" label="$3" expected_sha="$4"
    if [[ "${TDK_DISTRIBUTE_FAIL_AT:-}" == "$rel" ]]; then
        ERRORS+=("injected delete failure: $rel")
        ((ERROR_COUNT+=1))
        echo -e "  ${RED}✗ [$label] $rel (injected failure)${NC}"
        return
    fi
    if ! verify_target_preimage "$rel" "$expected_sha"; then
        ERRORS+=("delete proof failed: $rel")
        ((ERROR_COUNT+=1))
        echo -e "  ${RED}✗ [$label] $rel (delete proof failed)${NC}"
        return
    fi
    if rm -f "$dst" 2>/dev/null; then
        TRANSACTION_DELETED+=("$rel")
        ((DELETED_COUNT+=1))
        echo -e "  ${RED}✗${NC} [$label] $rel (deleted)"
    else
        ERRORS+=("delete failed: $rel")
        ((ERROR_COUNT+=1))
        echo -e "  ${RED}✗ [$label] $rel (delete failed)${NC}"
    fi
}

publish_release_manifest() {
    local dst_dir tmp current_sha
    assert_safe_target_path "$RELEASE_MANIFEST_REL" || return 1
    dst_dir="$(dirname "$TARGET_RELEASE_MANIFEST")"
    mkdir -p "$dst_dir" || return 1

    if [[ -n "$TARGET_MANIFEST_SNAPSHOT_SHA" ]]; then
        if [[ ! -f "$TARGET_RELEASE_MANIFEST" || -L "$TARGET_RELEASE_MANIFEST" ]]; then
            echo -e "${RED}Error: target release manifest changed before publish${NC}" >&2
            return 1
        fi
        current_sha="$(file_sha256 "$TARGET_RELEASE_MANIFEST")" || return 1
        [[ "$current_sha" == "$TARGET_MANIFEST_SNAPSHOT_SHA" ]] || {
            echo -e "${RED}Error: target release manifest changed before publish${NC}" >&2
            return 1
        }
    elif [[ -e "$TARGET_RELEASE_MANIFEST" || -L "$TARGET_RELEASE_MANIFEST" ]]; then
        echo -e "${RED}Error: target release manifest appeared before publish${NC}" >&2
        return 1
    fi

    tmp="$(mktemp "$dst_dir/.release-manifest.XXXXXX")" || return 1
    if [[ -n "$BRAND_PREFIX" ]]; then
        if ! bun "$DIFF_RELEASE_MANIFESTS_TS_SCRIPT" \
            --source-root "$SOURCE_ROOT" \
            --materialize-target-root "$TARGET_ROOT" > "$tmp"; then
            rm -f "$tmp"
            return 1
        fi
    elif ! cp -f "$SOURCE_RELEASE_MANIFEST" "$tmp"; then
        rm -f "$tmp"
        return 1
    fi
    copy_source_mode "$SOURCE_RELEASE_MANIFEST" "$tmp"

    if [[ -n "$TARGET_MANIFEST_SNAPSHOT_SHA" ]]; then
        current_sha="$(file_sha256 "$TARGET_RELEASE_MANIFEST")" || { rm -f "$tmp"; return 1; }
        [[ "$current_sha" == "$TARGET_MANIFEST_SNAPSHOT_SHA" ]] || { rm -f "$tmp"; return 1; }
    elif [[ -e "$TARGET_RELEASE_MANIFEST" || -L "$TARGET_RELEASE_MANIFEST" ]]; then
        rm -f "$tmp"
        return 1
    fi
    mv -f "$tmp" "$TARGET_RELEASE_MANIFEST"
    ((COPIED_COUNT+=1))
    echo -e "  ${GREEN}✓${NC} [root] $RELEASE_MANIFEST_REL"
}

MANIFEST_SHOULD_COPY=false

if ! prepare_distribution_rollback; then
    finish_distribution_transaction
    echo -e "${RED}Distribution rollback preparation failed. No files were changed.${NC}" >&2
    exit 1
fi

# Sync new files
for rel in "${SYNC_NEW[@]}"; do
    if [[ "$rel" == "$RELEASE_MANIFEST_REL" ]]; then
        MANIFEST_SHOULD_COPY=true
        continue
    fi
    target_rel="$(target_relative_path "$SOURCE_ROOT" "$rel")"
        action="new"
        [[ -z "${TARGET_MANIFEST_SHA[$rel]:-}" ]] || action="updated"
        copy_one "$SOURCE_ROOT/$rel" "$TARGET_ROOT/$target_rel" "$rel" "root" "$action" "${TARGET_MANIFEST_SHA[$rel]:-}"
    [[ $ERROR_COUNT -gt 0 ]] && break
done

# Sync updated files only while earlier copies remain successful.
if [[ $ERROR_COUNT -eq 0 ]]; then
    for rel in "${SYNC_UPDATED[@]}"; do
        if [[ "$rel" == "$RELEASE_MANIFEST_REL" ]]; then
            MANIFEST_SHOULD_COPY=true
            continue
        fi
        target_rel="$(target_relative_path "$SOURCE_ROOT" "$rel")"
        copy_one "$SOURCE_ROOT/$rel" "$TARGET_ROOT/$target_rel" "$rel" "root" "updated" "${TARGET_MANIFEST_SHA[$rel]:-}"
        [[ $ERROR_COUNT -gt 0 ]] && break
    done
fi

# Delete managed orphans only after every copy succeeds.
if [[ $ERROR_COUNT -eq 0 ]]; then
    for rel in "${SYNC_DELETED[@]}"; do
        delete_one "$TARGET_ROOT/$rel" "$rel" "root" "${TARGET_MANIFEST_SHA[$rel]:-}"
        [[ $ERROR_COUNT -gt 0 ]] && break
    done
fi

if [[ $ERROR_COUNT -eq 0 ]] && $MANIFEST_SHOULD_COPY; then
    if ! publish_release_manifest; then
        ERRORS+=("release manifest publish failed")
        ((ERROR_COUNT+=1))
        echo -e "  ${RED}✗ [root] $RELEASE_MANIFEST_REL${NC}"
    fi
fi

if [[ $ERROR_COUNT -gt 0 ]]; then
    if ! rollback_distribution_mutations; then
        ERRORS+=("payload rollback incomplete")
        ((ERROR_COUNT+=1))
    fi
else
    finish_distribution_transaction
fi

# Clean up empty directories (scoped to include-pattern subtrees only)
if [[ $DELETED_COUNT -gt 0 ]]; then
    for pattern in "${DISTRIBUTE_INCLUDES[@]}"; do
        if is_excluded "${pattern%/}" "${DISTRIBUTE_EXCLUDES[@]}"; then
            continue
        fi
        pdir="$TARGET_ROOT/${pattern%/}"
        [[ -d "$pdir" ]] || continue
        find "$pdir" -mindepth 1 -type d -empty -delete 2>/dev/null || true
    done
    log_dim "Cleaned up empty directories"
fi

# ─── Phase 5: Result ─────────────────────────────────────────────────────────
echo ""
log "${BOLD}${CYAN}━━━ Result ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [[ $ERROR_COUNT -gt 0 ]]; then
    echo -e "  ${RED}Errors: $ERROR_COUNT${NC}"
    for err in "${ERRORS[@]}"; do echo -e "    ${RED}! $err${NC}"; done
    echo ""
    echo -e "${RED}Distribution completed with $ERROR_COUNT errors.${NC}"
    exit 1
else
    echo -e "${GREEN}Distribution complete! $COPIED_COUNT files synced, $DELETED_COUNT files removed from $TARGET_ROOT${NC}"
fi

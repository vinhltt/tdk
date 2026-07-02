#!/usr/bin/env bash
# distribute.sh — Distribute/update TDK from source to a target project
#
# One-way sync of .specify/ substrate from TDK source to target project.
# Legacy .claude/ sync remains available, but explicit harness mutation should use
# `bun src/index.ts install <target> --harness claude` from the tdk-setup package (packages/tdk-setup).
# Uses built-in include/exclude rules, with optional legacy sync-config.yaml override.
# Compares files by MD5.
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
#   --with-claude     Legacy: also sync .claude/ files (prefer tdk-setup `install`)
#   --prefix PREFIX   Brand safe .specify payload text (example: pav -> pav-/PAV)
#   --force           Overwrite all files (skip MD5 comparison)
#   --no-delete       Skip orphan removal (don't delete files missing from source)
#   --yes-delete      Auto-approve file deletions (skip 'type delete' prompt)
#   --log-file PATH   Tee all output to a file (ANSI colors stripped in file)
#   --help            Show this help message
#
# Examples:
#   bash distribute.sh                                      # interactive
#   bash distribute.sh /path/to/my-project                  # sync .specify/ only
#   bash distribute.sh /path/to/my-project --with-claude    # legacy .claude sync
#   bash distribute.sh /path/to/my-project --dry-run        # preview changes
#   bash distribute.sh /path/to/my-project --prefix pav --dry-run
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
WITH_CLAUDE=false
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
        echo -e "${RED}Use lowercase letters, numbers, and hyphens only, for example: pav or pav-${NC}" >&2
        return 1
    fi
    printf '%s' "$value"
}

# ─── Args ─────────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)      DRY_RUN=true ;;
        --yes|-y)       AUTO_YES=true ;;
        --with-claude)  WITH_CLAUDE=true ;;
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
SOURCE_CLAUDE="$SOURCE_ROOT/.claude"

SYNC_CONFIG="$SOURCE_SPECIFY/plugins/specify-devtools/skills/specify-distribute/sync-config.yaml"

if [[ ! -d "$SOURCE_SPECIFY" ]]; then
    echo -e "${RED}Error: source .specify/ not found at $SOURCE_SPECIFY${NC}" >&2
    exit 1
fi

TARGET_ROOT="$(cd "$TARGET_PATH" 2>/dev/null && pwd || echo "$TARGET_PATH")"
TARGET_SPECIFY="$TARGET_ROOT/.specify"
TARGET_CLAUDE="$TARGET_ROOT/.claude"

if [[ ! -d "$TARGET_ROOT" ]]; then
    echo -e "${RED}Error: target directory not found: $TARGET_ROOT${NC}" >&2
    exit 1
fi

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
log_dim "yq: $(command -v yq 2>/dev/null && yq --version 2>/dev/null || echo 'not found')"

# ─── Interactive option prompts (TTY only) ───────────────────────────────────
is_interactive() { [[ -t 0 ]]; }

if is_interactive; then
    if ! $WITH_CLAUDE; then
        read -r -p "$(echo -e "${WHITE}Sync .claude/ files too? [y/N]: ${NC}")" ans
        [[ "$ans" == [yY]* ]] && WITH_CLAUDE=true
    fi
    if ! $FORCE; then
        read -r -p "$(echo -e "${WHITE}Force overwrite all files? [y/N]: ${NC}")" ans
        [[ "$ans" == [yY]* ]] && FORCE=true
    fi
fi

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║              TDK Distribute                       ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${WHITE}Source:${NC}  $SOURCE_ROOT"
echo -e "  ${WHITE}Target:${NC}  $TARGET_ROOT"
if $WITH_CLAUDE; then
    echo -e "  ${WHITE}Scope:${NC}   .specify/ + legacy .claude/"
    echo -e "  ${YELLOW}Note:${NC}    Prefer 'tdk-setup install <target> --harness claude' for explicit harness mutation"
else
    echo -e "  ${WHITE}Scope:${NC}   .specify/ only"
    if [[ -n "$BRAND_PREFIX" ]]; then
        echo -e "  ${WHITE}Next:${NC}    cd \"$SOURCE_ROOT/packages/tdk-setup\" && bun src/index.ts install \"$TARGET_ROOT\" --harness claude --all-plugins --prefix $BRAND_WORD --dry-run"
    else
        echo -e "  ${WHITE}Next:${NC}    cd \"$SOURCE_ROOT/packages/tdk-setup\" && bun src/index.ts install \"$TARGET_ROOT\" --harness claude --plugins tdk-core --dry-run"
    fi
fi
if [[ -n "$BRAND_PREFIX" ]]; then
    echo -e "  ${WHITE}Brand:${NC}   safe .specify payload text tdk-/tdk/TDK -> $BRAND_PREFIX/$BRAND_WORD/$BRAND_WORD_UPPER"
    echo -e "  ${DIM}         plugins/, codex-plugins/, scripts/, schemas/, and docs/assets/ stay source-identical${NC}"
fi
$FORCE && echo -e "  ${YELLOW}Mode:    --force (skip MD5 comparison)${NC}"
$NO_DELETE && echo -e "  ${YELLOW}Mode:    --no-delete (skip orphan removal)${NC}"
echo ""

# ─── Parse sync-config.yaml ──────────────────────────────────────────────────
# Reads simple YAML list format using yq (required by setup.sh prerequisites)
SPECIFY_INCLUDES=()
SPECIFY_EXCLUDES=()

if [[ -f "$SYNC_CONFIG" ]] && command -v yq &>/dev/null; then
    log_dim "Reading sync-config.yaml..."
    while IFS= read -r line; do
        [[ -n "$line" ]] && SPECIFY_INCLUDES+=("$line")
    done < <(yq -r '.include[]' "$SYNC_CONFIG" 2>/dev/null)

    while IFS= read -r line; do
        [[ -n "$line" ]] && SPECIFY_EXCLUDES+=("$line")
    done < <(yq -r '.exclude[]' "$SYNC_CONFIG" 2>/dev/null)

    log_dim "  Config: $SYNC_CONFIG"
    log_dim "  Includes: ${SPECIFY_INCLUDES[*]}"
    log_dim "  Excludes: ${SPECIFY_EXCLUDES[*]}"
elif [[ -f "$SYNC_CONFIG" ]]; then
    log "${YELLOW}Warning: yq not found — using fallback include/exclude rules${NC}"
    log "${YELLOW}Install yq for sync-config.yaml support: https://github.com/mikefarah/yq${NC}"
    SPECIFY_INCLUDES=("_shared" "plugins/" "codex-plugins/" "scripts" "templates/" "setup.sh" "docs/" "schemas/" "CHANGELOG.md" ".specify.yaml.example" ".specify.env.example" ".specify.json.example")
    SPECIFY_EXCLUDES=("configurations/" "memory/" ".specify.yaml" ".specify.env" "scripts/ts/node_modules/" "__pycache__/")
else
    log_dim "sync-config.yaml not found — using built-in include/exclude rules"
    SPECIFY_INCLUDES=("_shared" "plugins/" "codex-plugins/" "scripts" "templates/" "setup.sh" "docs/" "schemas/" "CHANGELOG.md" ".specify.yaml.example" ".specify.env.example" ".specify.json.example")
    SPECIFY_EXCLUDES=("configurations/" "memory/" ".specify.yaml" ".specify.env" "scripts/ts/node_modules/" "__pycache__/")
fi

# .claude/ rules (only used with --with-claude)
CLAUDE_INCLUDES=("skills" "hooks" "settings.json")
CLAUDE_EXCLUDES=("settings.local.json" "session-state/" "worktrees/" "rules/")

echo ""

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

has_payload_text_extension() {
    case "$1" in
        *.md|*.mdx|*.txt|*.json|*.yaml|*.yml|*.tpl|*.sh) return 0 ;;
        *) return 1 ;;
    esac
}

is_payload_rewrite_candidate() {
    local rel_path="$1"
    case "$rel_path" in
        setup.sh|CHANGELOG.md|.specify*.example) return 0 ;;
        plugins/*|codex-plugins/*|scripts/*|schemas/*|docs/assets/*) return 1 ;;
        docs/*|templates/*) has_payload_text_extension "$rel_path"; return ;;
        *) return 1 ;;
    esac
}

should_rewrite_source_file() {
    local source_dir="$1" rel_path="$2"
    [[ -n "$BRAND_PREFIX" && "$source_dir" == "$SOURCE_SPECIFY" ]] || return 1
    is_payload_rewrite_candidate "$rel_path"
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

# These references point to paths that distribute intentionally does not rename.
protect(r"\.specify/(?:codex-)?plugins/[^\s\"'`)\]}]+")
protect(r"(?:[A-Za-z0-9_.-]+/)*assets/tdk-[^\s\"'`)\]}]+")

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

    for pattern in "${includes[@]}"; do
        local target="$target_dir/${pattern%/}"
        if [[ -d "$target" ]]; then
            while IFS= read -r -d '' file; do
                local rel="${file#$target_dir/}"
                if is_excluded "$rel" "${excludes[@]}"; then
                    continue
                fi
                local src="$source_dir/$rel"
                if [[ ! -f "$src" ]]; then
                    echo "$rel"
                fi
            done < <(find "$target" -type f -print0 2>/dev/null | sort -z)
        elif [[ -f "$target" ]]; then
            local src="$source_dir/${pattern%/}"
            if [[ ! -f "$src" ]]; then
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
        local dst="$target_dir/$rel"

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

# Classify .specify/ files
classify_files "$SOURCE_SPECIFY" "$TARGET_SPECIFY" "${SPECIFY_INCLUDES[@]}" -- "${SPECIFY_EXCLUDES[@]}"
SPEC_NEW=("${G_NEW[@]}")
SPEC_UPDATED=("${G_UPDATED[@]}")
SPEC_UNCHANGED=("${G_UNCHANGED[@]}")
SPEC_DELETED=("${G_DELETED[@]}")
print_section ".specify/ files" SPEC_NEW SPEC_UPDATED SPEC_UNCHANGED SPEC_DELETED

# Classify .claude/ files (only with --with-claude)
CLAUDE_NEW=()
CLAUDE_UPDATED=()
CLAUDE_UNCHANGED=()
CLAUDE_DELETED=()
if $WITH_CLAUDE && [[ -d "$SOURCE_CLAUDE" ]]; then
    saved_no_delete=$NO_DELETE
    NO_DELETE=true
    classify_files "$SOURCE_CLAUDE" "$TARGET_CLAUDE" "${CLAUDE_INCLUDES[@]}" -- "${CLAUDE_EXCLUDES[@]}"
    NO_DELETE=$saved_no_delete
    CLAUDE_NEW=("${G_NEW[@]}")
    CLAUDE_UPDATED=("${G_UPDATED[@]}")
    CLAUDE_UNCHANGED=("${G_UNCHANGED[@]}")
    CLAUDE_DELETED=()
    print_section ".claude/ files" CLAUDE_NEW CLAUDE_UPDATED CLAUDE_UNCHANGED CLAUDE_DELETED
fi

# Show skill-level diffs
show_skill_diffs

# ─── Phase 2: Summary totals ─────────────────────────────────────────────────
TOTAL_NEW=$(( ${#SPEC_NEW[@]} + ${#CLAUDE_NEW[@]} ))
TOTAL_UPDATED=$(( ${#SPEC_UPDATED[@]} + ${#CLAUDE_UPDATED[@]} ))
TOTAL_UNCHANGED=$(( ${#SPEC_UNCHANGED[@]} + ${#CLAUDE_UNCHANGED[@]} ))
TOTAL_DELETED=$(( ${#SPEC_DELETED[@]} + ${#CLAUDE_DELETED[@]} ))
TOTAL_CHANGES=$(( TOTAL_NEW + TOTAL_UPDATED + TOTAL_DELETED ))

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
        SPEC_DELETED=()
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

# Copy a single file with logging
copy_one() {
    local src="$1" dst="$2" rel="$3" label="$4"
    local dst_dir
    dst_dir=$(dirname "$dst")

    if ! mkdir -p "$dst_dir" 2>/dev/null; then
        ERRORS+=("mkdir failed: $dst_dir")
        ((ERROR_COUNT+=1))
        echo -e "  ${RED}✗ [$label] $rel${NC}"
        return
    fi

    local copied=false
    if [[ "$label" == ".specify" ]] && should_rewrite_source_file "$SOURCE_SPECIFY" "$rel"; then
        local tmp
        tmp="$(mktemp "$dst_dir/.distribute.XXXXXX")"
        if payload_text_rewrite "$src" > "$tmp" 2>/dev/null && copy_source_mode "$src" "$tmp" && mv -f "$tmp" "$dst" 2>/dev/null; then
            copied=true
        else
            rm -f "$tmp" 2>/dev/null || true
        fi
    elif cp -f "$src" "$dst" 2>/dev/null; then
        copied=true
    fi

    if $copied; then
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
    local dst="$1" rel="$2" label="$3"
    if rm -f "$dst" 2>/dev/null; then
        ((DELETED_COUNT+=1))
        echo -e "  ${RED}✗${NC} [$label] $rel (deleted)"
    else
        ERRORS+=("delete failed: $rel")
        ((ERROR_COUNT+=1))
        echo -e "  ${RED}✗ [$label] $rel (delete failed)${NC}"
    fi
}

# Sync .specify/ new + updated
for rel in "${SPEC_NEW[@]}" "${SPEC_UPDATED[@]}"; do
    copy_one "$SOURCE_SPECIFY/$rel" "$TARGET_SPECIFY/$rel" "$rel" ".specify"
done

# Sync .claude/ new + updated
if $WITH_CLAUDE; then
    for rel in "${CLAUDE_NEW[@]}" "${CLAUDE_UPDATED[@]}"; do
        copy_one "$SOURCE_CLAUDE/$rel" "$TARGET_CLAUDE/$rel" "$rel" ".claude"
    done
fi

# Delete .specify/ orphans (copy first, delete after)
for rel in "${SPEC_DELETED[@]}"; do
    delete_one "$TARGET_SPECIFY/$rel" "$rel" ".specify"
done

# Clean up empty directories (scoped to include-pattern subtrees only)
if [[ $DELETED_COUNT -gt 0 ]]; then
    for pattern in "${SPECIFY_INCLUDES[@]}"; do
        pdir="$TARGET_SPECIFY/${pattern%/}"
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

#!/usr/bin/env bash
# distribute.sh — Distribute/update TDK from source to a target project
#
# One-way sync of root-relative paths from distribute.json to a target project.
# Explicit harness mutation should use `bun src/index.ts install <target> --harness claude`
# from the tdk-setup package (packages/tdk-setup).
# Uses distribute.json include/exclude rules.
# Compares files by release manifest when available. Prefix mode compares rendered
# output. Force mode is a destructive override of target ownership and checksums.
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
#   --force           Destructively overwrite consumer changes at current release paths;
#                     prior-manifest-only files may be deleted after delete approval
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
cleanup_render_tmp() {
    if [[ -n "${RENDER_TMP_DIR:-}" && -d "$RENDER_TMP_DIR" ]]; then
        rm -rf "$RENDER_TMP_DIR"
        RENDER_TMP_DIR=""
    fi
}
if [[ -n "$BRAND_PREFIX" ]]; then
    PYTHON_BIN="$(command -v python3 2>/dev/null || true)"
    if [[ -z "$PYTHON_BIN" ]]; then
        echo -e "${RED}Error: --prefix requires python3 for payload text rewrite${NC}" >&2
        exit 1
    fi
    RENDER_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tdk-distribute.XXXXXX")"
    trap cleanup_render_tmp EXIT
fi

# ─── Tool detection ──────────────────────────────────────────────────────────
log_dim "SHA-256 tool: $(command -v sha256sum 2>/dev/null || command -v shasum 2>/dev/null || echo 'python fallback')"
log_dim "JSON parser: $(command -v bun 2>/dev/null || command -v node 2>/dev/null || command -v python3 2>/dev/null || command -v python 2>/dev/null || echo 'not found')"

# ─── Interactive option prompts (TTY only) ───────────────────────────────────
is_interactive() { [[ -t 0 ]]; }

if is_interactive; then
    if ! $FORCE; then
        read -r -p "$(echo -e "${WHITE}Enable destructive force override of consumer changes? [y/N]: ${NC}")" ans
        [[ "$ans" == [yY]* ]] && FORCE=true
    fi
fi

scope_description() {
    if $FORCE; then
        printf "current/prior release-manifest paths"
    else
        printf "paths from distribute.json"
    fi
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
$FORCE && echo -e "  ${YELLOW}Mode:    --force (destructive consumer override)${NC}"
$NO_DELETE && echo -e "  ${YELLOW}Mode:    --no-delete (skip orphan removal)${NC}"
echo ""

# ─── Orphaned parallel-controller lease cleanup ──────────────────────────────
# TDK removed the repo-wide mutation lease. A target that updated .specify/ while
# a lease was held keeps an orphaned state directory under its Git common dir and
# no longer ships the CLI that could release it, so the installer clears it.
#
# The directory name follows the payload brand word, because the lease path was
# built from a payload string that --prefix rewrites. Derive it the same way the
# payload rewrite does rather than assuming the source word.
LEASE_BRAND_WORD="${BRAND_WORD:-${SOURCE_PREFIX%-}}"
# Every file the removed lease could write inside its lock directory.
LEASE_ARTIFACT_NAMES=(owner.json planner-snapshot.json wave-baseline.json mutation-state.json transition.json)

# True when a lock-directory entry is a lease artifact, including a temp file
# left behind by an interrupted atomic write (`<name>.tmp-<uuid>`).
is_known_lease_artifact() {
    local name="$1" known
    for known in "${LEASE_ARTIFACT_NAMES[@]}"; do
        [[ "$name" == "$known" || "$name" == "$known".tmp-* ]] && return 0
    done
    return 1
}

# Remove only the exact lock directory, and only when it holds nothing but known
# lease artifacts. Anything else is reported and left for the operator.
remove_orphaned_parallel_lease() {
    local git_common_dir lease_parent lock_path path name
    local saved_nullglob saved_dotglob
    local entries=() unexpected=() removed=() tombstones=()

    git_common_dir="$(git -C "$TARGET_ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 0
    [[ -n "$git_common_dir" && -d "$git_common_dir" ]] || return 0

    lease_parent="$git_common_dir/$LEASE_BRAND_WORD"
    lock_path="$lease_parent/parallel-controller.lock"
    [[ -d "$lock_path" && ! -L "$lock_path" ]] || return 0

    echo -e "${YELLOW}Orphaned parallel-controller lease detected:${NC} $lock_path"
    echo -e "  ${DIM}The lease was removed from TDK; this directory is leftover state.${NC}"
    echo -e "  ${WHITE}To release it by hand instead, inspect and then remove:${NC}"
    echo -e "    ${WHITE}rm -rf \"$lock_path\"${NC}"

    # `shopt -p` exits non-zero when the option is unset, so guard it under set -e.
    saved_nullglob="$(shopt -p nullglob || true)"
    saved_dotglob="$(shopt -p dotglob || true)"
    shopt -s nullglob dotglob
    entries=("$lock_path"/*)
    tombstones=("$lock_path".recovered-*)
    eval "$saved_nullglob"
    eval "$saved_dotglob"

    for path in ${entries[@]+"${entries[@]}"}; do
        name="${path##*/}"
        if [[ -f "$path" && ! -L "$path" ]] && is_known_lease_artifact "$name"; then
            continue
        fi
        unexpected+=("$name")
    done

    if [[ ${#unexpected[@]} -gt 0 ]]; then
        echo -e "  ${YELLOW}Left in place — unexpected contents: ${unexpected[*]}${NC}"
        echo ""
        return 0
    fi

    if $DRY_RUN; then
        echo -e "  ${WHITE}Dry-run: would remove ${#entries[@]} lease artifact(s) and the lock directory.${NC}"
        echo ""
        return 0
    fi

    for path in ${entries[@]+"${entries[@]}"}; do
        if rm -f "$path"; then
            removed+=("${path##*/}")
        else
            echo -e "  ${YELLOW}Could not remove ${path##*/}; lease left in place.${NC}"
            echo ""
            return 0
        fi
    done
    if ! rmdir "$lock_path" 2>/dev/null; then
        echo -e "  ${YELLOW}Could not remove $lock_path; remove it manually.${NC}"
        echo ""
        return 0
    fi

    [[ ${#removed[@]} -eq 0 ]] || echo -e "  ${GREEN}✓${NC} removed lease artifacts: ${removed[*]}"
    echo -e "  ${GREEN}✓${NC} removed lease directory: $lock_path"
    if [[ ${#tombstones[@]} -gt 0 ]]; then
        echo -e "  ${YELLOW}Recovery tombstones left in place (remove manually if not needed):${NC}"
        for path in "${tombstones[@]}"; do echo -e "    ${YELLOW}$path${NC}"; done
    elif rmdir "$lease_parent" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} removed empty lease parent: $lease_parent"
    fi
    echo ""
}

remove_orphaned_parallel_lease

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
  if (typeof entry !== "string" || entry.length === 0 || entry.includes("\0")) {
    console.error(`Invalid array entry in ${configFile}: ${queryPath}`);
    process.exit(3);
  }
  process.stdout.write(`${entry}\0`);
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
    if not isinstance(entry, str) or not entry or "\0" in entry:
        print(f"Invalid array entry in {config_file}: {query_path}", file=sys.stderr)
        sys.exit(3)
    sys.stdout.write(entry + "\0")
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
    if not isinstance(entry, str) or not entry or "\0" in entry:
        print("Invalid array entry in %s: %s" % (config_file, query_path), file=sys.stderr)
        sys.exit(3)
    sys.stdout.write(entry + "\0")
PY
    else
        echo "Error: distribute.json requires bun, node, python3, or python for parsing" >&2
        return 127
    fi
}

load_json_array() {
    local array_name="$1" query_path="$2" output_file entry
    local -n target_array="$array_name"
    output_file="$(mktemp "${TMPDIR:-/tmp}/tdk-distribute-config.XXXXXX")" || return 1
    if ! read_json_array "$DISTRIBUTE_CONFIG" "$query_path" > "$output_file"; then
        rm -f "$output_file"
        echo -e "${RED}Error: failed to read $query_path from $DISTRIBUTE_CONFIG${NC}" >&2
        return 1
    fi

    target_array=()
    while IFS= read -r -d '' entry; do
        target_array+=("$entry")
    done < "$output_file"
    rm -f "$output_file"
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

file_sha256() {
    local path="$1" result="" digest="" input_mode="path"
    local -a hash_command=()

    if command -v sha256sum &>/dev/null; then
        hash_command=(sha256sum)
        input_mode="stdin"
    elif command -v shasum &>/dev/null; then
        hash_command=(shasum -a 256)
        input_mode="stdin"
    elif command -v python3 &>/dev/null; then
        hash_command=(python3 -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())')
    elif command -v python &>/dev/null; then
        hash_command=(python -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())')
    else
        echo -e "${RED}Error: no SHA-256 tool available for: $path${NC}" >&2
        return 1
    fi

    if [[ "$input_mode" == "stdin" ]]; then
        result="$("${hash_command[@]}" < "$path")" || {
            echo -e "${RED}Error: failed to hash file: $path${NC}" >&2
            return 1
        }
        [[ "$result" =~ ^([[:xdigit:]]{64})[[:blank:]]+\*?-$ ]] && digest="${BASH_REMATCH[1]}"
    else
        digest="$("${hash_command[@]}" "$path")" || {
            echo -e "${RED}Error: failed to hash file: $path${NC}" >&2
            return 1
        }
    fi

    if [[ ! "$digest" =~ ^[[:xdigit:]]{64}$ ]]; then
        echo -e "${RED}Error: invalid SHA-256 output for: $path${NC}" >&2
        return 1
    fi
    printf '%s\n' "${digest,,}"
}

assert_safe_target_path() {
    local rel="$1" current="$TARGET_ROOT" segment remaining
    if [[ -z "$rel" || "$rel" == /* || "$rel" == *\\* || "$rel" == *//* ]]; then
        echo -e "${RED}Error: invalid release manifest path: $rel${NC}" >&2
        return 1
    fi
    remaining="$rel"
    while :; do
        segment="${remaining%%/*}"
        if [[ -z "$segment" || "$segment" == "." || "$segment" == ".." ]]; then
            echo -e "${RED}Error: invalid release manifest path: $rel${NC}" >&2
            return 1
        fi
        current="$current/$segment"
        if [[ -L "$current" ]]; then
            echo -e "${RED}Error: release manifest path has symlink component: $rel${NC}" >&2
            return 1
        fi
        [[ "$remaining" == */* ]] || break
        remaining="${remaining#*/}"
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
declare -A FORCE_PREIMAGE_PRESENT=()
declare -A FORCE_PREIMAGE_SHA=()
FORCE_ABSENT_DELETE_GUARDS=()
MANIFEST_DIFF_ACTIONS=()
MANIFEST_DIFF_PATHS=()
MANIFEST_DIFF_DELETED=()
TARGET_MANIFEST_SNAPSHOT_SHA=""

verify_target_preimage() {
    local rel="$1" expected_sha="$2" target actual_sha
    target="$TARGET_ROOT/$rel"
    assert_safe_target_path "$rel" || return 1
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
    local rel="$1" target
    target="$TARGET_ROOT/$rel"
    assert_safe_target_path "$rel" || return 1
    if [[ -e "$target" || -L "$target" ]]; then
        echo -e "${RED}Error: new managed target already exists without ownership proof: $rel${NC}" >&2
        return 1
    fi
}

validate_force_target_node() {
    local rel="$1" target
    target="$TARGET_ROOT/$rel"
    assert_safe_target_path "$rel" || return 1
    if [[ ! -e "$target" && ! -L "$target" ]]; then
        return 0
    fi
    if [[ -L "$target" || ! -f "$target" ]]; then
        echo -e "${RED}Error: force target is not a regular non-symlink file: $rel${NC}" >&2
        return 1
    fi
}

snapshot_force_target_preimage() {
    local rel="$1" target actual_sha
    target="$TARGET_ROOT/$rel"
    validate_force_target_node "$rel" || return 1
    if [[ ! -e "$target" && ! -L "$target" ]]; then
        FORCE_PREIMAGE_PRESENT["$rel"]="false"
        unset 'FORCE_PREIMAGE_SHA[$rel]'
        return 0
    fi
    actual_sha="$(file_sha256 "$target")" || return 1
    FORCE_PREIMAGE_PRESENT["$rel"]="true"
    FORCE_PREIMAGE_SHA["$rel"]="$actual_sha"
}

verify_force_target_preimage() {
    local rel="$1" target actual_sha
    target="$TARGET_ROOT/$rel"
    if [[ "${FORCE_PREIMAGE_PRESENT[$rel]:-false}" == "false" ]]; then
        if [[ -e "$target" || -L "$target" ]]; then
            echo -e "${RED}Error: force target changed after snapshot: $rel${NC}" >&2
            return 1
        fi
        return 0
    fi
    validate_force_target_node "$rel" || return 1
    actual_sha="$(file_sha256 "$target")" || return 1
    if [[ "$actual_sha" != "${FORCE_PREIMAGE_SHA[$rel]:-}" ]]; then
        echo -e "${RED}Error: force target changed after snapshot: $rel${NC}" >&2
        return 1
    fi
}

preflight_distribution_mutations() {
    local rel
    if $FORCE; then
        for rel in "${SYNC_NEW[@]}" "${SYNC_UPDATED[@]}" "${SYNC_DELETED[@]}"; do
            [[ -z "$rel" || "$rel" == "$RELEASE_MANIFEST_REL" ]] && continue
            validate_force_target_node "$rel" || return 1
        done
        return 0
    fi
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
        if [[ -n "$BRAND_PREFIX" && -z "${TARGET_MANIFEST_SHA[$rel]+present}" ]]; then
            echo -e "${RED}Error: checksum proof missing for unchanged prefixed target: $rel${NC}" >&2
            return 1
        fi
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

text = source_file.read_bytes().decode("utf-8")
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

sys.stdout.buffer.write(text.encode("utf-8"))
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

rendered_source_sha256() {
    local src="$1" source_dir="$2" rel_path="$3" tmp digest
    if should_rewrite_source_file "$source_dir" "$rel_path"; then
        tmp="$(mktemp "$RENDER_TMP_DIR/sha256.XXXXXX")" || return 1
        if ! render_source_to_path "$src" "$source_dir" "$rel_path" "$tmp" || \
            ! digest="$(file_sha256 "$tmp")"; then
            rm -f "$tmp"
            return 1
        fi
        rm -f "$tmp" || return 1
        printf '%s\n' "$digest"
    else
        file_sha256 "$src"
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
# Outputs NUL-delimited relative paths from source_dir matching rules.
collect_files() {
    local source_dir="$1"; shift
    local -a includes=() excludes=()
    local pattern target paths_file file rel

    while [[ $# -gt 0 && "$1" != "--" ]]; do includes+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    excludes=("$@")

    for pattern in "${includes[@]}"; do
        target="$source_dir/${pattern%/}"
        if [[ -f "$target" ]]; then
            if is_excluded "$pattern" "${excludes[@]}"; then
                log_dim "  [exclude] $pattern" >&2
            else
                log_dim "  [include] $pattern (file)" >&2
                printf '%s\0' "$pattern"
            fi
        elif [[ -d "$target" ]]; then
            log_dim "  [include] $pattern/ (directory)" >&2
            paths_file="$(mktemp "${TMPDIR:-/tmp}/tdk-distribute-files.XXXXXX")" || return 1
            if ! find "$target" -type f -print0 2>/dev/null | sort -z > "$paths_file"; then
                rm -f "$paths_file"
                return 1
            fi
            while IFS= read -r -d '' file; do
                rel="${file#$source_dir/}"
                if is_excluded "$rel" "${excludes[@]}"; then
                    log_dim "    [exclude] $rel" >&2
                else
                    printf '%s\0' "$rel"
                fi
            done < "$paths_file"
            rm -f "$paths_file"
        else
            log_dim "  [skip] $pattern (not found)" >&2
        fi
    done
}

# ─── Collect orphan files in target not present in source ────────────────────
collect_target_orphans() {
    local source_dir="$1" target_dir="$2"; shift 2
    local -a includes=() excludes=()
    local -A mapped_targets=()
    local pattern target source_files_file target_files_file source_rel file rel

    while [[ $# -gt 0 && "$1" != "--" ]]; do includes+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    excludes=("$@")

    source_files_file="$(mktemp "${TMPDIR:-/tmp}/tdk-distribute-source-files.XXXXXX")" || return 1
    if ! collect_files "$source_dir" "${includes[@]}" -- "${excludes[@]}" > "$source_files_file"; then
        rm -f "$source_files_file"
        return 1
    fi
    while IFS= read -r -d '' source_rel; do
        mapped_targets["$source_rel"]=1
    done < "$source_files_file"
    rm -f "$source_files_file"

    for pattern in "${includes[@]}"; do
        target="$target_dir/${pattern%/}"
        if [[ -d "$target" ]]; then
            target_files_file="$(mktemp "${TMPDIR:-/tmp}/tdk-distribute-target-files.XXXXXX")" || return 1
            if ! find "$target" -type f -print0 2>/dev/null | sort -z > "$target_files_file"; then
                rm -f "$target_files_file"
                return 1
            fi
            while IFS= read -r -d '' file; do
                rel="${file#$target_dir/}"
                if ! is_excluded "$rel" "${excludes[@]}" && [[ -z "${mapped_targets[$rel]+present}" ]]; then
                    printf '%s\0' "$rel"
                fi
            done < "$target_files_file"
            rm -f "$target_files_file"
        elif [[ -f "$target" ]]; then
            rel="${pattern%/}"
            if ! is_excluded "$rel" "${excludes[@]}" && [[ -z "${mapped_targets[$rel]+present}" ]]; then
                printf '%s\0' "$rel"
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
    local source_dir="$1" target_dir="$2"; shift 2
    local -a saved_includes=() saved_excludes=()
    local files_file orphans_file rel src dst src_sha dst_sha
    local total=0 count=0

    G_NEW=()
    G_UPDATED=()
    G_UNCHANGED=()
    G_DELETED=()

    while [[ $# -gt 0 && "$1" != "--" ]]; do saved_includes+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    saved_excludes=("$@")

    files_file="$(mktemp "${TMPDIR:-/tmp}/tdk-distribute-files.XXXXXX")" || return 1
    if ! collect_files "$source_dir" "${saved_includes[@]}" -- "${saved_excludes[@]}" > "$files_file"; then
        rm -f "$files_file"
        return 1
    fi
    while IFS= read -r -d '' rel; do ((total+=1)); done < "$files_file"

    while IFS= read -r -d '' rel; do
        ((count+=1))
        printf "\r${DIM}  [%d/%d] Comparing...${NC}" "$count" "$total" >&2
        src="$source_dir/$rel"
        dst="$target_dir/$rel"

        if [[ ! -f "$dst" ]]; then
            G_NEW+=("$rel")
            log_dim "  [NEW] $rel"
        elif $FORCE; then
            G_UPDATED+=("$rel")
            log_dim "  [FORCE] $rel → UPDATED"
        else
            if ! src_sha="$(rendered_source_sha256 "$src" "$source_dir" "$rel")" || \
                ! dst_sha="$(file_sha256 "$dst")"; then
                rm -f "$files_file"
                return 1
            fi
            if [[ "$src_sha" != "$dst_sha" ]]; then
                G_UPDATED+=("$rel")
                log_dim "  [SHA-256] $rel: $src_sha ≠ $dst_sha → UPDATED"
            else
                G_UNCHANGED+=("$rel")
                log_dim "  [SHA-256] $rel: $src_sha → UNCHANGED"
            fi
        fi
    done < "$files_file"
    rm -f "$files_file"
    printf "\r%*s\r" 50 "" >&2

    if ! $NO_DELETE; then
        orphans_file="$(mktemp "${TMPDIR:-/tmp}/tdk-distribute-orphans.XXXXXX")" || return 1
        if ! collect_target_orphans "$source_dir" "$target_dir" \
            "${saved_includes[@]}" -- "${saved_excludes[@]}" > "$orphans_file"; then
            rm -f "$orphans_file"
            return 1
        fi
        while IFS= read -r -d '' rel; do
            G_DELETED+=("$rel")
            log_dim "  [ORPHAN] $rel → DELETED"
        done < "$orphans_file"
        rm -f "$orphans_file"
    fi
}

classify_target_without_release_manifest() {
    local source_dir="$1" target_dir="$2"; shift 2
    local -a saved_includes=() saved_excludes=()
    local files_file rel

    G_NEW=()
    G_UPDATED=()
    G_UNCHANGED=()
    G_DELETED=()

    while [[ $# -gt 0 && "$1" != "--" ]]; do saved_includes+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    saved_excludes=("$@")

    files_file="$(mktemp "${TMPDIR:-/tmp}/tdk-distribute-files.XXXXXX")" || return 1
    if ! collect_files "$source_dir" "${saved_includes[@]}" -- "${saved_excludes[@]}" > "$files_file"; then
        rm -f "$files_file"
        return 1
    fi
    while IFS= read -r -d '' rel; do
        if [[ -f "$target_dir/$rel" ]]; then
            G_UPDATED+=("$rel")
            log_dim "  [BOOTSTRAP] $rel → UPDATED"
        else
            G_NEW+=("$rel")
            log_dim "  [BOOTSTRAP] $rel → NEW"
        fi
    done < "$files_file"
    rm -f "$files_file"
}

append_release_manifest_copy_state() {
    local source_sha target_sha
    if [[ ! -f "$TARGET_RELEASE_MANIFEST" ]]; then
        G_NEW+=("$RELEASE_MANIFEST_REL")
    elif ! source_sha="$(file_sha256 "$SOURCE_RELEASE_MANIFEST")" || \
        ! target_sha="$(file_sha256 "$TARGET_RELEASE_MANIFEST")"; then
        return 1
    elif [[ "$source_sha" != "$target_sha" ]]; then
        G_UPDATED+=("$RELEASE_MANIFEST_REL")
    else
        G_UNCHANGED+=("$RELEASE_MANIFEST_REL")
    fi
}

remove_classified_path() {
    local array_name="$1" path="$2" item
    local -a filtered=()
    local -n classified="$array_name"
    for item in "${classified[@]}"; do
        [[ "$item" == "$path" ]] || filtered+=("$item")
    done
    classified=("${filtered[@]}")
}

reconcile_materialized_release_manifest_state() {
    local desired_manifest desired_sha target_sha
    remove_classified_path G_NEW "$RELEASE_MANIFEST_REL"
    remove_classified_path G_UPDATED "$RELEASE_MANIFEST_REL"
    remove_classified_path G_UNCHANGED "$RELEASE_MANIFEST_REL"
    remove_classified_path G_DELETED "$RELEASE_MANIFEST_REL"

    if [[ ! -f "$TARGET_RELEASE_MANIFEST" ]]; then
        G_NEW+=("$RELEASE_MANIFEST_REL")
        return
    fi
    if [[ ${#G_NEW[@]} -gt 0 || ${#G_UPDATED[@]} -gt 0 || ${#G_DELETED[@]} -gt 0 ]]; then
        G_UPDATED+=("$RELEASE_MANIFEST_REL")
        return
    fi

    desired_manifest="$(mktemp "${TMPDIR:-/tmp}/tdk-release-manifest-materialized.XXXXXX")" || return 1
    if ! bun "$DIFF_RELEASE_MANIFESTS_TS_SCRIPT" \
        --source-root "$SOURCE_ROOT" \
        --materialize-target-root "$TARGET_ROOT" > "$desired_manifest" || \
        ! desired_sha="$(file_sha256 "$desired_manifest")" || \
        ! target_sha="$(file_sha256 "$TARGET_RELEASE_MANIFEST")"; then
        rm -f "$desired_manifest"
        return 1
    fi
    rm -f "$desired_manifest"

    if [[ "$desired_sha" == "$target_sha" ]]; then
        G_UNCHANGED+=("$RELEASE_MANIFEST_REL")
    else
        G_UPDATED+=("$RELEASE_MANIFEST_REL")
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
    local output_file stderr_file action rel expected_sha
    local -a target_mode_args=() target_snapshot_args=()
    TARGET_MANIFEST_SHA=()
    MANIFEST_DIFF_ACTIONS=()
    MANIFEST_DIFF_PATHS=()
    MANIFEST_DIFF_DELETED=()
    output_file="$(mktemp "${TMPDIR:-/tmp}/tdk-release-manifest-diff.XXXXXX")"
    stderr_file="$(mktemp "${TMPDIR:-/tmp}/tdk-release-manifest-diff.XXXXXX")"
    $FORCE && target_mode_args+=(--force-target-inventory)
    if [[ -n "$TARGET_MANIFEST_SNAPSHOT_SHA" ]]; then
        target_snapshot_args+=(--expected-target-manifest-sha "$TARGET_MANIFEST_SNAPSHOT_SHA")
    elif $FORCE; then
        target_snapshot_args+=(--expect-target-manifest-absent)
    fi
    if ! bun "$DIFF_RELEASE_MANIFESTS_TS_SCRIPT" \
        --source-root "$source_dir" \
        --target-root "$target_dir" \
        "${target_mode_args[@]}" \
        "${target_snapshot_args[@]}" \
        --output nul > "$output_file" 2>"$stderr_file"; then
        cat "$stderr_file" >&2
        rm -f "$output_file" "$stderr_file"
        exit 1
    fi
    rm -f "$stderr_file"

    exec 3< "$output_file"
    while :; do
        action=""
        if ! IFS= read -r -d '' action <&3; then
            [[ -z "$action" ]] && break
            exec 3<&-
            rm -f "$output_file"
            echo -e "${RED}Error: invalid NUL-delimited release manifest diff${NC}" >&2
            exit 1
        fi
        if ! IFS= read -r -d '' rel <&3 || ! IFS= read -r -d '' expected_sha <&3 || \
            [[ -z "$action" || -z "$rel" ]]; then
            exec 3<&-
            rm -f "$output_file"
            echo -e "${RED}Error: invalid NUL-delimited release manifest diff${NC}" >&2
            exit 1
        fi
        MANIFEST_DIFF_ACTIONS+=("$action")
        MANIFEST_DIFF_PATHS+=("$rel")
        if [[ -n "$expected_sha" ]]; then
            TARGET_MANIFEST_SHA["$rel"]="$expected_sha"
        fi
        if [[ "$action" == "deleted" ]]; then
            MANIFEST_DIFF_DELETED+=("$rel")
        fi
    done
    exec 3<&-
    rm -f "$output_file"
}

filter_force_delete_candidates() {
    local rel target
    local -a present=()
    FORCE_ABSENT_DELETE_GUARDS=()
    for rel in "${G_DELETED[@]}"; do
        [[ "$rel" == "$RELEASE_MANIFEST_REL" ]] && continue
        target="$TARGET_ROOT/$rel"
        validate_force_target_node "$rel" || return 1
        if [[ -e "$target" || -L "$target" ]]; then
            present+=("$rel")
        else
            FORCE_ABSENT_DELETE_GUARDS+=("$rel")
        fi
    done
    G_DELETED=("${present[@]}")
}

classify_with_release_manifest_diff() {
    local source_dir="$1"
    local target_dir="$2"
    local index action rel

    G_NEW=()
    G_UPDATED=()
    G_UNCHANGED=()
    G_DELETED=()

    load_release_manifest_diff "$source_dir" "$target_dir"
    for index in "${!MANIFEST_DIFF_ACTIONS[@]}"; do
        action="${MANIFEST_DIFF_ACTIONS[$index]}"
        rel="${MANIFEST_DIFF_PATHS[$index]}"
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
    done

    if $NO_DELETE; then
        G_DELETED=()
    fi
    append_release_manifest_copy_state
}

classify_force_release_manifest_paths() {
    local source_dir="$1" target_dir="$2"
    local index action rel src dst

    G_NEW=()
    G_UPDATED=()
    G_UNCHANGED=()
    G_DELETED=()

    for index in "${!MANIFEST_DIFF_ACTIONS[@]}"; do
        action="${MANIFEST_DIFF_ACTIONS[$index]}"
        rel="${MANIFEST_DIFF_PATHS[$index]}"
        if [[ "$action" == "deleted" ]]; then
            G_DELETED+=("$rel")
            log_dim "  [FORCE] $rel → DELETED"
            continue
        fi

        src="$source_dir/$rel"
        if [[ ! -f "$src" || -L "$src" ]]; then
            echo -e "${RED}Error: source release manifest path is not a regular non-symlink file: $rel${NC}" >&2
            return 1
        fi
        dst="$target_dir/$rel"
        if [[ ! -e "$dst" && ! -L "$dst" ]]; then
            G_NEW+=("$rel")
            log_dim "  [FORCE] $rel → NEW"
        else
            G_UPDATED+=("$rel")
            log_dim "  [FORCE] $rel → UPDATED"
        fi
    done

    filter_force_delete_candidates || return 1
    if $NO_DELETE; then
        G_DELETED=()
        FORCE_ABSENT_DELETE_GUARDS=()
    fi
    append_release_manifest_copy_state
    remove_classified_path G_NEW "$RELEASE_MANIFEST_REL"
    remove_classified_path G_UPDATED "$RELEASE_MANIFEST_REL"
    remove_classified_path G_UNCHANGED "$RELEASE_MANIFEST_REL"
    if [[ -f "$TARGET_RELEASE_MANIFEST" ]]; then
        G_UPDATED+=("$RELEASE_MANIFEST_REL")
    else
        G_NEW+=("$RELEASE_MANIFEST_REL")
    fi
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

    if $FORCE; then
        load_release_manifest_diff "$source_dir" "$target_dir"
        log_dim "Using destructive force classification with validated release-manifest path inventory"
        classify_force_release_manifest_paths "$source_dir" "$target_dir" || exit 1
    elif [[ ! -f "$TARGET_RELEASE_MANIFEST" ]]; then
        log_dim "Target release manifest missing; first ship will not delete target orphans"
        classify_target_without_release_manifest "$source_dir" "$target_dir" "$@"
    elif [[ -n "$BRAND_PREFIX" ]]; then
        load_release_manifest_diff "$source_dir" "$target_dir"
        log_dim "Using rendered/full classification with release-manifest ownership proof"
        classify_files "$source_dir" "$target_dir" "$@"
        if $NO_DELETE; then
            G_DELETED=()
        else
            G_DELETED=("${MANIFEST_DIFF_DELETED[@]}")
        fi
        reconcile_materialized_release_manifest_state || exit 1
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

if $FORCE; then
    echo -e "${BOLD}${RED}⚠ FORCE OVERRIDE ENABLED${NC}"
    echo -e "  ${YELLOW}Current release paths will overwrite consumer bytes.${NC}"
    echo -e "  ${YELLOW}Target ownership, checksums, and legacy manifest compatibility are ignored.${NC}"
    echo -e "  ${YELLOW}Prior-manifest-only paths may be deleted only after separate delete approval.${NC}"
    echo -e "  ${DIM}Path containment, symlink/nonregular checks, rollback, and manifest publication checks remain enforced.${NC}"
    echo ""
fi

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
    if $FORCE; then
        echo -e -n "${WHITE}Destructively overwrite consumer changes in ${BOLD}$TARGET_ROOT${NC}${WHITE}? [y/N] ${NC}"
    else
        echo -e -n "${WHITE}Proceed with sync to ${BOLD}$TARGET_ROOT${NC}${WHITE}? [y/N] ${NC}"
    fi
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
PUBLICATION_SNAPSHOT_INVALID=false
TRANSACTION_ACTIVE=false
PENDING_TRANSACTION_SIGNAL=""
PENDING_TRANSACTION_SIGNAL_EXIT_CODE=1
ACTIVE_TRANSACTION_TEMP=""
declare -A TRANSACTION_OUTPUT_SHA=()

prepare_distribution_rollback() {
    local rel target backup backup_sha
    ROLLBACK_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/tdk-distribute-rollback.XXXXXX")" || return 1

    if $FORCE; then
        FORCE_PREIMAGE_PRESENT=()
        FORCE_PREIMAGE_SHA=()
        for rel in "${FORCE_ABSENT_DELETE_GUARDS[@]}"; do
            validate_force_target_node "$rel" || return 1
            if [[ -e "$TARGET_ROOT/$rel" || -L "$TARGET_ROOT/$rel" ]]; then
                echo -e "${RED}Error: force delete target appeared after classification: $rel${NC}" >&2
                return 1
            fi
            FORCE_PREIMAGE_PRESENT["$rel"]="false"
        done
        for rel in "${SYNC_NEW[@]}" "${SYNC_UPDATED[@]}" "${SYNC_DELETED[@]}"; do
            [[ -z "$rel" || "$rel" == "$RELEASE_MANIFEST_REL" ]] && continue
            snapshot_force_target_preimage "$rel" || return 1
            [[ "${FORCE_PREIMAGE_PRESENT[$rel]}" == "true" ]] || continue
            target="$TARGET_ROOT/$rel"
            backup="$ROLLBACK_ROOT/$rel"
            mkdir -p "$(dirname "$backup")" || return 1
            if ! cp -p "$target" "$backup" || \
                ! backup_sha="$(file_sha256 "$backup")" || \
                [[ "$backup_sha" != "${FORCE_PREIMAGE_SHA[$rel]}" ]] || \
                ! verify_force_target_preimage "$rel"; then
                echo -e "${RED}Error: force target changed while preparing rollback: $rel${NC}" >&2
                return 1
            fi
        done
        return 0
    fi

    for rel in "${SYNC_NEW[@]}"; do
        [[ "$rel" == "$RELEASE_MANIFEST_REL" ]] && continue
        verify_new_target_absent "$rel" || return 1
    done
    for rel in "${SYNC_UPDATED[@]}" "${SYNC_DELETED[@]}"; do
        [[ -z "$rel" || "$rel" == "$RELEASE_MANIFEST_REL" ]] && continue
        verify_target_preimage "$rel" "${TARGET_MANIFEST_SHA[$rel]:-}" || return 1
        target="$TARGET_ROOT/$rel"
        backup="$ROLLBACK_ROOT/$rel"
        mkdir -p "$(dirname "$backup")" || return 1
        cp -p "$target" "$backup" || return 1
    done
}

rollback_distribution_mutations() {
    local rel target backup dst_dir tmp rollback_failed=false
    if [[ -z "$ROLLBACK_ROOT" || ! -d "$ROLLBACK_ROOT" ]]; then
        echo -e "${RED}Error: distribution rollback backup is unavailable.${NC}" >&2
        return 1
    fi
    for rel in "${TRANSACTION_NEW[@]}"; do
        target="$TARGET_ROOT/$rel"
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
        target="$TARGET_ROOT/$rel"
        backup="$ROLLBACK_ROOT/$rel"
        dst_dir="$(dirname "$target")"
        if ! assert_safe_target_path "$rel" || ! mkdir -p "$dst_dir"; then
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
        target="$TARGET_ROOT/$rel"
        backup="$ROLLBACK_ROOT/$rel"
        dst_dir="$(dirname "$target")"
        if ! assert_safe_target_path "$rel" || [[ -e "$target" || -L "$target" ]] || ! mkdir -p "$dst_dir"; then
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
    if $PUBLICATION_SNAPSHOT_INVALID; then
        echo -e "${YELLOW}Payload rollback completed, but an external target change invalidated the release snapshot; inspect the target before rerunning.${NC}"
    else
        echo -e "${YELLOW}Payload changes rolled back; the previous release manifest remains authoritative.${NC}"
    fi
}

finish_distribution_transaction() {
    [[ -z "$ROLLBACK_ROOT" ]] || rm -rf "$ROLLBACK_ROOT"
    ROLLBACK_ROOT=""
}

discard_active_transaction_temp() {
    if [[ -n "$ACTIVE_TRANSACTION_TEMP" && "$ACTIVE_TRANSACTION_TEMP" == "$TARGET_ROOT"/* ]]; then
        rm -f "$ACTIVE_TRANSACTION_TEMP"
    fi
    ACTIVE_TRANSACTION_TEMP=""
}

abort_active_distribution_transaction() {
    local reason="$1" exit_code="$2" rollback_failed=false
    trap - EXIT INT TERM HUP
    echo -e "${RED}Distribution interrupted by $reason; rolling back completed mutations.${NC}" >&2
    TRANSACTION_ACTIVE=false
    discard_active_transaction_temp
    rollback_distribution_mutations || rollback_failed=true
    finish_distribution_transaction
    cleanup_render_tmp
    $rollback_failed && exit_code=1
    exit "$exit_code"
}

handle_distribution_exit() {
    local exit_code="$1"
    if [[ "${TRANSACTION_ACTIVE:-false}" == "true" ]]; then
        [[ $exit_code -ne 0 ]] || exit_code=1
        abort_active_distribution_transaction "unexpected exit" "$exit_code"
    fi
    cleanup_render_tmp
}

handle_distribution_signal() {
    PENDING_TRANSACTION_SIGNAL="$1"
    PENDING_TRANSACTION_SIGNAL_EXIT_CODE="$2"
}

abort_if_transaction_signal_pending() {
    local reason exit_code
    [[ -n "$PENDING_TRANSACTION_SIGNAL" ]] || return 0
    reason="$PENDING_TRANSACTION_SIGNAL"
    exit_code="$PENDING_TRANSACTION_SIGNAL_EXIT_CODE"
    PENDING_TRANSACTION_SIGNAL=""
    abort_active_distribution_transaction "$reason" "$exit_code"
}

commit_distribution_transaction() {
    TRANSACTION_ACTIVE=false
    trap - INT TERM HUP
    finish_distribution_transaction
}

exit_if_committed_signal_pending() {
    local reason exit_code
    [[ -n "$PENDING_TRANSACTION_SIGNAL" ]] || return 0
    reason="$PENDING_TRANSACTION_SIGNAL"
    exit_code="$PENDING_TRANSACTION_SIGNAL_EXIT_CODE"
    PENDING_TRANSACTION_SIGNAL=""
    echo -e "${YELLOW}Distribution committed before handling $reason.${NC}" >&2
    cleanup_render_tmp
    exit "$exit_code"
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

    if $FORCE; then
        if ! verify_force_target_preimage "$rel"; then
            ERRORS+=("force target proof failed: $rel")
            ((ERROR_COUNT+=1))
            return
        fi
    elif [[ "$action" == "new" ]]; then
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
    ACTIVE_TRANSACTION_TEMP="$tmp"
    if [[ -n "$PENDING_TRANSACTION_SIGNAL" ]]; then
        discard_active_transaction_temp
        abort_if_transaction_signal_pending
    fi
    if render_source_to_path "$src" "$SOURCE_ROOT" "$rel" "$tmp" 2>/dev/null && \
        copy_source_mode "$src" "$tmp" && rendered_sha="$(file_sha256 "$tmp")"; then
        if $FORCE; then
            if ! verify_force_target_preimage "$rel"; then
                discard_active_transaction_temp
                ERRORS+=("force target changed before copy: $rel")
                ((ERROR_COUNT+=1))
                return
            fi
        elif [[ "$action" == "new" ]]; then
            if ! verify_new_target_absent "$rel"; then
                discard_active_transaction_temp
                ERRORS+=("new target changed before copy: $rel")
                ((ERROR_COUNT+=1))
                return
            fi
        else
            if ! verify_target_preimage "$rel" "$expected_sha"; then
                discard_active_transaction_temp
                ERRORS+=("managed target changed before copy: $rel")
                ((ERROR_COUNT+=1))
                return
            fi
        fi
        if [[ -n "$PENDING_TRANSACTION_SIGNAL" ]]; then
            discard_active_transaction_temp
            abort_if_transaction_signal_pending
        fi
        if mv -f "$tmp" "$dst" 2>/dev/null; then
            copied=true
            ACTIVE_TRANSACTION_TEMP=""
            TRANSACTION_OUTPUT_SHA["$rel"]="$rendered_sha"
            if [[ "$action" == "new" ]]; then
                TRANSACTION_NEW+=("$rel")
            else
                TRANSACTION_UPDATED+=("$rel")
            fi
            ((COPIED_COUNT+=1))
        fi
    fi
    $copied || discard_active_transaction_temp
    abort_if_transaction_signal_pending

    if $copied; then
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
    if $FORCE; then
        if [[ "${FORCE_PREIMAGE_PRESENT[$rel]:-false}" == "false" ]]; then
            if ! verify_force_target_preimage "$rel"; then
                ERRORS+=("force delete proof failed: $rel")
                ((ERROR_COUNT+=1))
            fi
            abort_if_transaction_signal_pending
            return
        fi
        if ! verify_force_target_preimage "$rel"; then
            ERRORS+=("force delete proof failed: $rel")
            ((ERROR_COUNT+=1))
            echo -e "  ${RED}✗ [$label] $rel (force delete proof failed)${NC}"
            return
        fi
    elif ! verify_target_preimage "$rel" "$expected_sha"; then
        ERRORS+=("delete proof failed: $rel")
        ((ERROR_COUNT+=1))
        echo -e "  ${RED}✗ [$label] $rel (delete proof failed)${NC}"
        return
    fi
    abort_if_transaction_signal_pending
    if rm -f "$dst" 2>/dev/null; then
        TRANSACTION_DELETED+=("$rel")
        ((DELETED_COUNT+=1))
        abort_if_transaction_signal_pending
        echo -e "  ${RED}✗${NC} [$label] $rel (deleted)"
    else
        abort_if_transaction_signal_pending
        ERRORS+=("delete failed: $rel")
        ((ERROR_COUNT+=1))
        echo -e "  ${RED}✗ [$label] $rel (delete failed)${NC}"
    fi
}

validate_transaction_snapshot() {
    local rel target
    for rel in "${TRANSACTION_NEW[@]}" "${TRANSACTION_UPDATED[@]}"; do
        if ! verify_target_preimage "$rel" "${TRANSACTION_OUTPUT_SHA[$rel]:-}"; then
            echo -e "${RED}Error: transaction output changed before manifest publish: $rel${NC}" >&2
            return 1
        fi
    done
    for rel in "${TRANSACTION_DELETED[@]}"; do
        assert_safe_target_path "$rel" || return 1
        target="$TARGET_ROOT/$rel"
        if [[ -e "$target" || -L "$target" ]]; then
            echo -e "${RED}Error: deleted transaction target reappeared before manifest publish: $rel${NC}" >&2
            return 1
        fi
    done
    if $FORCE; then
        for rel in "${FORCE_ABSENT_DELETE_GUARDS[@]}"; do
            assert_safe_target_path "$rel" || return 1
            target="$TARGET_ROOT/$rel"
            if [[ -e "$target" || -L "$target" ]]; then
                echo -e "${RED}Error: absent force delete target reappeared before manifest publish: $rel${NC}" >&2
                return 1
            fi
        done
    fi
    for rel in "${SYNC_UNCHANGED[@]}"; do
        [[ "$rel" == "$RELEASE_MANIFEST_REL" ]] && continue
        if [[ -z "${TARGET_MANIFEST_SHA[$rel]+present}" ]]; then
            if [[ -n "$BRAND_PREFIX" ]]; then
                echo -e "${RED}Error: unchanged prefixed target changed before manifest publish: $rel${NC}" >&2
                return 1
            fi
            continue
        fi
        if ! verify_target_preimage "$rel" "${TARGET_MANIFEST_SHA[$rel]}"; then
            if [[ -n "$BRAND_PREFIX" ]]; then
                echo -e "${RED}Error: unchanged prefixed target changed before manifest publish: $rel${NC}" >&2
            else
                echo -e "${RED}Error: unchanged target changed before manifest publish: $rel${NC}" >&2
            fi
            return 1
        fi
    done
}

verify_published_release_manifest() {
    local expected_sha="$1" current_sha
    if [[ ! -f "$TARGET_RELEASE_MANIFEST" || -L "$TARGET_RELEASE_MANIFEST" ]] || \
        ! current_sha="$(file_sha256 "$TARGET_RELEASE_MANIFEST")" || \
        [[ "$current_sha" != "$expected_sha" ]]; then
        echo -e "${RED}Error: target release manifest changed after publish${NC}" >&2
        return 1
    fi
}

restore_published_release_manifest() {
    local previous_manifest="$1" published_sha="$2" current_sha
    if [[ ! -f "$TARGET_RELEASE_MANIFEST" || -L "$TARGET_RELEASE_MANIFEST" ]]; then
        echo -e "${RED}Error: cannot restore target release manifest after failed publication${NC}" >&2
        return 1
    fi
    current_sha="$(file_sha256 "$TARGET_RELEASE_MANIFEST")" || return 1
    if [[ "$current_sha" != "$published_sha" ]]; then
        echo -e "${RED}Error: target release manifest changed during failed publication${NC}" >&2
        return 1
    fi
    if [[ -n "$previous_manifest" ]]; then
        if ! mv -f "$previous_manifest" "$TARGET_RELEASE_MANIFEST"; then
            echo -e "${RED}Error: could not restore target release manifest${NC}" >&2
            return 1
        fi
        current_sha="$(file_sha256 "$TARGET_RELEASE_MANIFEST")" || return 1
        if [[ "$current_sha" != "$TARGET_MANIFEST_SNAPSHOT_SHA" ]]; then
            echo -e "${RED}Error: restored target release manifest checksum mismatch${NC}" >&2
            return 1
        fi
    elif ! rm -f "$TARGET_RELEASE_MANIFEST"; then
        echo -e "${RED}Error: could not remove target release manifest after failed publication${NC}" >&2
        return 1
    fi
}

publish_release_manifest() {
    local dst_dir tmp previous_manifest="" current_sha previous_sha published_sha
    assert_safe_target_path "$RELEASE_MANIFEST_REL" || return 1
    dst_dir="$(dirname "$TARGET_RELEASE_MANIFEST")"
    mkdir -p "$dst_dir" || return 1

    tmp="$(mktemp "$dst_dir/.release-manifest.XXXXXX")" || return 1
    ACTIVE_TRANSACTION_TEMP="$tmp"
    if [[ -n "$BRAND_PREFIX" ]] || $FORCE; then
        if ! bun "$DIFF_RELEASE_MANIFESTS_TS_SCRIPT" \
            --source-root "$SOURCE_ROOT" \
            --materialize-target-root "$TARGET_ROOT" > "$tmp"; then
            discard_active_transaction_temp
            return 1
        fi
    elif ! cp -f "$SOURCE_RELEASE_MANIFEST" "$tmp"; then
        discard_active_transaction_temp
        return 1
    fi
    if ! copy_source_mode "$SOURCE_RELEASE_MANIFEST" "$tmp" || \
        ! published_sha="$(file_sha256 "$tmp")"; then
        discard_active_transaction_temp
        return 1
    fi
    if [[ -n "$PENDING_TRANSACTION_SIGNAL" ]]; then
        discard_active_transaction_temp
        abort_if_transaction_signal_pending
    fi

    # These checks bound this publication snapshot. A non-cooperating external writer
    # can still mutate after the post-publication check without a broader lock/staging protocol.
    if ! validate_transaction_snapshot; then
        PUBLICATION_SNAPSHOT_INVALID=true
        discard_active_transaction_temp
        return 1
    fi
    if [[ -n "$TARGET_MANIFEST_SNAPSHOT_SHA" ]]; then
        if [[ ! -f "$TARGET_RELEASE_MANIFEST" || -L "$TARGET_RELEASE_MANIFEST" ]] || \
            ! current_sha="$(file_sha256 "$TARGET_RELEASE_MANIFEST")" || \
            [[ "$current_sha" != "$TARGET_MANIFEST_SNAPSHOT_SHA" ]]; then
            discard_active_transaction_temp
            echo -e "${RED}Error: target release manifest changed before publish${NC}" >&2
            return 1
        fi
        previous_manifest="$(mktemp "$dst_dir/.release-manifest.previous.XXXXXX")" || {
            discard_active_transaction_temp
            return 1
        }
        if ! cp -p "$TARGET_RELEASE_MANIFEST" "$previous_manifest" || \
            ! previous_sha="$(file_sha256 "$previous_manifest")" || \
            [[ "$previous_sha" != "$TARGET_MANIFEST_SNAPSHOT_SHA" ]] || \
            [[ ! -f "$TARGET_RELEASE_MANIFEST" || -L "$TARGET_RELEASE_MANIFEST" ]] || \
            ! current_sha="$(file_sha256 "$TARGET_RELEASE_MANIFEST")" || \
            [[ "$current_sha" != "$TARGET_MANIFEST_SNAPSHOT_SHA" ]]; then
            discard_active_transaction_temp
            rm -f "$previous_manifest"
            echo -e "${RED}Error: could not snapshot target release manifest${NC}" >&2
            return 1
        fi
    elif [[ -e "$TARGET_RELEASE_MANIFEST" || -L "$TARGET_RELEASE_MANIFEST" ]]; then
        discard_active_transaction_temp
        echo -e "${RED}Error: target release manifest appeared before publish${NC}" >&2
        return 1
    fi
    if [[ -n "$PENDING_TRANSACTION_SIGNAL" ]]; then
        discard_active_transaction_temp
        rm -f "$previous_manifest"
        abort_if_transaction_signal_pending
    fi
    if ! mv -f "$tmp" "$TARGET_RELEASE_MANIFEST"; then
        discard_active_transaction_temp
        rm -f "$previous_manifest"
        return 1
    fi
    ACTIVE_TRANSACTION_TEMP=""
    if ! verify_published_release_manifest "$published_sha"; then
        PUBLICATION_SNAPSHOT_INVALID=true
        [[ -z "$previous_manifest" ]] || \
            echo -e "${YELLOW}Previous release manifest backup retained for inspection: $previous_manifest${NC}" >&2
        return 1
    fi
    if ! validate_transaction_snapshot; then
        PUBLICATION_SNAPSHOT_INVALID=true
        restore_published_release_manifest "$previous_manifest" "$published_sha" || return 1
        return 1
    fi
    if ! verify_published_release_manifest "$published_sha"; then
        PUBLICATION_SNAPSHOT_INVALID=true
        [[ -z "$previous_manifest" ]] || \
            echo -e "${YELLOW}Previous release manifest backup retained for inspection: $previous_manifest${NC}" >&2
        return 1
    fi
    rm -f "$previous_manifest"
    ((COPIED_COUNT+=1))
    echo -e "  ${GREEN}✓${NC} [root] $RELEASE_MANIFEST_REL"
    commit_distribution_transaction
    exit_if_committed_signal_pending
}

MANIFEST_SHOULD_COPY=false

if ! prepare_distribution_rollback; then
    finish_distribution_transaction
    echo -e "${RED}Distribution rollback preparation failed. No files were changed.${NC}" >&2
    exit 1
fi
TRANSACTION_ACTIVE=true
trap 'handle_distribution_signal INT 130' INT
trap 'handle_distribution_signal TERM 143' TERM
trap 'handle_distribution_signal HUP 129' HUP
trap 'handle_distribution_exit $?' EXIT

# Sync new files
for rel in "${SYNC_NEW[@]}"; do
    if [[ "$rel" == "$RELEASE_MANIFEST_REL" ]]; then
        MANIFEST_SHOULD_COPY=true
        continue
    fi
    action="new"
    if $FORCE; then
        [[ "${FORCE_PREIMAGE_PRESENT[$rel]:-false}" == "true" ]] && action="updated"
    else
        [[ -z "${TARGET_MANIFEST_SHA[$rel]:-}" ]] || action="updated"
    fi
    copy_one "$SOURCE_ROOT/$rel" "$TARGET_ROOT/$rel" "$rel" "root" "$action" "${TARGET_MANIFEST_SHA[$rel]:-}"
    [[ $ERROR_COUNT -gt 0 ]] && break
done

# Sync updated files only while earlier copies remain successful.
if [[ $ERROR_COUNT -eq 0 ]]; then
    for rel in "${SYNC_UPDATED[@]}"; do
        if [[ "$rel" == "$RELEASE_MANIFEST_REL" ]]; then
            MANIFEST_SHOULD_COPY=true
            continue
        fi
        action="updated"
        $FORCE && [[ "${FORCE_PREIMAGE_PRESENT[$rel]:-false}" == "false" ]] && action="new"
        copy_one "$SOURCE_ROOT/$rel" "$TARGET_ROOT/$rel" "$rel" "root" "$action" "${TARGET_MANIFEST_SHA[$rel]:-}"
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
    TRANSACTION_ACTIVE=false
    trap - INT TERM HUP
    if ! rollback_distribution_mutations; then
        ERRORS+=("payload rollback incomplete")
        ((ERROR_COUNT+=1))
    fi
else
    if $TRANSACTION_ACTIVE; then
        abort_if_transaction_signal_pending
        commit_distribution_transaction
    fi
    exit_if_committed_signal_pending
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

#!/usr/bin/env python3
"""One-way sync of common .specify/ files from source project to target project.

Compares files by MD5, compares skills via manifest.json checksums.
Supports --dry-run mode (JSON output only, no writes).

Usage:
    python sync-distribute-common-files.py \
      --source /path/to/source/.specify \
      --target /path/to/target/.specify \
      --config /path/to/sync-config.yaml \
      [--dry-run] [--with-claude] [--force] [--verbose]
"""

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print(
        "Error: pyyaml required. Run: pip install pyyaml",
        file=sys.stderr,
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------

def load_sync_config(config_path: Path) -> dict:
    """Load include/exclude rules from sync-config.yaml."""
    with open(config_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return {
        "include": data.get("include", []),
        "exclude": data.get("exclude", []),
    }


# ---------------------------------------------------------------------------
# Skill loading from manifest.json
# ---------------------------------------------------------------------------

def load_plugin_skills(specify_dir: Path) -> dict:
    """Load flat {skill_name: {version, checksum}} from manifest.json.

    Aggregate checksum per skill includes file paths to prevent file-swap attacks (RT#1).
    Empty skills get sentinel hash instead of "" to prevent silent "unchanged" (RT#1).
    """
    flat = {}
    manifest_path = specify_dir / "plugins" / "manifest.json"
    if not manifest_path.is_file():
        return flat
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return flat
    for plugin_name, plugin_data in data.get("plugins", {}).items():
        components = plugin_data.get("components", {})
        skills = components.get("skills", {})
        files = plugin_data.get("files", {})
        for skill_name, skill_info in skills.items():
            # RT#1: Include file path in hash input to prevent file-swap attacks
            skill_prefix = f"skills/{skill_name}/"
            skill_file_entries = sorted(
                f"{p}:{h}" for p, h in files.items() if p.startswith(skill_prefix)
            )
            # RT#1: Use sentinel for empty skills instead of "" to prevent silent "unchanged"
            if skill_file_entries:
                aggregate = hashlib.sha256("\n".join(skill_file_entries).encode()).hexdigest()
            else:
                aggregate = hashlib.sha256(b"EMPTY_SKILL").hexdigest()
            flat[skill_name] = {
                "version": skill_info.get("version", "0.1.0"),
                "checksum": aggregate,
            }
    return flat


# ---------------------------------------------------------------------------
# Verbose logging helper
# ---------------------------------------------------------------------------

_verbose = False


def vlog(*args, **kwargs):
    """Print to stderr only when --verbose is set."""
    if _verbose:
        print(*args, file=sys.stderr, **kwargs)


# ---------------------------------------------------------------------------
# File MD5 helpers
# ---------------------------------------------------------------------------

def file_md5(path: Path) -> str:
    """Compute MD5 hex digest of a file (binary read)."""
    md5 = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            md5.update(chunk)
    return md5.hexdigest()


# ---------------------------------------------------------------------------
# Include/exclude filtering
# ---------------------------------------------------------------------------

def is_excluded(rel_path: str, exclude_patterns: list) -> bool:
    """Check if rel_path matches any exclude pattern.

    Directory patterns (ending with /) use prefix match OR exact-without-slash match
    (aligned with bash distribute.sh behavior).
    File patterns use exact match.
    """
    normalized = rel_path.replace("\\", "/")
    for pattern in exclude_patterns:
        p = pattern.replace("\\", "/")
        if p.endswith("/"):
            # Match prefix (files inside dir) or exact dir name without trailing slash
            if normalized.startswith(p) or normalized == p.rstrip("/"):
                return True
        else:
            if normalized == p:
                return True
    return False


def collect_include_files(specify_dir: Path, include_patterns: list, exclude_patterns: list) -> dict:
    """Walk include paths and return {rel_path: abs_path} for all non-excluded files."""
    files = {}
    for pattern in include_patterns:
        target = specify_dir / pattern.rstrip("/")
        if not target.exists():
            continue
        if target.is_file():
            rel = pattern.replace("\\", "/")
            if not is_excluded(rel, exclude_patterns):
                files[rel] = target
        elif target.is_dir():
            for f in sorted(target.rglob("*")):
                if not f.is_file():
                    continue
                rel = str(f.relative_to(specify_dir)).replace("\\", "/")
                if not is_excluded(rel, exclude_patterns):
                    files[rel] = f
    return files


# ---------------------------------------------------------------------------
# Skill-level comparison via plugin.json checksums
# ---------------------------------------------------------------------------

def classify_skills(source_skills: dict, target_skills: dict) -> dict:
    """Compare source vs target skill checksums from plugin.json."""
    new_skills = []
    updated_skills = []
    unchanged_skills = []

    for name, info in source_skills.items():
        src_checksum = info.get("checksum", "")
        src_version = info.get("version", "0.1.0")
        if name not in target_skills:
            new_skills.append({"name": name, "version": src_version})
            vlog(f"  [skill] {name}: NEW")
        else:
            tgt_checksum = target_skills[name].get("checksum", "")
            tgt_version = target_skills[name].get("version", "0.1.0")
            if src_checksum != tgt_checksum:
                updated_skills.append({
                    "name": name,
                    "old_version": tgt_version,
                    "new_version": src_version,
                })
                vlog(f"  [skill] {name}: {tgt_version} → {src_version} (checksum changed)")
            else:
                unchanged_skills.append({"name": name})
                vlog(f"  [skill] {name}: unchanged")

    return {
        "new": new_skills,
        "updated": updated_skills,
        "unchanged": unchanged_skills,
    }


# ---------------------------------------------------------------------------
# File-level comparison
# ---------------------------------------------------------------------------

def classify_files(source_files: dict, source_dir: Path, target_dir: Path, force: bool = False) -> dict:
    """Compare source files against target by MD5. Returns new/updated/unchanged lists."""
    new_files = []
    updated_files = []
    unchanged_files = []

    for rel, src_path in source_files.items():
        tgt_path = target_dir / rel
        if not tgt_path.exists():
            new_files.append(rel)
            vlog(f"  [NEW] {rel}")
        elif force:
            updated_files.append(rel)
            vlog(f"  [FORCE] {rel} → UPDATED")
        else:
            src_md5 = file_md5(src_path)
            tgt_md5 = file_md5(tgt_path)
            if src_md5 != tgt_md5:
                updated_files.append(rel)
                vlog(f"  [MD5] {rel}: {src_md5} ≠ {tgt_md5} → UPDATED")
            else:
                unchanged_files.append(rel)
                vlog(f"  [MD5] {rel}: {src_md5} → UNCHANGED")

    return {
        "new": new_files,
        "updated": updated_files,
        "unchanged": unchanged_files,
    }


# ---------------------------------------------------------------------------
# Sync execution
# ---------------------------------------------------------------------------

def copy_file(src: Path, dst: Path) -> None:
    """Copy file, creating parent directories as needed."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def execute_sync(
    source_dir: Path,
    target_dir: Path,
    source_files: dict,
    files_result: dict,
) -> list:
    """Copy new/updated files to target. Returns errors list."""
    errors = []
    to_copy = files_result["new"] + files_result["updated"]

    for rel in to_copy:
        src_path = source_files.get(rel)
        if not src_path:
            continue
        tgt_path = target_dir / rel
        try:
            copy_file(src_path, tgt_path)
        except OSError as e:
            errors.append(f"Failed to copy {rel}: {e}")

    return errors


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# .claude/ include/exclude constants
# ---------------------------------------------------------------------------

CLAUDE_INCLUDES = ["skills", "hooks", "settings.json"]
CLAUDE_EXCLUDES = ["settings.local.json", "session-state/", "worktrees/", "rules/"]


def main():
    global _verbose

    parser = argparse.ArgumentParser(
        description="Sync common .specify/ files from source to target project"
    )
    parser.add_argument("--source", required=True, help="Source .specify/ directory")
    parser.add_argument("--target", required=True, help="Target .specify/ directory")
    parser.add_argument("--config", required=True, help="Path to sync-config.yaml")
    parser.add_argument("--dry-run", action="store_true",
                        help="Output JSON diff only, no file writes")
    parser.add_argument("--with-claude", action="store_true",
                        help="Also sync .claude/ files (skills, hooks, settings)")
    parser.add_argument("--force", action="store_true",
                        help="Skip MD5 comparison, mark all existing as UPDATED")
    parser.add_argument("--verbose", action="store_true",
                        help="Log details to stderr (JSON stays clean on stdout)")
    args = parser.parse_args()

    _verbose = args.verbose

    source_dir = Path(args.source).resolve()
    target_dir = Path(args.target).resolve()
    config_path = Path(args.config).resolve()

    if not source_dir.is_dir():
        print(f"Error: source directory not found: {source_dir}", file=sys.stderr)
        sys.exit(1)
    if not config_path.is_file():
        print(f"Error: config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    config = load_sync_config(config_path)
    vlog(f"Config: {config_path}")
    vlog(f"  Includes: {config['include']}")
    vlog(f"  Excludes: {config['exclude']}")

    # Load skills from plugin.json files (replaces stale manifest.yaml)
    source_skills = load_plugin_skills(source_dir)
    target_skills = load_plugin_skills(target_dir)
    vlog(f"Source skills: {len(source_skills)}, Target skills: {len(target_skills)}")

    # Collect and classify .specify/ files
    source_files = collect_include_files(source_dir, config["include"], config["exclude"])
    vlog(f"Collected {len(source_files)} files from source")

    files_result = classify_files(source_files, source_dir, target_dir, force=args.force)
    skills_result = classify_skills(source_skills, target_skills)

    errors = []

    if not args.dry_run:
        errors = execute_sync(source_dir, target_dir, source_files, files_result)

    result = {
        "source": str(source_dir).replace("\\", "/"),
        "target": str(target_dir).replace("\\", "/"),
        "skills": skills_result,
        "files": files_result,
        "claude": None,
        "errors": errors,
    }

    # .claude/ sync if --with-claude
    if args.with_claude:
        claude_source = source_dir.parent / ".claude"
        claude_target = target_dir.parent / ".claude"
        vlog(f"Claude source: {claude_source}, target: {claude_target}")

        if claude_source.is_dir():
            claude_files = collect_include_files(claude_source, CLAUDE_INCLUDES, CLAUDE_EXCLUDES)
            vlog(f"Collected {len(claude_files)} .claude/ files")
            claude_result = classify_files(claude_files, claude_source, claude_target, force=args.force)

            if not args.dry_run:
                claude_errors = execute_sync(claude_source, claude_target, claude_files, claude_result)
                errors.extend(claude_errors)

            result["claude"] = claude_result
        else:
            vlog(f"Claude source not found: {claude_source}")

    result["errors"] = errors
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

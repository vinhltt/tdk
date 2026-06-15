"""
SHA256 checksum validation script for tdk-memory-checksum skill.

Compares actual SHA256 hashes of .specify/memory/ files against memory.yaml manifest.
Reports mismatches, untracked files, and manifest entries missing from disk.

Usage:
  python validate-memory-checksums-against-manifest.py <memory_root>

Output:
  JSON to stdout with keys: mismatches, missing_from_manifest, missing_from_disk, verified_count

Exit codes:
  0 — success (output JSON even if issues found)
  1 — fatal error (missing manifest, YAML parse error, bad path)
"""
import hashlib
import json
import os
import sys

# Excluded files and directories from manifest tracking (auto-managed)
EXCLUDED_FILES = {"memory-index.md", "CHANGELOG.md"}
EXCLUDED_DIRS = {"_deprecated", "memory-architect"}


def validate_memory_root(memory_root: str) -> None:
    """Validate memory_root is within project .specify/memory/ (no path traversal)."""
    cwd = os.path.abspath(".")
    expected_prefix = os.path.join(cwd, ".specify", "memory")
    if not memory_root.startswith(expected_prefix):
        print(
            "ERROR: path must be within .specify/memory/",
            file=sys.stderr,
        )
        sys.exit(1)


def compute_sha256(file_path: str) -> str | None:
    """Compute SHA256 hex digest of a file. Returns None on permission error."""
    try:
        return hashlib.sha256(open(file_path, "rb").read()).hexdigest()
    except PermissionError as e:
        print(f"WARNING: permission error reading {file_path}: {e}", file=sys.stderr)
        return None


def scan_memory_files(memory_root: str) -> list[str]:
    """
    Recursively scan memory_root for .md files.
    Excludes EXCLUDED_FILES at root and EXCLUDED_DIRS subtrees.
    Returns list of relative paths (forward slashes).
    """
    results = []
    for dirpath, dirnames, filenames in os.walk(memory_root):
        # Prune excluded directories in-place
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDED_DIRS
        ]
        for filename in filenames:
            if not filename.endswith(".md"):
                continue
            abs_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(abs_path, memory_root).replace("\\", "/")
            # Exclude root-level special files
            if rel_path in EXCLUDED_FILES:
                continue
            results.append(rel_path)
    return results


def main() -> None:
    if len(sys.argv) != 2:
        print(
            "Usage: validate-memory-checksums-against-manifest.py <memory_root>",
            file=sys.stderr,
        )
        sys.exit(1)

    memory_root = os.path.abspath(sys.argv[1])
    validate_memory_root(memory_root)

    # Import PyYAML — provide helpful message if missing
    try:
        import yaml
    except ImportError:
        venv_hint = (
            ".venv\\Scripts\\python.exe"
            if sys.platform == "win32"
            else ".venv/bin/python3"
        )
        print(
            f"ERROR: PyYAML required. Run: {venv_hint} -m pip install pyyaml",
            file=sys.stderr,
        )
        sys.exit(1)

    # Load memory.yaml
    manifest_path = os.path.join(memory_root, "memory.yaml")
    if not os.path.isfile(manifest_path):
        print(
            "ERROR: memory.yaml not found. Run /tdk-memory-init first.",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f"ERROR: Failed to parse memory.yaml: {e}", file=sys.stderr)
        sys.exit(1)

    manifest_files: list[dict] = manifest.get("files", []) or []

    # Build lookup: rel_path -> expected sha256
    manifest_index: dict[str, str] = {
        entry["path"]: entry["sha256"]
        for entry in manifest_files
        if "path" in entry and "sha256" in entry
    }

    # Scan actual files on disk
    disk_files = set(scan_memory_files(memory_root))
    manifest_paths = set(manifest_index.keys())

    # Compute results
    mismatches: list[dict] = []
    verified_count = 0

    for rel_path in manifest_paths:
        file_path = os.path.join(memory_root, rel_path)

        if not os.path.isfile(file_path):
            # Handled separately as missing_from_disk
            continue

        actual_hash = compute_sha256(file_path)
        if actual_hash is None:
            # Permission error — skip silently (already logged to stderr)
            continue

        expected_hash = manifest_index[rel_path]
        if actual_hash != expected_hash:
            mismatches.append({
                "path": rel_path,
                "expected": expected_hash,
                "actual": actual_hash,
            })
        else:
            verified_count += 1

    missing_from_manifest = sorted(disk_files - manifest_paths)
    missing_from_disk = sorted(
        rel_path for rel_path in manifest_paths
        if not os.path.isfile(os.path.join(memory_root, rel_path))
    )

    result = {
        "mismatches": mismatches,
        "missing_from_manifest": missing_from_manifest,
        "missing_from_disk": missing_from_disk,
        "verified_count": verified_count,
    }

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

"""
Shared SHA256 utility for tdk-memory skills.
Called by tdk-memory-init and tdk-memory-changelog.

Usage:
  python compute-sha256-hashes.py <memory_root> <relative_file_path>

Output:
  Single SHA256 hex string to stdout.

Path validation: file must be within memory_root (prevents path traversal).
"""
import hashlib
import os
import sys


def main():
    if len(sys.argv) != 3:
        print("Usage: compute-sha256-hashes.py <memory_root> <relative_file_path>", file=sys.stderr)
        sys.exit(1)

    memory_root = os.path.abspath(sys.argv[1])
    rel_path = sys.argv[2]

    # Path validation: must be within memory_root (no path traversal)
    file_path = os.path.abspath(os.path.join(memory_root, rel_path))
    if not file_path.startswith(memory_root + os.sep) and file_path != memory_root:
        print("ERROR: path must be within memory root", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(file_path):
        print(f"ERROR: file not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    with open(file_path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    print(digest)


if __name__ == "__main__":
    main()

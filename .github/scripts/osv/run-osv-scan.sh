#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '::error::OSV scan failed: %s\n' "$*" >&2
  exit 2
}

[[ $# -eq 2 && -n "$1" && -n "$2" ]] || fail 'Usage: run-osv-scan.sh <scan-root> <out.json>'
root=$1
out=$2
[[ ! -d "$out" ]] || fail 'Output path must be a file, not a directory'
# Delete previous output before any operation that can fail. Publish only this run's successful result.
rm -f -- "$out"
[[ -d "$root" ]] || fail "Scan root does not exist: $root"
root=$(realpath -- "$root")
out=$(realpath -m -- "$out")
version=${OSV_SCANNER_VERSION:-}
checksum=${OSV_SCANNER_SHA256:-}
[[ "$version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Set OSV_SCANNER_VERSION to the pinned release version'
[[ "$checksum" =~ ^[a-fA-F0-9]{64}$ ]] || fail 'Set OSV_SCANNER_SHA256 to the pinned Linux amd64 release checksum'
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || fail 'The pinned scanner requires Linux amd64'
version=${version#v}
work=$(mktemp -d "${TMPDIR:-/tmp}/tdk-osv-scan.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p -- "$work/bin" "$work/home" "$work/cache" "$(dirname -- "$out")"
# Explicit lockfiles make parse errors fatal; directory discovery can silently skip them.
if ! git -C "$root" ls-files -z -- 'bun.lock' '**/bun.lock' > "$work/lockfiles"; then
  fail 'Could not enumerate tracked Bun lockfiles'
fi
lockfiles=()
while IFS= read -r -d '' path; do
  [[ -f "$root/$path" ]] || fail "Tracked lockfile is missing: $path"
  lockfiles+=(--lockfile "$root/$path")
done < "$work/lockfiles"
[[ ${#lockfiles[@]} -gt 0 ]] || fail 'No tracked bun.lock files found'
# Ignore repository-local suppression config; the gate must reflect advisory data.
: > "$work/osv-scanner.toml"
# Never use an unverified PATH binary or share database/install state between scans.
export HOME="$work/home"
export XDG_CACHE_HOME="$work/cache"
binary="$work/bin/osv-scanner"
url="https://github.com/google/osv-scanner/releases/download/v$version/osv-scanner_linux_amd64"
if ! curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' "$url" --output "$binary"; then
  fail "Could not download osv-scanner v$version"
fi
if ! printf '%s  %s\n' "$checksum" "$binary" | sha256sum --check --status; then
  fail 'Scanner SHA-256 mismatch; refusing to execute'
fi
chmod 700 -- "$binary"
status=0
"$binary" scan source "${lockfiles[@]}" --config "$work/osv-scanner.toml" --all-packages --format json --output-file "$work/scan.json" || status=$?
case "$status" in
  0|1) ;;
  128) fail 'No packages found: bun.lock was not parsed (scanner exit 128)' ;;
  *) fail "Scanner exited $status (only 0 clean / 1 findings are accepted)" ;;
esac
[[ -s "$work/scan.json" ]] || fail 'Scanner did not write a non-empty JSON results file'
mv -- "$work/scan.json" "$out"

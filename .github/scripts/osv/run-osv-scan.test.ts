import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const wrapper = join(import.meta.dir, 'run-osv-scan.sh');
const scanner = `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" "$HOME" "$XDG_CACHE_HOME" > "$FAKE_SCAN_TRACE"
out=
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-file) out=$2; shift 2 ;;
    --lockfile)
      if [[ $(cat "$2") == INVALID_BUN_LOCK ]]; then exit 127; fi
      shift 2 ;;
    *) shift ;;
  esac
done
case "$FAKE_SCAN_OUTPUT" in
  present) cp "$WRAPPER_FIXTURE" "$out" ;;
  empty) : > "$out" ;;
  missing) ;;
esac
exit "$FAKE_SCAN_STATUS"
`;
const downloader = `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" > "$FAKE_DOWNLOAD_TRACE"
[[ "$FAKE_DOWNLOAD_STATUS" == 0 ]] || exit "$FAKE_DOWNLOAD_STATUS"
while [[ $# -gt 0 ]]; do
  if [[ "$1" == --output ]]; then cp "$FAKE_SCANNER_SOURCE" "$2"; exit 0; fi
  shift
done
exit 64
`;

function runScan(options: { status?: number; output?: string; checksum?: string; downloadStatus?: number; missingRoot?: boolean; invalidLock?: boolean; missingTracked?: boolean; noTracked?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tdk-osv-wrapper-test-'));
  try {
    const bin = join(dir, 'bin');
    const root = join(dir, 'repo');
    const out = join(dir, 'scan.json');
    const trace = join(dir, 'trace');
    const downloadTrace = join(dir, 'download-trace');
    const pathUsed = join(dir, 'path-used');
    mkdirSync(bin);
    mkdirSync(root);
    const init = Bun.spawnSync(['git', 'init', '--quiet', root]);
    if (init.exitCode !== 0) throw new Error(init.stderr.toString());
    writeFileSync(join(root, 'bun.lock'), '{}');
    const add = Bun.spawnSync(['git', '-C', root, 'add', 'bun.lock']);
    if (add.exitCode !== 0) throw new Error(add.stderr.toString());
    if (options.invalidLock) {
      mkdirSync(join(root, 'packages/broken'), { recursive: true });
      writeFileSync(join(root, 'packages/broken/bun.lock'), 'INVALID_BUN_LOCK');
      const added = Bun.spawnSync(['git', '-C', root, 'add', 'packages/broken/bun.lock']);
      if (added.exitCode !== 0) throw new Error(added.stderr.toString());
    }
    if (options.missingTracked) rmSync(join(root, 'bun.lock'));
    if (options.noTracked) Bun.spawnSync(['git', '-C', root, 'rm', '--cached', '--quiet', 'bun.lock']);
    writeFileSync(join(bin, 'scanner-source'), scanner);
    writeFileSync(join(bin, 'curl'), downloader, { mode: 0o700 });
    writeFileSync(join(bin, 'osv-scanner'), '#!/usr/bin/env bash\ntouch "$FAKE_PATH_USED"\nexit 99\n', { mode: 0o700 });
    writeFileSync(out, 'STALE RESULT');
    const child = Bun.spawnSync(['bash', wrapper, options.missingRoot ? join(dir, 'missing') : root, out], {
      env: {
        ...process.env, PATH: `${bin}:${process.env.PATH}`, OSV_SCANNER_VERSION: '2.7.0',
        OSV_SCANNER_SHA256: options.checksum ?? createHash('sha256').update(scanner).digest('hex'),
        FAKE_SCANNER_SOURCE: join(bin, 'scanner-source'), FAKE_SCAN_TRACE: trace, FAKE_PATH_USED: pathUsed,
        FAKE_DOWNLOAD_TRACE: downloadTrace, FAKE_DOWNLOAD_STATUS: String(options.downloadStatus ?? 0),
        FAKE_SCAN_STATUS: String(options.status ?? 0), FAKE_SCAN_OUTPUT: options.output ?? 'present',
        WRAPPER_FIXTURE: join(import.meta.dir, 'fixtures/osv-scan-clean.json'),
      },
    });
    return {
      code: child.exitCode, stderr: child.stderr.toString(), stdout: child.stdout.toString(),
      output: existsSync(out) ? readFileSync(out, 'utf8') : null,
      trace: existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n') : [],
      download: existsSync(downloadTrace) ? readFileSync(downloadTrace, 'utf8') : '',
      pathUsed: existsSync(pathUsed), root,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('pinned scan wrapper contract', () => {
  test.each([0, 1])('scanner status %d publishes only fresh results and succeeds', status => {
    const result = runScan({ status });
    expect(result.code).toBe(0);
    expect(result.output).toContain('"results"');
    expect(result.output).not.toContain('STALE');
    expect(result.download).toContain('/download/v2.7.0/osv-scanner_linux_amd64');
    expect(result.pathUsed).toBe(false);
  });
  test('one malformed tracked lockfile cannot publish a partial successful scan', () => {
    const result = runScan({ invalidLock: true });
    expect(result.code).not.toBe(0);
    expect(result.output).toBeNull();
    expect(result.stderr).toContain('Scanner exited 127');
  });

  test.each([{ missingTracked: true }, { noTracked: true }])('requires a complete tracked lockfile inventory %j', options => {
    const result = runScan(options);
    expect(result.code).not.toBe(0);
    expect(result.output).toBeNull();
    expect(result.download).toBe('');
  });

  test.each([127, 128, 2])('scanner status %d fails and leaves no stale or partial result', status => {
    const result = runScan({ status });
    expect(result.code).not.toBe(0);
    expect(result.output).toBeNull();
    expect(result.stderr).toContain('::error::OSV scan failed:');
    expect(result.stderr).toContain(status === 128 ? 'No packages found' : `Scanner exited ${status}`);
  });

  test.each(['missing', 'empty'])('success status with %s output still fails closed', output => {
    const result = runScan({ status: 0, output });
    expect(result.code).not.toBe(0);
    expect(result.output).toBeNull();
    expect(result.stderr).toContain('non-empty JSON results file');
  });

  test('verifies the downloaded bytes before every use, never executing a PATH scanner', () => {
    const result = runScan({ checksum: '0'.repeat(64) });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('SHA-256 mismatch');
    expect(result.trace).toEqual([]);
    expect(result.output).toBeNull();
    expect(result.pathUsed).toBe(false);
  });

  test('separate invocations isolate and remove install/cache/home state', () => {
    const first = runScan();
    const second = runScan();
    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(first.trace[1]).not.toBe(second.trace[1]);
    expect(first.trace[1]).toMatch(/\/tdk-osv-scan\.[^/]+\/home$/);
    expect(first.trace[2]).toMatch(/\/tdk-osv-scan\.[^/]+\/cache$/);
    for (const path of [...first.trace.slice(1), ...second.trace.slice(1)]) expect(existsSync(path)).toBe(false);
  });

  test('download failure removes stale output and does not execute a binary', () => {
    const result = runScan({ downloadStatus: 22 });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Could not download');
    expect(result.trace).toEqual([]);
    expect(result.output).toBeNull();
  });

  test('invalid pin or missing root fails before download and clears stale output', () => {
    for (const options of [{ checksum: '' }, { missingRoot: true }]) {
      const result = runScan(options);
      expect(result.code).not.toBe(0);
      expect(result.output).toBeNull();
      expect(result.download).toBe('');
    }
  });

  test('scan root and output positional arguments are both required', () => {
    const result = Bun.spawnSync(['bash', wrapper], { env: process.env });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('Usage:');
  });
});

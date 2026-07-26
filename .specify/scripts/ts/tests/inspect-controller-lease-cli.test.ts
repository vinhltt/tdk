import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI_PATH = resolve(__dirname, '../src/commands/util/inspect-controller-lease.ts');

/** Asserts stdout is exactly one line of compact JSON ending in a single trailing newline, then parses it. */
function parseSoleJsonLine(stdout: string): unknown {
  expect(stdout.endsWith('\n')).toBe(true);
  const withoutTrailingNewline = stdout.slice(0, -1);
  expect(withoutTrailingNewline.includes('\n')).toBe(false);
  return JSON.parse(withoutTrailingNewline);
}

function run(projectRoot: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bun', [CLI_PATH, '--project-root', projectRoot], { encoding: 'utf-8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

let root: string;

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-lease-cli-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('inspect-controller-lease CLI', () => {
  it('exit 0 with held:false JSON when no lease is held', () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const { status, stdout } = run(root);
    expect(status).toBe(0);
    expect(parseSoleJsonLine(stdout)).toEqual({ held: false, reason: 'no-lock-dir' });
  });

  it('exit 2 with held:true JSON when a lease is held', () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const lockPath = join(root, '.git', 'tdk', 'parallel-controller.lock');
    mkdirSync(lockPath, { recursive: true });
    writeFileSync(join(lockPath, 'owner.json'), JSON.stringify({ controllerId: 'ctrl-cli' }));
    const { status, stdout } = run(root);
    expect(status).toBe(2);
    expect(parseSoleJsonLine(stdout)).toEqual({ held: true, lockPath, owner: { controllerId: 'ctrl-cli' } });
  });

  it('exit 1 with an error JSON line when --project-root does not exist', () => {
    const bogus = join(root, 'does', 'not', 'exist');
    const { status, stdout, stderr } = run(bogus);
    expect(status).toBe(1);
    const payload = parseSoleJsonLine(stdout) as { error: string };
    expect(typeof payload.error).toBe('string');
    expect(stderr.length).toBeGreaterThan(0);
  });

  it('never mutates the project root while inspecting', () => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    run(root);
    // A second inspection after the first must observe the same no-lock-dir state — proves nothing was created.
    const { stdout } = run(root);
    expect(parseSoleJsonLine(stdout)).toEqual({ held: false, reason: 'no-lock-dir' });
  });
});

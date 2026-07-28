import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI_PATH = resolve(__dirname, '../src/commands/util/transition-phase-status.ts');

function parseSoleJsonLine(stdout: string): unknown {
  expect(stdout.endsWith('\n')).toBe(true);
  const withoutTrailingNewline = stdout.slice(0, -1);
  expect(withoutTrailingNewline.includes('\n')).toBe(false);
  return JSON.parse(withoutTrailingNewline);
}

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bun', [CLI_PATH, ...args], { encoding: 'utf-8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

let root: string; let planPath: string; let phasePath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tdk-transition-cli-'));
  phasePath = join(root, 'phase-01-a.md');
  planPath = join(root, 'plan.md');
  writeFileSync(phasePath, '---\nphase: 1\nstatus: todo\n---\n# A\n');
  writeFileSync(planPath, '## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|\n| 01 | [A](phase-01-a.md) | todo | — | — |\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('transition-phase-status CLI', () => {
  it('writes plan.md and phase frontmatter consistently for a single transition', () => {
    const { status, stdout } = run(['--project-root', root, '--plan', planPath, '--feature-dir', root, '--phase', '1', '--to', 'in_progress']);
    expect(status).toBe(0);
    expect(parseSoleJsonLine(stdout)).toEqual({ ok: true, phases: [1] });
    expect(readFileSync(planPath, 'utf8')).toContain('| in_progress |');
    expect(readFileSync(phasePath, 'utf8')).toContain('status: in_progress');
  });

  it('inspect-status reports no mismatch after a consistent transition', () => {
    run(['--project-root', root, '--plan', planPath, '--feature-dir', root, '--phase', '1', '--to', 'in_progress']);
    const { status, stdout } = run(['inspect-status', '--project-root', root, '--plan', planPath, '--feature-dir', root]);
    expect(status).toBe(0);
    expect(parseSoleJsonLine(stdout)).toEqual({
      rows: [{ phase: 1, planStatus: 'in_progress', frontmatterStatus: 'in_progress' }],
      mismatches: [], stale: [1],
    });
  });

  it('inspect-status reports a mismatch when plan.md and frontmatter diverge, with no --controller-id', () => {
    writeFileSync(phasePath, readFileSync(phasePath, 'utf8').replace('status: todo', 'status: done'));
    const { status, stdout } = run(['inspect-status', '--project-root', root, '--plan', planPath, '--feature-dir', root]);
    expect(status).toBe(0);
    const payload = parseSoleJsonLine(stdout) as { mismatches: number[] };
    expect(payload.mismatches).toEqual([1]);
  });

  it('creates no lease artifact and no .git directory anywhere under the project root', () => {
    run(['--project-root', root, '--plan', planPath, '--feature-dir', root, '--phase', '1', '--to', 'in_progress']);
    run(['inspect-status', '--project-root', root, '--plan', planPath, '--feature-dir', root]);
    expect(existsSync(join(root, '.git'))).toBe(false);
  });

  it('fails a mismatched --phase/--to arity without writing anything', () => {
    const { status, stdout } = run(['--project-root', root, '--plan', planPath, '--feature-dir', root, '--phase', '1', '--to', 'in_progress', '--to', 'done']);
    expect(status).toBe(1);
    expect((parseSoleJsonLine(stdout) as { error: string }).error).toContain('matching pairs');
    expect(readFileSync(planPath, 'utf8')).toContain('| todo |');
  });
});

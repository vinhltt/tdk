import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const CLI_PATH = resolve(__dirname, '../src/commands/util/resolve-parallel-phase-wave.ts');

/** Asserts stdout is exactly one line of compact JSON ending in a single trailing newline, then parses it. */
function parseSoleJsonLine(stdout: string): unknown {
  expect(stdout.endsWith('\n')).toBe(true);
  const withoutTrailingNewline = stdout.slice(0, -1);
  expect(withoutTrailingNewline.includes('\n')).toBe(false);
  return JSON.parse(withoutTrailingNewline);
}

function run(projectRoot: string, planPath: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bun', [CLI_PATH, '--project-root', projectRoot, '--plan', planPath], { encoding: 'utf-8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function writeFile(absPath: string, contents: string): void {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, contents);
}

function autoPhaseMarkdown(title: string, createTarget: string): string {
  return [
    '---',
    'parallel_safe: auto',
    '---',
    '',
    `# ${title}`,
    '',
    '## Related Code Files',
    '',
    `- Create: \`${createTarget}\``,
    '',
  ].join('\n');
}

/** A phase declaring `Modify` on a target that does not exist yet — invalid if ever validated. */
function autoPhaseMarkdownModifyingMissingTarget(title: string, modifyTarget: string): string {
  return [
    '---',
    'parallel_safe: auto',
    '---',
    '',
    `# ${title}`,
    '',
    '## Related Code Files',
    '',
    `- Modify: \`${modifyTarget}\``,
    '',
  ].join('\n');
}

/** A `parallel_safe: never` phase — always a serial barrier when ready. */
function neverPhaseMarkdown(title: string, reason: string): string {
  return ['---', 'parallel_safe: never', `parallel_reason: ${reason}`, '---', '', `# ${title}`, ''].join('\n');
}

const PHASES_HEADER = '| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|';

let root: string;
let planPath: string;

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-wave-cli-')));
  execFileSync('git', ['init', '-q'], { cwd: root });
  planPath = join(root, 'plan.md');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolve-parallel-phase-wave CLI', () => {
  it('exit 0 with a wave payload for two independent auto phases', () => {
    writeFile(join(root, 'phases', 'phase-01-one.md'), autoPhaseMarkdown('Phase One', 'src/new-file-1.ts'));
    writeFile(join(root, 'phases', 'phase-02-two.md'), autoPhaseMarkdown('Phase Two', 'src/new-file-2.ts'));
    writeFile(planPath, [
      '## Phases', '',
      PHASES_HEADER,
      '| 01 | [Phase One](phases/phase-01-one.md) | todo | — | — |',
      '| 02 | [Phase Two](phases/phase-02-two.md) | todo | — | — |',
      '',
    ].join('\n'));

    const { status, stdout } = run(root, planPath);
    expect(status).toBe(0);
    const payload = parseSoleJsonLine(stdout) as { ok: boolean; state: string; wave: number[] };
    expect(payload.ok).toBe(true);
    expect(payload.state).toBe('wave');
    expect(payload.wave).toEqual([1, 2]);
  });

  it('excludes a not-yet-ready todo row from access validation so an otherwise valid wave is not blocked', () => {
    // Phase 3 is `todo` but blockedBy phase 2 (`in_progress`, not done/skipped) — not ready.
    // Its Modify target does not exist yet; validating it now would wrongly reject the whole run.
    writeFile(join(root, 'phases', 'phase-01-one.md'), autoPhaseMarkdown('Phase One', 'src/new-file-1.ts'));
    writeFile(join(root, 'phases', 'phase-03-three.md'), autoPhaseMarkdownModifyingMissingTarget('Phase Three', 'src/not-created-yet.ts'));
    writeFile(planPath, [
      '## Phases', '',
      PHASES_HEADER,
      '| 01 | [Phase One](phases/phase-01-one.md) | todo | — | — |',
      '| 02 | [Phase Two](phases/phase-02-two.md) | in_progress | 03 | — |',
      '| 03 | [Phase Three](phases/phase-03-three.md) | todo | — | 02 |',
      '',
    ].join('\n'));

    const { status, stdout } = run(root, planPath);
    expect(status).toBe(0);
    const payload = parseSoleJsonLine(stdout) as { ok: boolean; state: string; wave: number[] };
    expect(payload.ok).toBe(true);
    expect(payload.state).toBe('wave');
    expect(payload.wave).toEqual([1]);
  });

  it('C-B3: canonical numeric order survives table row order 3,1,2 end-to-end', () => {
    writeFile(join(root, 'phases', 'phase-01-one.md'), autoPhaseMarkdown('Phase One', 'src/new-file-1.ts'));
    writeFile(join(root, 'phases', 'phase-02-two.md'), autoPhaseMarkdown('Phase Two', 'src/new-file-2.ts'));
    writeFile(join(root, 'phases', 'phase-03-three.md'), autoPhaseMarkdown('Phase Three', 'src/new-file-3.ts'));
    writeFile(planPath, [
      '## Phases', '',
      PHASES_HEADER,
      '| 03 | [Phase Three](phases/phase-03-three.md) | todo | — | — |',
      '| 01 | [Phase One](phases/phase-01-one.md) | todo | — | — |',
      '| 02 | [Phase Two](phases/phase-02-two.md) | todo | — | — |',
      '',
    ].join('\n'));

    const { status, stdout } = run(root, planPath);
    expect(status).toBe(0);
    const payload = parseSoleJsonLine(stdout) as { state: string; wave: number[] };
    expect(payload.state).toBe('wave');
    expect(payload.wave).toEqual([1, 2, 3]);
  });

  it('exit 0 with a complete payload when every phase is terminal', () => {
    writeFile(planPath, [
      '## Phases', '',
      PHASES_HEADER,
      '| 01 | [Phase One](phases/phase-01-one.md) | done | — | — |',
      '',
    ].join('\n'));

    const { status, stdout } = run(root, planPath);
    expect(status).toBe(0);
    expect(parseSoleJsonLine(stdout)).toMatchObject({ ok: true, state: 'complete', wave: [] });
  });

  it('exit 2 with an invalid payload when the plan.md graph fails to parse', () => {
    writeFile(planPath, '# Not a plan file at all\n');

    const { status, stdout } = run(root, planPath);
    expect(status).toBe(2);
    const payload = parseSoleJsonLine(stdout) as { ok: boolean; state: string; errors: unknown[] };
    expect(payload.ok).toBe(false);
    expect(payload.state).toBe('invalid');
    expect(payload.errors.length).toBeGreaterThan(0);
  });

  it('exit 2 with an invalid payload and NO_READY_PHASE when work remains but nothing is ready', () => {
    writeFile(planPath, [
      '## Phases', '',
      PHASES_HEADER,
      '| 01 | [Phase One](phases/phase-01-one.md) | blocked | — | — |',
      '',
    ].join('\n'));

    const { status, stdout } = run(root, planPath);
    expect(status).toBe(2);
    const payload = parseSoleJsonLine(stdout) as { errors: { code: string }[] };
    expect(payload.errors.map((e) => e.code)).toContain('NO_READY_PHASE');
  });

  it('exit 1 with an error JSON line when --plan does not exist', () => {
    const bogusPlan = join(root, 'no-such-plan.md');
    const { status, stdout, stderr } = run(root, bogusPlan);
    expect(status).toBe(1);
    const payload = parseSoleJsonLine(stdout) as { error: string };
    expect(typeof payload.error).toBe('string');
    expect(stderr.length).toBeGreaterThan(0);
  });

  // C-B6: "Exit 0 for wave|serial-barrier|complete." serial-barrier had no
  // coverage at any level of the CLI edge (Finding H).
  it('exit 0 with a serial-barrier payload for a ready parallel_safe: never phase', () => {
    writeFile(join(root, 'phases', 'phase-01-one.md'), neverPhaseMarkdown('Phase One', 'legacy migration script, not yet safety-audited'));
    writeFile(planPath, [
      '## Phases', '',
      PHASES_HEADER,
      '| 01 | [Phase One](phases/phase-01-one.md) | todo | — | — |',
      '',
    ].join('\n'));

    const { status, stdout } = run(root, planPath);
    expect(status).toBe(0);
    const payload = parseSoleJsonLine(stdout) as { ok: boolean; state: string; serialBarrier: number | null; wave: number[] };
    expect(payload.ok).toBe(true);
    expect(payload.state).toBe('serial-barrier');
    expect(payload.serialBarrier).toBe(1);
    expect(payload.wave).toEqual([]);
  });

  // Finding E: the capability check and case probe must gate the work BEFORE
  // buildPhaseScheduleInputs reads any phase file. Force two independent
  // failures — an unreadable phase file (surfaces as PHASE_FILE_UNREADABLE
  // under the old, post-access-resolution ordering) and a probe failure
  // (mkdirSync inside a since-made-read-only project root). Under the fixed
  // ordering the probe runs first and wins; the phase file is never read.
  it('reorders the capability/probe gate before phase-file reads: a probe failure wins over a downstream unreadable-file error', () => {
    const phaseFile = join(root, 'phases', 'phase-01-one.md');
    writeFile(phaseFile, autoPhaseMarkdown('Phase One', 'src/new-file-1.ts'));
    writeFile(planPath, [
      '## Phases', '',
      PHASES_HEADER,
      '| 01 | [Phase One](phases/phase-01-one.md) | todo | — | — |',
      '',
    ].join('\n'));

    chmodSync(phaseFile, 0o000);
    chmodSync(root, 0o500);
    try {
      const { status, stdout } = run(root, planPath);
      expect(status).toBe(2);
      const payload = parseSoleJsonLine(stdout) as { errors: { code: string }[] };
      const codes = payload.errors.map((e) => e.code);
      expect(codes).toContain('CASE_SENSITIVITY_PROBE_FAILED');
      expect(codes).not.toContain('PHASE_FILE_UNREADABLE');
    } finally {
      chmodSync(root, 0o700);
      chmodSync(phaseFile, 0o600);
    }
  });
});

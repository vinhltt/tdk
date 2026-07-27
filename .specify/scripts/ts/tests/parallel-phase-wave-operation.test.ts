import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runParallelPhaseWaveOperation, type WaveOperationDeps } from '../src/commands/util/parallel-phase-wave-operation';
import type { FilesystemCapabilityResult } from '../src/commands/util/parallel-phase-mount-capability';
import type { CaseProbeResult } from '../src/commands/util/parallel-phase-case-probe';

function writeFile(absPath: string, contents: string): void {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, contents);
}

function autoPhaseMarkdown(title: string, createTarget: string): string {
  return ['---', 'parallel_safe: auto', '---', '', `# ${title}`, '', '## Related Code Files', '',
    `- Create: \`${createTarget}\``, ''].join('\n');
}

const PHASES_HEADER = '| # | File | Status | Blocks | BlockedBy |\n|---|------|--------|--------|-----------|';

let root: string;
let planPath: string;

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-wave-op-')));
  execFileSync('git', ['init', '-q'], { cwd: root });
  planPath = join(root, 'plan.md');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeTwoIndependentAutoPhases(): void {
  writeFile(join(root, 'phases', 'phase-01-one.md'), autoPhaseMarkdown('Phase One', 'src/new-file-1.ts'));
  writeFile(join(root, 'phases', 'phase-02-two.md'), autoPhaseMarkdown('Phase Two', 'src/new-file-2.ts'));
  writeFile(planPath, [
    '## Phases', '', PHASES_HEADER,
    '| 01 | [Phase One](phases/phase-01-one.md) | todo | — | — |',
    '| 02 | [Phase Two](phases/phase-02-two.md) | todo | — | — |', '',
  ].join('\n'));
}

/** Counting wrapper so tests can assert an adapter was never invoked. */
function countingCapability(result: FilesystemCapabilityResult): {
  fn: NonNullable<WaveOperationDeps['resolveCapability']>; calls: number[];
} {
  const calls: number[] = [];
  const fn: NonNullable<WaveOperationDeps['resolveCapability']> = () => { calls.push(1); return result; };
  return { fn, calls };
}

function countingProbe(result: CaseProbeResult): {
  fn: NonNullable<WaveOperationDeps['probeCaseSensitivity']>; calls: number[];
} {
  const calls: number[] = [];
  const fn: NonNullable<WaveOperationDeps['probeCaseSensitivity']> = () => { calls.push(1); return result; };
  return { fn, calls };
}

describe('runParallelPhaseWaveOperation', () => {
  it('validate-only succeeds on an injected win32 platform, never calling capability or probe adapters', () => {
    writeTwoIndependentAutoPhases();
    const capability = countingCapability({ ok: true });
    const probe = countingProbe({ ok: true });

    const { payload, exitCode } = runParallelPhaseWaveOperation(
      { projectRoot: root, planPath, mode: 'validate-only' },
      { platform: 'win32', resolveCapability: capability.fn, probeCaseSensitivity: probe.fn },
    );

    expect(exitCode).toBe(0);
    expect(capability.calls.length).toBe(0);
    expect(probe.calls.length).toBe(0);
    expect('wave' in payload).toBe(false);
    expect('serialBarrier' in payload).toBe(false);
    expect(payload).toMatchObject({ ok: true, state: 'valid' });
  });

  it('schedule mode on an injected win32 platform rejects with native-windows-unsupported', () => {
    writeTwoIndependentAutoPhases();

    const { payload, exitCode } = runParallelPhaseWaveOperation(
      { projectRoot: root, planPath, mode: 'schedule' },
      { platform: 'win32' },
    );

    expect(exitCode).toBe(2);
    expect(payload).toMatchObject({
      ok: false,
      state: 'invalid',
      errors: [{ code: 'FILESYSTEM_CAPABILITY_UNSUPPORTED', message: 'native-windows-unsupported' }],
    });
  });

  it('validate-only fails closed on an invalid graph', () => {
    writeFile(planPath, '# Not a plan file at all\n');

    const { payload, exitCode } = runParallelPhaseWaveOperation({ projectRoot: root, planPath, mode: 'validate-only' });

    expect(exitCode).toBe(2);
    expect(payload).toMatchObject({ ok: false, state: 'invalid' });
    expect((payload as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
  });

  it('validate-only fails closed on malformed phase frontmatter', () => {
    writeFile(join(root, 'phases', 'phase-01-one.md'), '---\nparallel_safe: [not-a-scalar\n---\n# Phase One\n');
    writeFile(planPath, [
      '## Phases', '', PHASES_HEADER,
      '| 01 | [Phase One](phases/phase-01-one.md) | todo | — | — |', '',
    ].join('\n'));

    const { payload, exitCode } = runParallelPhaseWaveOperation({ projectRoot: root, planPath, mode: 'validate-only' });

    expect(exitCode).toBe(2);
    const errors = (payload as { errors: { code: string }[] }).errors;
    expect(errors.map((e) => e.code)).toContain('PHASE_FRONTMATTER_UNPARSABLE');
  });

  it('validate-only fails closed on an unresolved access declaration', () => {
    writeFile(join(root, 'phases', 'phase-01-one.md'), autoPhaseMarkdown('Phase One', 'src/new-file-1.ts')
      .replace('- Create: `src/new-file-1.ts`', '- Modify: `src/does-not-exist.ts`'));
    writeFile(planPath, [
      '## Phases', '', PHASES_HEADER,
      '| 01 | [Phase One](phases/phase-01-one.md) | todo | — | — |', '',
    ].join('\n'));

    const { payload, exitCode } = runParallelPhaseWaveOperation({ projectRoot: root, planPath, mode: 'validate-only' });

    expect(exitCode).toBe(2);
    expect((payload as { ok: boolean }).ok).toBe(false);
  });

  it('validate-only fails closed with NO_READY_PHASE when work remains but nothing is ready', () => {
    writeFile(planPath, [
      '## Phases', '', PHASES_HEADER,
      '| 01 | [Phase One](phases/phase-01-one.md) | blocked | — | — |', '',
    ].join('\n'));

    const { payload, exitCode } = runParallelPhaseWaveOperation({ projectRoot: root, planPath, mode: 'validate-only' });

    expect(exitCode).toBe(2);
    const errors = (payload as { errors: { code: string }[] }).errors;
    expect(errors.map((e) => e.code)).toContain('NO_READY_PHASE');
  });

  it('validate-only performs zero filesystem side effects under the project root', () => {
    writeTwoIndependentAutoPhases();
    const before = readdirSync(root, { recursive: true } as never).sort();

    const { exitCode } = runParallelPhaseWaveOperation({ projectRoot: root, planPath, mode: 'validate-only' });

    const after = readdirSync(root, { recursive: true } as never).sort();
    expect(exitCode).toBe(0);
    expect(after).toEqual(before);

    // Discriminating proof (the case probe cleans up its own sentinel in a
    // `finally`, so a before/after directory diff alone cannot tell "never
    // ran" from "ran and cleaned up"): chmod the root read-only so the probe's
    // mkdir would fail with EACCES if it ever ran, using the real (non-mocked)
    // adapters. Success here means the probe was genuinely never invoked.
    chmodSync(root, 0o500);
    try {
      const readOnlyResult = runParallelPhaseWaveOperation({ projectRoot: root, planPath, mode: 'validate-only' });
      expect(readOnlyResult.exitCode).toBe(0);
    } finally {
      chmodSync(root, 0o700);
    }
  });

  it('validate-only reports an ordinary scheduling conflict as valid, not a validation failure', () => {
    // Two auto phases declaring the same Create target: a same-path write-write
    // conflict. The resolver defers the second candidate and reports the
    // conflict; that is not a fail-closed validation error.
    writeFile(join(root, 'phases', 'phase-01-one.md'), autoPhaseMarkdown('Phase One', 'src/shared.ts'));
    writeFile(join(root, 'phases', 'phase-02-two.md'), autoPhaseMarkdown('Phase Two', 'src/shared.ts'));
    writeFile(planPath, [
      '## Phases', '', PHASES_HEADER,
      '| 01 | [Phase One](phases/phase-01-one.md) | todo | — | — |',
      '| 02 | [Phase Two](phases/phase-02-two.md) | todo | — | — |', '',
    ].join('\n'));

    const { payload, exitCode } = runParallelPhaseWaveOperation({ projectRoot: root, planPath, mode: 'validate-only' });

    expect(exitCode).toBe(0);
    expect(payload).toMatchObject({ ok: true, state: 'valid' });
    expect((payload as { conflicts: unknown[] }).conflicts.length).toBeGreaterThan(0);
  });

  it('schedule mode still rejects an injected DrvFS root via the capability seam', () => {
    writeTwoIndependentAutoPhases();
    const capability = countingCapability({ ok: false, reason: 'drvfs-root' });

    const { payload, exitCode } = runParallelPhaseWaveOperation(
      { projectRoot: root, planPath, mode: 'schedule' },
      { resolveCapability: capability.fn },
    );

    expect(exitCode).toBe(2);
    expect(capability.calls.length).toBeGreaterThan(0);
    expect(payload).toMatchObject({
      ok: false,
      state: 'invalid',
      errors: [{ code: 'FILESYSTEM_CAPABILITY_UNSUPPORTED', message: 'drvfs-root' }],
    });
  });

  it('schedule mode succeeds via the real process.platform seam on a non-Windows host with no injected deps', () => {
    writeTwoIndependentAutoPhases();
    // This case is a no-op (no assertions run) on native Windows; it only proves that,
    // absent a `platform` override, `runParallelPhaseWaveOperation` reads the real
    // `process.platform` and schedules normally on this host. Native-Windows rejection
    // is asserted separately above via an injected `platform: 'win32'` override, and
    // natively on a real Windows/Bun host by tests/windows/parallel-planner-windows-smoke.test.ts.
    if (process.platform === 'win32') return;
    const { payload, exitCode } = runParallelPhaseWaveOperation({ projectRoot: root, planPath, mode: 'schedule' });
    expect(exitCode).toBe(0);
    expect(payload).toMatchObject({ ok: true, state: 'wave' });
  });
});

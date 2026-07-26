import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const skillPath = resolve(import.meta.dir, '../../../plugins/tdk-core/skills/tdk-implement/SKILL.md');
const referencePath = resolve(dirname(skillPath), 'references/parallel-phase-orchestration.md');
const projectPath = resolve(dirname(skillPath), 'references/project-and-phase-contract.md');
const executionPath = resolve(dirname(skillPath), 'references/phase-execution.md');
const read = (path: string): string => readFileSync(path, 'utf8');

describe('tdk-implement parallel orchestration contract', () => {
  it('loads the progressive controller reference and rejects incompatible args first', () => {
    const skill = read(skillPath); const project = read(projectPath);
    expect(skill).toContain('Load: `references/parallel-phase-orchestration.md`');
    expect(skill.indexOf('### Step 0 — Parse Args')).toBeLessThan(skill.indexOf('### Step 0.1 — Validate Task ID'));
    expect(project).toContain('/tdk-implement <TASK_ID> --parallel');
    expect(project).toContain('duplicate `--parallel`');
    expect(project).toContain('reject `--parallel` with either `--phase` form before task-id validation');
  });

  it('uses one mutation reservation for serial entry and retained parallel barriers', () => {
    const contract = [read(skillPath), read(projectPath), read(executionPath), read(referencePath)].join('\n');
    expect(contract).toContain('parallel-controller.ts reserve --project-root');
    expect(contract).toContain('Serial modes never wait, steal, or age out');
    expect(contract).toContain('serial-barrier');
    expect(contract).toContain('retained lease');
    expect(contract).toContain('does not re-enter the serial mutation reservation');
    expect(contract).toContain('PID absence, age, or timeout never clears it');
  });

  it('requires exact canaries and one synchronous concurrent worker batch', () => {
    const parallel = read(referencePath);
    expect(parallel).toContain('"probe": "A|B"');
    expect(parallel).toContain('"status": "READY"');
    expect(parallel).toContain('one synchronous concurrent batch');
    expect(parallel).toContain('single controller message');
    expect(parallel).toContain('join every started worker');
    expect(parallel).not.toMatch(/while\s*\(/);
    expect(parallel).not.toContain('setTimeout');
  });

  it('defines strict worker JSON, two-stage audit, WAL recovery, and full-wave failure', () => {
    const parallel = read(referencePath);
    for (const term of [
      '64 KiB', 'duplicate keys', 'rename detection disabled', '--no-renames',
      'transition.json', 'wave-completion', 'recovery-only', 'post-worker', 'final',
      'complete admitted wave `in_progress`', 'No phase becomes `done`',
    ]) expect(parallel).toContain(term);
    expect(parallel).toContain('old tombstone');
    expect(parallel).toContain('atomic rename');
    expect(parallel).toContain('parallel-controller.ts');
    expect(parallel).toContain('exit `0`');
    expect(parallel).toContain('exit `2`');
  });
});

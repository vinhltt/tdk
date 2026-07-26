import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  detectPhaseAccessConflicts,
  isPathWithinEffectiveReadAuthority,
  resolvePhaseAccess,
  type OwnershipEntry,
  type PhaseAccessSummary,
} from '../src/commands/util/parallel-phase-ownership';

let root: string;

function file(relPath: string, contents = 'x'): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

function initGitRepo(): void {
  execFileSync('git', ['init', '-q'], { cwd: root });
}

function codes(errors: { code: string }[]): string[] {
  return errors.map((e) => e.code);
}

function phaseMarkdown(parallelSafe: 'auto' | 'never', sectionBody: string): string {
  const frontmatter =
    parallelSafe === 'never'
      ? ['parallel_safe: never', 'parallel_reason: prior serial-only defect']
      : ['parallel_safe: auto'];
  return ['---', ...frontmatter, '---', '', '# Phase X', '', '## Related Code Files', '', sectionBody, ''].join('\n');
}

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-ownership-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolvePhaseAccess', () => {
  it('action mismatch: reading a fixed-deny path is allowed, modifying it is denied', () => {
    file('package.json', '{}');
    const readOnly = resolvePhaseAccess(phaseMarkdown('never', '- Read: `package.json`'), root);
    expect(codes(readOnly.errors)).not.toContain('DENIED_WRITE_PATH');

    const writeAttempt = resolvePhaseAccess(phaseMarkdown('never', '- Modify: `package.json`'), root);
    expect(codes(writeAttempt.errors)).toContain('DENIED_WRITE_PATH');
  });

  it('read-only auto phase is rejected for lacking any write', () => {
    file('docs/readme.md');
    const result = resolvePhaseAccess(phaseMarkdown('auto', '- Read: `docs/readme.md`'), root);
    expect(codes(result.errors)).toContain('AUTO_PHASE_REQUIRES_WRITE');
  });

  it('auto phase with a write is not rejected for missing writes', () => {
    initGitRepo();
    const result = resolvePhaseAccess(phaseMarkdown('auto', '- Create: `src/new.ts`'), root);
    expect(codes(result.errors)).not.toContain('AUTO_PHASE_REQUIRES_WRITE');
  });

  it('denies a git-ignored write path', () => {
    initGitRepo();
    file('.gitignore', 'dist/\n');
    const result = resolvePhaseAccess(phaseMarkdown('auto', '- Create: `dist/out.js`'), root);
    expect(codes(result.errors)).toContain('GIT_IGNORED_WRITE_PATH');
  });

  it('allows a non-ignored write path', () => {
    initGitRepo();
    file('.gitignore', 'dist/\n');
    const result = resolvePhaseAccess(phaseMarkdown('auto', '- Create: `src/new.ts`'), root);
    expect(codes(result.errors)).not.toContain('GIT_IGNORED_WRITE_PATH');
    expect(codes(result.errors)).not.toContain('DENIED_WRITE_PATH');
  });

  it('fails closed when git check-ignore cannot run (not a repository)', () => {
    const result = resolvePhaseAccess(phaseMarkdown('auto', '- Create: `src/new.ts`'), root);
    expect(codes(result.errors)).toContain('GIT_CHECK_IGNORE_FAILED');
  });
});

describe('isPathWithinEffectiveReadAuthority', () => {
  const access = {
    reads: ['docs/readme.md'],
    writes: [
      { action: 'Modify', path: 'src/modified.ts' },
      { action: 'Delete', path: 'src/deleted.ts' },
      { action: 'Create', path: 'src/created.ts' },
    ] as OwnershipEntry[],
  };

  it('grants authority for a canonical Read entry', () => {
    expect(isPathWithinEffectiveReadAuthority(access, 'docs/readme.md')).toBe(true);
  });

  it('own-Modify/Delete readability: grants authority without a separate Read bullet', () => {
    expect(isPathWithinEffectiveReadAuthority(access, 'src/modified.ts')).toBe(true);
    expect(isPathWithinEffectiveReadAuthority(access, 'src/deleted.ts')).toBe(true);
  });

  it('Create readability only after creation', () => {
    expect(isPathWithinEffectiveReadAuthority(access, 'src/created.ts')).toBe(false);
    expect(isPathWithinEffectiveReadAuthority(access, 'src/created.ts', new Set(['src/created.ts']))).toBe(true);
  });

  it('undeclared-read rejection: a path declared nowhere is not readable', () => {
    expect(isPathWithinEffectiveReadAuthority(access, 'src/unrelated.ts')).toBe(false);
  });
});

describe('detectPhaseAccessConflicts', () => {
  it('write/write overlap on the exact same path', () => {
    const phase: PhaseAccessSummary = { phase: 2, reads: [], writes: ['src/config.ts'] };
    const candidate: PhaseAccessSummary = { phase: 3, reads: [], writes: ['src/config.ts'] };
    const conflicts = detectPhaseAccessConflicts(phase, candidate);
    expect(conflicts).toEqual([
      { phase: 2, candidate: 3, phasePath: 'src/config.ts', candidatePath: 'src/config.ts', access: 'write-write', overlap: 'same-path' },
    ]);
  });

  it('write/write overlap by ancestor/descendant path', () => {
    const phase: PhaseAccessSummary = { phase: 2, reads: [], writes: ['src'] };
    const candidate: PhaseAccessSummary = { phase: 3, reads: [], writes: ['src/config.ts'] };
    const conflicts = detectPhaseAccessConflicts(phase, candidate);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.access).toBe('write-write');
    expect(conflicts[0]!.overlap).toBe('ancestor');
  });

  it('write/read overlap, phase-writes-candidate-reads order', () => {
    const phase: PhaseAccessSummary = { phase: 2, reads: [], writes: ['src/config.ts'] };
    const candidate: PhaseAccessSummary = { phase: 3, reads: ['src/config.ts'], writes: [] };
    const conflicts = detectPhaseAccessConflicts(phase, candidate);
    expect(conflicts).toEqual([
      { phase: 2, candidate: 3, phasePath: 'src/config.ts', candidatePath: 'src/config.ts', access: 'write-read', overlap: 'same-path' },
    ]);
  });

  it('write/read overlap, swapped (candidate-writes-phase-reads) order', () => {
    const phase: PhaseAccessSummary = { phase: 3, reads: ['src/config.ts'], writes: [] };
    const candidate: PhaseAccessSummary = { phase: 2, reads: [], writes: ['src/config.ts'] };
    const conflicts = detectPhaseAccessConflicts(phase, candidate);
    expect(conflicts).toEqual([
      { phase: 3, candidate: 2, phasePath: 'src/config.ts', candidatePath: 'src/config.ts', access: 'read-write', overlap: 'same-path' },
    ]);
  });

  it('read/read overlap does not conflict', () => {
    const phase: PhaseAccessSummary = { phase: 2, reads: ['src/config.ts'], writes: [] };
    const candidate: PhaseAccessSummary = { phase: 3, reads: ['src/config.ts'], writes: [] };
    expect(detectPhaseAccessConflicts(phase, candidate)).toEqual([]);
  });
});

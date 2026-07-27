import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeProjectCaseSensitivity } from '../src/commands/util/parallel-phase-case-probe';

let root: string;

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-case-probe-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('probeProjectCaseSensitivity', () => {
  it('reports host case behavior and leaves no residue behind', () => {
    const result = probeProjectCaseSensitivity(root);
    if (process.platform !== 'win32') {
      expect(result.ok).toBe(true);
    } else if (!result.ok) {
      expect(result.reason).toBe('case-insensitive-root');
    }
    expect(readdirSync(root)).toHaveLength(0);
  });

  it('rejects when the case-swapped sentinel aliases the original (simulated case-insensitive root)', () => {
    const result = probeProjectCaseSensitivity(root, { detectAlias: () => true });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('rejects and reports a probe error when the root cannot be probed', () => {
    const missingRoot = join(root, 'does-not-exist');
    const result = probeProjectCaseSensitivity(missingRoot);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('case-probe-error');
  });

  it('rejects on cleanup failure, reports the exact bounded sentinel path, and calls removeDir exactly once with it', () => {
    const removedPaths: string[] = [];
    const result = probeProjectCaseSensitivity(root, {
      removeDir: (p) => {
        removedPaths.push(p);
        throw new Error('simulated cleanup failure');
      },
    });
    expect(result.ok).toBe(false);
    expect(removedPaths).toHaveLength(1);
    expect(removedPaths[0]!.startsWith(root)).toBe(true);
    expect(result.reason).toContain(removedPaths[0]!);
  });
});

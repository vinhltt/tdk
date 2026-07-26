import { describe, expect, it } from 'bun:test';
import { readPhaseFrontmatter, readParallelSafety } from '../src/commands/util/phase-frontmatter-reader';

describe('readPhaseFrontmatter', () => {
  it('returns empty metadata when no frontmatter block is present', () => {
    expect(readPhaseFrontmatter('# Title\n\nBody').metadata).toEqual({});
  });

  it('parses a YAML mapping frontmatter block', () => {
    const result = readPhaseFrontmatter('---\ntitle: Example\nphase_type: spike\n---\n\nBody');
    expect(result.metadata).toEqual({ title: 'Example', phase_type: 'spike' });
    expect(result.error).toBeUndefined();
  });

  it('rejects non-mapping frontmatter', () => {
    const result = readPhaseFrontmatter('---\n- one\n- two\n---\n');
    expect(result.error).toBe('Phase frontmatter must be a YAML mapping');
  });

  it('reports malformed YAML with a first-line error message', () => {
    const result = readPhaseFrontmatter('---\nphase_type: [spike\n---\n');
    expect(result.error).toMatch(/^Malformed phase frontmatter:/);
  });
});

describe('readParallelSafety', () => {
  it('auto-valid: parallel_safe auto without a reason is valid', () => {
    expect(readParallelSafety({ parallel_safe: 'auto' })).toEqual({
      parallelSafe: 'auto',
      parallelReason: null,
      errors: [],
    });
  });

  it('never+reason: parallel_safe never with a non-empty reason is valid', () => {
    expect(readParallelSafety({ parallel_safe: 'never', parallel_reason: 'shared migration file' })).toEqual({
      parallelSafe: 'never',
      parallelReason: 'shared migration file',
      errors: [],
    });
  });

  it('never-missing-reason: parallel_safe never without a reason errors', () => {
    const result = readParallelSafety({ parallel_safe: 'never' });
    expect(result.parallelSafe).toBe('never');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/never/i);
    expect(result.errors[0]).toMatch(/reason/i);
  });

  it('orphan-reason: parallel_reason present without parallel_safe errors', () => {
    const result = readParallelSafety({ parallel_reason: 'some reason' });
    expect(result.parallelSafe).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/parallel_reason/);
  });

  it('unknown-value: unrecognized parallel_safe errors and falls back to legacy serial-only', () => {
    const result = readParallelSafety({ parallel_safe: 'maybe' });
    expect(result.parallelSafe).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Unknown parallel_safe/);
  });

  it('legacy-absent: no parallel_safe and no parallel_reason is valid, treated as serial-only', () => {
    expect(readParallelSafety({})).toEqual({ parallelSafe: null, parallelReason: null, errors: [] });
  });

  it('auto carrying a reason errors', () => {
    const result = readParallelSafety({ parallel_safe: 'auto', parallel_reason: 'not needed' });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/auto/i);
  });

  it('non-string or empty parallel_reason errors (blank string and non-string value)', () => {
    const blank = readParallelSafety({ parallel_safe: 'never', parallel_reason: '   ' });
    expect(blank.errors).toHaveLength(1);
    expect(blank.errors[0]).toMatch(/non-empty string/);

    const nonString = readParallelSafety({ parallel_reason: 42 });
    expect(nonString.errors).toHaveLength(1);
    expect(nonString.errors[0]).toMatch(/non-empty string/);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateArgs } from '../../src/commands/scout/args-validator';

describe('args-validator', () => {
  let tempDir: string;
  beforeEach(() => { tempDir = mkdtempSync(join(tmpdir(), 'scout-args-')); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it('accepts --scope', () => {
    const r = validateArgs({ scope: tempDir });
    expect(r.mode).toBe('scope');
    expect(r.taskHint).toBe('general codebase navigation');
    expect(r.sampleBudget).toBe(10);
    expect(r.forceRefresh).toBe(false);
  });

  it('accepts --from-pack with existing file', () => {
    const f = join(tempDir, 'pack.md');
    writeFileSync(f, '# pack');
    const r = validateArgs({ fromPack: f });
    expect(r.mode).toBe('from-pack');
    expect(r.packPath).toBe(f);
  });

  it('throws on both --scope and --from-pack', () => {
    expect(() => validateArgs({ scope: tempDir, fromPack: '/x' }))
      .toThrow(/mutually exclusive/);
  });

  it('throws on neither flag', () => {
    expect(() => validateArgs({})).toThrow(/exactly one/);
  });

  it('throws on missing pack file', () => {
    expect(() => validateArgs({ fromPack: '/nonexistent.md' }))
      .toThrow(/not found/);
  });

  it('rejects sample-budget out of range', () => {
    expect(() => validateArgs({ scope: tempDir, sampleBudget: '99' }))
      .toThrow(/between 1 and 50/);
    expect(() => validateArgs({ scope: tempDir, sampleBudget: '0' }))
      .toThrow(/between 1 and 50/);
  });

  it('rejects non-numeric sample-budget', () => {
    expect(() => validateArgs({ scope: tempDir, sampleBudget: 'abc' }))
      .toThrow(/must be a number/);
  });

  it('splits and trims --include / --ignore patterns', () => {
    const r = validateArgs({ scope: tempDir, include: 'src/**/*.ts, *.md', ignore: '**/*.test.ts' });
    expect(r.include).toEqual(['src/**/*.ts', '*.md']);
    expect(r.ignore).toEqual(['**/*.test.ts']);
  });

  it('drops empty pattern entries', () => {
    const r = validateArgs({ scope: tempDir, include: 'src/**,,  ,docs/**' });
    expect(r.include).toEqual(['src/**', 'docs/**']);
  });

  it('leaves patterns undefined when nothing usable remains', () => {
    const r = validateArgs({ scope: tempDir, include: ' , ', ignore: '' });
    expect(r.include).toBeUndefined();
    expect(r.ignore).toBeUndefined();
  });

  it('leaves patterns undefined when flags absent', () => {
    const r = validateArgs({ scope: tempDir });
    expect(r.include).toBeUndefined();
    expect(r.ignore).toBeUndefined();
  });

  it('rejects --include combined with --from-pack', () => {
    const f = join(tempDir, 'pack.md');
    writeFileSync(f, '# pack');
    expect(() => validateArgs({ fromPack: f, include: 'src/**' }))
      .toThrow(/already built/);
  });

  it('rejects --ignore combined with --from-pack, even when it normalizes away', () => {
    const f = join(tempDir, 'pack.md');
    writeFileSync(f, '# pack');
    expect(() => validateArgs({ fromPack: f, ignore: ' , ' }))
      .toThrow(/--scope/);
  });

  it('honours custom task-hint and forceRefresh', () => {
    const r = validateArgs({ scope: tempDir, taskHint: 'find auth', forceRefresh: true });
    expect(r.taskHint).toBe('find auth');
    expect(r.forceRefresh).toBe(true);
  });
});

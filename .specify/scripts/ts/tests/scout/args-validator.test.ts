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

  it('honours custom task-hint and forceRefresh', () => {
    const r = validateArgs({ scope: tempDir, taskHint: 'find auth', forceRefresh: true });
    expect(r.taskHint).toBe('find auth');
    expect(r.forceRefresh).toBe(true);
  });
});

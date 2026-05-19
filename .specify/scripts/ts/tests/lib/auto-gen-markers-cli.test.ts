import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI_PATH = resolve(__dirname, '../../src/lib/auto-gen-markers-cli.ts');

const fixture = `<!-- AUTO-GEN-START: a
SOURCES: x
INSTRUCTION: do
-->
old body
<!-- AUTO-GEN-END -->`;

describe('auto-gen-markers-cli', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'agm-cli-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('parse emits JSON array of sections', () => {
    const f = join(tmp, 'doc.md');
    writeFileSync(f, fixture);
    const r = spawnSync('bun', [CLI_PATH, 'parse', f], { encoding: 'utf-8' });
    expect(r.status).toBe(0);
    const sections = JSON.parse(r.stdout);
    expect(Array.isArray(sections)).toBe(true);
    expect(sections[0].id).toBe('a');
    expect(sections[0].body).toBe('old body');
  });

  it('splice replaces bodies from replacements file', () => {
    const f = join(tmp, 'doc.md');
    const repl = join(tmp, 'r.json');
    writeFileSync(f, fixture);
    writeFileSync(repl, JSON.stringify({ a: 'NEW' }));
    const r = spawnSync('bun', [CLI_PATH, 'splice', f, repl], { encoding: 'utf-8' });
    expect(r.status).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.content).toContain('NEW');
    expect(result.content).not.toContain('old body');
  });

  it('exits 1 on missing args', () => {
    const r = spawnSync('bun', [CLI_PATH, 'parse'], { encoding: 'utf-8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('argument required');
  });

  it('exits 1 on unknown command', () => {
    const r = spawnSync('bun', [CLI_PATH, 'bogus'], { encoding: 'utf-8' });
    expect(r.status).toBe(1);
  });

  it('handles multiline body in replacements via file (no shell quoting bugs)', () => {
    const f = join(tmp, 'doc.md');
    const repl = join(tmp, 'r.json');
    writeFileSync(f, fixture);
    writeFileSync(repl, JSON.stringify({ a: 'line one\nline two\nline three' }));
    const r = spawnSync('bun', [CLI_PATH, 'splice', f, repl], { encoding: 'utf-8' });
    expect(r.status).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.content).toContain('line one');
    expect(result.content).toContain('line two');
    expect(result.content).toContain('line three');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeAgentVersion } from '../src/commands/util/normalize-agent-version';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'normalize-agent-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function write(name: string, content: string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('normalizeAgentVersion', () => {
  it('folds top-level version into metadata.version, overwriting stale value', () => {
    const path = write('dual.md', [
      '---',
      'name: agent-x',
      'version: 3.3.2',
      'metadata:',
      '  lens: security',
      '  version: "1.0.0"',
      '---',
      '',
      'Body.',
      '',
    ].join('\n'));

    const msg = normalizeAgentVersion(path);
    const result = readFileSync(path, 'utf-8');

    expect(msg).toContain('normalized');
    // No top-level version line anymore.
    expect(result).not.toMatch(/^version:/m);
    // metadata.version overwritten with fresh top-level value.
    expect(result).toContain('  version: "3.3.2"');
    expect(result).not.toContain('1.0.0');
    // Sibling key preserved.
    expect(result).toContain('  lens: security');
  });

  it('creates a metadata block when none exists', () => {
    const path = write('no-meta.md', [
      '---',
      'name: agent-y',
      'version: 0.1.0',
      'model: haiku',
      '---',
      '',
      'Body.',
      '',
    ].join('\n'));

    const msg = normalizeAgentVersion(path);
    const result = readFileSync(path, 'utf-8');

    expect(msg).toContain('normalized');
    expect(result).not.toMatch(/^version:/m);
    expect(result).toContain('metadata:');
    expect(result).toContain('  version: "0.1.0"');
    expect(result).toContain('name: agent-y');
    expect(result).toContain('model: haiku');
  });

  it('is idempotent — no top-level version is a no-op (content unchanged)', () => {
    const original = [
      '---',
      'name: agent-z',
      'metadata:',
      '  version: "2.0.0"',
      '---',
      '',
      'Body.',
      '',
    ].join('\n');
    const path = write('noop.md', original);

    const msg = normalizeAgentVersion(path);
    const result = readFileSync(path, 'utf-8');

    expect(msg).toContain('noop');
    expect(result).toBe(original);
  });

  it('preserves folded multi-line description byte-for-byte', () => {
    const descLines = [
      'description: >-',
      '  This is a folded description that spans',
      '  multiple continuation lines with two-space',
      '  indentation that must survive normalization.',
    ];
    const original = [
      '---',
      'name: agent-folded',
      ...descLines,
      'version: 9.9.9',
      'metadata:',
      '  version: "0.0.1"',
      '---',
      '',
      'Body.',
      '',
    ].join('\n');
    const path = write('folded.md', original);

    normalizeAgentVersion(path);
    const result = readFileSync(path, 'utf-8');

    // Each folded description line is byte-identical.
    for (const line of descLines) {
      expect(result).toContain(line);
    }
    expect(result).toContain('  version: "9.9.9"');
    expect(result).not.toMatch(/^version:/m);
  });

  it('throws when file has no frontmatter', () => {
    const path = write('no-fm.md', 'Just body text.\n');
    expect(() => normalizeAgentVersion(path)).toThrow('no YAML frontmatter');
  });

  it('throws on unterminated frontmatter', () => {
    const path = write('unterminated.md', '---\nname: x\nversion: 1.0.0\n');
    expect(() => normalizeAgentVersion(path)).toThrow('unterminated frontmatter');
  });
});

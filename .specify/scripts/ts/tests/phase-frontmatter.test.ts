import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readPhaseFrontmatterStatus,
  renderPhaseFrontmatterStatus,
  replaceFrontmatterStatusLine,
  updatePhaseFrontmatterStatus,
} from '../src/commands/util/phase-frontmatter';
import type { PhaseStatus } from '../src/commands/util/phases-table-parser';

const FIXTURES = join(import.meta.dir, 'fixtures');

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'phase-fm-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function tmpFixture(name: string): string {
  const src = join(FIXTURES, name);
  const dst = join(tmpDir, name);
  cpSync(src, dst);
  return dst;
}

describe('updatePhaseFrontmatterStatus', () => {
  it('updates existing status: todo → in_progress', () => {
    const path = tmpFixture('phase-frontmatter-valid.md');
    updatePhaseFrontmatterStatus(path, 'in_progress');
    const result = readFileSync(path, 'utf-8');
    expect(result).toContain('status: in_progress');
    expect(result).not.toContain('status: todo');
  });

  it('is idempotent — re-call with same status does not rewrite', () => {
    const path = tmpFixture('phase-frontmatter-valid.md');
    updatePhaseFrontmatterStatus(path, 'in_progress');
    const contentAfterFirst = readFileSync(path, 'utf-8');
    const mtimeAfterFirst = Bun.file(path).lastModified;

    updatePhaseFrontmatterStatus(path, 'in_progress');
    const contentAfterSecond = readFileSync(path, 'utf-8');
    expect(contentAfterSecond).toBe(contentAfterFirst);
  });

  it('inserts status: key when frontmatter has phase: but no status:', () => {
    const path = tmpFixture('phase-frontmatter-no-status.md');
    updatePhaseFrontmatterStatus(path, 'done');
    const result = readFileSync(path, 'utf-8');
    expect(result).toContain('status: done');
    expect(result).toContain('phase: 2');
    expect(result).toContain('title: "Phase without status key"');
  });

  it('throws when file does not exist', () => {
    expect(() =>
      updatePhaseFrontmatterStatus(join(tmpDir, 'nonexistent.md'), 'todo'),
    ).toThrow();
  });

  it('throws when no frontmatter block exists', () => {
    const path = tmpFixture('phase-frontmatter-no-block.md');
    expect(() =>
      updatePhaseFrontmatterStatus(path, 'todo'),
    ).toThrow('no YAML frontmatter block found');
  });

  it('throws on invalid status value', () => {
    const path = tmpFixture('phase-frontmatter-valid.md');
    expect(() =>
      updatePhaseFrontmatterStatus(path, 'bogus' as PhaseStatus),
    ).toThrow('invalid status');
  });

  it('preserves other YAML keys and trailing content', () => {
    const path = tmpFixture('phase-frontmatter-valid.md');
    const before = readFileSync(path, 'utf-8');
    updatePhaseFrontmatterStatus(path, 'done');
    const after = readFileSync(path, 'utf-8');
    expect(after).toContain('phase: 1');
    expect(after).toContain('title: "Test phase"');
    expect(after).toContain('priority: P2');
    expect(after).toContain('effort: 2h');
    expect(after).toContain('# Phase 1: Test phase');
    expect(after).toContain('Body content here.');
  });

  it('accepts all 6 canonical status values', () => {
    const allStatuses: PhaseStatus[] = [
      'todo', 'in_progress', 'done', 'skipped', 'blocked', 'cancelled',
    ];
    for (const status of allStatuses) {
      const path = tmpFixture('phase-frontmatter-valid.md');
      updatePhaseFrontmatterStatus(path, status);
      const result = readFileSync(path, 'utf-8');
      expect(result).toContain(`status: ${status}`);
    }
  });
});

describe('phase frontmatter pure helpers', () => {
  it('renders exact after bytes without writing', () => {
    const path = tmpFixture('phase-frontmatter-valid.md');
    const before = readFileSync(path, 'utf-8');
    const after = renderPhaseFrontmatterStatus(before, 'done', path);

    expect(readFileSync(path, 'utf-8')).toBe(before);
    expect(readPhaseFrontmatterStatus(after, path)).toBe('done');
  });

  it('reports a missing status while the renderer can insert it', () => {
    const path = tmpFixture('phase-frontmatter-no-status.md');
    const before = readFileSync(path, 'utf-8');
    expect(readPhaseFrontmatterStatus(before, path)).toBeNull();
    expect(readPhaseFrontmatterStatus(renderPhaseFrontmatterStatus(before, 'todo', path), path)).toBe('todo');
  });
});

describe('replaceFrontmatterStatusLine', () => {
  it('keeps CRLF on the rewritten status line', () => {
    const before = '---\r\nphase: 1\r\nstatus: todo\r\n---\r\n# Phase\r\n';
    expect(replaceFrontmatterStatusLine(before, 'done')).toBe('---\r\nphase: 1\r\nstatus: done\r\n---\r\n# Phase\r\n');
  });

  it('preserves a leading BOM', () => {
    const before = '\uFEFF---\nstatus: todo\n---\n';
    expect(replaceFrontmatterStatusLine(before, 'done')).toBe('\uFEFF---\nstatus: done\n---\n');
  });

  it('preserves an inline comment after the value', () => {
    expect(replaceFrontmatterStatusLine('---\nstatus: draft  # draft | ready\n---\n', 'ready'))
      .toBe('---\nstatus: ready  # draft | ready\n---\n');
  });

  it('keeps $ replacement patterns in the frontmatter literal', () => {
    const before = "---\ntitle: costs $$ and $' and $&\nstatus: todo\nphase: 1\n---\n# $` body\n";
    expect(replaceFrontmatterStatusLine(before, 'done')).toBe(before.replace('status: todo', 'status: done'));
    expect(renderPhaseFrontmatterStatus(before, 'in_progress')).toBe(before.replace('status: todo', 'status: in_progress'));
    const noStatus = "---\ntitle: $'x$$\nphase: 1\n---\n";
    expect(renderPhaseFrontmatterStatus(noStatus, 'todo')).toBe("---\ntitle: $'x$$\nphase: 1\nstatus: todo\n---\n");
  });

  it('is a no-op without frontmatter or status key', () => {
    expect(replaceFrontmatterStatusLine('# body only\n', 'done')).toBe('# body only\n');
    expect(replaceFrontmatterStatusLine('---\nphase: 1\n---\n', 'done')).toBe('---\nphase: 1\n---\n');
  });

  it('lets the phase renderer update CRLF and BOM files', () => {
    const crlf = '---\r\nphase: 1\r\nstatus: todo\r\n---\r\n';
    expect(renderPhaseFrontmatterStatus(crlf, 'in_progress')).toBe('---\r\nphase: 1\r\nstatus: in_progress\r\n---\r\n');
    const bom = '\uFEFF---\nphase: 1\nstatus: todo\n---\n';
    expect(readPhaseFrontmatterStatus(bom)).toBe('todo');
    expect(renderPhaseFrontmatterStatus(bom, 'done')).toBe('\uFEFF---\nphase: 1\nstatus: done\n---\n');
  });
});

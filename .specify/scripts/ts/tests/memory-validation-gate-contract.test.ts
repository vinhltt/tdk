import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { implementationGate, validateGuardianReport } from '../src/commands/util/memory-gate';

const FIXTURES = resolve(import.meta.dir, 'fixtures/guardian-reports');
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'tdk-gate-'));
  roots.push(workspace);
  const root = join(workspace, 'memory');
  await mkdir(join(root, 'data-model'), { recursive: true });
  const path = join(root, 'data-model/account.md');
  const note = '---\ntype: data-model\nstatus: active\nauthority: memory\nbinding: true\n---\n\n## Fields\n\nid is non-nullable.\n';
  await writeFile(path, note);
  return { workspace, root, path, note };
}

async function report(name: string, path?: string) {
  const text = await readFile(join(FIXTURES, `${name}.txt`), 'utf8');
  return path ? text.replaceAll('.specify/memory/data-model/account.md', path) : text;
}

describe('Guardian report boundary', () => {
  it.each(['empty', 'bare-clear', 'clear-with-conflict', 'two-actions'])(
    'does not grant implementation for malformed %s output', async name => {
      const { root } = await fixture();
      expect((await validateGuardianReport(await report(name), 0, root)).state).toBe('not-checked');
    },
  );

  it('treats failed execution as unchecked even when stdout looks CLEAR', async () => {
    const { root } = await fixture();
    expect((await validateGuardianReport(await report('valid-clear'), 7, root)).state).toBe('not-checked');
  });

  it('accepts a complete CLEAR report with a counted verified claim', async () => {
    const { root } = await fixture();
    expect((await validateGuardianReport(await report('valid-clear'), 0, root)).state).toBe('clear');
  });

  it('blocks on a conflict supported by a real active binding note and heading', async () => {
    const { root, path } = await fixture();
    expect((await validateGuardianReport(await report('valid-block', path), 0, root)).state).toBe('block-impl');
  });

  it('rejects claimed evidence when the exact note is nonbinding or the anchor is absent', async () => {
    const { root, path, note } = await fixture();
    const text = await report('valid-block', path);
    expect((await validateGuardianReport(text.replace('#fields', '#missing'), 0, root)).state).toBe('not-checked');
    await writeFile(path, note.replace('binding: true', 'binding: false'));
    expect((await validateGuardianReport(text, 0, root)).state).toBe('not-checked');
  });

  it('never treats template or deprecated assets as conflict evidence', async () => {
    const { root, note } = await fixture();
    for (const directory of ['_templates', '_deprecated']) {
      await mkdir(join(root, directory));
      const path = join(root, directory, 'account.md');
      await writeFile(path, note);
      expect((await validateGuardianReport(await report('valid-block', path), 0, root)).state).toBe('not-checked');
    }
  });

  it('rejects an in-root citation whose symlink resolves outside memory', async () => {
    const { root, path, workspace, note } = await fixture();
    const external = join(workspace, 'outside.md');
    await writeFile(external, note);
    await rm(path);
    await symlink(external, path);
    expect((await validateGuardianReport(await report('valid-block', path), 0, root)).state).toBe('not-checked');
  });

  it('rejects summary totals and entry counts that cannot describe the actual report', async () => {
    const { root } = await fixture();
    const clear = await report('valid-clear');
    expect((await validateGuardianReport(clear.replace('Total claims checked: 1', 'Total claims checked: 2'), 0, root)).state).toBe('not-checked');
    expect((await validateGuardianReport(clear.replace('- account.id is not nullable, matching memory', 'None found'), 0, root)).state).toBe('not-checked');
  });

  it('rejects duplicate reports and an action moved outside Summary', async () => {
    const { root } = await fixture();
    const clear = await report('valid-clear');
    expect((await validateGuardianReport(clear + clear, 0, root)).state).toBe('not-checked');
    expect((await validateGuardianReport(clear.replace('Action required: CLEAR\n', '') + '\nAction required: CLEAR\n', 0, root)).state).toBe('not-checked');
  });

  it('uses the same anchored delimiter pair for validation and slicing', async () => {
    const { root } = await fixture();
    const clear = await report('valid-clear');
    expect((await validateGuardianReport(`quoted ${clear}\n=== GUARDIAN REPORT ===\n`, 0, root)).state).toBe('not-checked');
  });

  it('rejects conflicts misplaced in OK, NOT CHECKED, or Summary', async () => {
    const { root, path } = await fixture();
    const clear = await report('valid-clear');
    for (const section of ['OK', 'NOT CHECKED', 'Summary']) {
      const malformed = clear.replace(new RegExp(`^## ${section}[^\\n]*\\n`, 'm'), `$&### CONFLICT-001\nEvidence: ${path}#fields\nIssue: contradicts memory\n`);
      expect((await validateGuardianReport(malformed, 0, root)).state).toBe('not-checked');
    }
  });

  it('rejects malformed evidence type and example-only anchors', async () => {
    const { root, path, note } = await fixture();
    const text = await report('valid-block', path);
    await writeFile(path, note.replace('type: data-model', 'type: [data-model]'));
    expect((await validateGuardianReport(text, 0, root)).state).toBe('not-checked');
    for (const body of ['```markdown\n## Fields\n```\n', '~~~\n## Fields\n~~~\n', '<!--\n## Fields\n-->\n', '    ## Fields\n']) {
      await writeFile(path, note.split('## Fields')[0] + body);
      expect((await validateGuardianReport(text, 0, root)).state).toBe('not-checked');
    }
    await writeFile(path, note.split('## Fields')[0] + '```\nExample ^fields\n```\n');
    expect((await validateGuardianReport(text.replace('#fields', '#^fields'), 0, root)).state).toBe('not-checked');
    await writeFile(path, note + '\nActual constraint ^fields\n');
    expect((await validateGuardianReport(text.replace('#fields', '#^fields'), 0, root)).state).toBe('block-impl');
  });

  it('continues with REVIEW only when actual warning entries support its count', async () => {
    const { root } = await fixture();
    const review = (await report('valid-clear')).replace('## WARNINGS (should review)\nNone found', '## WARNINGS (should review)\n### WARN-001\nIssue: nonbinding context differs')
      .replace('Total claims checked: 1', 'Total claims checked: 2').replace('WARNINGS: 0', 'WARNINGS: 1').replace('Action required: CLEAR', 'Action required: REVIEW');
    expect((await validateGuardianReport(review, 0, root)).state).toBe('review');
  });
});

describe('persisted implementation gate', () => {
  const metadata = { memory_gate_reason: 'fixture outcome', memory_gate_at: '2026-09-22T00:00:00Z' };
  it('keeps legacy plans compatible but rejects unknown or incomplete gate states', () => {
    expect(implementationGate({})).toBe('allow');
    expect(implementationGate({ ...metadata, memory_gate: 'invalid' })).toBe('block');
    expect(implementationGate({ memory_gate: 'clear' })).toBe('block');
  });
  it('never coerces malformed sequences or partial metadata into permission', () => {
    for (const memory_gate of [['clear'], ['review'], ['skipped'], {}, null, true]) {
      expect(implementationGate({ ...metadata, memory_gate })).toBe('block');
    }
    expect(implementationGate(metadata)).toBe('block');
  });
  it('allows valid outcomes and genuine skips without turning failures into permission', () => {
    for (const state of ['clear', 'review', 'skipped']) expect(implementationGate({ ...metadata, memory_gate: state })).toBe('allow');
    for (const state of ['not-checked', 'block-impl']) expect(implementationGate({ ...metadata, memory_gate: state })).toBe('block');
  });
  it('requires live confirmation even for complete handwritten authorization metadata', () => {
    expect(implementationGate({ ...metadata, memory_gate: 'authorized' })).toBe('block');
    expect(implementationGate({ ...metadata, memory_gate: 'authorized', memory_gate_actor: 'agent' })).toBe('block');
    expect(implementationGate({ ...metadata, memory_gate: 'authorized', memory_gate_actor: 'user' })).toBe('confirm');
    expect(implementationGate({ ...metadata, memory_gate: 'authorized', memory_gate_actor: 'user', memory_gate_at: 'not-a-date' })).toBe('block');
  });
});

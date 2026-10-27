import { afterEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { hasForbiddenLocationCharacter, implementationGate, validateGuardianReport } from '../src/commands/util/memory-gate';

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

describe('memory root cross-check', () => {
  const NOTE = '---\ntype: data-model\nstatus: active\nauthority: memory\nbinding: true\n---\n\n## Fields\n\nid is non-nullable.\n';

  /** Workspace under a fresh parent so `../` roots stay inside the test sandbox. */
  async function workspace(config?: Record<string, unknown> | string) {
    const parent = await realpath(await mkdtemp(join(tmpdir(), 'tdk-gate-root-')));
    roots.push(parent);
    const ws = join(parent, 'ws');
    await mkdir(join(ws, '.specify'), { recursive: true });
    if (config !== undefined) {
      await writeFile(join(ws, '.specify/.specify.json'), typeof config === 'string' ? config : JSON.stringify({ name: 'sample', ...config }));
    }
    return { parent, ws };
  }

  async function initMemory(root: string, files = ['memory.yaml', 'memory-index.md']) {
    await mkdir(join(root, 'data-model'), { recursive: true });
    for (const file of files) await writeFile(join(root, file), 'x\n');
    await writeFile(join(root, 'data-model/account.md'), NOTE);
  }

  const run = async (ws: string, root: string, text?: string) =>
    validateGuardianReport(text ?? await report('valid-clear'), 0, root, ws);

  it('accepts the default root and a lone memory/ root when memory.path is not set', async () => {
    const { ws } = await workspace({});
    await initMemory(join(ws, 'memory'));
    expect((await run(ws, join(ws, 'memory'))).state).toBe('clear');
    await rm(join(ws, 'memory'), { recursive: true });
    await initMemory(join(ws, '.specify/memory'));
    expect((await run(ws, join(ws, '.specify/memory'))).state).toBe('clear');
  });

  it('accepts a project without any config on the default root', async () => {
    const { ws } = await workspace();
    await initMemory(join(ws, '.specify/memory'));
    expect((await run(ws, join(ws, '.specify/memory'))).state).toBe('clear');
  });

  it('refuses to pick between the two default roots', async () => {
    const { ws } = await workspace({});
    await initMemory(join(ws, '.specify/memory'));
    await initMemory(join(ws, 'memory'));
    expect(await run(ws, join(ws, 'memory'))).toEqual({ state: 'not-checked', reason: 'ambiguous-default — .specify/memory' });
  });

  it('reports a missing or half-initialized root by code and configured path', async () => {
    const { ws } = await workspace({ memory: { path: 'docs/brain' } });
    expect((await run(ws, join(ws, 'docs/brain'))).reason).toBe('root-missing — docs/brain');
    await initMemory(join(ws, 'docs/brain'), ['memory-index.md']);
    expect((await run(ws, join(ws, 'docs/brain'))).reason).toBe('memory-incomplete — docs/brain');
    await writeFile(join(ws, 'docs/brain/memory.yaml'), 'x\n');
    expect((await run(ws, join(ws, 'docs/brain'))).state).toBe('clear');
  });

  it('treats a sibling directory that merely starts with two dots as internal', async () => {
    const { ws } = await workspace({ memory: { path: '..mem' } });
    await initMemory(join(ws, '..mem'));
    expect((await run(ws, join(ws, '..mem'))).state).toBe('clear');
  });

  it('allows an external root only with allowExternal and honors root-relative evidence', async () => {
    const { parent, ws } = await workspace({ memory: { path: '../shared-memory', allowExternal: true } });
    const external = join(parent, 'shared-memory');
    await initMemory(external);
    expect((await run(ws, external)).state).toBe('clear');
    const block = (await report('valid-block')).replaceAll('.specify/memory/data-model/account.md', 'data-model/account.md');
    expect((await run(ws, external, block)).state).toBe('block-impl');
  });

  it('rejects an external root without allowExternal and never leaks absolute paths', async () => {
    const { parent, ws } = await workspace({ memory: { path: '../shared-memory' } });
    const external = join(parent, 'shared-memory');
    await initMemory(external);
    const result = await run(ws, external);
    expect(result).toEqual({ state: 'not-checked', reason: 'external-not-allowed — ../shared-memory' });
    expect(result.reason).not.toContain(parent);
  });

  it('rejects a root argument that is not the configured root', async () => {
    const { parent, ws } = await workspace({ memory: { path: '../shared-memory', allowExternal: true } });
    await initMemory(join(parent, 'shared-memory'));
    await initMemory(join(parent, 'other-memory'));
    const result = await run(ws, join(parent, 'other-memory'));
    expect(result).toEqual({ state: 'not-checked', reason: 'containment — ../shared-memory' });
  });

  it('reports an internal path whose symlink escapes the workspace as containment', async () => {
    const { parent, ws } = await workspace({ memory: { path: 'docs/brain' } });
    await initMemory(join(parent, 'elsewhere'));
    await mkdir(join(ws, 'docs'));
    await symlink(join(parent, 'elsewhere'), join(ws, 'docs/brain'));
    expect((await run(ws, join(ws, 'docs/brain'))).reason).toBe('containment — docs/brain');
  });

  it('rejects forbidden characters and malformed settings as config-invalid', async () => {
    const { ws } = await workspace({ memory: { path: 'docs/$(x)' } });
    expect((await run(ws, join(ws, 'docs'))).reason).toBe('config-invalid — docs/?(x)');
    await writeFile(join(ws, '.specify/.specify.json'), JSON.stringify({ name: 's', memory: { path: 'docs/brain', allowExternal: 'true' } }));
    expect((await run(ws, join(ws, 'docs/brain'))).reason).toBe('config-invalid — docs/brain');
    await writeFile(join(ws, '.specify/.specify.json'), '{ not json');
    expect((await run(ws, join(ws, 'docs/brain'))).reason).toMatch(/^config-invalid/);
  });

  /** A repository at `<parent>/main` with a linked worktree at `<parent>/wt/linked`, config committed in main. */
  async function linkedWorktree(memory: Record<string, unknown>) {
    const { parent } = await workspace();
    const main = join(parent, 'main');
    const linked = join(parent, 'wt/linked');
    await mkdir(join(main, '.specify'), { recursive: true });
    await writeFile(join(main, '.specify/.specify.json'), JSON.stringify({ name: 'sample', memory }));
    const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, stdio: 'ignore' });
    git(main, 'init', '-q');
    git(main, 'add', '.');
    git(main, 'commit', '-qm', 'init');
    git(main, 'worktree', 'add', '-q', linked);
    return { parent, main, linked };
  }

  it('keeps an in-repo relative memory.path in the current worktree', async () => {
    const { main, linked } = await linkedWorktree({ path: 'docs/brain' });
    await initMemory(join(linked, 'docs/brain'));
    expect((await run(linked, join(linked, 'docs/brain'))).state).toBe('clear');
    await initMemory(join(main, 'docs/brain'));
    expect((await run(linked, join(main, 'docs/brain'))).reason).toBe('containment — docs/brain');
  });

  it('resolves a relative memory.path that leaves the repository from the main worktree', async () => {
    const { parent, linked } = await linkedWorktree({ path: '../team-memory', allowExternal: true });
    await initMemory(join(parent, 'team-memory'));
    expect((await run(linked, join(parent, 'team-memory'))).state).toBe('clear');
    await initMemory(join(parent, 'wt/team-memory'));
    expect((await run(linked, join(parent, 'wt/team-memory'))).reason).toBe('containment — ../team-memory');
  });

  it('treats an absolute path into the main worktree as external from a linked worktree', async () => {
    const { main, linked } = await linkedWorktree({});
    const absolute = join(main, 'docs/brain');
    await initMemory(absolute);
    await writeFile(join(linked, '.specify/.specify.json'), JSON.stringify({ name: 'sample', memory: { path: absolute } }));
    expect((await run(linked, absolute)).reason).toBe(`external-not-allowed — ${absolute}`);
    await writeFile(join(linked, '.specify/.specify.json'), JSON.stringify({ name: 'sample', memory: { path: absolute, allowExternal: true } }));
    expect((await run(linked, absolute)).state).toBe('clear');
  });

  it('refuses a root that is the filesystem root or contains the workspace', async () => {
    const { ws } = await workspace({ memory: { path: '..', allowExternal: true } });
    await initMemory(dirname(ws));
    expect((await run(ws, dirname(ws))).reason).toBe('containment — ..');
    await writeFile(join(ws, '.specify/.specify.json'), JSON.stringify({ name: 's', memory: { path: '.', allowExternal: true } }));
    expect((await run(ws, ws)).reason).toBe('containment — .');
    await writeFile(join(ws, '.specify/.specify.json'), JSON.stringify({ name: 's', memory: { path: '/', allowExternal: true } }));
    expect((await run(ws, '/')).reason).toBe('containment — /');
  });

  it('rejects empty, blank, and non-string memory.path as config-invalid', async () => {
    const { ws } = await workspace({});
    for (const path of ['', '   ', 5, null]) {
      await writeFile(join(ws, '.specify/.specify.json'), JSON.stringify({ name: 's', memory: { path } }));
      expect((await run(ws, join(ws, '.specify/memory'))).reason).toBe('config-invalid — .specify/memory');
    }
  });

  it('rejects backslash, C1, and separator characters in memory.path as config-invalid', async () => {
    const { ws } = await workspace({});
    for (const [path, shown] of [['docs\\brain', 'docs?brain'], ['docs/\u0085x', 'docs/?x'], ['docs/\u2028x', 'docs/?x']]) {
      await writeFile(join(ws, '.specify/.specify.json'), JSON.stringify({ name: 's', memory: { path } }));
      expect((await run(ws, join(ws, 'docs'))).reason).toBe(`config-invalid — ${shown}`);
    }
  });

  it('screens resolved locations with the narrower set, so common directory names stay usable', async () => {
    const { parent } = await workspace();
    for (const name of ['R&D', "Tom's projects", 'a;b|c', 'x<y>z']) {
      const ws = join(parent, name, 'ws');
      await mkdir(join(ws, '.specify'), { recursive: true });
      await initMemory(join(ws, '.specify/memory'));
      expect((await run(ws, join(ws, '.specify/memory'))).state).toBe('clear');
    }
  });

  it('reports a workspace or canonical root holding a double-quote-active character as containment', async () => {
    const { parent, ws } = await workspace({});
    const dollarWorkspace = join(parent, 'a$b/ws');
    await mkdir(join(dollarWorkspace, '.specify/memory'), { recursive: true });
    expect((await run(dollarWorkspace, join(dollarWorkspace, '.specify/memory'))).reason).toBe('containment — .specify/memory');
    await initMemory(join(parent, 'odd$dir'));
    await symlink(join(parent, 'odd$dir'), join(ws, 'brain'));
    await writeFile(join(ws, '.specify/.specify.json'), JSON.stringify({ name: 's', memory: { path: 'brain', allowExternal: true } }));
    expect((await run(ws, join(ws, 'brain'))).reason).toBe('containment — brain');
  });

  it('treats a backslash as a location character everywhere except win32', () => {
    expect(hasForbiddenLocationCharacter('/srv/a\\b', 'linux')).toBe(true);
    expect(hasForbiddenLocationCharacter('C:\\Users\\me', 'win32')).toBe(false);
    for (const dirty of ['/a$b', '/a`b', '/a"b', '/a\nb', '/a\u0085b', '/a\u2028b']) {
      expect(hasForbiddenLocationCharacter(dirty, 'win32')).toBe(true);
    }
    for (const clean of ["/Tom's/R&D", '/a;b|c<d>e']) expect(hasForbiddenLocationCharacter(clean, 'linux')).toBe(false);
  });

  it('selects default roots by directory, not by any file-system entry', async () => {
    const { ws } = await workspace({});
    await initMemory(join(ws, '.specify/memory'));
    await writeFile(join(ws, 'memory'), 'not a directory\n');
    expect((await run(ws, join(ws, '.specify/memory'))).state).toBe('clear');
  });

  it('requires memory.yaml and memory-index.md to be regular files, not directories or symlinks', async () => {
    const { ws } = await workspace({});
    const root = join(ws, '.specify/memory');
    await initMemory(root);
    await rm(join(root, 'memory.yaml'));
    await mkdir(join(root, 'memory.yaml'));
    expect((await run(ws, root)).reason).toBe('memory-incomplete — .specify/memory');
    await rm(join(root, 'memory.yaml'), { recursive: true });
    await writeFile(join(ws, 'real.yaml'), 'x\n');
    await symlink(join(ws, 'real.yaml'), join(root, 'memory.yaml'));
    expect((await run(ws, root)).reason).toBe('containment — .specify/memory');
  });

  it('reads only a regular, bounded .specify/.specify.json', async () => {
    const { ws } = await workspace();
    const config = join(ws, '.specify/.specify.json');
    await initMemory(join(ws, 'docs/brain'));
    await writeFile(join(ws, 'real.json'), JSON.stringify({ name: 's', memory: { path: 'docs/brain' } }));
    await symlink(join(ws, 'real.json'), config);
    expect((await run(ws, join(ws, 'docs/brain'))).reason).toBe('config-invalid — .specify/memory');
    await rm(config);
    await writeFile(config, JSON.stringify({ name: 's', memory: { path: 'docs/brain' }, padding: 'x'.repeat(1_048_576) }));
    expect((await run(ws, join(ws, 'docs/brain'))).reason).toBe('config-invalid — .specify/memory');
    await rm(config);
    await writeFile(join(ws, '.specify/.specify.yaml'), 'name: s\nmemory:\n  path: docs/brain\n');
    await initMemory(join(ws, '.specify/memory'));
    expect((await run(ws, join(ws, '.specify/memory'))).state).toBe('clear');
    expect((await run(ws, join(ws, 'docs/brain'))).reason).toBe('containment — .specify/memory');
  });

  it('discovers the workspace from a subdirectory of the invocation cwd', async () => {
    const { ws } = await workspace({});
    await initMemory(join(ws, '.specify/memory'));
    await mkdir(join(ws, 'src/deep'), { recursive: true });
    expect((await run(join(ws, 'src/deep'), join(ws, '.specify/memory'))).state).toBe('clear');
  });

  it('treats a sub-workspace with its own .specify as the workspace, like the memory runtime', async () => {
    const { ws } = await workspace({});
    await initMemory(join(ws, '.specify/memory'));
    await mkdir(join(ws, 'apps/web/.specify'), { recursive: true });
    expect((await run(join(ws, 'apps/web'), join(ws, '.specify/memory'))).reason).toBe('root-missing — .specify/memory');
    await initMemory(join(ws, 'apps/web/.specify/memory'));
    expect((await run(join(ws, 'apps/web'), join(ws, 'apps/web/.specify/memory'))).state).toBe('clear');
  });

  it('keeps the CLI exit codes and output for valid reports', async () => {
    const { ws } = await workspace({});
    await initMemory(join(ws, '.specify/memory'));
    const input = join(ws, 'report.txt');
    await writeFile(input, await report('valid-clear'));
    const script = resolve(import.meta.dir, '../src/commands/util/memory-gate.ts');
    const cli = (root: string) => Bun.spawnSync([process.execPath, script, 'report', input, root, '0'], { cwd: ws });
    const ok = cli(join(ws, '.specify/memory'));
    expect(ok.exitCode).toBe(0);
    expect(JSON.parse(ok.stdout.toString())).toEqual({ state: 'clear', reason: 'validated CLEAR report' });
    const bad = cli(join(dirname(ws), 'elsewhere'));
    expect(bad.exitCode).toBe(1);
    expect(JSON.parse(bad.stdout.toString()).state).toBe('not-checked');
  });
});

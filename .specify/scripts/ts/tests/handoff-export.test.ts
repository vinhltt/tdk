import { afterEach, expect, test } from 'bun:test';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { renderHandoffArtifact } from '../../../plugins/tdk-utils/skills/tdk-handoff/scripts/handoff-artifact';
import { exportHandoff } from '../../../plugins/tdk-utils/skills/tdk-handoff/scripts/handoff-export';

const skillScripts = resolve(import.meta.dir, '../../../plugins/tdk-utils/skills/tdk-handoff/scripts');
const command = join(skillScripts, 'handoff-export.js');
const sourceCommand = join(skillScripts, 'handoff-export.ts');
const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function root() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'handoff-export-')));
  temporary.push(dir);
  return dir;
}
function packet() {
  return {
    kind: 'continuation', title: 'Review safe export', focus: null as string | null,
    source_task: null as string | null, source_issue: null as string | null,
    intended_recipient: null as string | null, target_project: null as string | null,
    sections: {
      mission: 'Finish the bounded export helper.', scope: 'Capture only; no lifecycle changes.',
      current_state: 'Not captured in this session', decisions: 'Keep existing files unchanged.',
      work_performed: 'Not captured in this session', verification: 'Not captured in this session',
      risks: 'Receiver must verify live state.',
      next_actions: '1. **First safe step**: Verify the recipient worktree and missing local changes.',
      sources: 'Not captured in this session',
    },
  };
}
async function cli(dir: string, input: unknown = packet(), extra: string[] = [], env: Record<string, string> = {}, executable = command, cwd = tmpdir()) {
  const child = Bun.spawn([process.execPath, '--no-install', executable, '--capture-root', dir, '--slug', 'safe-export', ...extra], {
    cwd, env: { ...process.env, TZ: Intl.DateTimeFormat().resolvedOptions().timeZone, ...env }, stdin: new Blob([typeof input === 'string' ? input : JSON.stringify(input)]), stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { stdout, stderr, code, result: JSON.parse(stdout) };
}

test('compiled-only skill in a quoted consumer path exports to a separate root without dependencies and preserves collisions', async () => {
  const installedRoot = root(); const captureRoot = root(); const workingRoot = root();
  const installedScripts = join(installedRoot, '.claude', 'skills', "receiver's handoff", 'scripts');
  mkdirSync(installedScripts, { recursive: true });
  const installedCommand = join(installedScripts, 'handoff-export.js');
  copyFileSync(command, installedCommand);
  const expectIsolated = () => {
    expect(readdirSync(installedScripts)).toEqual(['handoff-export.js']);
    for (const dir of [installedRoot, captureRoot, workingRoot]) {
      expect(existsSync(join(dir, '.specify', 'scripts'))).toBe(false);
      expect(readdirSync(dir, { recursive: true }).some(entry => entry.split(/[\\/]/).includes('node_modules'))).toBe(false);
    }
    expect(existsSync(join(installedRoot, '.specify'))).toBe(false);
    expect(existsSync(join(workingRoot, '.specify'))).toBe(false);
  };
  expectIsolated();
  const input = packet();
  input.source_task = 'task-171';
  input.source_issue = 'https://example.com/issues/171';
  input.intended_recipient = 'Codex';
  input.target_project = installedRoot;
  input.sections.verification = 'API_KEY=fake-isolated-consumer-secret\nCheck the reported worktree state before continuing.';
  const environment = { CLAUDE_PROJECT_DIR: installedRoot };
  const first = await cli(captureRoot, input, [], environment, installedCommand, workingRoot);
  expect(first.code).toBe(0); expect(first.stderr).toBe('');
  expect(first.result.path).toMatch(/^\.specify\/handoffs\/\d{8}-safe-export\.md$/);
  const target = join(captureRoot, first.result.path);
  const body = readFileSync(target, 'utf8');
  const metadata = parse(body.split('---\n')[1]!);
  const expected = renderHandoffArtifact(input, new Date(metadata.generated_at));
  expect(first.result).toEqual({ ok: true, path: first.result.path, kind: 'continuation', redactions: expected.redactions });
  expect(expected.redactions).toBeGreaterThan(0);
  expect(body).toBe(expected.body);
  expect(metadata.handoff_version).toBe(1);
  expect(metadata.kind).toBe('continuation');
  expect(metadata.source_task).toBe('task-171');
  expect(metadata.source_issue).toBe(input.source_issue);
  expect(metadata.intended_recipient).toBe('Codex');
  expect(body).toContain('**First safe step**: Verify the recipient worktree and missing local changes.');
  expect(body).toContain('Not captured in this session');
  expect(body).not.toContain('fake-isolated-consumer-secret');
  expect(body).not.toContain(installedRoot);
  const replacement = { ...input, title: 'Attempted replacement' };
  for (const bytes of [Buffer.from(body), Buffer.from('incomplete prior capture')]) {
    writeFileSync(target, bytes);
    const collision = await cli(captureRoot, replacement, [], environment, installedCommand, workingRoot);
    expect(collision.code).toBe(1); expect(collision.stderr).toBe('');
    expect(collision.result).toEqual({ ok: false, error: 'collision_exists' });
    expect(readFileSync(target)).toEqual(bytes);
    expect(readdirSync(join(captureRoot, '.specify', 'handoffs'))).toEqual([first.result.path.split('/').at(-1)!]);
  }
  expectIsolated();
});

test('real stdin CLI writes only under explicit configless root despite environment and recipient', async () => {
  const consumer = root(); const maintainer = root();
  const input = packet(); input.target_project = maintainer;
  const result = await cli(consumer, input, [], { CLAUDE_PROJECT_DIR: maintainer });
  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.result.path).toMatch(/^\.specify\/handoffs\/\d{8}-safe-export\.md$/);
  const body = readFileSync(join(consumer, result.result.path), 'utf8');
  expect(body).toContain('# HANDOFF: Review safe export');
  expect(body).toContain('Not captured in this session');
  expect(body).not.toContain(maintainer);
  expect(existsSync(join(maintainer, '.specify'))).toBe(false);
  expect(existsSync(join(consumer, '.git'))).toBe(false);
  expect(existsSync(join(consumer, '.specify', '.specify.json'))).toBe(false);
  if (process.platform !== 'win32') expect(lstatSync(join(consumer, result.result.path)).mode & 0o777).toBe(0o600);
});

test('selected configured host succeeds but child host mismatch and orphan declaration do not write', () => {
  const host = root(); const child = join(host, 'child');
  mkdirSync(join(host, '.specify')); mkdirSync(join(child, '.specify'), { recursive: true });
  writeFileSync(join(host, '.specify', '.specify.json'), JSON.stringify({ name: 'fixture', type: 'workspace' }));
  writeFileSync(join(child, '.specify', '.specify.json'), JSON.stringify({ type: 'sub-workspace' }));
  expect(exportHandoff(child, 'safe-export', packet())).toEqual({ ok: false, error: 'capture_root_mismatch', exitCode: 1 });
  expect(existsSync(join(child, '.specify', 'handoffs'))).toBe(false);
  const orphan = root(); mkdirSync(join(orphan, '.specify'));
  writeFileSync(join(orphan, '.specify', '.specify.json'), JSON.stringify({ type: 'sub-workspace' }));
  expect(exportHandoff(orphan, 'safe-export', packet())).toEqual({ ok: false, error: 'capture_root_mismatch', exitCode: 1 });
  expect(existsSync(join(orphan, '.specify', 'handoffs'))).toBe(false);
  const valid = exportHandoff(host, 'safe-export', packet());
  expect(valid.ok).toBe(true);
  if (valid.ok) expect(readFileSync(join(host, valid.path), 'utf8')).toContain('Finish the bounded export helper.');
});

test('nonexistent roots and malformed host configs never create output', () => {
  const dir = root();
  expect(exportHandoff(join(dir, 'missing'), 'safe-export', packet())).toEqual({ ok: false, error: 'invalid_capture_root', exitCode: 1 });
  mkdirSync(join(dir, '.specify'));
  writeFileSync(join(dir, '.specify', '.specify.json'), '{secret-value');
  expect(exportHandoff(dir, 'safe-export', packet())).toEqual({ ok: false, error: 'invalid_capture_config', exitCode: 1 });
  const legacy = root();
  mkdirSync(join(legacy, '.specify'));
  writeFileSync(join(legacy, '.specify', '.specify.yaml'), 'name: fabricated-private-config\n');
  expect(exportHandoff(legacy, 'safe-export', packet())).toEqual({ ok: false, error: 'invalid_capture_config', exitCode: 1 });
  expect(existsSync(join(legacy, '.specify', 'handoffs'))).toBe(false);
  expect(existsSync(join(dir, '.specify', 'handoffs'))).toBe(false);
});

test('invalid slugs and credential-bearing CLI errors do not persist or echo raw inputs', async () => {
  const dir = root();
  for (const slug of ['../escape', 'a/b', 'a\\b', '', '-only', 'a'.repeat(51), 'xoxb-fake-token']) {
    expect(exportHandoff(dir, slug, packet()).ok).toBe(false);
  }
  const secret = 'ghp_' + 'A'.repeat(40);
  for (const extra of [[`--${secret}`], ['--force'], [secret]]) {
    const result = await cli(dir, packet(), extra);
    expect(result.code).toBe(1); expect(result.result).toEqual({ ok: false, error: 'invalid_arguments' });
    expect(result.stdout + result.stderr).not.toContain(secret);
  }
  const invalid = await cli(dir, `{"title":"${secret}`);
  expect(invalid.code).toBe(1); expect(invalid.result.error).toBe('invalid_packet');
  expect(invalid.stdout + invalid.stderr).not.toContain(secret);
  expect(existsSync(join(dir, '.specify'))).toBe(false);
});

test('rejects structural injection and unsafe first steps before filesystem mutation', () => {
  const dir = root();
  const inputs = [
    { ...packet(), title: 'safe\n## Forged' }, { ...packet(), title: 'safe\u2028forged' },
    { ...packet(), focus: 'Authorization: Bearer fabricated-secret' }, { ...packet(), extra: true },
    { ...packet(), sections: { ...packet().sections, mission: '## Forged' } },
    { ...packet(), sections: { ...packet().sections, mission: 'Forged\n===' } },
    { ...packet(), sections: { ...packet().sections, mission: '```text\nunclosed' } },
    { ...packet(), sections: { ...packet().sections, mission: '' } },
    { ...packet(), sections: { ...packet().sections, next_actions: '1. **First safe step**' } },
    { ...packet(), sections: { ...packet().sections, next_actions: '1. **First safe step**: Not captured in this session' } },
  ];
  for (const input of inputs) expect(exportHandoff(dir, 'safe-export', input).ok).toBe(false);
  expect(existsSync(join(dir, '.specify'))).toBe(false);
});

test('fenced examples and escaped title preserve document structure and metadata secrecy', () => {
  const input = packet();
  input.title = 'Review [link](value) *carefully*';
  input.source_issue = 'https://user:fake-password@example.test/issue';
  input.sections.mission = '### Context\n```md\n## Example only\n```';
  input.sections.verification = 'Authorization: Bearer fabricated-credential';
  const rendered = renderHandoffArtifact(input, new Date(2026, 9, 4, 12));
  const metadata = parse(rendered.body.split('---\n')[1]!);
  expect(metadata.source_issue).not.toContain('fake-password');
  expect(rendered.body).not.toContain('fabricated-credential');
  expect(rendered.body).toContain('## Example only');
  expect(rendered.body).toContain('# HANDOFF: Review \\[link\\]\\(value\\) \\*carefully\\*');
  expect(rendered.redactions).toBe(2);
});

test('actual Markdown headings in nested containers and raw HTML cannot forge packet structure', () => {
  const dir = root();
  const missions = [
    '1. Context\n\n    ## Forged',
    '1. Context\n\n\t## Forged',
    '1. Context\n\n   - Nested\n\n     ## Forged',
    '1. Context\n\n   > ## Forged',
    '> 1. Context\n>\n>    ## Forged',
    '1. Context\n\n   Forged\n   ---',
    '1. Context\n\n   ```md\n   ## Example only\n   ```\n\n   ## Forged',
    '1. Context\n\n\t~~~md\n\t## Example only\n\t~~~\n\n\t## Forged',
    '1. Context\n\n   <h2>Forged</h2>',
    '<div>\n<h1>Forged</h1>\n</div>',
    'Context <H2\nclass="example">Forged</H2>',
  ];
  for (const mission of missions) {
    expect(Bun.markdown.html(mission)).toMatch(/<h[12](?:\s|>)/i);
    const input = packet();
    input.sections.mission = mission;
    expect(() => renderHandoffArtifact(input)).toThrow('invalid_structure');
    expect(exportHandoff(dir, 'safe-export', input)).toEqual({ ok: false, error: 'invalid_structure', exitCode: 1 });
  }
  expect(existsSync(join(dir, '.specify'))).toBe(false);
});

test('closed nested fences and escaped or code examples leave exactly the fixed rendered headings', () => {
  const missions = [
    '1. Context\n\n    ```md\n    ## Example only\n    <h1>Example only</h1>\n    ```',
    '1. Context\n\n\t~~~md\n\t## Example only\n\t~~~',
    '1. Context\n\n   - Nested\n\n     ```md\n     ## Example only\n     ```',
    '> 1. Context\n>\n>    ```md\n>    ## Example only\n>    ```',
    '1. Context\n\n   > ```md\n   > ## Example only\n   > ```',
    '1. Context\n\n        ## Indented example',
    '- - -\n\n    ```md\n    ## Indented example without a Markdown fence',
    '<kbd>Useful detail</kbd> and escaped \\<h2>example\\</h2>.',
    'Escaped \\## Example and `<h2>inline code</h2>`.\n\n### Useful detail',
    '```html\n<!-- Example only\n<h2>Example only</h2>\n````',
  ];
  const expected = [
    '<h1>HANDOFF: Review [link](value) *carefully*</h1>',
    '<h2>Mission and current status</h2>', '<h2>Scope and guardrails</h2>',
    '<h2>Current state</h2>', '<h2>Decisions and rationale</h2>',
    '<h2>Work performed</h2>', '<h2>Verification</h2>',
    '<h2>Open risks and blockers</h2>', '<h2>Exact next actions</h2>',
    '<h2>Source pointers</h2>',
  ];
  for (const mission of missions) {
    const input = packet();
    input.title = 'Review [link](value) *carefully*';
    input.sections.mission = mission;
    const { body } = renderHandoffArtifact(input);
    const markdown = body.slice(body.indexOf('\n---\n', 4) + 5);
    const html = Bun.markdown.html(markdown);
    expect([...html.matchAll(/<h[12](?:\s[^>]*)?>.*?<\/h[12]>/gs)].map((match) => match[0])).toEqual(expected);
  }
});

test('unterminated fences refuse even when nested container boundaries implicitly close Markdown code', () => {
  for (const mission of [
    '```md\n## Example only',
    '1. Context\n\n   ```md\n   ## Example only',
    '1. Context\n\n\t~~~md\n\t## Example only',
    '1. Context\n\n   - Nested\n\n     ```md\n     ## Example only\n\nOutside',
    '> ```md\n> ## Example only\n\nOutside',
    '1. Context\n\n   > ```md\n   > ## Example only\n\nOutside',
    '1. Context\n\n   ````md\n   ## Example only\n   ```',
    '> ```md\n\n> ```',
  ]) {
    const input = packet();
    input.sections.mission = mission;
    expect(() => renderHandoffArtifact(input)).toThrow('invalid_structure');
  }
});

test('raw HTML cannot hide the fixed title or later section headings', () => {
  for (const mission of [
    '<!-- unclosed', '<![CDATA[unclosed', '<?unclosed',
    '<script>', '<pre>', '<style>', '<textarea>', '<title>',
    '<iframe>', '<xmp>', '<noembed>', '<noframes>', '<plaintext>',
  ]) {
    const input = packet();
    input.sections.mission = mission;
    expect(() => renderHandoffArtifact(input)).toThrow('invalid_structure');
  }
});

test('later blocks cannot supply an empty or redaction-only first safe step', () => {
  const dir = root();
  const firstItems = [
    '1. **First safe step**:',
    '1. **First safe step**: [REDACTED:api-key]',
    `1. **First safe step**: ${'ghp_' + 'A'.repeat(40)}`,
    '1. **First safe step**: Not captured in this session',
  ];
  for (const firstItem of firstItems) {
    for (const laterBlock of [
      'Proceed with deployment.', '- Proceed with deployment.',
      '### Proceed with deployment', '2. Proceed with deployment.',
    ]) {
      const input = packet();
      input.sections.next_actions = `${firstItem}\n\n${laterBlock}`;
      expect(() => renderHandoffArtifact(input)).toThrow('invalid_structure');
      expect(exportHandoff(dir, 'safe-export', input)).toEqual({ ok: false, error: 'invalid_structure', exitCode: 1 });
    }
  }
  expect(existsSync(join(dir, '.specify'))).toBe(false);
  const reference = packet();
  reference.sections.next_actions = '1. **First safe step**: [REDACTED:api-key][marker]\n\nProceed with deployment.\n\n[marker]: https://example.com';
  expect(() => renderHandoffArtifact(reference)).toThrow('invalid_structure');
});

test('first safe step retains meaningful wrapped and indented actions in any language', () => {
  for (const nextActions of [
    '1. **First safe step**: Re-check\nlive worktree state before proceeding.\n\n2. Continue only after checking.',
    '1. **First safe step**:\n   Verify the current worktree.\n\n   Re-check the reported failures before changing files.',
    '1. **First safe step**:\n\tVerify the current worktree.\n\n\tRe-check the reported failures.',
    '1. **First safe step**:\n\n   - Kiểm tra lại trạng thái hiện tại trước khi tiếp tục.',
    '1. **First safe step**: 現在の作業ツリーと失敗した確認を再検証してください。',
  ]) {
    const input = packet();
    input.sections.next_actions = nextActions;
    const { body } = renderHandoffArtifact(input);
    expect(body).toContain(nextActions);
    expect(Bun.markdown.html(nextActions)).toContain('<ol>');
  }
});

test('local calendar filename and generated offset share one instant across UTC day boundary', async () => {
  const clock = new Date('2026-10-04T23:30:00Z');
  const script = `
    import { renderHandoffArtifact } from ${JSON.stringify(join(skillScripts, 'handoff-artifact.ts'))};
    console.log(JSON.stringify(renderHandoffArtifact(${JSON.stringify(packet())}, new Date(${JSON.stringify(clock.toISOString())}))));
  `;
  // Native runtimes cache timezone state: isolate TZ at process startup, never mutate the suite's clock.
  const child = Bun.spawn([process.execPath, '--no-install', '-e', script], {
    env: { ...process.env, TZ: 'Asia/Tokyo' }, stdout: 'pipe', stderr: 'pipe',
  });
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code).toBe(0); expect(err).toBe('');
  const rendered = JSON.parse(out);
  const metadata = parse(rendered.body.split('---\n')[1]!);
  expect(rendered.date).toBe('20261005');
  expect(new Date(metadata.generated_at).getTime()).toBe(clock.getTime());
  expect(metadata.generated_at).toMatch(/^2026-10-05T08:30:00(?:\.000)?\+09:00$/);
});

test('existing complete or incomplete packet bytes survive collisions unchanged', () => {
  const dir = root(); const clock = new Date(2026, 9, 4, 12);
  const first = exportHandoff(dir, 'safe-export', packet(), clock);
  expect(first.ok).toBe(true); if (!first.ok) return;
  const target = join(dir, first.path);
  for (const bytes of [readFileSync(target), Buffer.from('incomplete prior capture')]) {
    writeFileSync(target, bytes);
    expect(exportHandoff(dir, 'safe-export', packet(), clock)).toEqual({ ok: false, error: 'collision_exists', exitCode: 1 });
    expect(readFileSync(target)).toEqual(bytes);
  }
});

test('two native processes with missing output parents yield one complete winner', async () => {
  const dir = root(); const left = packet(); const right = packet(); right.title = 'Second writer';
  const results = await Promise.all([cli(dir, left), cli(dir, right)]);
  expect(results.map(r => r.code).sort()).toEqual([0, 1]);
  const winner = results.findIndex(r => r.code === 0);
  expect(results[1 - winner]!.result).toEqual({ ok: false, error: 'collision_exists' });
  const output = readFileSync(join(dir, results[winner]!.result.path), 'utf8');
  const expected = renderHandoffArtifact(winner === 0 ? left : right, new Date(parse(output.split('---\n')[1]!).generated_at));
  expect(output).toBe(expected.body);
});

test('output directory links, final occupied links and dangling links never affect outside bytes', () => {
  const clock = new Date(2026, 9, 4, 12); const outside = root();
  const sentinel = join(outside, 'sentinel.md'); writeFileSync(sentinel, 'outside bytes');
  const linkTypes: Array<'dir' | 'junction'> = process.platform === 'win32' ? ['dir', 'junction'] : ['dir'];
  for (const type of linkTypes) {
    for (const component of ['.specify', 'handoffs']) {
      for (const destination of [outside, join(outside, 'missing-directory')]) {
        const dir = root(); const link = component === '.specify' ? join(dir, '.specify') : join(dir, '.specify', 'handoffs');
        if (component === 'handoffs') mkdirSync(join(dir, '.specify'));
        symlinkSync(destination, link, type);
        expect(exportHandoff(dir, 'safe-export', packet(), clock)).toEqual({ ok: false, error: 'unsafe_output_path', exitCode: 1 });
        expect(existsSync(join(outside, '20261004-safe-export.md'))).toBe(false);
      }
    }
  }
  for (const destination of [sentinel, join(outside, 'missing.md')]) {
    const dir = root(); mkdirSync(join(dir, '.specify', 'handoffs'), { recursive: true });
    symlinkSync(destination, join(dir, '.specify', 'handoffs', '20261004-safe-export.md'), 'file');
    expect(exportHandoff(dir, 'safe-export', packet(), clock)).toEqual({ ok: false, error: 'collision_exists', exitCode: 1 });
  }
  expect(readFileSync(sentinel, 'utf8')).toBe('outside bytes');
  expect(existsSync(join(outside, 'missing.md'))).toBe(false);
});

test('caught partial write and close failures remove only this invocation owned file', async () => {
  for (const mode of ['partial', 'replaced', 'close', 'cli']) {
    const dir = root();
    const script = `
      import { mock } from 'bun:test';
      import * as original from 'node:fs';
      const realWrite = original.writeFileSync;
      const realClose = original.closeSync;
      const target = ${JSON.stringify(dir)} + '/.specify/handoffs/20261004-safe-export.md';
      let firstClose = true;
      mock.module('node:fs', () => ({
        ...original,
        writeFileSync(fd, data, options) {
          if (${JSON.stringify(mode)} === 'close') return realWrite(fd, data, options);
          realWrite(fd, 'partial');
          if (${JSON.stringify(mode)} === 'replaced') {
            original.unlinkSync(target);
            realWrite(target, 'another writer owns these bytes');
          }
          throw new Error('private failure diagnostic');
        },
        closeSync(fd) {
          realClose(fd);
          if (${JSON.stringify(mode)} === 'close' && firstClose) { firstClose = false; throw new Error('private close failure'); }
        },
      }));
      // Load only after fault injection; isolate module mocks from the parent test suite.
      const { exportHandoff, createHandoffExportCommand } = await import(${JSON.stringify(sourceCommand)});
      if (${JSON.stringify(mode)} === 'cli') {
        createHandoffExportCommand().parse(['bun', 'handoff-export', '--capture-root', ${JSON.stringify(dir)}, '--slug', 'safe-export']);
      } else {
        console.log(JSON.stringify(exportHandoff(${JSON.stringify(dir)}, 'safe-export', ${JSON.stringify(packet())}, new Date(2026, 9, 4, 12))));
      }
    `;
    const child = Bun.spawn([process.execPath, '--no-install', '-e', script], { stdin: new Blob([JSON.stringify(packet())]), stdout: 'pipe', stderr: 'pipe' });
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code).toBe(mode === 'cli' ? 2 : 0); expect(err).toBe('');
    expect(JSON.parse(out)).toEqual(mode === 'cli' ? { ok: false, error: 'write_failed' } : { ok: false, error: 'write_failed', exitCode: 2 });
    const target = join(dir, '.specify', 'handoffs', '20261004-safe-export.md');
    if (mode === 'replaced') expect(readFileSync(target, 'utf8')).toBe('another writer owns these bytes');
    else expect(readdirSync(join(dir, '.specify', 'handoffs'))).toEqual([]);
  }
});

test('explicit root aliases canonicalize but regular output components and occupied directories refuse', () => {
  const container = root(); const host = root(); const alias = join(container, 'selected-root');
  symlinkSync(host, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const result = exportHandoff(alias, 'safe-export', packet(), new Date(2026, 9, 4, 12));
  expect(result.ok).toBe(true);
  if (result.ok) expect(readFileSync(join(host, result.path), 'utf8')).toContain('Finish the bounded export helper.');
  for (const component of ['.specify', 'handoffs']) {
    const dir = root();
    if (component === 'handoffs') mkdirSync(join(dir, '.specify'));
    const file = component === '.specify' ? join(dir, component) : join(dir, '.specify', component);
    writeFileSync(file, 'existing non-directory');
    expect(exportHandoff(dir, 'safe-export', packet()).ok).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe('existing non-directory');
  }
  const dir = root(); const target = join(dir, '.specify', 'handoffs', '20261004-safe-export.md');
  mkdirSync(target, { recursive: true }); writeFileSync(join(target, 'sentinel'), 'untouched');
  expect(exportHandoff(dir, 'safe-export', packet(), new Date(2026, 9, 4, 12)).ok).toBe(false);
  expect(readFileSync(join(target, 'sentinel'), 'utf8')).toBe('untouched');
});

test('credential embedded in a kebab-case slug refuses without leaking filename or writing', async () => {
  const dir = root(); const slug = 'handoff-xoxb-fabricated-secret';
  const result = await cli(dir, packet(), ['--slug', slug]);
  expect(result.code).toBe(1);
  expect(result.result).toEqual({ ok: false, error: 'invalid_slug' });
  expect(result.stdout + result.stderr).not.toContain(slug);
  expect(existsSync(join(dir, '.specify'))).toBe(false);
});

test('concurrent parent creation rechecks EEXIST directories instead of trusting the winning entry', async () => {
  for (const replacement of ['directory', 'file']) {
    const dir = root();
    const script = `
      import { mock } from 'bun:test';
      import * as fs from 'node:fs';
      const realMkdir = fs.mkdirSync;
      mock.module('node:fs', () => ({
        ...fs,
        mkdirSync(path) {
          if (${JSON.stringify(replacement)} === 'directory') realMkdir(path);
          else fs.writeFileSync(path, 'concurrent non-directory');
          throw Object.assign(new Error('fixture EEXIST'), { code: 'EEXIST' });
        },
      }));
      // Import after the injected creation race; do not mutate parent-process module state.
      const { exportHandoff } = await import(${JSON.stringify(sourceCommand)});
      console.log(JSON.stringify(exportHandoff(${JSON.stringify(dir)}, 'safe-export', ${JSON.stringify(packet())}, new Date(2026, 9, 4, 12))));
    `;
    const child = Bun.spawn([process.execPath, '--no-install', '-e', script], {
      env: { ...process.env, TZ: Intl.DateTimeFormat().resolvedOptions().timeZone }, stdout: 'pipe', stderr: 'pipe',
    });
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code).toBe(0); expect(err).toBe('');
    const result = JSON.parse(out);
    if (replacement === 'directory') {
      expect(result.ok).toBe(true);
      expect(readFileSync(join(dir, result.path), 'utf8')).toBe(renderHandoffArtifact(packet(), new Date(2026, 9, 4, 12)).body);
    } else {
      expect(result).toEqual({ ok: false, error: 'unsafe_output_path', exitCode: 1 });
      expect(readFileSync(join(dir, '.specify'), 'utf8')).toBe('concurrent non-directory');
    }
  }
});

test('self-closing raw elements and lazily nested unfinished fences cannot alter packet structure', () => {
  for (const mission of [
    'Context <h2/>Forged</h2>',
    'Context <pre/>hidden',
    '1. Context\nlazy continuation\n\n    ```md\n    ## Example only',
    '1. Context\nlazy continuation\n\n    ```\n    example only',
    '> 1. Context\n> lazy continuation\n>\n>     ```md\n>     ## Example only',
  ]) {
    const input = packet(); input.sections.mission = mission;
    expect(() => renderHandoffArtifact(input)).toThrow('invalid_structure');
  }
  const input = packet();
  input.sections.mission = '1. Context\nlazy continuation\n\n    ```md\n    ## Example only\n    ```';
  expect(renderHandoffArtifact(input).body).toContain('## Example only');
  input.sections.mission = '> 1. Context\n> lazy continuation\n>\n>     ```md\n>     ## Example only\n>     ```';
  expect(renderHandoffArtifact(input).body).toContain('## Example only');
});

test('supported YAML credentials and Unicode machine paths cannot survive the persistence-ready artifact', () => {
  for (const verification of [
    "api_key: 'fake-head''fake-tail'\npublic_note: keep-this-evidence",
    "api_key: '''fake-head''''fake-tail'\npublic_note: keep-this-evidence",
    'api_key: fake-head\n  fake-tail\npublic_note: keep-this-evidence',
    '/秘密/fake-person/project',
  ]) {
    const input = packet(); input.sections.verification = verification;
    const { body } = renderHandoffArtifact(input);
    for (const secret of ['fake-head', 'fake-tail', '/秘密', 'fake-person']) expect(body).not.toContain(secret);
    if (verification.includes('public_note')) expect(body).toContain('public_note: keep-this-evidence');
  }
});

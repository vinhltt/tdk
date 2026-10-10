import { afterEach, describe, expect, it } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PhaseDelegatesError, parsePhaseDelegates, phaseSnapshotDigest, sha256, type DelegateGroups, type PlanTestMode } from '../../../src/utils/phase-delegates';
import { readPhaseFrontmatterStatus } from '../../../src/commands/util/phase-frontmatter';
import { parsePhasesTable } from '../../../src/commands/util/phases-table-parser';
import { executePhaseDelegates, type PhaseDelegatesResult } from '../../../src/commands/routing/phase-delegates';
import { containerFenceRepros, containerFenceVariants, delegateRewriteCases, renderRewriteEndings } from '../../fixtures/phase-delegate-rewrite-cases';

const CLI = join(import.meta.dir, '../../../src/index.ts');
const roots: string[] = [];
interface FixturePhase { number: number; status?: string; file?: string; title?: string; paths?: string[] }
interface Fixture { root: string; plan: string; config: string; route: string; phases: string[] }

function makeFixture(mode: PlanTestMode = 'none', definitions: FixturePhase[] = [{ number: 1 }]): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'phase-delegates-cli-'));
  roots.push(root);
  const config = join(root, '.specify', '.specify.json');
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(config, JSON.stringify({ version: '1.0', name: 'fixture', docs: { path: 'docs' }, subWorkspaces: [{ name: 'backend', path: 'src/backend' }, { name: 'web', path: 'src/web' }] }));
  const route = join(root, 'docs/custom-workflow/delegate-routing.md');
  mkdirSync(dirname(route), { recursive: true });
  const plan = join(root, 'plans/task/plan.md');
  mkdirSync(dirname(plan), { recursive: true });
  const rows = definitions.map((phase) => `| ${phase.number} | [Phase ${phase.number}](${phase.file ?? `phases/phase-${String(phase.number).padStart(2, '0')}-work.md`}) | ${phase.status ?? 'todo'} | — | — |`).join('\n');
  writeFileSync(plan, `---\ntest_mode: ${mode}\nstatus: todo\n---\n# Plan\n\n## Phases\n\n| # | File | Status | Blocks | BlockedBy |\n|---|---|---|---|---|\n${rows}\n\n## Notes\nKeep plan bytes.\n`);
  const phases = definitions.map((phase) => {
    const path = join(dirname(plan), phase.file ?? `phases/phase-${String(phase.number).padStart(2, '0')}-work.md`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `---\nphase: ${phase.number}\nstatus: ${phase.status ?? 'todo'}\nparallel_safe: never\nparallel_reason: preserve this exact reason\nblockedBy: []\nblocks: []\n---\n# Phase ${phase.number}: ${phase.title ?? 'API service'}\n\n## Overview\nPreserve Unicode: tiếng Việt and whitespace.  \n\n## Key Insights\nKeep the phase insights.\n\n${mode === 'none' ? '' : '## Test Quality Gate\nKeep the quality gate.\n\n'}## Delegate Skills\n- \`/old-skill\` - old purpose\n\n## Delegate Agents\n- \`@old-executor\` - old agent purpose\n\n${mode === 'tdd' ? '## Regression Gate\nKeep regression evidence.\n\n' : ''}## Requirements\nKeep requirements unchanged.\n\n## Related Code Files\n${(phase.paths ?? ['src/backend/service.ts']).map((path) => `- Modify: \`${path}\``).join('\n')}\n\n## Implementation Steps\nNever rewrite this text.\n`);
    return path;
  });
  return { root, plan, config, route, phases };
}

async function runCli(fixture: Fixture, action: string, args: string[] = [], credentials: { uid?: number; gid?: number } = {}) {
  const proc = Bun.spawn(['bun', CLI, 'routing', 'phase-delegates', action, '--project-root', fixture.root, '--plan', fixture.plan, ...args], {
    cwd: fixture.root, stdout: 'pipe', stderr: 'pipe', env: { ...process.env }, ...credentials,
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr, payload: stdout ? JSON.parse(stdout) : null };
}

async function runUtil(fixture: Fixture, script: string, args: string[], input?: string) {
  const proc = Bun.spawn(['bun', join(dirname(CLI), 'commands/util', script), ...args], {
    cwd: fixture.root, stdout: 'pipe', stderr: 'pipe',
    stdin: input === undefined ? 'ignore' : new TextEncoder().encode(input),
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { exitCode: await proc.exited, stdout, stderr };
}

function withoutDelegates(markdown: string): string {
  return markdown.replace(/^## Delegate (?:Skills|Agents)(?:\r?\n|$)[\s\S]*?(?=^## |(?![\s\S]))/gm, '');
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('routing phase-delegates real CLI route-state matrix', () => {
  it('missing is an opt-out: check and apply leave all old delegate bytes and the route absence untouched', async () => {
    const fixture = makeFixture();
    const before = readFileSync(fixture.phases[0]!);
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(0);
    expect(checked.payload).toMatchObject({ state: 'missing', routeSha256: null });
    expect(checked.payload.phases[0]).toMatchObject({ optOut: true, drift: false, actual: { skills: ['/old-skill'], agents: ['@old-executor'] } });
    const applied = await runCli(fixture, 'apply', ['--snapshot', checked.payload.snapshotDigest]);
    expect(applied.exitCode).toBe(0);
    expect(applied.payload.changedPhases).toEqual([]);
    expect(readFileSync(fixture.phases[0]!)).toEqual(before);
    expect(existsSync(fixture.route)).toBe(false);
  });

  it('unreadable is an error with no computed phases or writes, not a missing-file opt-out', async () => {
    const fixture = makeFixture();
    mkdirSync(fixture.route);
    const before = readFileSync(fixture.phases[0]!);
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(1);
    expect(checked.payload).toMatchObject({ ok: false, status: 'unreadable', state: 'unreadable' });
    expect(checked.payload.phases).toBeUndefined();
    const applied = await runCli(fixture, 'apply', ['--snapshot', 'not-approved']);
    expect(applied.exitCode).toBe(1);
    expect(applied.payload.status).toBe('unreadable');
    expect(readFileSync(fixture.phases[0]!)).toEqual(before);
  });

  it('present-empty proposes and approval-applies deletion of both stale sections, preserving non-delegate bytes', async () => {
    const fixture = makeFixture();
    writeFileSync(fixture.route, '## global\n- implement: (default - no delegate)\n- test: none\n');
    const before = readFileSync(fixture.phases[0]!, 'utf-8');
    const routeBefore = readFileSync(fixture.route);
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(0);
    expect(checked.payload.state).toBe('present-empty');
    expect(checked.payload.phases[0]).toMatchObject({ expected: { skills: [], agents: [] }, optOut: false, drift: true });
    expect(readFileSync(fixture.phases[0]!, 'utf-8')).toBe(before);
    const applied = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', checked.payload.snapshotDigest]);
    expect(applied.exitCode).toBe(0);
    expect(applied.payload.changedPhases).toEqual([1]);
    const after = readFileSync(fixture.phases[0]!, 'utf-8');
    expect(after).not.toContain('## Delegate');
    expect(sha256(withoutDelegates(after))).toBe(sha256(withoutDelegates(before)));
    expect(readFileSync(fixture.route)).toEqual(routeBefore);
  });

  it('present-populated replaces old delegates and never creates empty group headings', async () => {
    const fixture = makeFixture();
    writeFileSync(fixture.route, '## global\n- implement: @new-executor\n');
    const checked = await runCli(fixture, 'check', ['--phase', '1']);
    expect(checked.exitCode).toBe(0);
    expect(checked.payload.state).toBe('present-populated');
    expect(checked.payload.routeSha256).toBe(sha256(readFileSync(fixture.route)));
    expect(checked.payload.phases[0].phaseSha256).toBe(sha256(readFileSync(fixture.phases[0]!)));
    expect(checked.payload.phases[0].expected).toEqual({ skills: [], agents: ['@new-executor'] });
    const applied = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', checked.payload.snapshotDigest]);
    expect(applied.exitCode).toBe(0);
    const after = readFileSync(fixture.phases[0]!, 'utf-8');
    expect(after).not.toContain('## Delegate Skills');
    expect(parsePhaseDelegates(after)).toEqual({ skills: [], agents: ['@new-executor'] });
  });

  it('detects the legacy file only when canonical routing is missing and never parses it', async () => {
    const fixture = makeFixture();
    writeFileSync(join(dirname(fixture.route), 'plan-skill-routing.md'), '## global\n- implement: /legacy-route\n');
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(0);
    expect(checked.payload.state).toBe('missing');
    expect(checked.payload.warnings).toContain('Legacy routing file detected; rename to delegate-routing.md and migrate @agent syntax');
    expect(checked.payload.phases[0].expected).toEqual({ skills: [], agents: [] });
    writeFileSync(fixture.route, '## global\n- implement: /canonical\n');
    const present = await runCli(fixture, 'check');
    expect(present.payload.warnings).toEqual([]);
    expect(present.payload.phases[0].expected.skills).toEqual(['/canonical']);
  });
});

describe('routing phase-delegates matching, anchors and byte preservation', () => {
  it('matches configured path prefixes and workspace names, merges route order and per-domain global fallbacks', async () => {
    const fixture = makeFixture('none', [{ number: 1, title: 'UI database API', paths: ['src/backend/schema.ts', 'src/web/component.ts'] }, { number: 2, paths: ['src/backend-extra/api.ts'] }]);
    writeFileSync(fixture.route, '## global\n- database: /db\n- implement: /global-impl\n\n## WEB\n- design: /web-design\n- implement: /web-impl, /shared, @web-agent\n\n## BACKEND\n- implement: /backend-impl, /shared, @backend-agent\n');
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(0);
    expect(checked.payload.phases[0].expected).toEqual({ skills: ['/db', '/web-design', '/web-impl', '/shared', '/backend-impl'], agents: ['@web-agent', '@backend-agent'] });
    expect(checked.payload.phases[1].expected).toEqual({ skills: ['/global-impl'], agents: [] });
    const applied = await runCli(fixture, 'apply', ['--snapshot', checked.payload.snapshotDigest]);
    expect(applied.exitCode).toBe(0);
    expect(readFileSync(fixture.phases[1]!, 'utf-8')).not.toContain('## Delegate Agents');
  });

  for (const laterHasOnlyRoute of [false, true]) {
    it(`preserves first workspace lookup and distinct-name fallback with duplicate sections (${laterHasOnlyRoute ? 'later-only domain' : 'missing worker section'})`, async () => {
      const fixture = makeFixture('none', [{ number: 1, paths: ['src/core/service.ts', 'src/worker/task.ts'] }]);
      const config = JSON.parse(readFileSync(fixture.config, 'utf-8'));
      config.subWorkspaces = [{ name: 'core', path: 'src/core' }, { name: 'worker', path: 'src/worker' }];
      writeFileSync(fixture.config, JSON.stringify(config));
      writeFileSync(fixture.route, laterHasOnlyRoute
        ? '## global\n- implement: @global\n\n## CORE\n- test: @tester\n\n## core\n- implement: @later\n'
        : '## global\n- implement: @global\n\n## core\n- implement: @local\n\n## CORE\n- implement: @local\n');
      const checked = await runCli(fixture, 'check', ['--phase', '1']);
      expect(checked.exitCode).toBe(0);
      const expected = { skills: [], agents: laterHasOnlyRoute ? ['@global'] : ['@local', '@global'] };
      expect(checked.payload.phases[0].expected).toEqual(expected);
      const applied = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', checked.payload.snapshotDigest]);
      expect(applied.exitCode).toBe(0);
      expect(parsePhaseDelegates(readFileSync(fixture.phases[0]!, 'utf-8'))).toEqual(expected);
    });
  }

  for (const mode of ['none', 'tdd', 'ut_backfill'] as const) {
    it(`uses plan-level ${mode} semantics and the correct anchor`, async () => {
      const fixture = makeFixture(mode);
      writeFileSync(fixture.route, '## global\n- test: /test-tools, @test-executor\n- implement: /implementation-tools, @implementation-executor\n');
      const checked = await runCli(fixture, 'check', ['--phase', '1']);
      expect(checked.exitCode).toBe(0);
      const expected = mode === 'tdd' ? { skills: ['/test-tools', '/implementation-tools'], agents: ['@test-executor', '@implementation-executor'] } :
        mode === 'ut_backfill' ? { skills: ['/test-tools'], agents: ['@test-executor'] } : { skills: ['/implementation-tools'], agents: ['@implementation-executor'] };
      expect(checked.payload.testMode).toBe(mode);
      expect(checked.payload.phases[0].expected).toEqual(expected);
      expect(checked.payload.phases[0].anchor).toBe(mode === 'none' ? 'key-insights' : 'test-quality-gate');
      const applied = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', checked.payload.snapshotDigest]);
      expect(applied.exitCode).toBe(0);
      const after = readFileSync(fixture.phases[0]!, 'utf-8');
      expect(parsePhaseDelegates(after)).toEqual(expected);
      expect(after.indexOf(mode === 'none' ? '## Key Insights' : '## Test Quality Gate')).toBeLessThan(after.indexOf('## Delegate Skills'));
      if (mode === 'tdd') expect(after.indexOf('## Delegate Agents')).toBeLessThan(after.indexOf('## Regression Gate'));
      if (mode === 'ut_backfill') expect(after).not.toContain('/implementation-tools');
    });
  }

  it('does not use a phase-level test_mode override', async () => {
    const fixture = makeFixture();
    writeFileSync(fixture.route, '## global\n- test: /test-tools\n- implement: /implementation-tools\n');
    writeFileSync(fixture.phases[0]!, readFileSync(fixture.phases[0]!, 'utf-8').replace('status: todo', 'status: todo\ntest_mode: tdd'));
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(0);
    expect(checked.payload.phases[0].expected.skills).toEqual(['/implementation-tools']);
  });

  for (const newline of ['\n', '\r\n']) {
    it(`keeps all non-delegate bytes, survivor purpose and line endings with ${newline === '\n' ? 'LF' : 'CRLF'}, then reports no drift on a second apply`, async () => {
      const fixture = makeFixture();
      writeFileSync(fixture.route, '## global\n- implement: /old-skill, /new-skill, @new-executor\n');
      const original = readFileSync(fixture.phases[0]!, 'utf-8').replace(/\n/g, newline);
      writeFileSync(fixture.phases[0]!, original);
      const planBefore = readFileSync(fixture.plan);
      const checked = await runCli(fixture, 'check');
      expect(checked.exitCode).toBe(0);
      const applied = await runCli(fixture, 'apply', ['--snapshot', checked.payload.snapshotDigest]);
      expect(applied.exitCode).toBe(0);
      const after = readFileSync(fixture.phases[0]!, 'utf-8');
      expect(sha256(withoutDelegates(after))).toBe(sha256(withoutDelegates(original)));
      expect(after).toContain(`- \`/old-skill\` - old purpose${newline}`);
      expect(readFileSync(fixture.plan)).toEqual(planBefore);
      if (newline === '\r\n') expect(after.replace(/\r\n/g, '')).not.toContain('\n');
      const rechecked = await runCli(fixture, 'check');
      expect(rechecked.payload.phases[0].drift).toBe(false);
      const second = await runCli(fixture, 'apply', ['--snapshot', rechecked.payload.snapshotDigest]);
      expect(second.exitCode).toBe(0);
      expect(second.payload.changedPhases).toEqual([]);
      expect(readFileSync(fixture.phases[0]!, 'utf-8')).toBe(after);
    });
  }

  for (const newline of ['\n', '\r\n']) {
    for (const fence of ['```', '~~~']) {
      for (const populated of [false, true]) {
        it(`keeps fenced delegate and anchor examples byte-identical through ${populated ? 'populated rewrite' : 'present-empty deletion'} (${fence}, ${newline === '\n' ? 'LF' : 'CRLF'})`, async () => {
          const fixture = makeFixture();
          writeFileSync(fixture.route, populated ? '## global\n- implement: /new, @new\n' : '## global\n- implement: none\n');
          const example = `${fence}markdown\n## Key Insights\n## Delegate Skills\n- \`/example\`\n## Delegate Agents\n- \`@example\`\n## Overview\nResearch schema UI example.\n## Related Code Files\n- Modify: \`src/web/component.ts\`\n${fence}\n`;
          const oldBlock = '## Delegate Skills\n- `/old-skill` - old purpose\n\n## Delegate Agents\n- `@old-executor` - old agent purpose\n\n';
          const original = readFileSync(fixture.phases[0]!, 'utf-8')
            .replace('## Key Insights\n', `## Implementation Steps\n${example}Keep the instruction after this fence.\n## Key Insights\n`)
            .replace('Keep the phase insights.\n\n', `Keep the phase insights.\n${fence}markdown\n## Requirements\nKeep this anchor example.\n${fence}\n`)
            .replace('Never rewrite this text.\n', `${example}Never rewrite this text.\n`)
            .replace(/\n/g, newline);
          const [prefix, suffix] = original.split(oldBlock.replace(/\n/g, newline));
          expect(suffix).toBeDefined();
          writeFileSync(fixture.phases[0]!, original);
          const planBefore = readFileSync(fixture.plan);
          const checked = await runCli(fixture, 'check', ['--phase', '1']);
          expect(checked.exitCode).toBe(0);
          expect(checked.payload.phases[0].actual).toEqual({ skills: ['/old-skill'], agents: ['@old-executor'] });
          expect(checked.payload.phases[0].domains).toEqual(['implement']);
          const expected = populated ? { skills: ['/new'], agents: ['@new'] } : { skills: [], agents: [] };
          expect(checked.payload.phases[0].expected).toEqual(expected);
          const applied = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', checked.payload.snapshotDigest]);
          expect(applied.exitCode).toBe(0);
          const rendered = populated ? '## Delegate Skills\n- `/new`\n\n## Delegate Agents\n- `@new`\n\n'.replace(/\n/g, newline) : '';
          expect(readFileSync(fixture.phases[0]!)).toEqual(Buffer.from(prefix + rendered + suffix));
          expect(parsePhaseDelegates(readFileSync(fixture.phases[0]!, 'utf-8'))).toEqual(expected);
          expect(readFileSync(fixture.plan)).toEqual(planBefore);
          const rechecked = await runCli(fixture, 'check', ['--phase', '1']);
          expect(rechecked.exitCode).toBe(0);
          expect(rechecked.payload.phases[0].drift).toBe(false);
        });
      }
    }
  }

  for (const endings of ['LF', 'CRLF', 'mixed'] as const) {
    for (const fence of ['```', '~~~']) {
      for (const anchor of ['key-insights', 'test-quality-gate'] as const) {
        it(`previews and refuses an unclosed anchor fence with zero writes, then idempotently accepts it outside the anchor (${anchor}, ${fence}, ${endings})`, async () => {
          const fixture = makeFixture(anchor === 'key-insights' ? 'none' : 'tdd', [{ number: 1 }, { number: 2 }]);
          writeFileSync(fixture.route, '## global\n- test: /new-tool, @new-executor\n- implement: /new-tool, @new-executor\n');
          const lines = ['---', 'phase: 2', 'status: todo', 'parallel_safe: never', 'parallel_reason: Preserve the example.',
            '---', '# Phase 2: API service', '## Overview', 'Actual API service overview.', '## Key Insights', 'Keep the insights.',
            ...(anchor === 'test-quality-gate' ? ['## Test Quality Gate', 'Keep the quality gate.'] : []),
            `${fence}markdown`, '## Delegate Skills', '- `/fenced-example`', 'Keep the unclosed example through EOF.'];
          const original = lines.map((line, i) => line + (endings === 'CRLF' || endings === 'mixed' && i % 2 === 1 ? '\r\n' : '\n')).join('');
          writeFileSync(fixture.phases[1]!, original);
          const phaseBytes = fixture.phases.map((path) => readFileSync(path));
          const planBytes = readFileSync(fixture.plan);
          const configBytes = readFileSync(fixture.config);
          const routeBytes = readFileSync(fixture.route);
          const selected = ['--phase', '1', '--phase', '2'];
          const checked = await runCli(fixture, 'check', selected);
          expect(checked.exitCode).toBe(0);
          expect(checked.payload.phases[0]).toMatchObject({ eligible: true, drift: true });
          expect(checked.payload.phases[1]).toMatchObject({ status: 'todo', eligible: false, drift: true, actual: { skills: [], agents: [] } });
          expect(checked.payload.phases[1].excludedReason).toContain('[anchor_in_fence]');
          expect(checked.payload.phases[1].excludedReason).toContain('anchor ends inside an unclosed');
          expect(checked.payload.warnings.some((warning: string) => warning.includes('[anchor_in_fence]'))).toBe(true);
          expect(fixture.phases.map((path) => readFileSync(path))).toEqual(phaseBytes);
          for (const scope of [selected, [...selected, '--allow-in-progress-plan'], []]) {
            const refused = await runCli(fixture, 'apply', [...scope, '--snapshot', checked.payload.snapshotDigest]);
            expect(refused.exitCode).toBe(1);
            expect(refused.payload).toMatchObject({ ok: false, status: 'anchor_in_fence', phase: 2 });
            expect(refused.payload.errors[0]).toContain('anchor ends inside an unclosed');
            expect(fixture.phases.map((path) => readFileSync(path))).toEqual(phaseBytes);
          }
          expect(readFileSync(fixture.plan)).toEqual(planBytes);
          expect(readFileSync(fixture.config)).toEqual(configBytes);
          expect(readFileSync(fixture.route)).toEqual(routeBytes);
          const newline = endings === 'CRLF' ? '\r\n' : '\n';
          const outside = original.replace(`${fence}markdown`, `## Requirements${newline}${fence}markdown`);
          writeFileSync(fixture.phases[1]!, outside);
          const accepted = await runCli(fixture, 'check', selected);
          expect(accepted.exitCode).toBe(0);
          expect(accepted.payload.warnings).toEqual([]);
          expect(accepted.payload.phases[1]).toMatchObject({ eligible: true, drift: true });
          const applied = await runCli(fixture, 'apply', [...selected, '--snapshot', accepted.payload.snapshotDigest]);
          expect(applied.exitCode).toBe(0);
          expect(applied.payload.changedPhases).toEqual([1, 2]);
          const boundary = outside.indexOf('## Requirements');
          const rendered = '## Delegate Skills\n- `/new-tool`\n\n## Delegate Agents\n- `@new-executor`\n\n'.replace(/\n/g, newline);
          expect(readFileSync(fixture.phases[1]!)).toEqual(Buffer.from(outside.slice(0, boundary) + rendered + outside.slice(boundary)));
          for (const path of fixture.phases) expect(parsePhaseDelegates(readFileSync(path, 'utf-8'))).toEqual({ skills: ['/new-tool'], agents: ['@new-executor'] });
          const rechecked = await runCli(fixture, 'check', selected);
          expect(rechecked.exitCode).toBe(0);
          expect(rechecked.payload.phases.map((phase: { drift: boolean }) => phase.drift)).toEqual([false, false]);
          const appliedBytes = fixture.phases.map((path) => readFileSync(path));
          const reapplied = await runCli(fixture, 'apply', [...selected, '--snapshot', rechecked.payload.snapshotDigest]);
          expect(reapplied.exitCode).toBe(0);
          expect(reapplied.payload.changedPhases).toEqual([]);
          expect(fixture.phases.map((path) => readFileSync(path))).toEqual(appliedBytes);
          expect(readFileSync(fixture.plan)).toEqual(planBytes);
        });
      }
    }
  }

  for (const endings of ['LF', 'CRLF', 'mixed'] as const) {
    for (const character of ['`', '~'] as const) {
      for (const routing of ['empty', 'unchanged', 'changed'] as const) {
        for (const probe of delegateRewriteCases(character)) {
          it(`whitelist refuses ${probe.name} with reason parity and zero sibling writes (${character}, ${endings}, ${routing})`, async () => {
            const fixture = makeFixture('none', [{ number: 1 }, { number: 2 }]);
            const original = renderRewriteEndings('---\nphase: 2\nstatus: todo\nparallel_safe: never\nparallel_reason: Preserve every instruction.\n---\n' + probe.markdown, endings);
            writeFileSync(fixture.phases[1]!, original);
            const actual = parsePhaseDelegates(original);
            const expected = routing === 'empty' ? { skills: [], agents: [] } : routing === 'unchanged' ? {
              skills: actual.skills.filter((token) => token.startsWith('/')),
              agents: actual.agents.filter((token) => token.startsWith('@')),
            } : { skills: ['/api-tools'], agents: ['@new-executor'] };
            writeFileSync(fixture.route, `## global\n- implement: ${[...expected.skills, ...expected.agents].join(', ') || 'none'}\n`);
            const before = fixture.phases.map((path) => readFileSync(path));
            const planBefore = readFileSync(fixture.plan);
            const routeBefore = readFileSync(fixture.route);
            const configBefore = readFileSync(fixture.config);
            const selected = ['--phase', '1', '--phase', '2'];
            const checked = await runCli(fixture, 'check', selected);
            expect(checked.exitCode).toBe(0);
            expect(checked.payload.phases[0]).toMatchObject({ eligible: true, drift: true });
            expect(checked.payload.phases[1]).toMatchObject({ status: 'todo', eligible: false, drift: true, expected, actual });
            expect(checked.payload.warnings).toContain(checked.payload.phases[1].excludedReason);
            expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
            for (const scope of [[...selected, '--allow-in-progress-plan'], []]) {
              const refused = await runCli(fixture, 'apply', [...scope, '--snapshot', checked.payload.snapshotDigest]);
              expect(refused.exitCode).toBe(1);
              expect(refused.payload).toMatchObject({ ok: false, status: probe.refusal, phase: 2 });
              expect(checked.payload.phases[1].excludedReason).toBe(`[${refused.payload.status}] ${refused.payload.errors[0]}`);
              expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
            }
            expect(readFileSync(fixture.plan)).toEqual(planBefore);
            expect(readFileSync(fixture.route)).toEqual(routeBefore);
            expect(readFileSync(fixture.config)).toEqual(configBefore);
          });
        }
      }
      it(`keeps true unchanged-routing no-ops and missing-routing opt-outs byte-identical (${character}, ${endings})`, async () => {
        for (const missing of [false, true]) {
          const fixture = makeFixture();
          const original = renderRewriteEndings('---\nphase: 1\nstatus: todo\n---\n# Phase 1: API service\n## Overview\nAPI service.\n## Key Insights\nInsight.\n## Delegate Skills\n- `/api-tools`\n\n## Delegate Agents\n- `@api-executor`\n\n' +
            (missing ? '' : '## Requirements\nREQ-1 must stay.\n') +
            `${character.repeat(4)}text\nAn unfinished example.\n${character.repeat(3)}\n## Implementation Steps\nSTEP-1 must stay.\n## Success Criteria\n- CRIT-1 must stay.\n`, endings);
          writeFileSync(fixture.phases[0]!, original);
          if (!missing) writeFileSync(fixture.route, '## global\n- implement: /api-tools, @api-executor\n');
          const before = readFileSync(fixture.phases[0]!);
          const selected = ['--phase', '1'];
          const checked = await runCli(fixture, 'check', selected);
          expect(checked.exitCode).toBe(0);
          expect(checked.payload.state).toBe(missing ? 'missing' : 'present-populated');
          expect(checked.payload.phases[0]).toMatchObject({ eligible: true, drift: false });
          expect(checked.payload.warnings).toEqual([]);
          const applied = await runCli(fixture, 'apply', [...selected, '--snapshot', checked.payload.snapshotDigest]);
          expect(applied.exitCode).toBe(0);
          expect(applied.payload.changedPhases).toEqual([]);
          expect(readFileSync(fixture.phases[0]!)).toEqual(before);
          const rechecked = await runCli(fixture, 'check', selected);
          expect(rechecked.exitCode).toBe(0);
          expect(rechecked.payload.phases[0].drift).toBe(false);
        }
      });
    }
  }

  it('preserves arbitrary non-delegate bytes rather than round-tripping them through UTF-8 decoding', async () => {
    const fixture = makeFixture();
    writeFileSync(fixture.route, '## global\n- implement: /new\n');
    const original = Buffer.concat([readFileSync(fixture.phases[0]!), Buffer.from([0xff, 0xfe, 0x00, 0x0a])]);
    writeFileSync(fixture.phases[0]!, original);
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(0);
    const applied = await runCli(fixture, 'apply', ['--snapshot', checked.payload.snapshotDigest]);
    expect(applied.exitCode).toBe(0);
    const after = readFileSync(fixture.phases[0]!);
    expect(sha256(Buffer.from(withoutDelegates(after.toString('latin1')), 'latin1'))).toBe(sha256(Buffer.from(withoutDelegates(original.toString('latin1')), 'latin1')));
    expect(after.subarray(-4)).toEqual(Buffer.from([0xff, 0xfe, 0x00, 0x0a]));
  });

  it('excludes a non-todo phase that lacks its anchor without aborting the all-phase scan', async () => {
    const fixture = makeFixture('none', [{ number: 1, status: 'done' }, { number: 2 }]);
    writeFileSync(fixture.route, '## global\n- implement: /new\n');
    writeFileSync(fixture.phases[0]!, readFileSync(fixture.phases[0]!, 'utf-8').replace('## Key Insights', '## Other Heading'));
    const doneBefore = readFileSync(fixture.phases[0]!);
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(0);
    expect(checked.payload.phases.map((phase: { number: number; eligible: boolean; drift: boolean }) => [phase.number, phase.eligible, phase.drift]))
      .toEqual([[1, false, true], [2, true, true]]);
    expect(checked.payload.phases[0].excludedReason).toStartWith('[anchor_missing]');
    expect(checked.payload.warnings.some((warning: string) => warning.startsWith('[anchor_missing] Phase 1'))).toBe(true);
    const applied = await runCli(fixture, 'apply', ['--snapshot', checked.payload.snapshotDigest]);
    expect(applied.exitCode).toBe(0);
    expect(applied.payload.changedPhases).toEqual([2]);
    expect(readFileSync(fixture.phases[0]!)).toEqual(doneBefore);
    expect(parsePhaseDelegates(readFileSync(fixture.phases[1]!, 'utf-8'))).toEqual({ skills: ['/new'], agents: [] });
  });

  it('excludes a todo phase that needs insertion but lacks its anchor, and apply refuses with zero writes', async () => {
    const fixture = makeFixture('none', [{ number: 1 }, { number: 2 }]);
    writeFileSync(fixture.route, '## global\n- implement: /new\n');
    writeFileSync(fixture.phases[1]!, readFileSync(fixture.phases[1]!, 'utf-8').replace('## Key Insights', '## Other Heading'));
    const before = fixture.phases.map((path) => readFileSync(path));
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(0);
    expect(checked.payload.phases[1]).toMatchObject({ number: 2, eligible: false, drift: true });
    expect(checked.payload.phases[1].excludedReason).toStartWith('[anchor_missing]');
    for (const selector of [['--phase', '2'], []]) {
      const scoped = await runCli(fixture, 'check', selector);
      const applied = await runCli(fixture, 'apply', [...selector, '--snapshot', scoped.payload.snapshotDigest]);
      expect(applied.exitCode).toBe(1);
      expect(applied.payload).toMatchObject({ status: 'anchor_missing', phase: 2 });
      expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
    }
  });

  it('needs no anchor for a no-op todo phase', async () => {
    const fixture = makeFixture('none', [{ number: 1 }]);
    writeFileSync(fixture.route, '## global\n- implement: none\n');
    writeFileSync(fixture.phases[0]!, withoutDelegates(readFileSync(fixture.phases[0]!, 'utf-8')).replace('## Key Insights', '## Other Heading'));
    const checked = await runCli(fixture, 'check', ['--phase', '1']);
    expect(checked.exitCode).toBe(0);
    expect(checked.payload.phases[0]).toMatchObject({ eligible: true, drift: false });
  });

  for (const mode of ['tdd', 'ut_backfill'] as const) {
    it(`anchors a ${mode}-plan spike after Key Insights and excludes it when Key Insights is missing`, async () => {
      const fixture = makeFixture(mode, [{ number: 1 }]);
      writeFileSync(fixture.route, '## global\n- test: /test-tools, @test-executor\n');
      const spike = '---\nphase: 1\nphase_type: spike\nstatus: todo\nblockedBy: []\nblocks: []\n---\n# Phase 1: API prototype spike\n\n## Overview\nMeasure API prototype viability.\n\n## Key Insights\nKeep the spike insight.\n\n## Spike Objective\nMeasure viability.\n\n## Experiment\nCommand: run `bun test api-prototype`.\n\n## Deliverables\nMeasured output.\n\n## Decision Gate\nApprove or replan.\n\n## Spike Result\nStatus: pending\n';
      writeFileSync(fixture.phases[0]!, spike);
      const checked = await runCli(fixture, 'check', ['--phase', '1']);
      expect(checked.exitCode).toBe(0);
      expect(checked.payload.phases[0]).toMatchObject({ anchor: 'key-insights', eligible: true, drift: true });
      const applied = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', checked.payload.snapshotDigest]);
      expect(applied.exitCode).toBe(0);
      const after = readFileSync(fixture.phases[0]!, 'utf-8');
      expect(parsePhaseDelegates(after)).toEqual({ skills: ['/test-tools'], agents: ['@test-executor'] });
      expect(withoutDelegates(after)).toBe(spike);
      expect(after.indexOf('## Key Insights')).toBeLessThan(after.indexOf('## Delegate Skills'));
      expect(after.indexOf('## Delegate Agents')).toBeLessThan(after.indexOf('## Spike Objective'));

      const legacy = spike.replace('## Key Insights\nKeep the spike insight.\n\n', '');
      writeFileSync(fixture.phases[0]!, legacy);
      const legacyChecked = await runCli(fixture, 'check', ['--phase', '1']);
      expect(legacyChecked.exitCode).toBe(0);
      expect(legacyChecked.payload.phases[0]).toMatchObject({ anchor: 'key-insights', eligible: false });
      expect(legacyChecked.payload.phases[0].excludedReason).toContain('Missing ## Key Insights');
      const refused = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', legacyChecked.payload.snapshotDigest]);
      expect(refused.exitCode).toBe(1);
      expect(refused.payload.status).toBe('anchor_missing');
      expect(readFileSync(fixture.phases[0]!, 'utf-8')).toBe(legacy);
    });
  }

  it('exposes the same ordered domain detector to scaffold through the domains command', async () => {
    const proc = Bun.spawn(['bun', CLI, 'routing', 'phase-delegates', 'domains', '--text', 'API UI schema UT research'], { stdout: 'pipe', stderr: 'pipe' });
    const payload = JSON.parse(await new Response(proc.stdout).text());
    expect(await proc.exited).toBe(0);
    expect(payload.domains).toEqual(['test', 'database', 'design', 'implement', 'research']);
  });

  it('preserves protected bytes or refuses with zero writes across 500 seeded real-filesystem check/apply cases under five seconds', () => {
    const fixture = makeFixture('none', [{ number: 1 }, { number: 2 }]);
    const safeBytes = readFileSync(fixture.phases[0]!);
    const planBytes = readFileSync(fixture.plan);
    const configBytes = readFileSync(fixture.config);
    const options = { projectRoot: fixture.root, plan: fixture.plan, phase: [] as string[] };
    expect(() => executePhaseDelegates('apply', options)).toThrow(PhaseDelegatesError);
    let seed = 0x173c4;
    const next = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    const kinds = new Set<number>();
    let accepted = 0;
    let refused = 0;
    let optedOut = 0;
    const started = performance.now();
    for (let index = 0; index < 500; index++) {
      const endings = (['LF', 'CRLF', 'mixed'] as const)[next() % 3]!;
      const character = next() % 2 === 0 ? '`' : '~';
      const marker = character.repeat(3 + next() % 3);
      const short = character.repeat(marker.length - 1);
      const kind = next() % 12;
      kinds.add(kind);
      const newline = endings === 'CRLF' ? '\r\n' : '\n';
      const skillPurpose = `- \`/api-tools\` - Purpose ${index}: tiếng Việt.  `;
      const agentPurpose = `- \`@api-executor\` - Purpose ${index}.  `;
      let prefix = renderRewriteEndings(`---\nphase: 2\nstatus: todo\nparallel_safe: never\nparallel_reason: Preserve every byte ${index}\n---\n# Phase 2: API service\n## Overview\nAPI service implementation ${index}.\n## Key Insights\nINSIGHT-${index} must remain.  \n`, endings);
      let skills = renderRewriteEndings(`## Delegate Skills\n${skillPurpose}\n \t\n`, endings);
      let agents = renderRewriteEndings(`## Delegate Agents\n${agentPurpose}\n\n`, endings);
      const managed: Record<keyof DelegateGroups, string[]> = { skills: [skills], agents: [agents] };
      let suffix = renderRewriteEndings(`## Requirements\nREQ-${index}: keep tiếng Việt and trailing spaces.  \n## Related Code Files\n- Modify: \`src/backend/api-${index}.ts\`\n## Implementation Steps\nSTEP-${index} must remain.\n## Success Criteria\n- CRIT-${index} must remain.\n`, endings);
      const closing = next() % 3;
      suffix += renderRewriteEndings(`${marker}markdown\n## Delegate Skills\n- \`/fake-${index}\`\n## Key Insights\nFENCED-${index} must remain.\n` +
        (closing === 0 ? `${character.repeat(marker.length + next() % 2)}\t \n` : closing === 1 ? `${short}\n` : '') +
        `TAIL-${index} must remain.\n`, endings);
      let gap = '';
      let anchorAtEof = false;
      if (kind === 1) {
        gap = renderRewriteEndings(`${marker}markdown\n## Requirements\nEXAMPLE-${index} must remain.\n${marker}\n`, endings);
      } else if (kind === 2) {
        gap = renderRewriteEndings(`${marker}text\nNOTE-${index} must remain.\n${short}\n`, endings);
        suffix += renderRewriteEndings(`${marker}bash\nbuild ${index}\n${marker}\n`, endings);
      } else if (kind === 3) {
        gap = renderRewriteEndings(([' ## Requirements\n', '  ## Requirements\n', '   ## Requirements\n', '##\tRequirements\n', 'Requirements\n---\n', 'Requirements\n===\n'] as const)[next() % 6]! + `BOUNDARY-${index} must remain.\n`, endings);
      } else if (kind === 4) {
        gap = renderRewriteEndings((['Note: preserve this prose.\n', '<!-- Preserve this comment. -->\n', '  - `@nested` - preserve this nested bullet.\n', '### Usage\n', '- Preserve this unfamiliar bullet.\n'] as const)[next() % 5]! + `CONTENT-${index} must remain.\n`, endings);
      } else if (kind === 5) {
        const example = renderRewriteEndings(`${marker}markdown\n## Delegate Agents\n- \`@fake-${index}\`\n## Key Insights\nANCHOR-EXAMPLE-${index} must remain.\n${marker}\n`, endings);
        prefix = prefix.replace('## Key Insights', `## Implementation Steps${newline}${example}## Key Insights`);
      } else if (kind === 6 || kind === 7) {
        managed.skills = [];
        managed.agents = [];
        skills = agents = '';
        if (kind === 6 && next() % 2 === 0) {
          suffix = '';
          anchorAtEof = true;
        } else if (kind === 7) {
          gap = renderRewriteEndings(`${marker}markdown\n## Delegate Skills\n- \`/fake-${index}\`\n`, endings);
          suffix = renderRewriteEndings(`## Requirements\nHIDDEN-${index} must remain.\n`, endings);
        }
      } else if (kind === 10) {
        skills = renderRewriteEndings('## Delegate Skills\n \t\n', endings);
        agents = renderRewriteEndings('## Delegate Agents\n\n', endings);
        managed.skills = [skills];
        managed.agents = [agents];
      } else if (kind === 11) {
        suffix = renderRewriteEndings(`# Adjacent real H1 ${index}\n`, endings) + suffix;
      }
      let original = prefix + skills + agents + gap + suffix;
      let protectedOriginal = prefix + gap + suffix;
      if (kind === 8) {
        const middle = renderRewriteEndings(`## Notes\nMIDDLE-${index} must remain.\n`, endings);
        original = prefix + agents + middle + skills + suffix;
        protectedOriginal = prefix + middle + suffix;
      } else if (kind === 9) {
        const duplicate = renderRewriteEndings(`## Delegate Skills\n- \`/api-tools\` - Duplicate purpose ${index}.\n\n`, endings);
        managed.skills.push(duplicate);
        original = prefix + skills + agents + duplicate + suffix;
      }
      const trailer = Buffer.from([0xff, 0xfe, 0x00]);
      const originalBytes = Buffer.concat([Buffer.from(original), trailer]);
      const protectedBytes = Buffer.concat([Buffer.from(protectedOriginal), trailer]);
      writeFileSync(fixture.phases[0]!, safeBytes);
      writeFileSync(fixture.phases[1]!, originalBytes);
      const routing = next() % 4;
      const expected: DelegateGroups = routing === 0 ? { skills: [], agents: [] } :
        routing === 1 ? { skills: ['/api-tools'], agents: ['@api-executor'] } :
          routing === 2 ? { skills: ['/api-tools'], agents: [`@new-${index}`] } :
            { skills: [`/new-${index}`], agents: ['@api-executor'] };
      const missing = next() % 17 === 0;
      if (missing) {
        if (existsSync(fixture.route)) unlinkSync(fixture.route);
      } else {
        writeFileSync(fixture.route, `## global\n- implement: ${[...expected.skills, ...expected.agents].join(', ') || 'none'}\n`);
      }
      const routeBytes = missing ? undefined : readFileSync(fixture.route);
      const before = fixture.phases.map((path) => readFileSync(path));
      const checked = executePhaseDelegates('check', options);
      expect(checked.snapshotDigest).toBe(executePhaseDelegates('check', options).snapshotDigest);
      expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
      let applied: PhaseDelegatesResult | undefined;
      let failure: unknown;
      try { applied = executePhaseDelegates('apply', { ...options, snapshot: checked.snapshotDigest }); }
      catch (error) { failure = error; }
      if (failure !== undefined) {
        refused++;
        expect(failure).toBeInstanceOf(PhaseDelegatesError);
        const error = failure as PhaseDelegatesError;
        expect(['anchor_in_fence', 'delegate_section_in_fence', 'delegate_section_not_clean']).toContain(error.status);
        expect(checked.phases[1]!.excludedReason).toBe(`[${error.status}] ${error.message}`);
        expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
      } else if (missing) {
        optedOut++;
        expect(applied!.changedPhases).toEqual([]);
        expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
      } else {
        accepted++;
        expect(parsePhaseDelegates(readFileSync(fixture.phases[1]!, 'utf-8'))).toEqual(expected);
        let protectedAfter = readFileSync(fixture.phases[1]!).toString('latin1');
        // Remove only constructor-owned literal slices or exactly modeled delegate output.
        // No production scanner/section regex participates in the protected-byte oracle.
        for (const group of ['skills', 'agents'] as const) {
          if (expected[group].length === 0) continue;
          const purpose = group === 'skills' ? skillPurpose : agentPurpose;
          const originalToken = group === 'skills' ? '/api-tools' : '@api-executor';
          const rendered = `## Delegate ${group === 'skills' ? 'Skills' : 'Agents'}${newline}` +
            expected[group].map((token) => (managed[group].length > 0 && kind !== 10 && token === originalToken ? purpose : `- \`${token}\``) + newline).join('') + newline;
          const candidates = [rendered, ...managed[group]].map((text) => Buffer.from(text).toString('latin1'));
          const found = candidates.find((text) => protectedAfter.includes(text));
          expect(found).toBeDefined();
          const at = protectedAfter.indexOf(found!);
          protectedAfter = protectedAfter.slice(0, at) + protectedAfter.slice(at + found!.length);
        }
        if (anchorAtEof && (expected.skills.length > 0 || expected.agents.length > 0)) {
          expect(protectedAfter).toBe(protectedBytes.toString('latin1') + newline);
          protectedAfter = protectedAfter.slice(0, -newline.length);
        }
        expect(Buffer.from(protectedAfter, 'latin1')).toEqual(protectedBytes);
        expect(withoutDelegates(readFileSync(fixture.phases[0]!).toString('latin1'))).toBe(withoutDelegates(safeBytes.toString('latin1')));
        const rechecked = executePhaseDelegates('check', options);
        expect(rechecked.phases.map((phase) => phase.drift)).toEqual([false, false]);
        const after = fixture.phases.map((path) => readFileSync(path));
        expect(executePhaseDelegates('apply', { ...options, snapshot: rechecked.snapshotDigest }).changedPhases).toEqual([]);
        expect(fixture.phases.map((path) => readFileSync(path))).toEqual(after);
      }
      expect(readFileSync(fixture.plan)).toEqual(planBytes);
      expect(readFileSync(fixture.config)).toEqual(configBytes);
      if (missing) expect(existsSync(fixture.route)).toBe(false);
      else expect(readFileSync(fixture.route)).toEqual(routeBytes);
    }
    expect(kinds.size).toBe(12);
    expect(accepted).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
    expect(optedOut).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

describe('routing phase-delegates container-fence admission', () => {
  for (const endings of ['LF', 'CRLF', 'mixed'] as const) {
    for (const character of ['`', '~'] as const) {
      for (const probe of containerFenceRepros) {
        it(`refuses minimized container repro ${probe.name} with exact check/apply reason parity and zero sibling writes (${character}, ${endings})`, async () => {
          const fixture = makeFixture(probe.anchor === 'key-insights' ? 'none' : 'tdd', [{ number: 1 }, { number: 2 }]);
          const original = renderRewriteEndings(probe.markdown.replace('phase: 1', 'phase: 2').replace('# Phase 1:', '# Phase 2:')
            .replace(/`{3,}|~{3,}/g, (marker) => character.repeat(marker.length)), endings);
          writeFileSync(fixture.phases[1]!, original);
          const binding = [...probe.expected.skills, ...probe.expected.agents].join(', ') || 'none';
          writeFileSync(fixture.route, `## global\n- test: ${binding}\n- implement: ${binding}\n`);
          const before = fixture.phases.map((path) => readFileSync(path));
          const planBefore = readFileSync(fixture.plan);
          const configBefore = readFileSync(fixture.config);
          const routeBefore = readFileSync(fixture.route);
          const selected = ['--phase', '1', '--phase', '2'];
          const checked = await runCli(fixture, 'check', selected);
          expect(checked.exitCode).toBe(0);
          expect(checked.payload.phases[0]).toMatchObject({ eligible: true, drift: true });
          expect(checked.payload.phases[1]).toMatchObject({ eligible: false, drift: true, expected: probe.expected });
          expect(checked.payload.warnings).toContain(checked.payload.phases[1].excludedReason);
          const rows = parsePhasesTable(planBefore.toString('utf-8')).phases;
          expect(checked.payload.snapshotDigest).toBe(phaseSnapshotDigest(routeBefore, planBefore, configBefore,
            rows.map((row, index) => ({ path: row.file, bytes: before[index]! }))));
          const refused = await runCli(fixture, 'apply', [...selected, '--snapshot', checked.payload.snapshotDigest]);
          expect(refused.exitCode).toBe(1);
          expect(refused.payload).toMatchObject({ ok: false, status: 'fence_container_ambiguous', phase: 2 });
          expect(checked.payload.phases[1].excludedReason).toBe(`[${refused.payload.status}] ${refused.payload.errors[0]}`);
          expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
          expect(readFileSync(fixture.plan)).toEqual(planBefore);
          expect(readFileSync(fixture.config)).toEqual(configBefore);
          expect(readFileSync(fixture.route)).toEqual(routeBefore);
        });
      }
      for (const opener of [1, 2, 3]) {
        for (const closer of [0, 1, 2, 3, undefined]) {
          if (closer === opener) continue;
          for (const routing of ['empty', 'unchanged', 'changed'] as const) {
            it(`refuses indented container-fence byte changes, not only token drift (${character}, ${opener}->${closer ?? 'EOF'}, ${endings}, ${routing})`, async () => {
              const anchor = endings === 'mixed' ? 'test-quality-gate' : 'key-insights';
              const fixture = makeFixture(anchor === 'key-insights' ? 'none' : 'tdd', [{ number: 1 }, { number: 2 }]);
              const variants = containerFenceVariants(character, opener, closer, anchor);
              const original = renderRewriteEndings('---\nphase: 2\nstatus: todo\n---\n' +
                variants[routing === 'changed' ? 'insertion' : 'relocation'], endings);
              writeFileSync(fixture.phases[1]!, original);
              const expected = routing === 'empty' ? { skills: [], agents: [] } : routing === 'unchanged' ?
                parsePhaseDelegates(original) : { skills: ['/new'], agents: ['@new'] };
              const binding = [...expected.skills, ...expected.agents].join(', ') || 'none';
              writeFileSync(fixture.route, `## global\n- test: ${binding}\n- implement: ${binding}\n`);
              const before = fixture.phases.map((path) => readFileSync(path));
              const inputs = [fixture.plan, fixture.config, fixture.route].map((path) => readFileSync(path));
              const selected = ['--phase', '1', '--phase', '2'];
              const checked = await runCli(fixture, 'check', selected);
              expect(checked.exitCode).toBe(0);
              expect(checked.payload.phases[0]).toMatchObject({ eligible: true, drift: true });
              expect(checked.payload.phases[1]).toMatchObject({ eligible: false, drift: true, expected });
              expect(checked.payload.warnings).toContain(checked.payload.phases[1].excludedReason);
              const refused = await runCli(fixture, 'apply', [...selected, '--allow-in-progress-plan', '--snapshot', checked.payload.snapshotDigest]);
              expect(refused.exitCode).toBe(1);
              expect(refused.payload.status).toBe('fence_container_ambiguous');
              expect(checked.payload.phases[1].excludedReason).toBe(`[${refused.payload.status}] ${refused.payload.errors[0]}`);
              expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
              expect([fixture.plan, fixture.config, fixture.route].map((path) => readFileSync(path))).toEqual(inputs);
            });
          }
        }
      }
      it(`accepts ambiguous container fences for exact byte no-ops and missing-route opt-out (${character}, ${endings})`, async () => {
        for (const opener of [1, 2, 3]) {
          for (const closer of [0, 1, 2, 3, undefined]) {
            if (closer === opener) continue;
            const fixture = makeFixture('none', [{ number: 1 }, { number: 2 }]);
            const original = renderRewriteEndings('---\nphase: 2\nstatus: todo\n---\n' + containerFenceVariants(character, opener, closer).noop, endings);
            writeFileSync(fixture.phases[1]!, original);
            writeFileSync(fixture.route, '## global\n- implement: /api-tools, @api-executor\n');
            const before = fixture.phases.map((path) => readFileSync(path));
            const checked = await runCli(fixture, 'check', ['--phase', '2']);
            expect(checked.exitCode).toBe(0);
            expect(checked.payload.phases[0]).toMatchObject({ eligible: true, drift: false });
            expect(checked.payload.warnings).toEqual([]);
            const applied = await runCli(fixture, 'apply', ['--phase', '2', '--snapshot', checked.payload.snapshotDigest]);
            expect(applied.exitCode).toBe(0);
            expect(applied.payload.changedPhases).toEqual([]);
            expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
            unlinkSync(fixture.route);
            const optedOut = executePhaseDelegates('check', { projectRoot: fixture.root, plan: fixture.plan, phase: ['2'] });
            expect(optedOut.phases[0]).toMatchObject({ eligible: true, drift: false, optOut: true });
            expect(executePhaseDelegates('apply', { projectRoot: fixture.root, plan: fixture.plan, phase: ['2'], snapshot: optedOut.snapshotDigest }).changedPhases).toEqual([]);
            expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
          }
        }
      }, 20000);
      for (const indentation of [0, 1, 2, 3]) {
        it(`supports matching-indent fences and idempotent CLI deletion/replacement (${character}, ${indentation}==${indentation}, ${endings})`, async () => {
          const anchor = endings === 'mixed' ? 'test-quality-gate' : 'key-insights';
          for (const populated of [false, true]) {
            const fixture = makeFixture(anchor === 'key-insights' ? 'none' : 'tdd', [{ number: 2 }]);
            const original = renderRewriteEndings('---\nphase: 2\nstatus: todo\n---\n' + containerFenceVariants(character, indentation, indentation, anchor).noop, endings);
            writeFileSync(fixture.phases[0]!, original);
            const binding = populated ? '/new, @new' : 'none';
            writeFileSync(fixture.route, `## global\n- test: ${binding}\n- implement: ${binding}\n`);
            const checked = await runCli(fixture, 'check', ['--phase', '2']);
            expect(checked.exitCode).toBe(0);
            expect(checked.payload.phases[0]).toMatchObject({ eligible: true, drift: true });
            expect(checked.payload.warnings).toEqual([]);
            const applied = await runCli(fixture, 'apply', ['--phase', '2', '--snapshot', checked.payload.snapshotDigest]);
            expect(applied.exitCode).toBe(0);
            const newline = endings === 'CRLF' ? '\r\n' : '\n';
            const block = populated ? `## Delegate Skills${newline}- \`/new\`${newline}${newline}## Delegate Agents${newline}- \`@new\`${newline}${newline}` : '';
            expect(readFileSync(fixture.phases[0]!)).toEqual(Buffer.from(original.slice(0, original.indexOf('## Delegate Skills')) +
              block + original.slice(original.indexOf('## Success Criteria'))));
            const rechecked = await runCli(fixture, 'check', ['--phase', '2']);
            expect(rechecked.exitCode).toBe(0);
            expect(rechecked.payload.phases[0].drift).toBe(false);
            const before = readFileSync(fixture.phases[0]!);
            const reapplied = await runCli(fixture, 'apply', ['--phase', '2', '--snapshot', rechecked.payload.snapshotDigest]);
            expect(reapplied.exitCode).toBe(0);
            expect(reapplied.payload.changedPhases).toEqual([]);
            expect(readFileSync(fixture.phases[0]!)).toEqual(before);
          }
        });
      }
    }
  }

  it('permits the documented line-based empty no-op when an EOF-open indented list fence hides a later delegate heading', async () => {
    const fixture = makeFixture();
    const original = '---\nphase: 1\nstatus: todo\n---\n# API service\n## Key Insights\n- Keep this context.\n   ```text\n## Delegate Skills\n- `/manual`\n';
    writeFileSync(fixture.phases[0]!, original);
    writeFileSync(fixture.route, '## global\n- implement: none\n');
    const checked = await runCli(fixture, 'check', ['--phase', '1']);
    expect(checked.exitCode).toBe(0);
    expect(checked.payload.phases[0]).toMatchObject({ eligible: true, drift: false, actual: { skills: [], agents: [] } });
    const applied = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', checked.payload.snapshotDigest]);
    expect(applied.exitCode).toBe(0);
    expect(applied.payload.changedPhases).toEqual([]);
    expect(readFileSync(fixture.phases[0]!)).toEqual(Buffer.from(original));
  });

  it('allows only true byte no-ops or zero-write refusal across 500 seeded ambiguous-container filesystem cases under five seconds', () => {
    const fixture = makeFixture('none', [{ number: 1 }, { number: 2 }]);
    const safeBytes = readFileSync(fixture.phases[0]!);
    const options = { projectRoot: fixture.root, plan: fixture.plan, phase: [] as string[] };
    const planBytes = readFileSync(fixture.plan);
    const configBytes = readFileSync(fixture.config);
    let seed = 17305;
    const next = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    let accepted = 0;
    let refused = 0;
    const started = performance.now();
    for (let index = 0; index < 500; index++) {
      const character = next() % 2 === 0 ? '`' : '~';
      const opener = 1 + next() % 3;
      const closing = next() % 5;
      const closer = closing === 4 ? undefined : closing === opener ? (closing + 1) % 4 : closing;
      const endings = (['LF', 'CRLF', 'mixed'] as const)[next() % 3]!;
      const variants = containerFenceVariants(character, opener, closer, 'key-insights', 3 + next() % 4);
      const layout = (['insertion', 'relocation', 'noop'] as const)[next() % 3]!;
      const original = Buffer.concat([Buffer.from(renderRewriteEndings('---\nphase: 2\nstatus: todo\n---\n' + variants[layout], endings)), Buffer.from([0xff, 0xfe, 0x00])]);
      writeFileSync(fixture.phases[0]!, safeBytes);
      writeFileSync(fixture.phases[1]!, original);
      const routing = next() % 3;
      const binding = routing === 0 ? 'none' : routing === 1 ? '/api-tools, @api-executor' : `/new-${index}, @new-${index}`;
      writeFileSync(fixture.route, `## global\n- implement: ${binding}\n`);
      const routeBytes = readFileSync(fixture.route);
      const before = fixture.phases.map((path) => readFileSync(path));
      const checked = executePhaseDelegates('check', options);
      let applied: PhaseDelegatesResult | undefined;
      let failure: unknown;
      try { applied = executePhaseDelegates('apply', { ...options, snapshot: checked.snapshotDigest }); }
      catch (error) { failure = error; }
      if (failure !== undefined) {
        refused++;
        expect(failure).toBeInstanceOf(PhaseDelegatesError);
        const error = failure as PhaseDelegatesError;
        expect(error.status).toBe('fence_container_ambiguous');
        expect(checked.phases[1]!.excludedReason).toBe(`[${error.status}] ${error.message}`);
        expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
      } else {
        accepted++;
        expect(applied!.changedPhases).not.toContain(2);
        // Exact byte equality is stronger than preservation/order of every protected source line.
        expect(readFileSync(fixture.phases[1]!)).toEqual(original);
        expect(checked.phases[1]).toMatchObject({ eligible: true, drift: false });
      }
      expect(readFileSync(fixture.plan)).toEqual(planBytes);
      expect(readFileSync(fixture.config)).toEqual(configBytes);
      expect(readFileSync(fixture.route)).toEqual(routeBytes);
    }
    expect(accepted).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

describe('routing phase-delegates snapshot and status refusals', () => {
  for (const changedInput of ['phase', 'route', 'test_mode', 'subWorkspaces', 'docs.path', 'plan-status'] as const) {
    it(`refuses stale ${changedInput} bytes and preserves phase bytes on apply`, async () => {
      const fixture = makeFixture();
      writeFileSync(fixture.route, '## global\n- implement: /new\n');
      const checked = await runCli(fixture, 'check', ['--phase', '1']);
      expect(checked.exitCode).toBe(0);
      if (changedInput === 'phase') writeFileSync(fixture.phases[0]!, `${readFileSync(fixture.phases[0]!, 'utf-8')}\nUser edit.\n`);
      if (changedInput === 'route') writeFileSync(fixture.route, '## global\n- implement: /changed\n');
      if (changedInput === 'test_mode') writeFileSync(fixture.plan, readFileSync(fixture.plan, 'utf-8').replace('test_mode: none', 'test_mode: tdd'));
      if (changedInput === 'plan-status') writeFileSync(fixture.plan, readFileSync(fixture.plan, 'utf-8').replace('| todo |', '| done |'));
      if (changedInput === 'subWorkspaces' || changedInput === 'docs.path') {
        const config = JSON.parse(readFileSync(fixture.config, 'utf-8'));
        if (changedInput === 'subWorkspaces') config.subWorkspaces[0].path = 'src/changed';
        else config.docs.path = 'new-docs';
        writeFileSync(fixture.config, JSON.stringify(config));
      }
      const before = readFileSync(fixture.phases[0]!);
      const applied = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', checked.payload.snapshotDigest]);
      expect(applied.exitCode).toBe(1);
      expect(applied.payload.status).toBe('stale');
      expect(readFileSync(fixture.phases[0]!)).toEqual(before);
    });
  }

  it('requires the identical selected snapshot set, normalizes selector order/duplicates and does not hash unselected phase bytes', async () => {
    const fixture = makeFixture('none', [{ number: 1 }, { number: 2 }, { number: 3, status: 'done' }]);
    writeFileSync(fixture.route, '## global\n- implement: /new\n');
    const all = await runCli(fixture, 'check');
    expect(all.exitCode).toBe(0);
    expect(all.payload.phases.map((phase: { eligible: boolean }) => phase.eligible)).toEqual([true, true, false]);
    const before = fixture.phases.map((path) => readFileSync(path));
    const refused = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', all.payload.snapshotDigest]);
    expect(refused.exitCode).toBe(1);
    expect(refused.payload.status).toBe('stale');
    expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
    const selected = await runCli(fixture, 'check', ['--phase', '2', '--phase', '01', '--phase', '1']);
    expect(selected.exitCode).toBe(0);
    expect(selected.payload.phases.map((phase: { number: number }) => phase.number)).toEqual([1, 2]);
    writeFileSync(fixture.phases[2]!, `${readFileSync(fixture.phases[2]!, 'utf-8')}\nUnselected user edit.\n`);
    const unselectedBefore = readFileSync(fixture.phases[2]!);
    const applied = await runCli(fixture, 'apply', ['--phase', '1', '--phase', '2', '--snapshot', selected.payload.snapshotDigest]);
    expect(applied.exitCode).toBe(0);
    expect(applied.payload.changedPhases).toEqual([1, 2]);
    expect(readFileSync(fixture.phases[2]!)).toEqual(unselectedBefore);
  });

  it('normalizes selected phase 0/00 and 1/01 to the same snapshot and applies a documented 00/01 plan', async () => {
    const fixture = makeFixture('none', [{ number: 0 }, { number: 1 }]);
    writeFileSync(fixture.plan, readFileSync(fixture.plan, 'utf-8').replace(/^\| ([01]) \|/gm, '| 0$1 |'));
    writeFileSync(fixture.route, '## global\n- implement: /new, @executor\n');
    const planBefore = readFileSync(fixture.plan);
    const all = await runCli(fixture, 'check', ['--phase', '01', '--phase', '0', '--phase', '00']);
    expect(all.exitCode).toBe(0);
    expect(all.payload.phases.map((phase: { number: number }) => phase.number)).toEqual([0, 1]);
    const aliases = await runCli(fixture, 'check', ['--phase', '00', '--phase', '1']);
    expect(aliases.exitCode).toBe(0);
    expect(aliases.payload.snapshotDigest).toBe(all.payload.snapshotDigest);
    const zero = await runCli(fixture, 'check', ['--phase', '0']);
    expect(zero.exitCode).toBe(0);
    expect(zero.payload.phases.map((phase: { number: number }) => phase.number)).toEqual([0]);
    const zeroAlias = await runCli(fixture, 'check', ['--phase', '00', '--phase', '0']);
    expect(zeroAlias.exitCode).toBe(0);
    expect(zeroAlias.payload.snapshotDigest).toBe(zero.payload.snapshotDigest);
    expect(zero.payload.snapshotDigest).not.toBe(all.payload.snapshotDigest);
    const wrongScope = await runCli(fixture, 'apply', ['--phase', '00', '--snapshot', all.payload.snapshotDigest]);
    expect(wrongScope.exitCode).toBe(1);
    expect(wrongScope.payload.status).toBe('stale');
    const applied = await runCli(fixture, 'apply', ['--phase', '0', '--phase', '01', '--snapshot', aliases.payload.snapshotDigest]);
    expect(applied.exitCode).toBe(0);
    expect(applied.payload.changedPhases).toEqual([0, 1]);
    for (const path of fixture.phases) expect(parsePhaseDelegates(readFileSync(path, 'utf-8'))).toEqual({ skills: ['/new'], agents: ['@executor'] });
    expect(readFileSync(fixture.plan)).toEqual(planBefore);
  });

  it('reports excluded statuses and refuses explicit non-todo selection without mutation, while all-phase apply skips them', async () => {
    const fixture = makeFixture('none', [{ number: 1 }, { number: 2, status: 'done' }, { number: 3, status: 'blocked' }]);
    writeFileSync(fixture.route, '## global\n- implement: /new\n');
    const before = fixture.phases.map((path) => readFileSync(path));
    const selected = await runCli(fixture, 'check', ['--phase', '2']);
    expect(selected.payload.phases[0]).toMatchObject({ status: 'done', eligible: false });
    expect(selected.payload.phases[0].excludedReason).toContain('only todo');
    const refused = await runCli(fixture, 'apply', ['--phase', '2', '--snapshot', selected.payload.snapshotDigest]);
    expect(refused.exitCode).toBe(1);
    expect(refused.payload.status).toBe('excluded');
    expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
    const all = await runCli(fixture, 'check');
    const applied = await runCli(fixture, 'apply', ['--snapshot', all.payload.snapshotDigest]);
    expect(applied.exitCode).toBe(0);
    expect(applied.payload.changedPhases).toEqual([1]);
    expect(readFileSync(fixture.phases[1]!)).toEqual(before[1]!);
    expect(readFileSync(fixture.phases[2]!)).toEqual(before[2]!);
  });

  for (const status of ['done', 'blocked']) {
    for (const unsafe of ['fence', 'other-content', 'anchor'] as const) {
      it(`skips ${status} rewrite errors on all-phase and todo-only apply but refuses explicit non-todo selection (${unsafe})`, async () => {
        const fixture = makeFixture('none', [{ number: 1 }, { number: 2, status }]);
        const original = renderRewriteEndings(`---\nphase: 2\nstatus: ${status}\n---\n# Phase 2: API service\n## Overview\nAPI service implementation.\n## Key Insights\nInsight.\n` +
          (unsafe === 'anchor' ? '~~~markdown\n## Delegate Skills\n- `/fenced-example`\n' :
            '## Delegate Skills\n- `/old-skill`\n\n## Delegate Agents\n- `@old-executor`\n\n' +
            (unsafe === 'fence' ? '```text\nKeep this example.\n```\n' : '<!-- Keep this instruction. -->\n')) +
          '## Requirements\nREQ-2 must remain.\n', 'mixed');
        writeFileSync(fixture.phases[1]!, original);
        writeFileSync(fixture.route, '## global\n- implement: /new\n');
        const before = readFileSync(fixture.phases[1]!);
        const all = await runCli(fixture, 'check');
        expect(all.exitCode).toBe(0);
        expect(all.payload.phases[1]).toMatchObject({ status, eligible: false, drift: true });
        const applied = await runCli(fixture, 'apply', ['--snapshot', all.payload.snapshotDigest]);
        expect(applied.exitCode).toBe(0);
        expect(applied.payload.changedPhases).toEqual([1]);
        expect(readFileSync(fixture.phases[1]!)).toEqual(before);
        writeFileSync(fixture.route, '## global\n- implement: /changed\n');
        const todo = await runCli(fixture, 'check', ['--phase', '1']);
        expect(todo.exitCode).toBe(0);
        expect(todo.payload.warnings).toEqual([]);
        const todoApplied = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', todo.payload.snapshotDigest]);
        expect(todoApplied.exitCode).toBe(0);
        expect(todoApplied.payload.changedPhases).toEqual([1]);
        expect(readFileSync(fixture.phases[1]!)).toEqual(before);
        const excluded = await runCli(fixture, 'check', ['--phase', '2']);
        const phaseBytes = fixture.phases.map((path) => readFileSync(path));
        const refused = await runCli(fixture, 'apply', ['--phase', '2', '--snapshot', excluded.payload.snapshotDigest]);
        expect(refused.exitCode).toBe(1);
        expect(refused.payload.status).toBe('excluded');
        expect(fixture.phases.map((path) => readFileSync(path))).toEqual(phaseBytes);
      });
    }
  }

  it('refuses an in_progress plan unless explicitly owned todo phases are allowed, never allowing the active phase itself', async () => {
    const fixture = makeFixture('none', [{ number: 1 }, { number: 2, status: 'in_progress' }]);
    writeFileSync(fixture.route, '## global\n- implement: /new\n');
    const before = fixture.phases.map((path) => readFileSync(path));
    const checked = await runCli(fixture, 'check', ['--phase', '1']);
    const refused = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', checked.payload.snapshotDigest]);
    expect(refused.exitCode).toBe(1);
    expect(refused.payload.status).toBe('in_progress');
    expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
    const all = await runCli(fixture, 'check');
    const broad = await runCli(fixture, 'apply', ['--allow-in-progress-plan', '--snapshot', all.payload.snapshotDigest]);
    expect(broad.exitCode).toBe(1);
    expect(broad.payload.status).toBe('excluded');
    const active = await runCli(fixture, 'check', ['--phase', '2']);
    const activeApply = await runCli(fixture, 'apply', ['--phase', '2', '--allow-in-progress-plan', '--snapshot', active.payload.snapshotDigest]);
    expect(activeApply.payload.status).toBe('excluded');
    const owned = await runCli(fixture, 'apply', ['--phase', '1', '--allow-in-progress-plan', '--snapshot', checked.payload.snapshotDigest]);
    expect(owned.exitCode).toBe(0);
    expect(owned.payload.changedPhases).toEqual([1]);
    expect(readFileSync(fixture.phases[1]!)).toEqual(before[1]!);
  });

  it('fails closed when table and phase frontmatter disagree, naming both statuses and writing nothing', async () => {
    const fixture = makeFixture('none', [{ number: 1 }, { number: 2 }]);
    writeFileSync(fixture.route, '## global\n- implement: /new\n');
    writeFileSync(fixture.phases[1]!, readFileSync(fixture.phases[1]!, 'utf-8').replace('status: todo', 'status: done'));
    const before = fixture.phases.map((path) => readFileSync(path));
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(1);
    expect(checked.payload).toMatchObject({ status: 'status_mismatch', phase: 2, tableStatus: 'todo', frontmatterStatus: 'done' });
    expect(checked.payload.errors[0]).toContain('Phase 2');
    expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
  });
});

describe('generation routing draft lifecycle through real CLI commands', () => {
  for (const spikeNumber of [0, 1]) {
    for (const populated of [false, true]) {
      it(`injects every invocation-owned draft before blocking spike ${String(spikeNumber).padStart(2, '0')} dependents and still refuses ordinary blocked refresh (${populated ? 'populated' : 'present-empty'})`, async () => {
        const dependentNumber = spikeNumber + 1;
        const fixture = makeFixture('none', [{ number: spikeNumber }, { number: dependentNumber }, { number: 3, status: 'blocked' }]);
        const spikeSelector = String(spikeNumber).padStart(2, '0');
        const dependentSelector = String(dependentNumber).padStart(2, '0');
        writeFileSync(fixture.plan, readFileSync(fixture.plan, 'utf-8')
          .replace(`| ${spikeNumber} | [Phase ${spikeNumber}](phases/phase-${spikeSelector}-work.md) | todo | — | — |`,
            `| ${spikeSelector} | [Phase ${spikeNumber}](phases/phase-${spikeSelector}-work.md) | todo | ${dependentSelector} | — |`)
          .replace(`| ${dependentNumber} | [Phase ${dependentNumber}](phases/phase-${dependentSelector}-work.md) | todo | — | — |`,
            `| ${dependentSelector} | [Phase ${dependentNumber}](phases/phase-${dependentSelector}-work.md) | todo | — | ${spikeSelector} |`));
        const spikePath = fixture.phases[0]!;
        const dependentPath = fixture.phases[1]!;
        writeFileSync(spikePath, withoutDelegates(readFileSync(spikePath, 'utf-8'))
          .replace(`phase: ${spikeNumber}\n`, `phase: ${spikeNumber}\nphase_type: spike\n`)
          .replace('blocks: []', `blocks: [${dependentNumber}]`) +
          '\n## Spike Objective\nMeasure API prototype viability.\n\n## Experiment\nCommand: run `bun test api-prototype` and record output.\n\n## Deliverables\nPrototype and measured output for review.\n\n## Decision Gate\nApprove the measured prototype or replan the dependent implementation.\n\n## Spike Result\nStatus: pending\n');
        writeFileSync(dependentPath, withoutDelegates(readFileSync(dependentPath, 'utf-8'))
          .replace('blockedBy: []', `blockedBy: [${spikeNumber}]\ndependencies: [${spikeNumber}]`));
        writeFileSync(fixture.route, populated ? '## global\n- implement: /api-tools, @api-executor\n' : '## global\n- implement: none\n');
        const draftPlan = readFileSync(fixture.plan);
        const drafts = [readFileSync(spikePath, 'utf-8'), readFileSync(dependentPath, 'utf-8')];
        const existingBefore = readFileSync(fixture.phases[2]!);
        const selected = ['--phase', spikeSelector, '--phase', dependentSelector];
        const checked = await runCli(fixture, 'check', selected);
        expect(checked.exitCode).toBe(0);
        expect(checked.payload.state).toBe(populated ? 'present-populated' : 'present-empty');
        expect(checked.payload.phases.map((phase: { number: number; status: string; eligible: boolean }) => [phase.number, phase.status, phase.eligible]))
          .toEqual([[spikeNumber, 'todo', true], [dependentNumber, 'todo', true]]);
        const expected = populated ? { skills: ['/api-tools'], agents: ['@api-executor'] } : { skills: [], agents: [] };
        for (const phase of checked.payload.phases) expect(phase.expected).toEqual(expected);
        const applied = await runCli(fixture, 'apply', [...selected, '--allow-in-progress-plan', '--snapshot', checked.payload.snapshotDigest]);
        expect(applied.exitCode).toBe(0);
        expect(applied.payload.changedPhases).toEqual(populated ? [spikeNumber, dependentNumber] : []);
        expect(readFileSync(fixture.plan)).toEqual(draftPlan);
        for (const [index, path] of [spikePath, dependentPath].entries()) {
          expect(parsePhaseDelegates(readFileSync(path, 'utf-8'))).toEqual(expected);
          expect(withoutDelegates(readFileSync(path, 'utf-8'))).toBe(drafts[index]!);
        }
        // Finalize generation-assigned status in both sources before any post-write gate.
        expect((await runUtil(fixture, 'update-phase-frontmatter-status.ts', [dependentPath, 'blocked'])).exitCode).toBe(0);
        expect((await runUtil(fixture, 'update-phase-status.ts', [fixture.plan, dependentSelector, 'blocked'])).exitCode).toBe(0);
        expect(parsePhasesTable(readFileSync(fixture.plan, 'utf-8')).phases.map((phase) => phase.status)).toEqual(['todo', 'blocked', 'blocked']);
        expect(readPhaseFrontmatterStatus(readFileSync(dependentPath, 'utf-8'), dependentPath)).toBe('blocked');
        for (const script of ['plan-prose-validator.ts', 'plan-status-validator.ts']) {
          const gate = await runUtil(fixture, script, [fixture.plan, '--json']);
          expect(gate.exitCode).toBe(0);
          expect(JSON.parse(gate.stdout).ok).toBe(true);
        }
        for (const [path, number] of [[spikePath, spikeSelector], [dependentPath, dependentSelector]]) {
          const gate = await runUtil(fixture, 'validate-phase-file.ts', [path!, '--phase-number', number!, '--plan', fixture.plan, '--mode', 'parallel', '--project-root', fixture.root, '--json']);
          expect(gate.exitCode).toBe(0);
          expect(JSON.parse(gate.stdout).valid).toBe(true);
        }
        const disjointness = await runUtil(fixture, 'check-phase-write-disjointness.ts', ['--project-root', fixture.root, '--validate-only'], '[]');
        expect(disjointness.exitCode).toBe(0);
        expect(JSON.parse(disjointness.stdout).rejected).toEqual([]);
        const finalPlan = readFileSync(fixture.plan);
        const finalPhases = fixture.phases.map((path) => readFileSync(path));
        const blocked = await runCli(fixture, 'check', ['--phase', dependentSelector]);
        expect(blocked.exitCode).toBe(0);
        expect(blocked.payload.phases[0]).toMatchObject({ status: 'blocked', eligible: false });
        for (const allowance of [[], ['--allow-in-progress-plan']]) {
          const refused = await runCli(fixture, 'apply', ['--phase', dependentSelector, '--snapshot', blocked.payload.snapshotDigest, ...allowance]);
          expect(refused.exitCode).toBe(1);
          expect(refused.payload.status).toBe('excluded');
        }
        expect(readFileSync(fixture.plan)).toEqual(finalPlan);
        expect(fixture.phases.map((path) => readFileSync(path))).toEqual(finalPhases);
        expect(readFileSync(fixture.phases[2]!)).toEqual(existingBefore);
      });
    }
  }
});

describe('routing phase-delegates canonical containment and rollback', () => {
  for (const targetType of ['file', 'parent-directory'] as const) {
    it(`rejects an escaping ${targetType} symlink before reading or writing its target`, async () => {
      const fixture = makeFixture();
      writeFileSync(fixture.route, '## global\n- implement: /new\n');
      const outside = mkdtempSync(join(tmpdir(), 'phase-delegates-outside-'));
      roots.push(outside);
      const outsideFile = join(outside, 'phase-01-work.md');
      writeFileSync(outsideFile, 'Not even a valid phase; containment must fail before parsing.\n');
      if (targetType === 'file') {
        unlinkSync(fixture.phases[0]!);
        symlinkSync(outsideFile, fixture.phases[0]!);
      } else {
        rmSync(dirname(fixture.phases[0]!), { recursive: true });
        symlinkSync(outside, dirname(fixture.phases[0]!));
      }
      const before = readFileSync(outsideFile);
      const checked = await runCli(fixture, 'check');
      expect(checked.exitCode).toBe(1);
      expect(checked.payload.status).toBe('path_outside_plan');
      const applied = await runCli(fixture, 'apply', ['--snapshot', 'invalid']);
      expect(applied.exitCode).toBe(1);
      expect(applied.payload.status).toBe('path_outside_plan');
      expect(readFileSync(outsideFile)).toEqual(before);
    });
  }

  it('checks containment again on apply if a previously approved path becomes an escaping symlink', async () => {
    const fixture = makeFixture();
    writeFileSync(fixture.route, '## global\n- implement: /new\n');
    const checked = await runCli(fixture, 'check', ['--phase', '1']);
    expect(checked.exitCode).toBe(0);
    const outside = join(fixture.root, 'outside.md');
    writeFileSync(outside, readFileSync(fixture.phases[0]!));
    unlinkSync(fixture.phases[0]!);
    symlinkSync(outside, fixture.phases[0]!);
    const before = readFileSync(outside);
    const applied = await runCli(fixture, 'apply', ['--phase', '1', '--snapshot', checked.payload.snapshotDigest]);
    expect(applied.exitCode).toBe(1);
    expect(applied.payload.status).toBe('path_outside_plan');
    expect(readFileSync(outside)).toEqual(before);
  });

  it('allows in-boundary file and parent-directory symlinks instead of banning every link', async () => {
    const fixture = makeFixture();
    writeFileSync(fixture.route, '## global\n- implement: /new\n');
    const original = readFileSync(fixture.phases[0]!);
    const targets = join(dirname(fixture.plan), 'targets');
    mkdirSync(targets);
    const target = join(targets, 'phase-01-work.md');
    writeFileSync(target, original);
    rmSync(dirname(fixture.phases[0]!), { recursive: true });
    symlinkSync(targets, dirname(fixture.phases[0]!));
    const checkParent = await runCli(fixture, 'check');
    expect(checkParent.exitCode).toBe(0);
    const applyParent = await runCli(fixture, 'apply', ['--snapshot', checkParent.payload.snapshotDigest]);
    expect(applyParent.exitCode).toBe(0);
    expect(parsePhaseDelegates(readFileSync(target, 'utf-8')).skills).toEqual(['/new']);
    unlinkSync(dirname(fixture.phases[0]!));
    mkdirSync(dirname(fixture.phases[0]!));
    symlinkSync(target, fixture.phases[0]!);
    writeFileSync(target, original);
    const checkFile = await runCli(fixture, 'check');
    expect(checkFile.exitCode).toBe(0);
    const applyFile = await runCli(fixture, 'apply', ['--snapshot', checkFile.payload.snapshotDigest]);
    expect(applyFile.exitCode).toBe(0);
    expect(parsePhaseDelegates(readFileSync(target, 'utf-8')).skills).toEqual(['/new']);
  });

  it('rejects a lexical escape without opening or mutating the outside phase', async () => {
    const fixture = makeFixture();
    writeFileSync(fixture.route, '## global\n- implement: /new\n');
    const outside = join(fixture.root, 'outside.md');
    writeFileSync(outside, 'Outside bytes stay unchanged.\n');
    writeFileSync(fixture.plan, readFileSync(fixture.plan, 'utf-8').replace('phases/phase-01-work.md', '../../outside.md'));
    const before = readFileSync(outside);
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(1);
    const applied = await runCli(fixture, 'apply', ['--snapshot', 'invalid']);
    expect(applied.exitCode).toBe(1);
    expect(readFileSync(outside)).toEqual(before);
  });

  it('restores byte snapshots after a real second-phase write failure, including the already-written first phase', async () => {
    const fixture = makeFixture('none', [{ number: 1 }, { number: 2 }]);
    writeFileSync(fixture.route, '## global\n- implement: /new\n');
    const before = fixture.phases.map((path) => readFileSync(path));
    const checked = await runCli(fixture, 'check');
    expect(checked.exitCode).toBe(0);
    chmodSync(fixture.root, 0o755);
    chmodSync(fixture.phases[0]!, 0o666);
    chmodSync(fixture.phases[1]!, 0o444);
    const firstMtime = statSync(fixture.phases[0]!, { bigint: true }).mtimeNs;
    // Permission refusal is exercised by the OS, even when the test runner happens to be root.
    const credentials = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {};
    const applied = await runCli(fixture, 'apply', ['--snapshot', checked.payload.snapshotDigest], credentials);
    expect(applied.exitCode).toBe(1);
    expect(applied.payload.status).toBe('write_failed');
    expect(applied.payload.errors[0]).toContain('original phase bytes restored');
    expect(statSync(fixture.phases[0]!, { bigint: true }).mtimeNs).toBeGreaterThan(firstMtime);
    expect(fixture.phases.map((path) => readFileSync(path))).toEqual(before);
  });
});

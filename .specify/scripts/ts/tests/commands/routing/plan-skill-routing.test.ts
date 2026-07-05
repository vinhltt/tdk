import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dir, '../../../src/index.ts');

let tmpRoot = '';

function makeRoot(): string {
  tmpRoot = mkdtempSync(join(tmpdir(), 'plan-skill-routing-'));
  mkdirSync(join(tmpRoot, '.specify/templates/plan'), { recursive: true });
  writeFileSync(
    join(tmpRoot, '.specify/.specify.json'),
    JSON.stringify({
      version: '1.0',
      name: 'fixture',
      docs: { path: '.specify/configurations' },
      subWorkspaces: [{ name: 'backend', path: 'src/backend' }],
    }),
    'utf-8',
  );
  writeFileSync(
    join(tmpRoot, '.specify/templates/plan/plan-skill-routing-template.tpl'),
    '# Plan Skill Routing\n\n## global\n\n- test: /fixture-test\n',
    'utf-8',
  );
  return tmpRoot;
}

function routeFile(root: string): string {
  return join(root, '.specify/configurations/custom-workflow/plan-skill-routing.md');
}

function writeRoute(root: string, content: string): void {
  mkdirSync(join(root, '.specify/configurations/custom-workflow'), { recursive: true });
  writeFileSync(routeFile(root), content, 'utf-8');
}

function writeProposal(root: string): string {
  return writeProposalWithEntries(root, [
    {
      subWorkspace: 'backend',
      domain: 'test',
      skills: ['/backend-test'],
      reason: 'Route backend tests',
    },
  ]);
}

function writeProposalWithEntries(root: string, entries: Record<string, unknown>[]): string {
  const proposalPath = join(root, 'plan-skill-routing-proposal.json');
  writeFileSync(
    proposalPath,
    JSON.stringify({
      version: 1,
      sourceRecommendation: '.specify/configurations/automation-recommendations/sub-workspaces/backend/automation-recommendation.md',
      entries,
    }),
    'utf-8',
  );
  return proposalPath;
}

async function runCli(
  root: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', CLI, ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

afterEach(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  tmpRoot = '';
});

describe('tdk routing plan-skill command', () => {
  it('reports missing route file without creating it, then init creates explicitly', async () => {
    const root = makeRoot();

    const inspect = await runCli(root, ['routing', 'plan-skill', 'inspect', '--project-root', root]);
    expect(inspect.exitCode).toBe(0);
    expect(JSON.parse(inspect.stdout).status).toBe('missing');

    const init = await runCli(root, ['routing', 'plan-skill', 'init', '--project-root', root]);
    expect(init.exitCode).toBe(0);
    expect(JSON.parse(init.stdout).status).toBe('created');
    expect(readFileSync(routeFile(root), 'utf-8')).toContain('/fixture-test');
  });

  it('returns validation warnings for identical duplicates and nonzero for conflicts', async () => {
    const root = makeRoot();
    writeRoute(root, '## global\n- test: /skill-a\n- test: /skill-a\n');

    const duplicate = await runCli(root, ['routing', 'plan-skill', 'check', '--project-root', root]);
    expect(duplicate.exitCode).toBe(0);
    expect(JSON.parse(duplicate.stdout).warnings).toHaveLength(1);

    writeRoute(root, '## global\n- test: /skill-a\n- test: /skill-b\n');
    const conflict = await runCli(root, ['routing', 'plan-skill', 'check', '--project-root', root]);
    expect(conflict.exitCode).toBe(1);
    expect(JSON.parse(conflict.stdout).status).toBe('invalid');
  });

  it('diffs, registers, verifies, and keeps register idempotent', async () => {
    const root = makeRoot();
    writeRoute(root, '## global\n- test: /global-test\n');
    const proposalPath = writeProposal(root);

    const diff = await runCli(root, [
      'routing',
      'plan-skill',
      'diff',
      '--project-root',
      root,
      '--proposal',
      proposalPath,
    ]);
    expect(diff.exitCode).toBe(0);
    expect(JSON.parse(diff.stdout).operations[0].type).toBe('add');

    const blocked = await runCli(root, [
      'routing',
      'plan-skill',
      'register',
      '--project-root',
      root,
      '--proposal',
      proposalPath,
    ]);
    expect(blocked.exitCode).toBe(1);
    expect(readFileSync(routeFile(root), 'utf-8')).not.toContain('/backend-test');

    const registered = await runCli(root, [
      'routing',
      'plan-skill',
      'register',
      '--project-root',
      root,
      '--proposal',
      proposalPath,
      '--yes',
    ]);
    expect(registered.exitCode).toBe(0);
    expect(JSON.parse(registered.stdout).status).toBe('registered');
    expect(readFileSync(routeFile(root), 'utf-8')).toContain('- test: /backend-test');

    const verify = await runCli(root, [
      'routing',
      'plan-skill',
      'verify',
      '--project-root',
      root,
      '--proposal',
      proposalPath,
    ]);
    expect(verify.exitCode).toBe(0);
    expect(JSON.parse(verify.stdout).status).toBe('verified');

    const secondRegister = await runCli(root, [
      'routing',
      'plan-skill',
      'register',
      '--project-root',
      root,
      '--proposal',
      proposalPath,
      '--yes',
    ]);
    expect(secondRegister.exitCode).toBe(0);
    expect(JSON.parse(secondRegister.stdout).status).toBe('noop');
  });

  it('blocks register and verify when conflicting duplicate routes exist', async () => {
    const root = makeRoot();
    writeRoute(root, '## global\n- test: /skill-a\n- test: /skill-b\n');
    const proposalPath = writeProposalWithEntries(root, [
      { subWorkspace: 'global', domain: 'test', skills: ['/skill-a'] },
    ]);

    const before = readFileSync(routeFile(root), 'utf-8');
    const register = await runCli(root, [
      'routing',
      'plan-skill',
      'register',
      '--project-root',
      root,
      '--proposal',
      proposalPath,
      '--yes',
    ]);
    expect(register.exitCode).toBe(1);
    expect(JSON.parse(register.stdout).errors[0]).toContain('route file has conflicts');
    expect(readFileSync(routeFile(root), 'utf-8')).toBe(before);

    const verify = await runCli(root, [
      'routing',
      'plan-skill',
      'verify',
      '--project-root',
      root,
      '--proposal',
      proposalPath,
    ]);
    expect(verify.exitCode).toBe(1);
    expect(JSON.parse(verify.stdout).errors[0]).toContain('route file has conflicts');
  });

  it('rejects proposal operation mismatches without writing', async () => {
    const root = makeRoot();
    writeRoute(root, '## global\n- test: /existing-test\n');
    const proposalPath = writeProposalWithEntries(root, [
      {
        subWorkspace: 'global',
        domain: 'test',
        skills: ['/new-test'],
        operation: 'add',
      },
    ]);

    const before = readFileSync(routeFile(root), 'utf-8');
    const result = await runCli(root, [
      'routing',
      'plan-skill',
      'register',
      '--project-root',
      root,
      '--proposal',
      proposalPath,
      '--yes',
    ]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).errors[0]).toContain("operation 'add'");
    expect(readFileSync(routeFile(root), 'utf-8')).toBe(before);
  });

  it('keeps optimize dry-run read-only unless --yes is provided', async () => {
    const root = makeRoot();
    writeRoute(root, '## global\n- test: /skill-a, /skill-a\n- test: /skill-a\n');

    const dryRun = await runCli(root, ['routing', 'plan-skill', 'optimize', '--project-root', root]);
    expect(dryRun.exitCode).toBe(0);
    expect(JSON.parse(dryRun.stdout).dryRun).toBe(true);
    expect(readFileSync(routeFile(root), 'utf-8').match(/^- test:/gm)).toHaveLength(2);

    const write = await runCli(root, [
      'routing',
      'plan-skill',
      'optimize',
      '--project-root',
      root,
      '--yes',
    ]);
    expect(write.exitCode).toBe(0);
    expect(JSON.parse(write.stdout).dryRun).toBe(false);
    expect(readFileSync(routeFile(root), 'utf-8').match(/^- test:/gm)).toHaveLength(1);
  });
});

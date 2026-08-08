import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dir, '../../../src/index.ts');

let tmpRoot = '';

function makeRoot(): string {
  tmpRoot = mkdtempSync(join(tmpdir(), 'delegate-routing-'));
  mkdirSync(join(tmpRoot, '.specify'), { recursive: true });
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
  return tmpRoot;
}

function routeDir(root: string): string {
  return join(root, '.specify/configurations/custom-workflow');
}

function routeFile(root: string): string {
  return join(routeDir(root), 'delegate-routing.md');
}

function writeRoute(root: string, content: string): void {
  mkdirSync(routeDir(root), { recursive: true });
  writeFileSync(routeFile(root), content, 'utf-8');
}

function writeProposal(root: string, entries: Record<string, unknown>[]): string {
  const proposalPath = join(root, 'delegate-routing-proposal.json');
  writeFileSync(proposalPath, JSON.stringify({ version: 1, entries }), 'utf-8');
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

describe('tdk routing delegate command', () => {
  it('lists only diff, register, verify', async () => {
    const root = makeRoot();
    const help = await runCli(root, ['routing', 'delegate', '--help']);
    expect(help.stdout).toContain('diff');
    expect(help.stdout).toContain('register');
    expect(help.stdout).toContain('verify');
    expect(help.stdout).not.toContain('init');
    expect(help.stdout).not.toContain('inspect');
    expect(help.stdout).not.toContain('optimize');
  });

  it('reports a missing route file with a copy-template hint and a legacy-file warning', async () => {
    const root = makeRoot();
    mkdirSync(routeDir(root), { recursive: true });
    writeFileSync(join(routeDir(root), 'plan-skill-routing.md'), '## global\n', 'utf-8');
    const proposalPath = writeProposal(root, [
      { subWorkspace: 'global', domain: 'test', delegates: ['/global-test'] },
    ]);

    const diff = await runCli(root, ['routing', 'delegate', 'diff', '--project-root', root, '--proposal', proposalPath]);
    expect(diff.exitCode).toBe(0);
    const payload = JSON.parse(diff.stdout);
    expect(payload.status).toBe('missing');
    expect(payload.warnings.some((w: string) => w.includes('Copy .specify/templates/plan/delegate-routing-template.tpl'))).toBe(true);
    expect(payload.warnings.some((w: string) => w.includes('Legacy routing file detected'))).toBe(true);
  });

  it('merges duplicate-route and domain warnings into diff, and registers @agent tokens end to end', async () => {
    const root = makeRoot();
    writeRoute(root, '## global\n- test: /skill-a\n- test: /skill-a\n');
    const proposalPath = writeProposal(root, [
      { subWorkspace: 'backend', domain: 'test', delegates: ['/backend-test', '@backend-agent'], reason: 'route' },
      { subWorkspace: 'global', domain: 'docs', delegates: ['/docs-skill'] },
    ]);

    const diff = await runCli(root, ['routing', 'delegate', 'diff', '--project-root', root, '--proposal', proposalPath]);
    expect(diff.exitCode).toBe(0);
    const diffPayload = JSON.parse(diff.stdout);
    expect(diffPayload.warnings.some((w: string) => w.startsWith('Duplicate route'))).toBe(true);
    expect(diffPayload.warnings.some((w: string) => w.includes("Domain 'docs'"))).toBe(true);

    const registered = await runCli(root, [
      'routing', 'delegate', 'register', '--project-root', root, '--proposal', proposalPath, '--yes',
    ]);
    expect(registered.exitCode).toBe(0);
    expect(JSON.parse(registered.stdout).status).toBe('registered');
    expect(readFileSync(routeFile(root), 'utf-8')).toContain('- test: /backend-test, @backend-agent');

    const verify = await runCli(root, ['routing', 'delegate', 'verify', '--project-root', root, '--proposal', proposalPath]);
    expect(verify.exitCode).toBe(0);
    expect(JSON.parse(verify.stdout).status).toBe('verified');

    const secondRegister = await runCli(root, [
      'routing', 'delegate', 'register', '--project-root', root, '--proposal', proposalPath, '--yes',
    ]);
    expect(secondRegister.exitCode).toBe(0);
    expect(JSON.parse(secondRegister.stdout).status).toBe('noop');
  });

  it('does not create a route file on register when missing, and returns the copy-template hint', async () => {
    const root = makeRoot();
    const proposalPath = writeProposal(root, [
      { subWorkspace: 'global', domain: 'test', delegates: ['/global-test'] },
    ]);

    const register = await runCli(root, [
      'routing', 'delegate', 'register', '--project-root', root, '--proposal', proposalPath, '--yes',
    ]);
    expect(register.exitCode).toBe(1);
    const payload = JSON.parse(register.stdout);
    expect(payload.status).toBe('missing');
    expect(payload.errors[0]).toContain('Copy .specify/templates/plan/delegate-routing-template.tpl');
  });

  it('blocks register and verify when conflicting duplicate routes exist', async () => {
    const root = makeRoot();
    writeRoute(root, '## global\n- test: /skill-a\n- test: /skill-b\n');
    const proposalPath = writeProposal(root, [
      { subWorkspace: 'global', domain: 'test', delegates: ['/skill-a'] },
    ]);

    const before = readFileSync(routeFile(root), 'utf-8');
    const register = await runCli(root, [
      'routing', 'delegate', 'register', '--project-root', root, '--proposal', proposalPath, '--yes',
    ]);
    expect(register.exitCode).toBe(1);
    expect(JSON.parse(register.stdout).errors[0]).toContain('route file has conflicts');
    expect(readFileSync(routeFile(root), 'utf-8')).toBe(before);

    const verify = await runCli(root, ['routing', 'delegate', 'verify', '--project-root', root, '--proposal', proposalPath]);
    expect(verify.exitCode).toBe(1);
    expect(JSON.parse(verify.stdout).errors[0]).toContain('route file has conflicts');
  });

  it('rejects proposal operation mismatches without writing', async () => {
    const root = makeRoot();
    writeRoute(root, '## global\n- test: /existing-test\n');
    const proposalPath = writeProposal(root, [
      { subWorkspace: 'global', domain: 'test', delegates: ['/new-test'], operation: 'add' },
    ]);

    const before = readFileSync(routeFile(root), 'utf-8');
    const result = await runCli(root, [
      'routing', 'delegate', 'register', '--project-root', root, '--proposal', proposalPath, '--yes',
    ]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).errors[0]).toContain("operation 'add'");
    expect(readFileSync(routeFile(root), 'utf-8')).toBe(before);
  });
});

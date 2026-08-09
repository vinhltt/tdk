import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deriveSpecifyConfig, formatTopologyDiff } from '../../src/commands/config/topology/patch';
import { parseWorkspaceTopology } from '../../src/commands/config/topology/schema';

describe('config topology apply dry-run', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tdk-topology-'));
    mkdirSync(join(tempDir, '.specify', 'configurations', 'workspace-topology'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeJson(path: string, value: unknown): void {
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2));
  }

  function configPath(): string {
    return join(tempDir, '.specify', '.specify.json');
  }

  function topologyPath(): string {
    return join(tempDir, '.specify', 'configurations', 'workspace-topology', 'workspace-topology.json');
  }

  function layoutPath(): string {
    return join(
      tempDir,
      '.specify',
      'configurations',
      'workspace-layout',
      'workspace-layout-proposal.json',
    );
  }

  async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const indexPath = resolve(import.meta.dir, '../../src/index.ts');
    const proc = Bun.spawn(['bun', 'run', indexPath, 'config', 'topology', 'apply', ...args], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  }

  it('derives only schema-backed runtime config and warns for report-only fields', () => {
    const parsed = parseWorkspaceTopology({
      architecture: { type: 'modular-monolith', boundaryType: 'report-only' },
      subWorkspaces: [
        {
          name: 'app',
          path: 'apps/app',
          boundaryType: 'bounded-context',
          owner: 'team-a',
          contracts: ['public-api'],
          allowedDependencies: ['shared'],
          routing: { next: 'tdk-plan' },
          modules: [{ name: 'api', path: 'src/api' }],
        },
      ],
    });

    const result = deriveSpecifyConfig(
      { name: 'demo', subWorkspaces: [] },
      parsed.topology,
      parsed.warnings,
    );

    expect(result.config.architecture?.type).toBe('modular-monolith');
    expect(result.config.subWorkspaces?.[0]).toEqual({
      name: 'app',
      path: 'apps/app',
      modules: [{ name: 'api', path: 'src/api' }],
      hasModules: true,
    });
    expect(Object.keys(result.config.subWorkspaces?.[0] ?? {}).sort()).toEqual([
      'hasModules',
      'modules',
      'name',
      'path',
    ]);
    expect(Object.keys(result.config.subWorkspaces?.[0]?.modules?.[0] ?? {}).sort()).toEqual([
      'name',
      'path',
    ]);
    expect(JSON.stringify(result.config)).not.toContain('boundaryType');
    expect(JSON.stringify(result.config)).not.toContain('owner');
    expect(JSON.stringify(result.config)).not.toContain('contracts');
    expect(JSON.stringify(result.config)).not.toContain('allowedDependencies');
    expect(JSON.stringify(result.config)).not.toContain('routing');
    expect(result.warnings.join('\n')).toContain('report-only');
    expect(result.requiresConfirmation).toBe(false);
    expect(result.warnings.join('\n')).toContain('subWorkspaces.app.boundaryType');
  });

  it('preserves unmentioned sub-workspaces and reports same-name overwrite candidates', () => {
    const parsed = parseWorkspaceTopology({
      subWorkspaces: [
        {
          name: 'api',
          path: 'services/api-v2',
          modules: [{ name: 'http', path: 'src/http' }],
        },
      ],
    });

    const result = deriveSpecifyConfig(
      {
        name: 'brownfield',
        subWorkspaces: [
          { name: 'api', path: 'services/api' },
          { name: 'admin', path: 'apps/admin' },
        ],
      },
      parsed.topology,
      parsed.warnings,
    );

    expect(result.config.subWorkspaces?.map((entry) => entry.name)).toEqual(['api', 'admin']);
    expect(result.config.subWorkspaces?.find((entry) => entry.name === 'admin')?.path).toBe('apps/admin');
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationFindings).toEqual([
      { name: 'api', fields: ['path', 'modules'] },
    ]);
  });

  it('warns and ignores unsupported architecture values', () => {
    const parsed = parseWorkspaceTopology({
      architecture: { type: 'event-driven' },
      subWorkspaces: [{ name: 'app', path: 'app' }],
    });
    const result = deriveSpecifyConfig({ name: 'demo' }, parsed.topology, parsed.warnings);

    expect(result.config.architecture).toBeUndefined();
    expect(result.warnings.join('\n')).toContain('Unsupported architecture type');
  });

  it('rejects unsafe topology paths, duplicates, and shell-like routing', () => {
    expect(() => parseWorkspaceTopology({
      subWorkspaces: [{ name: 'escape', path: '../escape' }],
    })).toThrow('path traversal');

    expect(() => parseWorkspaceTopology({
      subWorkspaces: [{ name: 'escape', path: '/tmp/escape' }],
    })).toThrow('absolute paths');

    expect(() => parseWorkspaceTopology({
      subWorkspaces: [
        { name: 'api', path: 'services/api' },
        { name: 'API', path: 'services/api-copy' },
      ],
    })).toThrow('Duplicate sub-workspace name');

    expect(() => parseWorkspaceTopology({
      subWorkspaces: [
        {
          name: 'api',
          path: 'services/api',
          modules: [
            { name: 'http', path: 'src/http' },
            { name: 'HTTP', path: 'src/http-copy' },
          ],
        },
      ],
    })).toThrow('Duplicate module name');

    expect(() => parseWorkspaceTopology({
      subWorkspaces: [
        { name: 'api', path: 'services/api', routing: { next: 'tdk-plan && rm -rf .' } },
      ],
    })).toThrow('shell-like routing');

    expect(() => parseWorkspaceTopology({
      routing: { next: 'tdk-plan && rm -rf .' },
      subWorkspaces: [],
    })).toThrow('shell-like routing');
  });

  it('warns for safe raw report-only fields before schema stripping', () => {
    const parsed = parseWorkspaceTopology({
      owner: 'platform',
      contracts: ['workspace-contract'],
      routing: { next: 'tdk-status' },
      subWorkspaces: [
        { name: 'app', path: 'app', boundaryType: 'bounded-context' },
      ],
    });

    expect(parsed.warnings).toContain('topology.owner is report-only and ignored for runtime config');
    expect(parsed.warnings).toContain('topology.contracts is report-only and ignored for runtime config');
    expect(parsed.warnings).toContain('topology.routing is report-only and ignored for runtime config');
    expect(parsed.warnings).toContain('subWorkspaces.app.boundaryType is report-only and ignored for runtime config');
  });

  it('reports path collisions after dot-segment normalization', () => {
    const parsed = parseWorkspaceTopology({
      subWorkspaces: [{ name: 'web', path: 'apps/./shared' }],
    });

    const result = deriveSpecifyConfig({
      name: 'demo',
      subWorkspaces: [{ name: 'admin', path: 'apps/shared' }],
    }, parsed.topology, parsed.warnings);

    expect(result.requiresConfirmation).toBe(true);
    expect(JSON.stringify(result.confirmationFindings)).toContain('pathCollision');
  });

  it('prefers the default workspace layout proposal and falls back to legacy topology', async () => {
    writeJson(configPath(), { name: 'demo' });
    writeJson(topologyPath(), {
      subWorkspaces: [{ name: 'legacy', path: 'legacy' }],
    });
    writeJson(layoutPath(), {
      subWorkspaces: [{ name: 'app', path: 'apps/app' }],
    });

    const preferred = JSON.parse((await runCli([])).stdout);
    expect(preferred.topologyPath).toBe(layoutPath());
    expect(preferred.changes.after.subWorkspaces.map((entry: { name: string }) => entry.name)).toEqual([
      'app',
    ]);

    rmSync(layoutPath(), { force: true });

    const fallback = JSON.parse((await runCli([])).stdout);
    expect(fallback.topologyPath).toBe(topologyPath());
    expect(fallback.changes.after.subWorkspaces.map((entry: { name: string }) => entry.name)).toEqual([
      'legacy',
    ]);
  });

  it('runs the CLI dry-run from a workspace layout proposal without writing .specify/.specify.json', async () => {
    writeJson(configPath(), {
      name: 'demo',
      subWorkspaces: [{ name: 'legacy', path: 'legacy' }],
    });
    writeJson(layoutPath(), {
      subWorkspaces: [{ name: 'app', path: 'apps/app' }],
    });
    const before = readFileSync(configPath(), 'utf-8');
    const { stdout, stderr, exitCode } = await runCli(['--topology', layoutPath()]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(readFileSync(configPath(), 'utf-8')).toBe(before);

    const output = JSON.parse(stdout);
    expect(output.mode).toBe('dry-run');
    expect(output.configPath).toBe(configPath());
    expect(output.topologyPath).toBe(layoutPath());
    expect(typeof output.runId).toBe('string');
    expect(output.rawBeforeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(output.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(output.applyEligible).toBe(true);
    expect(output.requiresConfirmation).toBe(false);
    expect(output.changes.after.subWorkspaces.map((entry: { name: string }) => entry.name)).toEqual([
      'app',
      'legacy',
    ]);
    expect(output.diff).toContain('"name": "app"');
  });

  it('keeps planHash stable while changing runId per dry-run', async () => {
    writeJson(configPath(), { name: 'demo' });
    writeJson(layoutPath(), { subWorkspaces: [{ name: 'app', path: 'apps/app' }] });

    const first = JSON.parse((await runCli(['--topology', layoutPath()])).stdout);
    const second = JSON.parse((await runCli(['--topology', layoutPath()])).stdout);

    expect(first.planHash).toBe(second.planHash);
    expect(first.runId).not.toBe(second.runId);
  });

  it('rejects --yes without --expect-hash and leaves config unchanged', async () => {
    writeJson(configPath(), { name: 'demo' });
    writeJson(layoutPath(), { subWorkspaces: [{ name: 'app', path: 'apps/app' }] });
    const before = readFileSync(configPath(), 'utf-8');

    const { stderr, exitCode } = await runCli(['--topology', layoutPath(), '--yes']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--yes requires --expect-hash');
    expect(readFileSync(configPath(), 'utf-8')).toBe(before);
  });

  it('rejects explicit --dry-run --yes before config reads', async () => {
    const { stderr, exitCode } = await runCli(['--dry-run', '--yes']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--dry-run and --yes cannot be combined');
    expect(stderr).not.toContain('Missing .specify/.specify.json');
  });

  it('applies the dry-run plan with --expect-hash and preserves raw unknown fields', async () => {
    writeJson(configPath(), {
      name: 'demo',
      metadata: { local: 'keep-me' },
      pluginOwned: { untouched: true },
      subWorkspaces: [{ name: 'legacy', path: 'legacy', pluginField: 'keep-subfield' }],
    });
    chmodSync(configPath(), 0o600);
    writeJson(layoutPath(), {
      architecture: { type: 'modular-monolith' },
      subWorkspaces: [{ name: 'app', path: 'apps/app' }],
    });
    const dryRun = JSON.parse((await runCli(['--topology', layoutPath()])).stdout);

    const { stdout, stderr, exitCode } = await runCli([
      '--topology',
      layoutPath(),
      '--yes',
      '--expect-hash',
      dryRun.planHash,
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    const result = JSON.parse(stdout);
    expect(result.mode).toBe('apply');
    expect(result.audit.status).toBe('success');
    expect(result.backupPath).toContain('backups');
    expect(existsSync(result.backupPath)).toBe(true);
    expect(readFileSync(join(tempDir, '.specify', 'configurations', 'workspace-layout', 'backups', '.gitignore'), 'utf-8')).toBe('*\n');
    expect(existsSync(result.reportPath)).toBe(true);
    expect(result.reportPath).toContain('workspace-layout');

    const written = JSON.parse(readFileSync(configPath(), 'utf-8'));
    expect(written.pluginOwned).toEqual({ untouched: true });
    expect(written.metadata).toEqual({ local: 'keep-me' });
    expect(written.architecture.type).toBe('modular-monolith');
    expect(written.subWorkspaces.map((entry: { name: string }) => entry.name)).toEqual(['app', 'legacy']);
    expect(written.subWorkspaces.find((entry: { name: string }) => entry.name === 'legacy').pluginField).toBe('keep-subfield');
    const mode = (statSync(configPath()).mode & 0o777).toString(8);
    expect(mode).toBe(process.platform === 'win32' ? '666' : '600');
  });

  it('rejects stale --expect-hash after raw config changes', async () => {
    writeJson(configPath(), { name: 'demo', metadata: { note: 'previewed' } });
    writeJson(layoutPath(), { subWorkspaces: [{ name: 'app', path: 'apps/app' }] });
    const dryRun = JSON.parse((await runCli(['--topology', layoutPath()])).stdout);
    writeJson(configPath(), { name: 'demo', metadata: { note: 'changed' } });
    const beforeApply = readFileSync(configPath(), 'utf-8');

    const { stderr, exitCode } = await runCli([
      '--topology',
      layoutPath(),
      '--yes',
      '--expect-hash',
      dryRun.planHash,
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('Stale topology apply preview');
    expect(readFileSync(configPath(), 'utf-8')).toBe(beforeApply);
  });

  it('marks external topology dry-runs as not apply-eligible and rejects apply', async () => {
    writeJson(configPath(), { name: 'demo' });
    const externalTopology = join(tempDir, 'external-topology.json');
    writeJson(externalTopology, { subWorkspaces: [{ name: 'app', path: 'apps/app' }] });
    const dryRun = JSON.parse((await runCli(['--topology', externalTopology])).stdout);

    expect(dryRun.applyEligible).toBe(false);

    const { stderr, exitCode } = await runCli([
      '--topology',
      externalTopology,
      '--yes',
      '--expect-hash',
      dryRun.planHash,
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('External layout/topology dry-runs are not apply-eligible');
  });

  it('allows external topology dry-run when default layout and topology directories are missing', async () => {
    rmSync(join(tempDir, '.specify', 'configurations'), { recursive: true, force: true });
    writeJson(configPath(), { name: 'demo' });
    const externalTopology = join(tempDir, 'external-topology.json');
    writeJson(externalTopology, { subWorkspaces: [{ name: 'app', path: 'apps/app' }] });

    const { stdout, stderr, exitCode } = await runCli(['--topology', externalTopology]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout).applyEligible).toBe(false);
  });

  it('rejects YAML-only config and symlinked JSON config before parsing', async () => {
    writeFileSync(join(tempDir, '.specify', '.specify.yaml'), 'name: demo\n');
    writeJson(topologyPath(), { subWorkspaces: [] });
    const yamlResult = await runCli(['--topology', topologyPath()]);
    expect(yamlResult.exitCode).toBe(1);
    expect(yamlResult.stderr).toContain('YAML config is not applyable');

    rmSync(join(tempDir, '.specify', '.specify.yaml'), { force: true });
    writeJson(join(tempDir, 'outside.json'), { name: 'outside' });
    symlinkSync(join(tempDir, 'outside.json'), configPath());
    const symlinkResult = await runCli(['--topology', topologyPath()]);
    expect(symlinkResult.exitCode).toBe(1);
    expect(symlinkResult.stderr).toContain('must not be a symlink');
  });

  it('requires --accept-overwrites for same-name, architecture, and path-collision findings', async () => {
    writeJson(configPath(), {
      name: 'demo',
      architecture: { type: 'monolith' },
      subWorkspaces: [
        { name: 'api', path: 'services/api' },
        { name: 'admin', path: 'apps/shared' },
      ],
    });
    writeJson(topologyPath(), {
      architecture: { type: 'modular-monolith' },
      subWorkspaces: [
        { name: 'api', path: 'services/api-v2' },
        { name: 'web', path: 'apps/shared' },
      ],
    });
    const dryRun = JSON.parse((await runCli(['--topology', topologyPath()])).stdout);

    expect(dryRun.requiresConfirmation).toBe(true);
    expect(JSON.stringify(dryRun.confirmationFindings)).toContain('architecture.type');
    expect(JSON.stringify(dryRun.confirmationFindings)).toContain('pathCollision');

    const rejected = await runCli(['--topology', topologyPath(), '--yes', '--expect-hash', dryRun.planHash]);
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stderr).toContain('--accept-overwrites is required');

    const accepted = await runCli([
      '--topology',
      topologyPath(),
      '--yes',
      '--expect-hash',
      dryRun.planHash,
      '--accept-overwrites',
    ]);
    expect(accepted.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(configPath(), 'utf-8')).architecture.type).toBe('modular-monolith');
  });

  it('formats a deterministic patch preview', () => {
    const diff = formatTopologyDiff(
      { name: 'demo', subWorkspaces: [] },
      { name: 'demo', subWorkspaces: [{ name: 'app', path: 'apps/app' }] },
    );

    expect(diff).toContain('--- .specify/.specify.json (current)');
    expect(diff).toContain('+++ .specify/.specify.json (dry-run)');
    expect(diff).toContain('"subWorkspaces"');
    expect(diff).toContain('"path": "apps/app"');
  });
});

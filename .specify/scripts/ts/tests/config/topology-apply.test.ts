import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
          docs: { path: 'docs/app' },
          testMapping: { strategy: 'mirror' },
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
      docs: { path: 'docs/app' },
      testMapping: { strategy: 'mirror' },
      modules: [{ name: 'api', path: 'src/api' }],
      hasModules: true,
    });
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
          docs: { path: 'docs/api-v2' },
          modules: [{ name: 'http', path: 'src/http' }],
        },
      ],
    });

    const result = deriveSpecifyConfig(
      {
        name: 'brownfield',
        subWorkspaces: [
          { name: 'api', path: 'services/api', docs: { path: 'docs/api' } },
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
      { name: 'api', fields: ['path', 'docs', 'modules'] },
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

  it('runs the CLI dry-run without writing .specify/.specify.json', async () => {
    writeJson(configPath(), {
      name: 'demo',
      subWorkspaces: [{ name: 'legacy', path: 'legacy' }],
    });
    writeJson(topologyPath(), {
      subWorkspaces: [{ name: 'app', path: 'apps/app' }],
    });
    const before = readFileSync(configPath(), 'utf-8');
    const indexPath = resolve(import.meta.dir, '../../src/index.ts');

    const proc = Bun.spawn(
      ['bun', 'run', indexPath, 'config', 'topology', 'apply', '--topology', topologyPath()],
      { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' },
    );
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(readFileSync(configPath(), 'utf-8')).toBe(before);

    const output = JSON.parse(stdout);
    expect(output.mode).toBe('dry-run');
    expect(output.configPath).toBe(configPath());
    expect(output.topologyPath).toBe(topologyPath());
    expect(output.requiresConfirmation).toBe(false);
    expect(output.changes.after.subWorkspaces.map((entry: { name: string }) => entry.name)).toEqual([
      'app',
      'legacy',
    ]);
    expect(output.diff).toContain('"name": "app"');
  });

  it('rejects --yes in slice 1 and leaves config unchanged', async () => {
    writeJson(configPath(), { name: 'demo' });
    writeJson(topologyPath(), { subWorkspaces: [{ name: 'app', path: 'apps/app' }] });
    const before = readFileSync(configPath(), 'utf-8');
    const indexPath = resolve(import.meta.dir, '../../src/index.ts');

    const proc = Bun.spawn(
      ['bun', 'run', indexPath, 'config', 'topology', 'apply', '--topology', topologyPath(), '--yes'],
      { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' },
    );
    await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('unknown option');
    expect(readFileSync(configPath(), 'utf-8')).toBe(before);
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

// Decision table for artifact-host resolution (phase 02, rows E1-E8).
//
// Every spawn sets `cwd` explicitly. Nothing here may depend on where `bun test` was invoked from,
// because the ladder branch that fires is a function of cwd — a test that inherits the runner's cwd
// silently changes which row it is actually exercising.
//
// Each row asserts the three things that must agree, not just the helper's return value:
//   - getRepoRoot()
//   - detectConfig(...).workspaceRoot
//   - where setup-plan physically writes
// Rows 5-7 resolve to a directory with no config at all. detectConfig answers `configFound: false`
// with `workspaceRoot: ''` there and is right to; those rows use the no-config oracle instead of
// demanding three equal strings.

import { afterAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  API_BRANCH,
  HOST_BRANCH,
  cleanupPolyrepoFixtures,
  createConfiglessDir,
  createPolyrepo,
  makeRepo,
  writeWorkspaceConfig,
} from './fixtures/polyrepo';

const PROBE = resolve(import.meta.dir, 'fixtures/resolve-probe.ts');
const PROBE_TWICE = resolve(import.meta.dir, 'fixtures/resolve-probe-twice.ts');
const SETUP_PLAN = resolve(import.meta.dir, '../src/commands/util/setup-plan.ts');
const STATUS = resolve(import.meta.dir, '../src/commands/feature/status.ts');

afterAll(cleanupPolyrepoFixtures);

interface ProbeResult {
  cwd: string;
  repoRoot: string;
  configFile: string | null;
  configFound: boolean;
  workspaceRoot: string;
  workspaceName: string;
  targetSubWorkspace: string | null;
  targetModule: string | null;
  defaultFolder: string;
  specsRoot: string;
  gitToplevel: string | null;
}

/** Child environment with CLAUDE_PROJECT_DIR either set or genuinely absent. */
function probeEnv(env: string | null, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...process.env, ...extra };
  if (env === null) delete result['CLAUDE_PROJECT_DIR'];
  else result['CLAUDE_PROJECT_DIR'] = env;
  return result;
}

function probe(cwd: string, env: string | null, extra: Record<string, string> = {}): ProbeResult {
  const out = execFileSync('bun', [PROBE], {
    cwd, env: probeEnv(env, extra), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out) as ProbeResult;
}

/**
 * Run setup-plan for `taskId` and return the directory it actually created.
 * This is the write-path half of each row: returning the right root but writing elsewhere is
 * exactly the failure the phase exists to remove.
 */
function setupPlanDir(cwd: string, env: string | null, taskId: string): string {
  const out = execFileSync('bun', [SETUP_PLAN, taskId, '--json'], {
    cwd, env: probeEnv(env), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return realpathSync.native(JSON.parse(out)['featureDir'] as string);
}

/** Assert getRepoRoot, detectConfig().workspaceRoot and the write path all name `expected`. */
function expectAllThree(result: ProbeResult, writtenDir: string, expected: string, taskId: string): void {
  expect(result.repoRoot).toBe(expected);
  expect(realpathSync.native(result.workspaceRoot)).toBe(expected);
  expect(writtenDir).toBe(realpathSync.native(join(expected, result.specsRoot, result.defaultFolder, taskId)));
}

describe('artifact host resolution matrix', () => {
  it('row 1 (E4): cwd is a host, env is an ancestor with no config -> the host', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-r1-' });
    const result = probe(fx.host, fx.container);

    expect(result.repoRoot).toBe(fx.host);
    expectAllThree(result, setupPlanDir(fx.host, fx.container, 'feature/row-001'), fx.host, 'row-001');
  });

  it('row 2 (E1): cwd is a directory under the host, env points at the same place -> the host', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-r2-' });
    const deep = join(fx.host, 'tools/scripts');
    mkdirSync(deep, { recursive: true });

    const result = probe(deep, deep);

    expect(result.repoRoot).toBe(fx.host);
    expectAllThree(result, setupPlanDir(deep, deep, 'feature/row-002'), fx.host, 'row-002');
  });

  it('row 3 (E5): cwd is a sub-workspace with its own child config, env unset -> the host, not the child', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-r3-', childConfig: true });

    const result = probe(fx.apiRoot, null);

    expect(result.repoRoot).toBe(fx.host);
    expect(result.workspaceName).toBe('polyrepo-workspace');
    expectAllThree(result, setupPlanDir(fx.apiRoot, null, 'feature/row-003'), fx.host, 'row-003');
  });

  it('row 4 (E2c): cwd inside one host, env a separate tree that has a config -> the env host', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-r4a-' });
    const other = createPolyrepo({ prefix: 'tdk-root-r4b-' });

    const result = probe(fx.host, other.host);

    expect(result.repoRoot).toBe(other.host);
    expectAllThree(result, setupPlanDir(fx.host, other.host, 'feature/row-004'), other.host, 'row-004');
  });

  it('row 5 (E3): cwd inside a host, env a separate tree with no config -> the raw env path', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-r5-' });
    const bare = createConfiglessDir('tdk-root-r5-bare-');

    const result = probe(fx.host, bare);

    // No-config oracle: the root is the env path, and every config-shaped answer says "nothing here".
    expect(result.repoRoot).toBe(bare);
    expect(result.configFound).toBe(false);
    expect(result.workspaceRoot).toBe('');
    expect(result.configFile).toBeNull();
    expect(result.defaultFolder).toBe('feature');
    expect(setupPlanDir(fx.host, bare, 'feature/row-005')).toBe(join(bare, '.specify/feature/row-005'));
  });

  it('row 6 (E7): cwd has no config, env is an outside ancestor with no config -> the raw env path', () => {
    const bare = createConfiglessDir('tdk-root-r6-');
    const leaf = join(bare, 'nested/leaf');

    const result = probe(leaf, bare);

    expect(result.repoRoot).toBe(bare);
    expect(result.configFound).toBe(false);
    expect(result.workspaceRoot).toBe('');
    expect(result.configFile).toBeNull();
    expect(setupPlanDir(leaf, bare, 'feature/row-006')).toBe(join(bare, '.specify/feature/row-006'));
  });

  it('row 7 (E8): no config and no env -> git toplevel resolved at cwd, else cwd', () => {
    const bare = createConfiglessDir('tdk-root-r7-');
    const repo = join(bare, 'repo');
    makeRepo(repo, 'row-seven');
    const inner = join(repo, 'src/deep');
    mkdirSync(inner, { recursive: true });

    const result = probe(inner, null);

    // The git fallback must be anchored at cwd: unanchored it answered for whatever repository
    // the parent process happened to be sitting in.
    expect(result.repoRoot).toBe(repo);
    expect(result.configFound).toBe(false);
    expect(result.workspaceRoot).toBe('');
    expect(setupPlanDir(inner, null, 'feature/row-007')).toBe(join(repo, '.specify/feature/row-007'));
  });

  it('row 8: two unrelated projects each resolve their own specs.defaultFolder', () => {
    const alpha = createPolyrepo({
      prefix: 'tdk-root-r8a-',
      configOverrides: { name: 'alpha', specs: { root: '.specify', defaultFolder: 'alpha-specs' } },
    });
    const beta = createPolyrepo({
      prefix: 'tdk-root-r8b-',
      configOverrides: { name: 'beta', specs: { root: '.specify', defaultFolder: 'beta-specs' } },
    });

    const a = probe(alpha.host, alpha.host);
    const b = probe(beta.host, beta.host);

    expect(a.workspaceName).toBe('alpha');
    expect(a.defaultFolder).toBe('alpha-specs');
    expect(b.workspaceName).toBe('beta');
    expect(b.defaultFolder).toBe('beta-specs');
    expect(setupPlanDir(alpha.host, alpha.host, 'row-008'))
      .toBe(join(alpha.host, '.specify/alpha-specs/row-008'));
    expect(setupPlanDir(beta.host, beta.host, 'row-008'))
      .toBe(join(beta.host, '.specify/beta-specs/row-008'));
  });

  it('row 9 (E2a): cwd in a nested host, env the outer host -> the innermost host', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-r9-', nestedHost: true });
    const inner = fx.nestedHost as string;

    const result = probe(inner, fx.host);

    // Collapsing E2a/E2b/E2c into "the env host always wins" returns fx.host here and breaks the
    // host-inside-host requirement.
    expect(result.repoRoot).toBe(inner);
    expectAllThree(result, setupPlanDir(inner, fx.host, 'feature/row-009'), inner, 'row-009');
  });

  it('row 10 (E2b): cwd in the outer host, env the nested host -> the innermost host', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-r10-', nestedHost: true });
    const inner = fx.nestedHost as string;

    const result = probe(fx.host, inner);

    expect(result.repoRoot).toBe(inner);
    expectAllThree(result, setupPlanDir(fx.host, inner, 'feature/row-010'), inner, 'row-010');
  });

  it('row 11 (E2c): env host and cwd host are resolved independently, not through one cache slot', () => {
    const a = createPolyrepo({ prefix: 'tdk-root-r11a-', configOverrides: { name: 'host-a' } });
    const b = createPolyrepo({ prefix: 'tdk-root-r11b-', configOverrides: { name: 'host-b' } });

    const result = probe(a.host, b.host);

    // Keying the hostOf cache on (cwd, env) instead of on dir makes the second lookup read back
    // the first one's answer, and this row reports host-a.
    expect(result.repoRoot).toBe(b.host);
    expect(result.workspaceName).toBe('host-b');
    expect(result.repoRoot).not.toBe(a.host);
    expectAllThree(result, setupPlanDir(a.host, b.host, 'feature/row-011'), b.host, 'row-011');
  });

  it('row 12: a config created mid-process changes the answer, with cwd and env unchanged', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-r12-' });
    const inner = join(fx.host, 'inner');
    mkdirSync(inner, { recursive: true });

    const out = execFileSync('bun', [PROBE_TWICE], {
      cwd: inner,
      env: probeEnv(null, { PROBE_CREATE_CONFIG_AT: inner }),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const { first, second } = JSON.parse(out) as { first: string; second: string };

    expect(first).toBe(fx.host);
    // Same cwd, same env, different filesystem: a process-lifetime cache answers fx.host twice.
    expect(second).toBe(inner);
  });

  it('row 13: cwd inside a sub-workspace still autodetects that sub-workspace', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-r13-' });
    const deep = join(fx.apiRoot, 'src');
    mkdirSync(deep, { recursive: true });

    const result = probe(deep, fx.host);

    // detectConfig({ cwd: root }) resolves the same root but loses this: the target goes null and
    // output falls back to the workspace docs root.
    expect(result.repoRoot).toBe(fx.host);
    expect(result.targetSubWorkspace).toBe('api');
    expectAllThree(result, setupPlanDir(deep, fx.host, 'feature/row-013'), fx.host, 'row-013');
  });

  it('row 14: cwd inside a module still autodetects that module', () => {
    const fx = createPolyrepo({
      prefix: 'tdk-root-r14-',
      configOverrides: {
        subWorkspaces: [{ name: 'api', path: 'apps/api', modules: [{ name: 'core', path: 'core' }] }],
      },
    });
    const moduleDir = join(fx.apiRoot, 'core/lib');
    mkdirSync(moduleDir, { recursive: true });

    const result = probe(moduleDir, fx.host);

    expect(result.repoRoot).toBe(fx.host);
    expect(result.targetSubWorkspace).toBe('api');
    expect(result.targetModule).toBe('core');
    expectAllThree(result, setupPlanDir(moduleDir, fx.host, 'feature/row-014'), fx.host, 'row-014');
  });

  it('row 15: GIT_DIR and GIT_WORK_TREE in the environment do not redirect any git command', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-r15-' });
    const foreign = createConfiglessDir('tdk-root-r15-foreign-');
    const foreignRepo = join(foreign, 'other');
    makeRepo(foreignRepo, 'foreign-branch');

    const poisoned = {
      GIT_DIR: join(foreignRepo, '.git'),
      GIT_WORK_TREE: foreignRepo,
    };

    const result = probe(fx.host, fx.host, poisoned);

    // `-C`/`cwd` anchor the working directory only; without sanitizing the environment these two
    // variables make git answer for foreignRepo from inside the host.
    expect(result.repoRoot).toBe(fx.host);
    expect(result.gitToplevel).toBe(fx.host);

    // Same guarantee through the status collector, which probes the host and each sub-workspace.
    writeFeature(fx.host, 'row-015');
    const status = JSON.parse(execFileSync('bun', [STATUS, 'row-015'], {
      cwd: fx.host, env: probeEnv(fx.host, poisoned), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    })) as Record<string, any>;

    expect(status['git']['branch']).toBe(HOST_BRANCH);
    expect(status['subWorkspaces'][0]['actualBranch']).toBe(API_BRANCH);
  });
});

describe('write-path containment', () => {
  it('rejects a task ID that traverses out of the specs root', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-trav-' });

    expect(() => execFileSync('bun', [SETUP_PLAN, 'feature/../../escaped', '--json'], {
      cwd: fx.host, env: probeEnv(fx.host), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    })).toThrow();

    expect(existsSync(join(fx.container, 'escaped'))).toBe(false);
  });

  it('rejects a destination whose physical path leaves the host through a symlinked specs dir', () => {
    const fx = createPolyrepo({ prefix: 'tdk-root-symlink-' });
    const outside = join(fx.container, 'outside');
    mkdirSync(outside, { recursive: true });

    // `<host>/.specify/specs -> <container>/outside`: every lexical check still says "inside the
    // host", while mkdir and copyFile land in `outside`.
    writeWorkspaceConfig(fx.host, {
      name: 'polyrepo-workspace',
      specs: { root: '.specify/specs', defaultFolder: 'feature' },
      subWorkspaces: [{ name: 'api', path: 'apps/api' }],
    });
    execFileSync('ln', ['-s', outside, join(fx.host, '.specify/specs')]);

    let failed = false;
    try {
      execFileSync('bun', [SETUP_PLAN, 'feature/escape-001', '--json'], {
        cwd: fx.host, env: probeEnv(fx.host), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch { failed = true; }

    expect(failed).toBe(true);
    expect(existsSync(join(outside, 'feature/escape-001'))).toBe(false);
  });
});

/** Minimal spec + plan so the status collector has a feature to report on. */
function writeFeature(host: string, ticket: string): void {
  const dir = join(host, '.specify/feature', ticket);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'spec.md'), `---\nfeature_branch: feature/${ticket}\n---\n\n# ${ticket}\n`);
  writeFileSync(join(dir, 'plan.md'), [
    '# Plan', '', '## Phases', '',
    '| Phase | Title | Status | Priority | Dependencies |',
    '|---|---|---|---|---|',
    '| 01 | [S](phase-01-s.md) | todo | P1 | — |', '',
  ].join('\n'));
}

describe('branch reporting is anchored to the artifact host (AC2)', () => {
  it('reports the host branch from every cwd, with the env pointing at an outer directory', () => {
    // Mirrors the real defect: CLAUDE_PROJECT_DIR is the builder root (no .specify config of its
    // own, on a different branch), while the artifact host lives further down. The fixture host
    // is on HOST_BRANCH, which is neither the builder root's branch nor `main`, so a probe that
    // answers for the enclosing repository is visibly wrong instead of accidentally right.
    const fx = createPolyrepo({ prefix: 'tdk-root-ac2-' });
    writeFeature(fx.host, 'ac2-001');

    const deep = join(fx.host, 'tools/scripts');
    mkdirSync(deep, { recursive: true });

    for (const cwd of [fx.host, deep, fx.apiRoot]) {
      const status = JSON.parse(execFileSync('bun', [STATUS, 'ac2-001'], {
        cwd, env: probeEnv(fx.container), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      })) as Record<string, any>;

      expect(status['git']['branch']).toBe(HOST_BRANCH);
      expect(status['git']['rootBranch']).toBe(HOST_BRANCH);
      expect(status['subWorkspaces'][0]['actualBranch']).toBe(API_BRANCH);
    }
  });
});

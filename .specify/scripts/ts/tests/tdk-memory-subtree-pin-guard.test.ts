import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  checkMemorySubtreePin,
  formatMemorySubtreeGuardResult,
  type MemorySubtreeDiagnosticKind,
  type MemorySubtreeGuardResult,
} from '../src/commands/util/check-memory-subtree';

const TDK_ROOT = resolve(import.meta.dir, '../../../..');
const GUARD_CLI = join(TDK_ROOT, '.specify', 'scripts', 'ts', 'src', 'commands', 'util', 'check-memory-subtree.ts');
const UPSTREAM_REPOSITORY = 'https://github.com/vinhltt/tdk-memory';
const PLUGIN_RELATIVE_PATH = join('.specify', 'plugins', 'tdk-memory');
const PIN_RELATIVE_PATH = join('.specify', 'plugins', 'tdk-memory.upstream-pin');
const RELEASE_MANIFEST_RELATIVE_PATH = join('.specify', 'release-manifest.json');

interface Fixture {
  container: string;
  root: string;
  plugin: string;
  commit: string;
}

const fixtureContainers: string[] = [];

function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function writeFile(root: string, relativePath: string, contents: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function commit(root: string, message: string): void {
  git(root, ['-c', 'user.email=tdk-memory-test@example.test', '-c', 'user.name=TDK Memory Test', 'commit', '-qm', message]);
}

function writePluginTree(root: string): void {
  writeFile(root, 'README.md', '# tdk-memory fixture\n');
  writeFile(root, '.gitignore', 'node_modules/\n');
  writeFile(root, 'bin/check.mjs', 'console.log("fixture");\n');
  chmodSync(join(root, 'bin', 'check.mjs'), 0o755);
  writeFile(root, 'tests/query/fixtures/query.json', '{"query":"memory"}\n');
  writeFile(root, 'node_modules/tracked.js', 'tracked fixture dependency\n');
  symlinkSync('README.md', join(root, 'README-link.md'));
}

function writePin(root: string, contents: string): void {
  writeFile(root, PIN_RELATIVE_PATH, contents);
}

function writeReleaseManifest(root: string, files: Record<string, unknown> = {}): void {
  writeFile(root, RELEASE_MANIFEST_RELATIVE_PATH, `${JSON.stringify({ schemaVersion: 1, files }, null, 2)}\n`);
}

function makeFixture(): Fixture {
  const container = mkdtempSync(join(tmpdir(), 'tdk-memory-subtree-'));
  fixtureContainers.push(container);
  const upstream = join(container, 'upstream');
  const root = join(container, 'tdk');
  mkdirSync(upstream, { recursive: true });
  mkdirSync(root, { recursive: true });

  git(upstream, ['init', '-q']);
  writePluginTree(upstream);
  git(upstream, ['add', '-A']);
  git(upstream, ['add', '-f', 'node_modules/tracked.js']);
  commit(upstream, 'upstream fixture');
  const upstreamCommit = git(upstream, ['rev-parse', 'HEAD']);

  git(root, ['init', '-q']);
  writeFile(root, '.gitignore', '**/node_modules/\n');
  const plugin = join(root, PLUGIN_RELATIVE_PATH);
  writePluginTree(plugin);
  writePin(root, `repo: ${UPSTREAM_REPOSITORY}\ncommit: ${upstreamCommit}\n`);
  writeReleaseManifest(root);
  git(root, ['add', '-A']);
  git(root, ['add', '-f', `${PLUGIN_RELATIVE_PATH.replaceAll('\\', '/')}/node_modules/tracked.js`]);
  commit(root, 'tdk fixture');

  // The real guard only needs the object locally. Fetching from this local fixture emulates the
  // subtree workflow without permitting an external network request.
  git(root, ['fetch', '-q', upstream, upstreamCommit]);
  return { container, root, plugin, commit: upstreamCommit };
}

function diagnosticPaths(result: MemorySubtreeGuardResult, kind: MemorySubtreeDiagnosticKind): string[] {
  return result.diagnostics.filter((diagnostic) => diagnostic.kind === kind).flatMap((diagnostic) => diagnostic.path ? [diagnostic.path] : []);
}

afterEach(() => {
  for (const container of fixtureContainers.splice(0)) rmSync(container, { recursive: true, force: true });
});

describe('tdk-memory pinned subtree guard', () => {
  test('accepts a matching upstream tree, including tests, symlinks, and ignored untracked dependencies', () => {
    const fixture = makeFixture();
    writeFile(fixture.plugin, 'node_modules/transient.js', 'ignore this untracked maintainer dependency\n');

    const result = checkMemorySubtreePin({ projectRoot: fixture.root });

    expect(result.ok, formatMemorySubtreeGuardResult(result)).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  test('reports changed bytes in a tracked path even when repository ignore rules match its directory', () => {
    const fixture = makeFixture();
    writeFile(fixture.plugin, 'node_modules/tracked.js', 'changed tracked dependency\n');

    const result = checkMemorySubtreePin({ projectRoot: fixture.root });

    expect(result.ok).toBe(false);
    expect(diagnosticPaths(result, 'changed')).toContain('node_modules/tracked.js');
  });

  test('reports executable mode drift', () => {
    const fixture = makeFixture();
    chmodSync(join(fixture.plugin, 'README.md'), 0o755);

    const result = checkMemorySubtreePin({ projectRoot: fixture.root });

    expect(result.ok).toBe(false);
    expect(diagnosticPaths(result, 'mode')).toContain('README.md');
  });

  test('reports missing and extra physical paths', () => {
    const fixture = makeFixture();
    rmSync(join(fixture.plugin, 'README.md'));
    writeFile(fixture.plugin, 'UNTRACKED-DISTRIBUTABLE.md', 'this file would be distributed\n');

    const result = checkMemorySubtreePin({ projectRoot: fixture.root });

    expect(result.ok).toBe(false);
    expect(diagnosticPaths(result, 'missing')).toContain('README.md');
    expect(diagnosticPaths(result, 'extra')).toContain('UNTRACKED-DISTRIBUTABLE.md');
  });

  test('fails with an exact fetch command when the pinned commit is absent', () => {
    const fixture = makeFixture();
    const unavailableCommit = 'a'.repeat(40);
    writePin(fixture.root, `repo: ${UPSTREAM_REPOSITORY}\ncommit: ${unavailableCommit}\n`);

    const result = checkMemorySubtreePin({ projectRoot: fixture.root });
    const diagnostic = result.diagnostics.find((entry) => entry.kind === 'missing-object');

    expect(result.ok).toBe(false);
    expect(diagnostic?.message).toContain(`git -C '${fixture.root}' fetch ${UPSTREAM_REPOSITORY} ${unavailableCommit}`);
  });

  test('rejects a self-declared tree hash instead of letting it approve changed bytes', () => {
    const fixture = makeFixture();
    writeFile(fixture.plugin, 'README.md', 'changed but not upstream\n');
    writePin(fixture.root, [
      `repo: ${UPSTREAM_REPOSITORY}`,
      `commit: ${fixture.commit}`,
      'tree-sha256: attacker-controlled-value',
      '',
    ].join('\n'));

    const result = checkMemorySubtreePin({ projectRoot: fixture.root });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.kind)).toContain('pin');
  });

  test('rejects Git metadata, logs, and plugin tests in the release payload map', () => {
    const fixture = makeFixture();
    writeReleaseManifest(fixture.root, {
      '.specify/plugins/tdk-memory/.git/config': {},
      '.specify/plugins/tdk-memory/.logs/guard.log': {},
      '.specify/plugins/tdk-memory/tests/query/fixture.test.mjs': {},
    });

    const result = checkMemorySubtreePin({ projectRoot: fixture.root });

    expect(result.ok).toBe(false);
    expect(diagnosticPaths(result, 'release-manifest')).toEqual([
      '.specify/plugins/tdk-memory/.git/config',
      '.specify/plugins/tdk-memory/.logs/guard.log',
      '.specify/plugins/tdk-memory/tests/query/fixture.test.mjs',
    ]);
  });

  test('returns a nonzero status from the real CLI when the working tree drifts', () => {
    const fixture = makeFixture();
    writeFile(fixture.plugin, 'UNTRACKED-DISTRIBUTABLE.md', 'this file would be distributed\n');

    const run = Bun.spawnSync({
      cmd: ['bun', GUARD_CLI, '--project-root', fixture.root],
      cwd: fixture.root,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(run.exitCode).not.toBe(0);
    expect(run.stderr.toString()).toContain('EXTRA [UNTRACKED-DISTRIBUTABLE.md]');
  });

  test('guards the actual nested TDK checkout after its upstream pin is published', () => {
    const result = checkMemorySubtreePin({ projectRoot: TDK_ROOT });

    expect(result.ok, formatMemorySubtreeGuardResult(result)).toBe(true);
  });
});

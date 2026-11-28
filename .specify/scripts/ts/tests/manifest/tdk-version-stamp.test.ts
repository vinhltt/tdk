// resolveTdkVersion precedence and the tdk_version stamp written by manifest compute.

import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveTdkVersion } from '../../src/commands/manifest/resolve-tdk-version';

const manifestCliPath = path.resolve('src/commands/manifest/compute.ts');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-version-stamp-'));
  roots.push(root);
  return root;
}

function writeJson(root: string, rel: string, data: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
}

function marketplace(version: unknown): unknown {
  return { metadata: { version } };
}

function addPlugin(root: string, tree: 'plugins' | 'codex-plugins'): void {
  const dir = tree === 'plugins' ? '.claude-plugin' : '.codex-plugin';
  writeJson(root, `.specify/${tree}/tdk-core/${dir}/plugin.json`, { name: 'tdk-core', version: '1.0.0' });
  writeJson(root, `.specify/${tree}/tdk-core/skills/tdk-demo/SKILL.md`, '# tdk-demo\n');
}

function compute(root: string, flag: '--write' | '--check') {
  return Bun.spawnSync({
    cmd: ['bun', manifestCliPath, '--project-root', root, flag],
    cwd: root, stdout: 'pipe', stderr: 'pipe',
  });
}

function readManifest(root: string, tree: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(root, '.specify', tree, 'manifest.json'), 'utf-8')) as Record<string, unknown>;
}

describe('resolveTdkVersion', () => {
  test('takes the marketplace version in a TDK source tree', () => {
    const root = makeRoot();
    writeJson(root, 'distribute.json', { ship: [], doNotShip: [] });
    writeJson(root, '.claude-plugin/marketplace.json', marketplace('2.3.4'));
    writeJson(root, '.specify/release-manifest.json', { tdkVersion: '9.9.9' });

    expect(resolveTdkVersion(root)).toBe('2.3.4');
  });

  test('takes the release manifest stamp in a consumer tree', () => {
    const root = makeRoot();
    writeJson(root, '.specify/release-manifest.json', { tdkVersion: '1.5.0' });

    expect(resolveTdkVersion(root)).toBe('1.5.0');
  });

  test('ignores a consumer-owned marketplace.json when distribute.json is absent', () => {
    const root = makeRoot();
    writeJson(root, '.claude-plugin/marketplace.json', marketplace('7.7.7'));
    writeJson(root, '.specify/release-manifest.json', { tdkVersion: '1.5.0' });

    expect(resolveTdkVersion(root)).toBe('1.5.0');
  });

  test('returns undefined when neither source exists', () => {
    expect(resolveTdkVersion(makeRoot())).toBeUndefined();
  });

  test('falls through from an invalid marketplace version to the release manifest', () => {
    const root = makeRoot();
    writeJson(root, 'distribute.json', {});
    writeJson(root, '.claude-plugin/marketplace.json', marketplace('latest'));
    writeJson(root, '.specify/release-manifest.json', { tdkVersion: '1.5.0' });

    expect(resolveTdkVersion(root)).toBe('1.5.0');
  });

  test.each([['a number', 5], ['garbage text', 'oops'], ['null', null]])(
    'treats a release manifest tdkVersion that is %s as absent',
    (_label, value) => {
      const root = makeRoot();
      writeJson(root, '.specify/release-manifest.json', { tdkVersion: value });

      expect(resolveTdkVersion(root)).toBeUndefined();
    },
  );

  test('does not throw on malformed JSON in either source', () => {
    const root = makeRoot();
    writeJson(root, 'distribute.json', {});
    writeJson(root, '.claude-plugin/marketplace.json', '{ not json');
    writeJson(root, '.specify/release-manifest.json', '[1,');

    expect(resolveTdkVersion(root)).toBeUndefined();
  });
});

describe('manifest compute tdk_version stamp', () => {
  test('writes tdk_version between algorithm and generated_at in both manifests', () => {
    const root = makeRoot();
    writeJson(root, 'distribute.json', {});
    writeJson(root, '.claude-plugin/marketplace.json', marketplace('3.1.4'));
    addPlugin(root, 'plugins');
    addPlugin(root, 'codex-plugins');

    const result = compute(root, '--write');
    expect(result.exitCode, result.stderr.toString()).toBe(0);

    for (const tree of ['plugins', 'codex-plugins']) {
      const manifest = readManifest(root, tree);
      expect(manifest['tdk_version']).toBe('3.1.4');
      expect(Object.keys(manifest)).toEqual(['algorithm', 'tdk_version', 'generated_at', 'plugins']);
    }
  });

  test('omits tdk_version when no version can be resolved', () => {
    const root = makeRoot();
    addPlugin(root, 'plugins');

    expect(compute(root, '--write').exitCode).toBe(0);

    expect(Object.keys(readManifest(root, 'plugins'))).toEqual(['algorithm', 'generated_at', 'plugins']);
  });

  test('--check stays clean when only tdk_version differs from the file on disk', () => {
    const root = makeRoot();
    writeJson(root, 'distribute.json', {});
    writeJson(root, '.claude-plugin/marketplace.json', marketplace('3.1.4'));
    addPlugin(root, 'plugins');
    expect(compute(root, '--write').exitCode).toBe(0);

    writeJson(root, '.claude-plugin/marketplace.json', marketplace('3.1.5'));
    const result = compute(root, '--check');

    expect(result.exitCode, result.stdout.toString()).toBe(0);
  });
});

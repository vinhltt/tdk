import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCodexInstallPlan } from '../src/codex-install-plan';
import { buildCodexReconcilePlan } from '../src/convert-reconcile';
import { sha256Buffer } from '../src/checksum';
import { buildClaudeInstallPlan } from '../src/install-plan';
import { applyInstallPlan } from '../src/install-writer';
import { emptyHarnessManifest, loadHarnessManifest, manifestPathFor } from '../src/manifest-store';
import { discoverPluginInventory } from '../src/plugin-discovery';
import type { CodexTargetFile } from '../src/flat-claude-types';
import type { InstallPlan } from '../src/types';
import {
  makeConsumer,
  sha256,
  treeHash,
  writeBasicPlugin,
  writeMultiPluginManifest,
  writePluginDependencyPolicy,
  type FixtureConsumer,
} from './fixtures';

const cliPath = path.resolve(import.meta.dir, '../src/index.ts');
const PAYLOAD = '1.135.0';
const INSTALLER = '1.136.0';

function writeReleaseTdkVersion(consumer: FixtureConsumer, version: string): void {
  const file = path.join(consumer.root, '.specify', 'release-manifest.json');
  const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : { schemaVersion: 1 };
  fs.writeFileSync(file, JSON.stringify({ ...current, tdkVersion: version }, null, 2), 'utf-8');
}

function makeClaudeConsumer(prefix = 'tdk-stamps-'): FixtureConsumer {
  const consumer = makeConsumer(prefix);
  writeBasicPlugin(consumer);
  writePluginDependencyPolicy(consumer, { requiredPlugins: ['tdk-core'], dependencies: {} });
  writeReleaseTdkVersion(consumer, PAYLOAD);
  return consumer;
}

function claudePlan(consumer: FixtureConsumer, installerVersion?: string): InstallPlan {
  const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
  const settingsPath = path.join(consumer.root, '.claude', 'settings.json');
  return buildClaudeInstallPlan({
    consumerRoot: consumer.root,
    selectedPlugins: ['tdk-core'],
    plugins: inventory.plugins,
    previousManifest: loadHarnessManifest(consumer.root),
    settings: fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {},
    installerVersion,
  });
}

function runCli(consumer: FixtureConsumer, args: string[]) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: consumer.scriptsDir, encoding: 'utf-8', input: '', timeout: 20000,
    env: { ...process.env, TDK_CODEX_COMPAT: 'optimistic' },
  });
  if (result.error) throw result.error;
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

function installCli(consumer: FixtureConsumer): void {
  const result = runCli(consumer, ['install', consumer.root, '--harness', 'claude', '--plugins', 'tdk-core', '--yes']);
  expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
}

function legacyPathOf(consumer: FixtureConsumer): string {
  return path.join(consumer.root, '.specify', 'state', 'harness-install.json');
}

function moveStateToLegacy(consumer: FixtureConsumer): void {
  fs.renameSync(manifestPathFor(consumer.root, 'claude'), legacyPathOf(consumer));
}

const infoLines = (stdout: string): string[] => stdout.split('\n').filter((line) => line.startsWith('version (informational):'));

afterEach(() => {
  // spies are restored per test; this keeps a failed assertion from leaking one.
  for (const spy of spies.splice(0)) spy.mockRestore();
});
const spies: Array<{ mockRestore: () => void }> = [];

describe('claude install stamps', () => {
  test('payload version and installer version are recorded independently', async () => {
    const consumer = makeClaudeConsumer();
    await applyInstallPlan(claudePlan(consumer, INSTALLER), { yes: true, interactive: false });
    const state = JSON.parse(fs.readFileSync(manifestPathFor(consumer.root, 'claude'), 'utf-8'));
    expect(state.tdkVersion).toBe(PAYLOAD);
    expect(state.installerVersion).toBe(INSTALLER);
    expect(state.pluginVersions).toEqual({ 'tdk-core': '1.0.0' });
    expect(state.sourceTdkVersion).toBeUndefined();
    expect('sourceTdkVersion' in state).toBe(false);
  });

  test('keys are omitted when the payload version is unknown', async () => {
    const consumer = makeClaudeConsumer();
    fs.rmSync(path.join(consumer.root, '.specify', 'release-manifest.json'));
    await applyInstallPlan(claudePlan(consumer, INSTALLER), { yes: true, interactive: false });
    const state = JSON.parse(fs.readFileSync(manifestPathFor(consumer.root, 'claude'), 'utf-8'));
    expect('tdkVersion' in state).toBe(false);
  });

  test('migration journal records tdkVersion and installerVersion', async () => {
    const consumer = makeClaudeConsumer();
    const plan = claudePlan(consumer, INSTALLER);
    plan.migration = { fromPrefix: 'tdk-', toPrefix: 'sample-' };
    const result = await applyInstallPlan(plan, { yes: true, interactive: false });
    const journal = JSON.parse(fs.readFileSync(result.migrationJournalPath!, 'utf-8'));
    expect(journal.tdkVersion).toBe(PAYLOAD);
    expect(journal.installerVersion).toBe(INSTALLER);
  });
});

describe('state loading', () => {
  test('state without the new fields loads', () => {
    const consumer = makeConsumer('tdk-stamps-old-');
    const file = manifestPathFor(consumer.root, 'claude');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(emptyHarnessManifest('claude')), 'utf-8');
    const loaded = loadHarnessManifest(consumer.root);
    expect(loaded.tdkVersion).toBeUndefined();
    expect(loaded.pluginVersions).toBeUndefined();
  });

  test('malformed new fields are dropped instead of failing the load', () => {
    const consumer = makeConsumer('tdk-stamps-malformed-');
    const file = manifestPathFor(consumer.root, 'claude');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const cases = [
      { tdkVersion: 5, sourceTdkVersion: 'latest', pluginVersions: ['a'] },
      { tdkVersion: {}, sourceTdkVersion: null, pluginVersions: { a: 1 } },
      { pluginVersions: 'tdk-core' },
    ];
    for (const extra of cases) {
      fs.writeFileSync(file, JSON.stringify({ ...emptyHarnessManifest('claude'), ...extra }), 'utf-8');
      const loaded = loadHarnessManifest(consumer.root);
      expect('tdkVersion' in loaded).toBe(false);
      expect('sourceTdkVersion' in loaded).toBe(false);
      expect('pluginVersions' in loaded).toBe(false);
    }
  });

  test('well-formed new fields survive a load', () => {
    const consumer = makeConsumer('tdk-stamps-wellformed-');
    const file = manifestPathFor(consumer.root, 'claude');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      ...emptyHarnessManifest('claude'), tdkVersion: '1.2.3', pluginVersions: { a: '1.0.0' },
    }), 'utf-8');
    const loaded = loadHarnessManifest(consumer.root);
    expect(loaded.tdkVersion).toBe('1.2.3');
    expect(loaded.pluginVersions).toEqual({ a: '1.0.0' });
  });
});

function writeCodexPackage(consumer: FixtureConsumer): void {
  const content = '# demo\n';
  const file = path.join(consumer.root, '.specify', 'codex-plugins', 'tdk-core', 'skills', 'demo', 'SKILL.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
  fs.writeFileSync(path.join(consumer.root, '.specify', 'codex-plugins', 'manifest.json'), JSON.stringify({
    algorithm: 'sha256',
    generated_at: '2026-06-15T00:00:00Z',
    plugins: { 'tdk-core': { version: '1.0.0', files: { 'skills/demo/SKILL.md': sha256(content) } } },
  }), 'utf-8');
  writeMultiPluginManifest(consumer, { 'tdk-core': { version: '1.0.0', files: {} } });
}

function convertedFile(consumer: FixtureConsumer): CodexTargetFile {
  const sourcePath = path.join(consumer.root, '.claude', 'source.txt');
  fs.writeFileSync(sourcePath, 'source', 'utf-8');
  const content = Buffer.from('generated', 'utf-8');
  return {
    sourcePath,
    sourceRelativePath: '.claude/source.txt',
    targetRelativePath: '.codex/agents/reviewer.toml',
    sourceChecksum: sha256Buffer(Buffer.from('source')),
    installedChecksum: sha256Buffer(content),
    content,
  };
}

async function installCodex(consumer: FixtureConsumer): Promise<void> {
  const plan = buildCodexInstallPlan({
    consumerRoot: consumer.root,
    selectedPlugins: ['tdk-core'],
    previousManifest: loadHarnessManifest(consumer.root, 'codex'),
    sourcePrefix: 'tdk-',
    targetPrefix: 'tdk-',
    installerVersion: INSTALLER,
  });
  await applyInstallPlan(plan, { yes: true, interactive: false });
}

async function convertCodex(consumer: FixtureConsumer): Promise<void> {
  const plan = buildCodexReconcilePlan({
    consumerRoot: consumer.root,
    desiredFiles: [convertedFile(consumer)],
    previousManifest: loadHarnessManifest(consumer.root, 'codex'),
    migrationReport: { recognized: [], reported: [], skipped: [], warnings: [] },
    installerVersion: INSTALLER,
  });
  await applyInstallPlan(plan.installPlan, { yes: true, interactive: false });
}

function writeClaudeState(consumer: FixtureConsumer, tdkVersion: string): void {
  const file = manifestPathFor(consumer.root, 'claude');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...emptyHarnessManifest('claude'), tdkVersion }), 'utf-8');
}

describe('codex.json has two owners', () => {
  function expectAllStamps(consumer: FixtureConsumer): void {
    const state = loadHarnessManifest(consumer.root, 'codex');
    expect(state.tdkVersion).toBe(PAYLOAD);
    expect(state.pluginVersions).toEqual({ 'tdk-core': '1.0.0' });
    expect(state.sourceTdkVersion).toBe('1.134.0');
    expect(state.installerVersion).toBe(INSTALLER);
    expect(Object.keys(state.pluginVersions ?? {})).not.toContain('convert-flat');
  }

  function codexConsumer(): FixtureConsumer {
    const consumer = makeConsumer('tdk-stamps-codex-');
    writeCodexPackage(consumer);
    writeReleaseTdkVersion(consumer, PAYLOAD);
    writeClaudeState(consumer, '1.134.0');
    return consumer;
  }

  test('install then convert-flat keeps the install fields', async () => {
    const consumer = codexConsumer();
    await installCodex(consumer);
    await convertCodex(consumer);
    expectAllStamps(consumer);
  });

  test('convert-flat then install keeps the converted source version', async () => {
    const consumer = codexConsumer();
    await convertCodex(consumer);
    expect(loadHarnessManifest(consumer.root, 'codex').sourceTdkVersion).toBe('1.134.0');
    await installCodex(consumer);
    expectAllStamps(consumer);
  });

  test('convert-flat omits the source version when claude state has none', async () => {
    const consumer = codexConsumer();
    fs.rmSync(manifestPathFor(consumer.root, 'claude'));
    await convertCodex(consumer);
    expect('sourceTdkVersion' in loadHarnessManifest(consumer.root, 'codex')).toBe(false);
  });
});

describe('legacy ownership file', () => {
  const legacyBytes = `${JSON.stringify({ ...emptyHarnessManifest('claude'), installedAt: 'legacy-kept' })}\n`;

  test('is removed by an apply, after the new state is written', async () => {
    const consumer = makeClaudeConsumer();
    fs.mkdirSync(path.dirname(legacyPathOf(consumer)), { recursive: true });
    fs.writeFileSync(legacyPathOf(consumer), legacyBytes);
    const plan = claudePlan(consumer, INSTALLER);
    expect(plan.legacyManifestPath).toBe(legacyPathOf(consumer));
    const result = await applyInstallPlan(plan, { yes: true, interactive: false });
    expect(fs.existsSync(legacyPathOf(consumer))).toBe(false);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'claude'))).toBe(true);
    expect(result.removed).toContain('.specify/state/harness-install.json');
  });

  test('is untouched and byte-identical when the apply fails', async () => {
    const consumer = makeClaudeConsumer();
    fs.mkdirSync(path.dirname(legacyPathOf(consumer)), { recursive: true });
    fs.writeFileSync(legacyPathOf(consumer), legacyBytes);
    const plan = claudePlan(consumer, INSTALLER);
    const realRename = fs.renameSync;
    const rename = spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to).endsWith(path.join('agents', 'demo.md'))) throw new Error('injected write failure');
      return realRename(from, to);
    });
    spies.push(rename);
    await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow('injected write failure');
    rename.mockRestore();
    expect(fs.readFileSync(legacyPathOf(consumer), 'utf-8')).toBe(legacyBytes);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'claude'))).toBe(false);
  });

  test('a failed unlink is a warning and the install still succeeds', async () => {
    const consumer = makeClaudeConsumer();
    fs.mkdirSync(path.dirname(legacyPathOf(consumer)), { recursive: true });
    fs.writeFileSync(legacyPathOf(consumer), legacyBytes);
    const plan = claudePlan(consumer, INSTALLER);
    const realUnlink = fs.unlinkSync;
    const unlink = spyOn(fs, 'unlinkSync').mockImplementation((target) => {
      if (String(target) === legacyPathOf(consumer)) throw new Error('injected unlink failure');
      return realUnlink(target);
    });
    spies.push(unlink);
    const result = await applyInstallPlan(plan, { yes: true, interactive: false });
    unlink.mockRestore();
    expect(result.warnings.join('\n')).toContain('injected unlink failure');
    expect(fs.existsSync(legacyPathOf(consumer))).toBe(true);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'claude'))).toBe(true);
  });

  test('a symlinked legacy file warns, is not planned for removal, and stays untouched', async () => {
    const consumer = makeClaudeConsumer();
    const outside = path.join(consumer.root, 'outside.json');
    fs.writeFileSync(outside, legacyBytes);
    fs.mkdirSync(path.dirname(legacyPathOf(consumer)), { recursive: true });
    fs.symlinkSync(outside, legacyPathOf(consumer));
    const plan = claudePlan(consumer, INSTALLER);
    expect(plan.legacyManifestPath).toBeUndefined();
    expect(plan.warnings.join('\n')).toContain('Legacy ownership manifest will be left in place');
    await applyInstallPlan(plan, { yes: true, interactive: false });
    expect(fs.lstatSync(legacyPathOf(consumer)).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(outside, 'utf-8')).toBe(legacyBytes);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'claude'))).toBe(true);
  });

  test('a legacy path that is a directory warns, install succeeds, and the directory is untouched', () => {
    const consumer = makeClaudeConsumer();
    installCli(consumer);
    fs.mkdirSync(legacyPathOf(consumer), { recursive: true });
    fs.writeFileSync(path.join(legacyPathOf(consumer), 'keep.txt'), 'kept');
    const before = treeHash(consumer.root);

    const dryRun = runCli(consumer, ['install', consumer.root, '--harness', 'claude', '--plugins', 'tdk-core', '--dry-run']);
    expect(dryRun.exitCode, dryRun.stdout + dryRun.stderr).toBe(0);
    expect(dryRun.stdout).not.toContain('will be removed');
    expect(dryRun.stdout + dryRun.stderr).toContain('Legacy ownership manifest will be left in place');
    expect(treeHash(consumer.root)).toBe(before);

    const apply = runCli(consumer, ['install', consumer.root, '--harness', 'claude', '--plugins', 'tdk-core', '--yes']);
    expect(apply.exitCode, apply.stdout + apply.stderr).toBe(0);
    expect(apply.stdout + apply.stderr).toContain('Legacy ownership manifest will be left in place');
    expect(fs.lstatSync(legacyPathOf(consumer)).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(legacyPathOf(consumer), 'keep.txt'), 'utf-8')).toBe('kept');
    expect(fs.existsSync(manifestPathFor(consumer.root, 'claude'))).toBe(true);
  });

  test('a legacy file that changes after planning is kept with a warning', async () => {
    const consumer = makeClaudeConsumer();
    fs.mkdirSync(path.dirname(legacyPathOf(consumer)), { recursive: true });
    fs.writeFileSync(legacyPathOf(consumer), legacyBytes);
    const plan = claudePlan(consumer, INSTALLER);
    const changedBytes = `${legacyBytes}\n`;
    const realRename = fs.renameSync;
    const rename = spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      const result = realRename(from, to);
      if (String(to) === manifestPathFor(consumer.root, 'claude')) fs.writeFileSync(legacyPathOf(consumer), changedBytes);
      return result;
    });
    spies.push(rename);
    const result = await applyInstallPlan(plan, { yes: true, interactive: false });
    rename.mockRestore();
    expect(result.warnings.join('\n')).toContain('Legacy ownership manifest was not removed');
    expect(fs.readFileSync(legacyPathOf(consumer), 'utf-8')).toBe(changedBytes);
    expect(result.removed).not.toContain('.specify/state/harness-install.json');
  });

  test('a codex apply leaves it alone', async () => {
    const consumer = makeConsumer('tdk-stamps-codex-legacy-');
    writeCodexPackage(consumer);
    fs.mkdirSync(path.dirname(legacyPathOf(consumer)), { recursive: true });
    fs.writeFileSync(legacyPathOf(consumer), legacyBytes);
    await installCodex(consumer);
    expect(fs.readFileSync(legacyPathOf(consumer), 'utf-8')).toBe(legacyBytes);
  });

  test('--check and --dry-run keep it; dry-run announces the removal', () => {
    const consumer = makeClaudeConsumer();
    installCli(consumer);
    moveStateToLegacy(consumer);
    const before = treeHash(consumer.root);

    const check = runCli(consumer, ['install', consumer.root, '--harness', 'claude', '--check']);
    expect(check.exitCode, check.stdout + check.stderr).toBe(0);
    expect(check.stdout).not.toContain('Legacy manifest:');
    expect(treeHash(consumer.root)).toBe(before);

    const dryRun = runCli(consumer, ['install', consumer.root, '--harness', 'claude', '--plugins', 'tdk-core', '--dry-run']);
    expect(dryRun.exitCode, dryRun.stdout + dryRun.stderr).toBe(0);
    expect(dryRun.stdout.split('\n').filter((line) => line.startsWith('Legacy manifest:'))).toHaveLength(1);
    expect(treeHash(consumer.root)).toBe(before);

    const apply = runCli(consumer, ['install', consumer.root, '--harness', 'claude', '--plugins', 'tdk-core', '--yes']);
    expect(apply.exitCode, apply.stdout + apply.stderr).toBe(0);
    expect(fs.existsSync(legacyPathOf(consumer))).toBe(false);
  });
});

describe('--check version line', () => {
  test('claude: silent when versions match, one line when they differ, status lines unchanged', () => {
    const consumer = makeClaudeConsumer();
    installCli(consumer);
    const same = runCli(consumer, ['install', consumer.root, '--harness', 'claude', '--check']);
    expect(same.exitCode).toBe(0);
    expect(infoLines(same.stdout)).toHaveLength(0);
    expect(same.stdout).toContain('Claude projection is current. No files changed.');

    writeReleaseTdkVersion(consumer, '1.136.0');
    const differ = runCli(consumer, ['install', consumer.root, '--harness', 'claude', '--check']);
    expect(differ.exitCode).toBe(0);
    expect(infoLines(differ.stdout)).toEqual([
      'version (informational): recorded tdkVersion 1.135.0, payload 1.136.0',
    ]);
    expect(differ.stdout).toContain('Claude projection is current. No files changed.');
    expect(differ.stdout).not.toContain('Claude projection is stale (');
  });

  test('claude: a stale tree keeps exit code 1 and the stale line next to the version line', () => {
    const consumer = makeClaudeConsumer();
    installCli(consumer);
    writeReleaseTdkVersion(consumer, '1.136.0');
    fs.rmSync(path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md'));
    const result = runCli(consumer, ['install', consumer.root, '--harness', 'claude', '--check']);
    expect(result.exitCode).toBe(1);
    expect(infoLines(result.stdout)).toHaveLength(1);
    expect(result.stdout).toContain('Claude projection is stale (1 item). No files changed.');
  });

  test('omp: compares the recorded source version with the claude projection version', () => {
    const consumer = makeConsumer('tdk-stamps-omp-');
    writeClaudeState(consumer, '1.134.0');
    const agent = path.join(consumer.root, '.claude', 'agents', 'reviewer.md');
    fs.mkdirSync(path.dirname(agent), { recursive: true });
    fs.writeFileSync(agent, '---\nname: reviewer\ndescription: Review code\ntools: Read\n---\nReview the code.\n');
    const convert = runCli(consumer, ['convert-flat', consumer.root, '--harness', 'omp', '--parts', 'agents', '--yes']);
    expect(convert.exitCode, convert.stdout + convert.stderr).toBe(0);
    expect(loadHarnessManifest(consumer.root, 'omp').sourceTdkVersion).toBe('1.134.0');

    const same = runCli(consumer, ['convert-flat', consumer.root, '--harness', 'omp', '--check']);
    expect(same.exitCode).toBe(0);
    expect(infoLines(same.stdout)).toHaveLength(0);
    expect(same.stdout).toContain('No OMP convert-flat drift detected.');

    writeClaudeState(consumer, '1.135.0');
    const differ = runCli(consumer, ['convert-flat', consumer.root, '--harness', 'omp', '--check']);
    expect(differ.exitCode).toBe(0);
    expect(infoLines(differ.stdout)).toEqual([
      'version (informational): recorded sourceTdkVersion 1.134.0, .claude projection 1.135.0',
    ]);
    expect(differ.stdout).toContain('No OMP convert-flat drift detected.');

    fs.writeFileSync(agent, 'changed');
    const drifted = runCli(consumer, ['convert-flat', consumer.root, '--harness', 'omp', '--check']);
    expect(drifted.exitCode).toBe(1);
    expect(drifted.stdout).toContain('OMP convert-flat drift detected:');
    expect(infoLines(drifted.stdout)).toHaveLength(1);
  });
});

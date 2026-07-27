import { describe, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverPluginInventory } from '../src/plugin-discovery';
import { emptyHarnessManifest, loadHarnessManifest } from '../src/manifest-store';
import { buildClaudeInstallPlan } from '../src/install-plan';
import { applyInstallPlan } from '../src/install-writer';
import { sha256Buffer } from '../src/checksum';
import { validateInstallPlanTargets } from '../src/target-path-safety';
import { makeConsumer, writeBasicPlugin } from './fixtures';
import type { HarnessName, InstallPlan } from '../src/types';

function singleWritePlan(consumer: ReturnType<typeof makeConsumer>, harness: HarnessName = 'claude'): InstallPlan {
  const content = Buffer.from('managed content', 'utf-8');
  const targetRelativePath = harness === 'claude' ? '.claude/managed.txt' : '.agents/skills/managed/SKILL.md';
  return {
    harness,
    consumerRoot: consumer.root,
    selectedPlugins: ['tdk-core'],
    targetDir: harness === 'claude' ? '.claude' : '.codex',
    claudeSettingsPath: harness === 'claude' ? '.claude/settings.json' : '.codex/config.toml',
    manifestPath: path.join(consumer.root, '.specify', 'state', 'harness-install', `${harness}.json`),
    writes: [{
      plugin: 'tdk-core',
      sourcePath: path.join(consumer.root, '.specify', 'source.txt'),
      sourceRelativePath: '.specify/source.txt',
      targetPath: path.join(consumer.root, targetRelativePath),
      targetRelativePath,
      sourceChecksum: sha256Buffer(content),
      installedChecksum: sha256Buffer(content),
      content,
      action: 'create',
    }],
    removals: [],
    hookMutations: [],
    collisions: [],
    prompts: [],
    warnings: [],
    nextManifest: emptyHarnessManifest(harness),
    settingsChanged: false,
    installSettingsChanged: false,
    operationStamp: 'path-safety-acceptance',
  };
}

function injectAfterTargetTempFsync(target: string, replacement: string): {
  injected: () => boolean;
  restore: () => void;
} {
  const originalFsync = fs.fsyncSync;
  const temporaryPrefix = `${path.basename(target)}.tmp-`;
  let wasInjected = false;
  const fsyncSpy = spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
    originalFsync(fd);
    if (!wasInjected && fs.readdirSync(path.dirname(target)).some((entry) => entry.startsWith(temporaryPrefix))) {
      wasInjected = true;
      fs.writeFileSync(target, replacement, 'utf-8');
    }
  });
  return {
    injected: () => wasInjected,
    restore: () => fsyncSpy.mockRestore(),
  };
}

function replaceDirectoryWithSymlink(directory: string, outside: string): () => void {
  const preservedDirectory = `${directory}-before-swap`;
  fs.renameSync(directory, preservedDirectory);
  fs.symlinkSync(outside, directory);
  return () => {
    fs.unlinkSync(directory);
    fs.renameSync(preservedDirectory, directory);
  };
}

describe('applyInstallPlan', () => {
  test('first install writes files, settings, and ownership manifest', async () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });

    const result = await applyInstallPlan(plan, { yes: true, interactive: false });

    expect(result.written.length).toBeGreaterThan(0);
    expect(result.settingsWritten).toBe(true);
    expect(fs.existsSync(path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md'))).toBe(true);
    expect(loadHarnessManifest(consumer.root).managedFiles.length).toBeGreaterThan(0);
  });

  test('revalidates managed target checksum immediately before write', async () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const firstPlan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });
    await applyInstallPlan(firstPlan, { yes: true, interactive: false });

    const secondPlan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: loadHarnessManifest(consumer.root),
      settings: JSON.parse(fs.readFileSync(path.join(consumer.root, '.claude', 'settings.json'), 'utf-8')),
    });
    fs.writeFileSync(path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md'), 'changed after plan', 'utf-8');

    await expect(applyInstallPlan(secondPlan, { yes: true, interactive: false })).rejects.toThrow(/changed after planning/);
  });

  test('writes captured planned bytes instead of re-reading source files', async () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });
    fs.writeFileSync(path.join(consumer.pluginRoot, 'skills', 'demo', 'SKILL.md'), 'changed source after plan', 'utf-8');

    await applyInstallPlan(plan, { yes: true, interactive: false });

    expect(fs.readFileSync(path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md'), 'utf-8')).toBe('# Skill\n');
  });

  test('backs up and repairs managed drift after interactive approval', async () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const firstPlan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });
    await applyInstallPlan(firstPlan, { yes: true, interactive: false });

    const target = path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md');
    fs.writeFileSync(target, 'user changed managed file', 'utf-8');
    const secondPlan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: loadHarnessManifest(consumer.root),
      settings: JSON.parse(fs.readFileSync(path.join(consumer.root, '.claude', 'settings.json'), 'utf-8')),
    });

    expect(secondPlan.prompts.some((prompt) => prompt.type === 'managed-drift-overwrite')).toBe(true);
    expect(secondPlan.writes.some((write) => write.targetRelativePath.endsWith('skills/demo/SKILL.md'))).toBe(true);
    const result = await applyInstallPlan(secondPlan, {
      yes: false,
      interactive: true,
      approveOverwrite: async () => true,
    });

    expect(result.backedUp).toHaveLength(1);
    expect(fs.readFileSync(result.backedUp[0]!, 'utf-8')).toBe('user changed managed file');
    expect(fs.readFileSync(target, 'utf-8')).toBe('# Skill\n');
  });

  test('revalidates managed removal checksum immediately before delete', async () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const firstPlan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });
    await applyInstallPlan(firstPlan, { yes: true, interactive: false });

    const target = path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md');
    const removalPlan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: [],
      plugins: [],
      previousManifest: loadHarnessManifest(consumer.root),
      settings: JSON.parse(fs.readFileSync(path.join(consumer.root, '.claude', 'settings.json'), 'utf-8')),
    });
    fs.writeFileSync(target, 'changed after removal plan', 'utf-8');

    await expect(applyInstallPlan(removalPlan, { yes: true, interactive: false })).rejects.toThrow(/changed after planning/);
    expect(fs.readFileSync(target, 'utf-8')).toBe('changed after removal plan');
  });

  test('backs up and overwrites unmanaged target after interactive approval', async () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const target = path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'user content', 'utf-8');

    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });

    const result = await applyInstallPlan(plan, {
      yes: false,
      interactive: true,
      approveOverwrite: async () => true,
    });

    expect(result.backedUp).toHaveLength(1);
    expect(fs.readFileSync(result.backedUp[0]!, 'utf-8')).toBe('user content');
    expect(fs.readFileSync(target, 'utf-8')).toBe('# Skill\n');
    expect(loadHarnessManifest(consumer.root).managedFiles.some((file) => file.targetRelativePath.endsWith('skills/demo/SKILL.md'))).toBe(true);
  });

  test('--yes does not approve unmanaged target overwrite', async () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const target = path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'user content', 'utf-8');

    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });

    await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/Unmanaged target already exists/);
  });

  test('writes repaired settings when managed hook is missing but ownership is unchanged', async () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const firstPlan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });
    const previous = {
      ...emptyHarnessManifest(),
      selectedPlugins: ['tdk-core'],
      managedHooks: firstPlan.nextManifest.managedHooks,
    };
    const repairPlan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: previous,
      settings: {},
    });

    expect(repairPlan.hookMutations).toEqual([]);
    expect(repairPlan.settingsChanged).toBe(true);
    const result = await applyInstallPlan(repairPlan, { yes: true, interactive: false });

    expect(result.settingsWritten).toBe(true);
    expect(fs.readFileSync(path.join(consumer.root, '.claude', 'settings.json'), 'utf-8')).toContain('.claude/hooks/tdk-core/hook-gateway.cjs');
  });

  test('backs up and removes unmanaged stale generated hooks json after approval', async () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const target = path.join(consumer.root, '.claude', 'hooks', 'hooks.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(consumer.pluginRoot, 'hooks', 'hooks.json'), target);

    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });

    const result = await applyInstallPlan(plan, {
      yes: false,
      interactive: true,
      approveOverwrite: async () => true,
    });

    expect(result.backedUp).toHaveLength(1);
    expect(result.removed).toContain('.claude/hooks/hooks.json');
    expect(fs.existsSync(target)).toBe(false);
  });

  test('revalidates stale generated hooks json before cleanup delete', async () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const target = path.join(consumer.root, '.claude', 'hooks', 'hooks.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(consumer.pluginRoot, 'hooks', 'hooks.json'), target);

    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });
    fs.writeFileSync(target, '{"hooks":{"Custom":[]}}\n', 'utf-8');

    await expect(applyInstallPlan(plan, {
      yes: false,
      interactive: true,
      approveOverwrite: async () => true,
    })).rejects.toThrow(/changed after planning/);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"hooks":{"Custom":[]}}\n');
  });

  test('rolls back earlier writes when a later write fails before manifest commit', async () => {
    const consumer = makeConsumer();
    const firstContent = Buffer.from('first', 'utf-8');
    const secondContent = Buffer.from('second', 'utf-8');
    const firstTarget = path.join(consumer.root, '.claude', 'ok.txt');
    const blockedParent = path.join(consumer.root, '.claude', 'blocked');
    fs.writeFileSync(blockedParent, 'not a directory', 'utf-8');
    const plan: InstallPlan = {
      harness: 'claude',
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      targetDir: '.claude',
      claudeSettingsPath: '.claude/settings.json',
      manifestPath: path.join(consumer.root, '.specify', 'state', 'harness-install', 'claude.json'),
      writes: [
        {
          plugin: 'tdk-core',
          sourcePath: path.join(consumer.root, '.specify', 'source-one.txt'),
          sourceRelativePath: 'source-one.txt',
          targetPath: firstTarget,
          targetRelativePath: '.claude/ok.txt',
          sourceChecksum: sha256Buffer(firstContent),
          installedChecksum: sha256Buffer(firstContent),
          content: firstContent,
          action: 'create',
        },
        {
          plugin: 'tdk-core',
          sourcePath: path.join(consumer.root, '.specify', 'source-two.txt'),
          sourceRelativePath: 'source-two.txt',
          targetPath: path.join(blockedParent, 'file.txt'),
          targetRelativePath: '.claude/blocked/file.txt',
          sourceChecksum: sha256Buffer(secondContent),
          installedChecksum: sha256Buffer(secondContent),
          content: secondContent,
          action: 'create',
        },
      ],
      removals: [],
      hookMutations: [],
      collisions: [],
      prompts: [],
      warnings: [],
      nextManifest: emptyHarnessManifest(),
      settingsChanged: false,
      installSettingsChanged: false,
    };

    await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow();

    expect(fs.existsSync(firstTarget)).toBe(false);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
    expect(fs.readFileSync(blockedParent, 'utf-8')).toBe('not a directory');
  });

  test('rolls back generated migration journal when apply fails', async () => {
    const consumer = makeConsumer();
    const firstContent = Buffer.from('first', 'utf-8');
    const secondContent = Buffer.from('second', 'utf-8');
    const blockedParent = path.join(consumer.root, '.claude', 'blocked');
    fs.writeFileSync(blockedParent, 'not a directory', 'utf-8');
    const plan: InstallPlan = {
      harness: 'claude',
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      targetDir: '.claude',
      claudeSettingsPath: '.claude/settings.json',
      manifestPath: path.join(consumer.root, '.specify', 'state', 'harness-install', 'claude.json'),
      writes: [
        {
          plugin: 'tdk-core',
          sourcePath: path.join(consumer.root, '.specify', 'source-one.txt'),
          sourceRelativePath: 'source-one.txt',
          targetPath: path.join(consumer.root, '.claude', 'ok.txt'),
          targetRelativePath: '.claude/ok.txt',
          sourceChecksum: sha256Buffer(firstContent),
          installedChecksum: sha256Buffer(firstContent),
          content: firstContent,
          action: 'create',
        },
        {
          plugin: 'tdk-core',
          sourcePath: path.join(consumer.root, '.specify', 'source-two.txt'),
          sourceRelativePath: 'source-two.txt',
          targetPath: path.join(blockedParent, 'file.txt'),
          targetRelativePath: '.claude/blocked/file.txt',
          sourceChecksum: sha256Buffer(secondContent),
          installedChecksum: sha256Buffer(secondContent),
          content: secondContent,
          action: 'create',
        },
      ],
      removals: [],
      hookMutations: [],
      collisions: [],
      prompts: [],
      warnings: [],
      nextManifest: emptyHarnessManifest(),
      settingsChanged: false,
      installSettingsChanged: false,
      migration: {
        fromPrefix: 'tdk',
        toPrefix: 'sample',
      },
    };

    await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow();

    const migrationDir = path.join(consumer.root, '.specify', 'state', 'harness-install', 'migrations');
    expect(fs.existsSync(migrationDir) ? fs.readdirSync(migrationDir) : []).toEqual([]);
  });

  test('aborts before mutation when a managed target ancestor becomes a symlink after planning', async () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });
    const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-writer-outside-'));
    const sentinel = path.join(outside, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'unchanged', 'utf-8');
    fs.rmSync(path.join(consumer.root, '.claude'), { recursive: true });
    fs.symlinkSync(outside, path.join(consumer.root, '.claude'));

    await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/symlinked ancestor/);
    expect(fs.readFileSync(sentinel, 'utf-8')).toBe('unchanged');
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('aborts before mutation when a Codex managed target ancestor becomes a symlink after planning', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer, 'codex');
    validateInstallPlanTargets(plan);
    const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-codex-writer-outside-'));
    const sentinel = path.join(outside, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'unchanged', 'utf-8');
    fs.mkdirSync(path.join(consumer.root, '.agents'), { recursive: true });
    fs.rmSync(path.join(consumer.root, '.agents'), { recursive: true, force: true });
    fs.symlinkSync(outside, path.join(consumer.root, '.agents'));

    await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/symlinked ancestor/);

    expect(fs.readFileSync(sentinel, 'utf-8')).toBe('unchanged');
    expect(fs.readdirSync(outside)).toEqual(['sentinel.txt']);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  for (const scenario of [
    {
      name: 'state root',
      link: '.specify/state',
      configure: (_plan: InstallPlan) => {},
    },
    {
      name: 'install settings root',
      link: '.specify/install-settings.json',
      configure: (plan: InstallPlan) => {
        plan.installSettingsPath = path.join(plan.consumerRoot, '.specify', 'install-settings.json');
        plan.nextInstallSettings = { version: 1 };
        plan.installSettingsChanged = true;
      },
    },
    {
      name: 'ownership manifest root',
      link: '.specify/state/harness-install',
      configure: (_plan: InstallPlan) => {},
    },
    {
      name: 'migration journal root',
      link: '.specify/state/harness-install/migrations',
      configure: (plan: InstallPlan) => {
        plan.migration = { fromPrefix: 'tdk', toPrefix: 'sample' };
      },
    },
  ]) {
    test(`aborts before managed or state mutation when the ${scenario.name} becomes a symlink after planning`, async () => {
      const consumer = makeConsumer();
      const plan = singleWritePlan(consumer);
      const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-state-writer-outside-'));
      const sentinel = path.join(outside, 'sentinel.txt');
      const link = path.join(consumer.root, scenario.link);
      scenario.configure(plan);
      validateInstallPlanTargets(plan);
      fs.writeFileSync(sentinel, 'unchanged', 'utf-8');
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.rmSync(link, { recursive: true, force: true });
      fs.symlinkSync(outside, link);

      await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/symlinked ancestor/);

      expect(fs.existsSync(plan.writes[0]!.targetPath)).toBe(false);
      expect(fs.existsSync(plan.manifestPath)).toBe(false);
      expect(fs.readFileSync(sentinel, 'utf-8')).toBe('unchanged');
      expect(fs.readdirSync(outside)).toEqual(['sentinel.txt']);
    });
  }

  test('aborts before confirmation, backup, managed write, or state mutation when the backup root swaps after planning', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const promptPath = path.join(consumer.root, '.claude', 'user-owned.txt');
    const userContent = 'user-owned content';
    const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-backup-writer-outside-'));
    const sentinel = path.join(outside, 'sentinel.txt');
    let confirmations = 0;
    fs.writeFileSync(promptPath, userContent, 'utf-8');
    fs.writeFileSync(sentinel, 'unchanged', 'utf-8');
    plan.prompts = [{
      type: 'unmanaged-target-overwrite',
      path: promptPath,
      targetRelativePath: '.claude/user-owned.txt',
      expectedTargetChecksum: sha256Buffer(Buffer.from(userContent, 'utf-8')),
    }];
    plan.collisions = [{
      kind: 'unmanaged-target-exists',
      path: promptPath,
      message: 'user-owned target requires confirmation',
    }];
    validateInstallPlanTargets(plan);
    const backupRoot = path.join(consumer.root, '.specify', 'state', 'harness-install', 'backups');
    fs.mkdirSync(backupRoot, { recursive: true });
    fs.rmSync(backupRoot, { recursive: true, force: true });
    fs.symlinkSync(outside, backupRoot);

    await expect(applyInstallPlan(plan, {
      yes: false,
      interactive: true,
      approveOverwrite: async () => { confirmations += 1; return true; },
    })).rejects.toThrow(/symlinked ancestor/);

    expect(confirmations).toBe(0);
    expect(fs.readFileSync(promptPath, 'utf-8')).toBe(userContent);
    expect(fs.existsSync(plan.writes[0]!.targetPath)).toBe(false);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
    expect(fs.readFileSync(sentinel, 'utf-8')).toBe('unchanged');
    expect(fs.readdirSync(outside)).toEqual(['sentinel.txt']);
  });

  test('does not create backups when the second overwrite confirmation is declined', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const firstTarget = path.join(consumer.root, '.claude', 'first-user-file.txt');
    const secondTarget = path.join(consumer.root, '.claude', 'second-user-file.txt');
    fs.writeFileSync(firstTarget, 'first user content', 'utf-8');
    fs.writeFileSync(secondTarget, 'second user content', 'utf-8');
    plan.prompts = [
      { type: 'unmanaged-target-overwrite', path: firstTarget, targetRelativePath: '.claude/first-user-file.txt' },
      { type: 'unmanaged-target-overwrite', path: secondTarget, targetRelativePath: '.claude/second-user-file.txt' },
    ];
    let confirmations = 0;

    await expect(applyInstallPlan(plan, {
      yes: false,
      interactive: true,
      approveOverwrite: async () => {
        confirmations += 1;
        return confirmations === 1;
      },
    })).rejects.toThrow(/Cancelled overwrite/);

    expect(confirmations).toBe(2);
    expect(fs.existsSync(path.join(consumer.root, '.specify', 'state', 'harness-install', 'backups'))).toBe(false);
    expect(fs.readFileSync(firstTarget, 'utf-8')).toBe('first user content');
    expect(fs.readFileSync(secondTarget, 'utf-8')).toBe('second user content');
    expect(fs.existsSync(plan.writes[0]!.targetPath)).toBe(false);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('does not create backups when an approved prompt target changes before preflight', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const promptTarget = path.join(consumer.root, '.claude', 'user-file.txt');
    const plannedContent = 'planned user content';
    fs.writeFileSync(promptTarget, plannedContent, 'utf-8');
    plan.prompts = [{
      type: 'unmanaged-target-overwrite',
      path: promptTarget,
      targetRelativePath: '.claude/user-file.txt',
      expectedTargetChecksum: sha256Buffer(Buffer.from(plannedContent, 'utf-8')),
    }];

    await expect(applyInstallPlan(plan, {
      yes: false,
      interactive: true,
      approveOverwrite: async () => {
        fs.writeFileSync(promptTarget, 'changed after approval', 'utf-8');
        return true;
      },
    })).rejects.toThrow(/changed after planning/);

    expect(fs.existsSync(path.join(consumer.root, '.specify', 'state', 'harness-install', 'backups'))).toBe(false);
    expect(fs.readFileSync(promptTarget, 'utf-8')).toBe('changed after approval');
    expect(fs.existsSync(plan.writes[0]!.targetPath)).toBe(false);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('does not overwrite a pre-existing backup target', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const promptTarget = path.join(consumer.root, '.claude', 'user-file.txt');
    const userContent = 'user content';
    const backup = path.join(consumer.root, '.specify', 'state', 'harness-install', 'backups', plan.operationStamp!, '.claude', 'user-file.txt');
    fs.writeFileSync(promptTarget, userContent, 'utf-8');
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, 'existing backup', 'utf-8');
    plan.prompts = [{
      type: 'unmanaged-target-overwrite',
      path: promptTarget,
      targetRelativePath: '.claude/user-file.txt',
      expectedTargetChecksum: sha256Buffer(Buffer.from(userContent, 'utf-8')),
    }];

    await expect(applyInstallPlan(plan, {
      yes: false,
      interactive: true,
      approveOverwrite: async () => true,
    })).rejects.toThrow(/Backup already exists/);

    expect(fs.readFileSync(backup, 'utf-8')).toBe('existing backup');
    expect(fs.readFileSync(promptTarget, 'utf-8')).toBe(userContent);
    expect(fs.existsSync(plan.writes[0]!.targetPath)).toBe(false);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('removes run-created backups and restores snapshots after a post-backup write failure', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const promptTarget = path.join(consumer.root, '.claude', 'user-file.txt');
    const userContent = Buffer.from('user content', 'utf-8');
    const replacement = Buffer.from('managed replacement', 'utf-8');
    const backupRoot = path.join(consumer.root, '.specify', 'state', 'harness-install', 'backups');
    const backup = path.join(backupRoot, plan.operationStamp!, '.claude', 'user-file.txt');
    const stampDirectory = path.dirname(path.dirname(backup));
    let approvals = 0;
    fs.writeFileSync(promptTarget, userContent);
    fs.mkdirSync(backupRoot, { recursive: true });
    plan.writes = [{
      ...plan.writes[0]!,
      targetPath: promptTarget,
      targetRelativePath: '.claude/user-file.txt',
      sourceChecksum: sha256Buffer(replacement),
      installedChecksum: sha256Buffer(Buffer.from('wrong checksum', 'utf-8')),
      content: replacement,
      expectedTargetChecksum: sha256Buffer(userContent),
      action: 'update',
    }];
    plan.prompts = [{
      type: 'unmanaged-target-overwrite',
      path: promptTarget,
      targetRelativePath: '.claude/user-file.txt',
      expectedTargetChecksum: sha256Buffer(userContent),
    }];

    await expect(applyInstallPlan(plan, {
      yes: false,
      interactive: true,
      approveOverwrite: async () => { approvals += 1; return true; },
    })).rejects.toThrow(/Checksum mismatch/);

    expect(approvals).toBe(1);
    expect(fs.readFileSync(promptTarget)).toEqual(userContent);
    expect(fs.existsSync(backup)).toBe(false);
    expect(fs.existsSync(stampDirectory)).toBe(false);
    expect(fs.readdirSync(backupRoot)).toEqual([]);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('removes partial backup temporary artifacts after a copy failure', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const promptTarget = path.join(consumer.root, '.claude', 'user-file.txt');
    const userContent = Buffer.from('user content', 'utf-8');
    const backupRoot = path.join(consumer.root, '.specify', 'state', 'harness-install', 'backups');
    const backup = path.join(backupRoot, plan.operationStamp!, '.claude', 'user-file.txt');
    let approvals = 0;
    let temporaryPath: string | undefined;
    fs.writeFileSync(promptTarget, userContent);
    plan.prompts = [{
      type: 'unmanaged-target-overwrite',
      path: promptTarget,
      targetRelativePath: '.claude/user-file.txt',
      expectedTargetChecksum: sha256Buffer(userContent),
    }];
    const copySpy = spyOn(fs, 'copyFileSync').mockImplementation((_source, destination) => {
      temporaryPath = String(destination);
      fs.writeFileSync(destination, 'partial backup', { flag: 'wx' });
      throw new Error('copy failure');
    });

    try {
      await expect(applyInstallPlan(plan, {
        yes: false,
        interactive: true,
        approveOverwrite: async () => { approvals += 1; return true; },
      })).rejects.toThrow(/copy failure/);
    } finally {
      copySpy.mockRestore();
    }

    expect(approvals).toBe(1);
    expect(temporaryPath).toBeDefined();
    expect(fs.readFileSync(promptTarget)).toEqual(userContent);
    expect(fs.existsSync(temporaryPath!)).toBe(false);
    expect(fs.existsSync(backup)).toBe(false);
    expect(fs.existsSync(backupRoot)).toBe(false);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('writes install settings through an exact trusted atomic temporary path', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const installSettingsPath = path.join(consumer.root, '.specify', 'install-settings.json');
    plan.installSettingsPath = installSettingsPath;
    plan.nextInstallSettings = { version: 1, defaults: { selectedPlugins: ['tdk-core'] } };
    plan.installSettingsChanged = true;

    await applyInstallPlan(plan, { yes: true, interactive: false });

    expect(JSON.parse(fs.readFileSync(installSettingsPath, 'utf-8'))).toEqual(plan.nextInstallSettings);
  });

  test('revalidates a managed removal immediately before its final filesystem operation', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const target = path.join(consumer.root, '.claude', 'remove.txt');
    const content = Buffer.from('managed removal content', 'utf-8');
    const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-removal-final-swap-'));
    const sentinel = path.join(outside, 'sentinel.txt');
    fs.writeFileSync(target, content);
    fs.writeFileSync(sentinel, 'unchanged', 'utf-8');
    plan.writes = [];
    plan.removals = [{
      targetPath: target,
      targetRelativePath: '.claude/remove.txt',
      previous: {
        plugin: 'tdk-core',
        sourceRelativePath: '.specify/source.txt',
        targetRelativePath: '.claude/remove.txt',
        sourceChecksum: sha256Buffer(content),
        installedChecksum: sha256Buffer(content),
      },
    }];
    let targetExistsCalls = 0;
    let restoreSwap: (() => void) | undefined;
    const originalExists = fs.existsSync;
    const existsSpy = spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      const exists = originalExists(filePath);
      if (filePath === target && ++targetExistsCalls === 3) {
        restoreSwap = replaceDirectoryWithSymlink(path.join(consumer.root, '.claude'), outside);
      }
      return exists;
    });

    try {
      await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/symlinked ancestor/);
    } finally {
      existsSpy.mockRestore();
      restoreSwap?.();
    }

    expect(targetExistsCalls).toBe(3);
    expect(fs.readFileSync(target)).toEqual(content);
    expect(fs.readFileSync(sentinel, 'utf-8')).toBe('unchanged');
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('revalidates harness settings immediately before atomic replacement', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const settingsPath = path.join(consumer.root, '.claude', 'settings.json');
    const originalSettings = '{"existing":true}\n';
    const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-settings-final-swap-'));
    const sentinel = path.join(outside, 'sentinel.txt');
    fs.writeFileSync(settingsPath, originalSettings, 'utf-8');
    fs.writeFileSync(sentinel, 'unchanged', 'utf-8');
    plan.writes = [];
    plan.nextSettings = { existing: false, managed: true };
    plan.settingsChanged = true;
    let restoreSwap: (() => void) | undefined;
    const originalLstat = fs.lstatSync;
    const lstatSpy = spyOn(fs, 'lstatSync').mockImplementation((filePath, options) => {
      const stat = originalLstat(filePath, options);
      if (
        filePath === settingsPath
        && fs.readdirSync(path.dirname(settingsPath)).some((entry) => entry.startsWith('settings.json.tmp-'))
      ) {
        restoreSwap = replaceDirectoryWithSymlink(path.join(consumer.root, '.claude'), outside);
      }
      return stat;
    });

    try {
      await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/symlinked ancestor/);
    } finally {
      lstatSpy.mockRestore();
      restoreSwap?.();
    }

    expect(restoreSwap).toBeDefined();
    expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(originalSettings);
    expect(fs.readFileSync(sentinel, 'utf-8')).toBe('unchanged');
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('revalidates a Codex .codex write immediately before atomic replacement', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer, 'codex');
    const target = path.join(consumer.root, '.codex', 'managed.toml');
    const originalContent = Buffer.from('existing codex content', 'utf-8');
    const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-codex-final-swap-'));
    const sentinel = path.join(outside, 'sentinel.txt');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, originalContent);
    fs.writeFileSync(sentinel, 'unchanged', 'utf-8');
    plan.writes = [{
      ...plan.writes[0]!,
      targetPath: target,
      targetRelativePath: '.codex/managed.toml',
      expectedTargetChecksum: sha256Buffer(originalContent),
      action: 'update',
    }];
    let restoreSwap: (() => void) | undefined;
    const originalLstat = fs.lstatSync;
    const lstatSpy = spyOn(fs, 'lstatSync').mockImplementation((filePath, options) => {
      const stat = originalLstat(filePath, options);
      if (
        filePath === target
        && fs.readdirSync(path.dirname(target)).some((entry) => entry.startsWith('managed.toml.tmp-'))
      ) {
        restoreSwap = replaceDirectoryWithSymlink(path.join(consumer.root, '.codex'), outside);
      }
      return stat;
    });

    try {
      await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/symlinked ancestor/);
    } finally {
      lstatSpy.mockRestore();
      restoreSwap?.();
    }

    expect(restoreSwap).toBeDefined();
    expect(fs.readFileSync(target)).toEqual(originalContent);
    expect(fs.readFileSync(sentinel, 'utf-8')).toBe('unchanged');
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('preserves a late user edit after backup publication rejects the managed write', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const target = path.join(consumer.root, '.claude', 'user-file.txt');
    const originalContent = Buffer.from('approved user content', 'utf-8');
    const lateUserContent = 'late user edit';
    const replacement = Buffer.from('managed replacement', 'utf-8');
    const backupRoot = path.join(consumer.root, '.specify', 'state', 'harness-install', 'backups');
    const backup = path.join(backupRoot, plan.operationStamp!, '.claude', 'user-file.txt');
    fs.writeFileSync(target, originalContent);
    plan.writes = [{
      ...plan.writes[0]!,
      targetPath: target,
      targetRelativePath: '.claude/user-file.txt',
      sourceChecksum: sha256Buffer(replacement),
      installedChecksum: sha256Buffer(replacement),
      content: replacement,
      expectedTargetChecksum: sha256Buffer(originalContent),
      action: 'update',
    }];
    plan.prompts = [{
      type: 'unmanaged-target-overwrite',
      path: target,
      targetRelativePath: '.claude/user-file.txt',
      expectedTargetChecksum: sha256Buffer(originalContent),
    }];
    const originalLink = fs.linkSync;
    const linkSpy = spyOn(fs, 'linkSync').mockImplementation((existingPath, newPath) => {
      originalLink(existingPath, newPath);
      if (String(newPath) === backup) fs.writeFileSync(target, lateUserContent, 'utf-8');
    });

    try {
      await expect(applyInstallPlan(plan, {
        yes: false,
        interactive: true,
        approveOverwrite: async () => true,
      })).rejects.toThrow(/changed after planning/);
    } finally {
      linkSpy.mockRestore();
    }

    expect(fs.readFileSync(target, 'utf-8')).toBe(lateUserContent);
    expect(fs.existsSync(backup)).toBe(false);
    expect(fs.existsSync(backupRoot)).toBe(false);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('restores original bytes and mode after a post-replacement checksum failure', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const target = plan.writes[0]!.targetPath;
    const originalContent = Buffer.from('original protected content', 'utf-8');
    const replacement = Buffer.from('managed replacement', 'utf-8');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, originalContent);
    fs.chmodSync(target, 0o700);
    plan.writes = [{
      ...plan.writes[0]!,
      sourceChecksum: sha256Buffer(replacement),
      installedChecksum: sha256Buffer(Buffer.from('wrong checksum', 'utf-8')),
      content: replacement,
      expectedTargetChecksum: sha256Buffer(originalContent),
      action: 'update',
    }];

    await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/Checksum mismatch/);

    expect(fs.readFileSync(target)).toEqual(originalContent);
    expect(fs.statSync(target).mode & 0o7777).toBe(0o700);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('tracks nested directories created by recursive mkdir', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const target = path.join(consumer.root, '.claude', 'new', 'nested', 'managed.txt');
    plan.writes = [{
      ...plan.writes[0]!,
      targetPath: target,
      targetRelativePath: '.claude/new/nested/managed.txt',
    }];

    const result = await applyInstallPlan(plan, { yes: true, interactive: false });

    expect(result.written).toEqual(['.claude/new/nested/managed.txt']);
    expect(fs.existsSync(target)).toBe(true);
  });

  test('removes only nested directories created by rolled-back writes', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const preexistingParent = path.join(consumer.root, '.claude', 'preexisting');
    const createdDirectory = path.join(preexistingParent, 'new', 'nested');
    const firstTarget = path.join(createdDirectory, 'file.txt');
    const blockedParent = path.join(consumer.root, '.claude', 'blocked');
    const firstContent = Buffer.from('first content', 'utf-8');
    const secondContent = Buffer.from('second content', 'utf-8');
    fs.mkdirSync(preexistingParent, { recursive: true });
    fs.writeFileSync(blockedParent, 'not a directory', 'utf-8');
    plan.writes = [
      {
        ...plan.writes[0]!,
        targetPath: firstTarget,
        targetRelativePath: '.claude/preexisting/new/nested/file.txt',
        sourceChecksum: sha256Buffer(firstContent),
        installedChecksum: sha256Buffer(firstContent),
        content: firstContent,
      },
      {
        ...plan.writes[0]!,
        targetPath: path.join(blockedParent, 'file.txt'),
        targetRelativePath: '.claude/blocked/file.txt',
        sourceChecksum: sha256Buffer(secondContent),
        installedChecksum: sha256Buffer(secondContent),
        content: secondContent,
      },
    ];

    await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow();

    expect(fs.existsSync(firstTarget)).toBe(false);
    expect(fs.existsSync(createdDirectory)).toBe(false);
    expect(fs.existsSync(path.join(preexistingParent, 'new'))).toBe(false);
    expect(fs.existsSync(preexistingParent)).toBe(true);
    expect(fs.readFileSync(blockedParent, 'utf-8')).toBe('not a directory');
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('aborts a managed write when its expected preimage changes after temporary fsync', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const target = plan.writes[0]!.targetPath;
    const originalContent = Buffer.from('original managed content', 'utf-8');
    const lateContent = 'late user content';
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, originalContent);
    plan.writes = [{
      ...plan.writes[0]!,
      expectedTargetChecksum: sha256Buffer(originalContent),
      action: 'update',
    }];
    const injection = injectAfterTargetTempFsync(target, lateContent);

    try {
      await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/changed after transaction start\/planning/);
    } finally {
      injection.restore();
    }

    expect(injection.injected()).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe(lateContent);
    expect(fs.readdirSync(path.dirname(target)).some((entry) => entry.startsWith('managed.txt.tmp-'))).toBe(false);
    expect(fs.existsSync(path.join(consumer.root, '.specify', 'state', 'harness-install', 'backups'))).toBe(false);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('aborts a harness settings write when its expected preimage changes after temporary fsync', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const target = path.join(consumer.root, '.claude', 'settings.json');
    const lateContent = '{"late":true}\n';
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{"existing":true}\n', 'utf-8');
    plan.writes = [];
    plan.nextSettings = { managed: true };
    plan.settingsChanged = true;
    const injection = injectAfterTargetTempFsync(target, lateContent);

    try {
      await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/changed after transaction start\/planning/);
    } finally {
      injection.restore();
    }

    expect(injection.injected()).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe(lateContent);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('aborts an install settings write when its expected preimage changes after temporary fsync', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const target = path.join(consumer.root, '.specify', 'install-settings.json');
    const lateContent = '{"late":true}\n';
    fs.writeFileSync(target, '{"existing":true}\n', 'utf-8');
    plan.writes = [];
    plan.installSettingsPath = target;
    plan.nextInstallSettings = { managed: true };
    plan.installSettingsChanged = true;
    const injection = injectAfterTargetTempFsync(target, lateContent);

    try {
      await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/changed after transaction start\/planning/);
    } finally {
      injection.restore();
    }

    expect(injection.injected()).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe(lateContent);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('does not replace a manifest created after its expected-absence snapshot', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const lateContent = '{"user":"manifest"}\n';
    plan.writes = [];
    const injection = injectAfterTargetTempFsync(plan.manifestPath, lateContent);

    try {
      await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow(/changed after transaction start\/planning/);
    } finally {
      injection.restore();
    }

    expect(injection.injected()).toBe(true);
    expect(fs.readFileSync(plan.manifestPath, 'utf-8')).toBe(lateContent);
    expect(fs.readdirSync(path.dirname(plan.manifestPath)).some((entry) => entry.startsWith('claude.json.tmp-'))).toBe(false);
  });

  test('preserves a late edit after publication when post-write verification fails', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const target = plan.writes[0]!.targetPath;
    const originalContent = Buffer.from('original protected content', 'utf-8');
    const replacement = Buffer.from('managed replacement', 'utf-8');
    const lateContent = 'late user edit after publish';
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, originalContent);
    plan.writes = [{
      ...plan.writes[0]!,
      sourceChecksum: sha256Buffer(replacement),
      installedChecksum: sha256Buffer(Buffer.from('wrong checksum', 'utf-8')),
      content: replacement,
      expectedTargetChecksum: sha256Buffer(originalContent),
      action: 'update',
    }];
    const originalRename = fs.renameSync;
    let injected = false;
    const renameSpy = spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      originalRename(oldPath, newPath);
      if (String(newPath) === target) {
        injected = true;
        fs.writeFileSync(target, lateContent, 'utf-8');
      }
    });
    let failure: unknown;

    try {
      await applyInstallPlan(plan, { yes: true, interactive: false });
    } catch (error) {
      failure = error;
    } finally {
      renameSpy.mockRestore();
    }

    expect(injected).toBe(true);
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('Expected checksum verification to fail.');
    expect(failure.message).toContain('Checksum mismatch');
    expect(failure.message).toContain('Rollback preserved targets changed after installer publication');
    expect(failure.message).toContain(target);
    expect(fs.readFileSync(target, 'utf-8')).toBe(lateContent);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });

  test('preserves a target recreated after managed removal when a later publish fails', async () => {
    const consumer = makeConsumer();
    const plan = singleWritePlan(consumer);
    const target = path.join(consumer.root, '.claude', 'remove.txt');
    const originalContent = Buffer.from('managed removal content', 'utf-8');
    const recreatedContent = 'recreated after removal';
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, originalContent);
    plan.writes = [];
    plan.removals = [{
      targetPath: target,
      targetRelativePath: '.claude/remove.txt',
      previous: {
        plugin: 'tdk-core',
        sourceRelativePath: '.specify/source.txt',
        targetRelativePath: '.claude/remove.txt',
        sourceChecksum: sha256Buffer(originalContent),
        installedChecksum: sha256Buffer(originalContent),
      },
    }];
    const originalUnlink = fs.unlinkSync;
    const originalRename = fs.renameSync;
    let recreated = false;
    const unlinkSpy = spyOn(fs, 'unlinkSync').mockImplementation((filePath) => {
      originalUnlink(filePath);
      if (String(filePath) === target) {
        recreated = true;
        fs.writeFileSync(target, recreatedContent, 'utf-8');
      }
    });
    const renameSpy = spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      if (String(newPath) === plan.manifestPath) throw new Error('injected manifest publish failure');
      originalRename(oldPath, newPath);
    });
    let failure: unknown;

    try {
      await applyInstallPlan(plan, { yes: true, interactive: false });
    } catch (error) {
      failure = error;
    } finally {
      renameSpy.mockRestore();
      unlinkSpy.mockRestore();
    }

    expect(recreated).toBe(true);
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('Expected manifest publication to fail.');
    expect(failure.message).toContain('injected manifest publish failure');
    expect(failure.message).toContain('Rollback preserved targets changed after installer publication');
    expect(failure.message).toContain(target);
    expect(fs.readFileSync(target, 'utf-8')).toBe(recreatedContent);
    expect(fs.existsSync(plan.manifestPath)).toBe(false);
  });
});

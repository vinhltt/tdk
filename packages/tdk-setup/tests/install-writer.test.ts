import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverPluginInventory } from '../src/plugin-discovery';
import { emptyHarnessManifest, loadHarnessManifest } from '../src/manifest-store';
import { buildClaudeInstallPlan } from '../src/install-plan';
import { applyInstallPlan } from '../src/install-writer';
import { sha256Buffer } from '../src/checksum';
import { makeConsumer, writeBasicPlugin } from './fixtures';
import type { InstallPlan } from '../src/types';

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
        toPrefix: 'pav',
      },
    };

    await expect(applyInstallPlan(plan, { yes: true, interactive: false })).rejects.toThrow();

    const migrationDir = path.join(consumer.root, '.specify', 'state', 'harness-install', 'migrations');
    expect(fs.existsSync(migrationDir) ? fs.readdirSync(migrationDir) : []).toEqual([]);
  });
});

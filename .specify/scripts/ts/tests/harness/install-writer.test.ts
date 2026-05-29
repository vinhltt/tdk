import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverPluginInventory } from '../../src/commands/harness/plugin-discovery';
import { emptyHarnessManifest, loadHarnessManifest } from '../../src/commands/harness/manifest-store';
import { buildClaudeInstallPlan } from '../../src/commands/harness/install-plan';
import { applyInstallPlan } from '../../src/commands/harness/install-writer';
import { makeConsumer, writeBasicPlugin } from './fixtures';

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
});

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverPluginInventory } from '../../src/commands/harness/plugin-discovery';
import { emptyHarnessManifest } from '../../src/commands/harness/manifest-store';
import { buildClaudeInstallPlan } from '../../src/commands/harness/install-plan';
import { makeConsumer, writeBasicPlugin } from './fixtures';

function buildPlan(root: string) {
  const inventory = discoverPluginInventory(root, ['tdk-core']);
  return buildClaudeInstallPlan({
    consumerRoot: root,
    selectedPlugins: ['tdk-core'],
    plugins: inventory.plugins,
    previousManifest: emptyHarnessManifest(),
    settings: {},
  });
}

describe('buildClaudeInstallPlan', () => {
  test('plans writes without mutating filesystem', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const plan = buildPlan(consumer.root);

    expect(plan.writes.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md'))).toBe(false);
  });

  test('blocks unmanaged target collision', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const target = path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'user content', 'utf-8');

    const plan = buildPlan(consumer.root);

    expect(plan.collisions.some((collision) => collision.kind === 'unmanaged-target-exists')).toBe(true);
  });
});

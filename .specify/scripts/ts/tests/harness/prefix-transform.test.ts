import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { discoverPluginInventory } from '../../src/commands/harness/plugin-discovery';
import { emptyHarnessManifest } from '../../src/commands/harness/manifest-store';
import { buildClaudeInstallPlan } from '../../src/commands/harness/install-plan';
import { makeConsumer, writeMultiPluginManifest, writePluginFile, writePrefixedSkillPlugin } from './fixtures';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('prefix transform planning', () => {
  test('rewrites component target paths and text content before checksumming installed bytes', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);

    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
      sourcePrefix: 'tdk-',
      targetPrefix: 'pav-',
    });

    const write = plan.writes.find((item) => item.sourceRelativePath === 'skills/tdk-demo/SKILL.md');
    expect(write?.targetRelativePath).toBe(path.join('.claude', 'skills', 'pav-demo', 'SKILL.md'));
    expect(write?.content.toString('utf-8')).toContain('pav-demo');
    expect(write?.sourceChecksum).toBe(sha256('# tdk-demo\nUse tdk-demo from command text.\n'));
    expect(write?.installedChecksum).toBe(sha256('# pav-demo\nUse pav-demo from command text.\n'));
    expect(fs.existsSync(path.join(consumer.root, '.claude', 'skills', 'pav-demo', 'SKILL.md'))).toBe(false);
  });

  test('blocks duplicate transformed target paths', () => {
    const consumer = makeConsumer();
    const skill = '# tdk-demo\n';
    writePluginFile(consumer, 'skills/tdk-demo/SKILL.md', skill, 'tdk-core');
    writePluginFile(consumer, 'skills/tdk-demo/SKILL.md', skill, 'tdk-other');
    writeMultiPluginManifest(consumer, {
      'tdk-core': { version: '1.0.0', files: { 'skills/tdk-demo/SKILL.md': sha256(skill) } },
      'tdk-other': { version: '1.0.0', files: { 'skills/tdk-demo/SKILL.md': sha256(skill) } },
    });
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core', 'tdk-other']);

    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core', 'tdk-other'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
      sourcePrefix: 'tdk-',
      targetPrefix: 'pav-',
    });

    expect(plan.collisions.some((collision) => collision.message.includes('Duplicate transformed target path'))).toBe(true);
  });

  test('honors rewrite settings flags for text content', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);

    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
      sourcePrefix: 'tdk-',
      targetPrefix: 'pav-',
      rewrite: { paths: true, textFiles: false, hooks: true },
    });

    const write = plan.writes.find((item) => item.sourceRelativePath === 'skills/tdk-demo/SKILL.md');
    expect(write?.targetRelativePath).toBe(path.join('.claude', 'skills', 'pav-demo', 'SKILL.md'));
    expect(write?.content.toString('utf-8')).toContain('tdk-demo');
  });
});

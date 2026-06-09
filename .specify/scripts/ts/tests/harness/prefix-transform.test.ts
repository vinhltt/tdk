import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { discoverPluginInventory, discoverPrefixRewritePlugins } from '../../src/commands/harness/plugin-discovery';
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
    expect(write?.targetRelativePath).toBe('.claude/skills/pav-demo/SKILL.md');
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
    expect(write?.targetRelativePath).toBe('.claude/skills/pav-demo/SKILL.md');
    expect(write?.content.toString('utf-8')).toContain('tdk-demo');
  });

  test('rewrites plugin ids in installed target paths and text while preserving source identity', () => {
    const consumer = makeConsumer();
    const script = '#!/usr/bin/env python3\nprint("ok")\n';
    const skill = [
      '# tdk-memory-init',
      'Run /tdk-memory-update from tdk-memory.',
      'Script root: .claude/scripts/tdk-memory/compute-sha256-hashes.py',
      '',
    ].join('\n');
    writePluginFile(consumer, 'scripts/compute-sha256-hashes.py', script, 'tdk-memory');
    writePluginFile(consumer, 'skills/tdk-memory-init/SKILL.md', skill, 'tdk-memory');
    writeMultiPluginManifest(consumer, {
      'tdk-memory': {
        version: '1.0.0',
        files: {
          'scripts/compute-sha256-hashes.py': sha256(script),
          'skills/tdk-memory-init/SKILL.md': sha256(skill),
        },
      },
    });
    const inventory = discoverPluginInventory(consumer.root, ['tdk-memory']);

    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-memory'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
      sourcePrefix: 'tdk-',
      targetPrefix: 'erc-',
    });

    const scriptWrite = plan.writes.find((item) => item.sourceRelativePath === 'scripts/compute-sha256-hashes.py');
    expect(scriptWrite?.plugin).toBe('tdk-memory');
    expect(scriptWrite?.targetRelativePath).toBe('.claude/scripts/erc-memory/compute-sha256-hashes.py');

    const skillWrite = plan.writes.find((item) => item.sourceRelativePath === 'skills/tdk-memory-init/SKILL.md');
    expect(skillWrite?.plugin).toBe('tdk-memory');
    expect(skillWrite?.targetRelativePath).toBe('.claude/skills/erc-memory-init/SKILL.md');
    expect(skillWrite?.content.toString('utf-8')).toContain('Run /erc-memory-update from erc-memory.');
    expect(skillWrite?.content.toString('utf-8')).toContain('.claude/scripts/erc-memory/compute-sha256-hashes.py');
    expect(skillWrite?.sourceRelativePath).toBe('skills/tdk-memory-init/SKILL.md');
  });

  test('preserves official source plugin paths under custom prefix', () => {
    const consumer = makeConsumer();
    const skill = [
      '# tdk-sub-workspace-docs',
      'Use tdk-scout to inspect docs.',
      'Source check: ls .specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md',
      '',
    ].join('\n');
    writePluginFile(consumer, 'skills/tdk-sub-workspace-docs/SKILL.md', skill, 'tdk-core');
    writeMultiPluginManifest(consumer, {
      'tdk-core': {
        version: '1.0.0',
        files: { 'skills/tdk-sub-workspace-docs/SKILL.md': sha256(skill) },
      },
      'tdk-utils': {
        version: '1.0.0',
        files: { 'skills/tdk-scout/SKILL.md': sha256('# tdk-scout\n') },
      },
    });
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);

    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      rewritePlugins: discoverPrefixRewritePlugins(consumer.root),
      previousManifest: emptyHarnessManifest(),
      settings: {},
      sourcePrefix: 'tdk-',
      targetPrefix: 'erc-',
    });

    const content = plan.writes
      .find((item) => item.sourceRelativePath === 'skills/tdk-sub-workspace-docs/SKILL.md')
      ?.content.toString('utf-8');
    expect(content).toContain('Use erc-scout to inspect docs.');
    expect(content).toContain('Source check: ls .specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md');
    expect(content).not.toContain('.specify/plugins/erc-utils/skills/erc-scout');
  });

  test('rewrites cross-plugin content refs during subset custom-prefix installs', () => {
    const consumer = makeConsumer();
    const skill = [
      '# tdk-specify',
      'Preload with tdk-memory-preload before invoking tdk-scout.',
      '',
    ].join('\n');
    writePluginFile(consumer, 'skills/tdk-specify/SKILL.md', skill, 'tdk-core');
    writeMultiPluginManifest(consumer, {
      'tdk-core': {
        version: '1.0.0',
        files: { 'skills/tdk-specify/SKILL.md': sha256(skill) },
      },
      'tdk-memory': {
        version: '1.0.0',
        files: { 'skills/tdk-memory-preload/SKILL.md': sha256('# tdk-memory-preload\n') },
      },
      'tdk-utils': {
        version: '1.0.0',
        files: { 'skills/tdk-scout/SKILL.md': sha256('# tdk-scout\n') },
      },
    });
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);

    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      rewritePlugins: discoverPrefixRewritePlugins(consumer.root),
      previousManifest: emptyHarnessManifest(),
      settings: {},
      sourcePrefix: 'tdk-',
      targetPrefix: 'erc-',
    });

    const content = plan.writes
      .find((item) => item.sourceRelativePath === 'skills/tdk-specify/SKILL.md')
      ?.content.toString('utf-8');
    expect(content).toContain('Preload with erc-memory-preload before invoking erc-scout.');
    expect(content).not.toContain('tdk-memory-preload');
    expect(content).not.toContain('tdk-scout');
  });
});

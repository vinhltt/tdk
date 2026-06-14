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

  test('converts mapper-defined source plugin paths to .claude paths; preserves mapper-undefined source refs under custom prefix', () => {
    // Installed skill docs self-reference via .claude paths: a .specify/plugins/<plugin>/skills/...
    // segment whose family is mapper-defined (skills) converts to .claude/skills/<name>/ with the target prefix.
    // Manifest refs and hooks/hooks.json refs are genuine source pointers — mapper-undefined — and stay verbatim.
    const consumer = makeConsumer();
    const skill = [
      '# tdk-sub-workspace-docs',
      'Use tdk-scout to inspect docs.',
      'Source check: ls .specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md',
      'Plugin manifest: .specify/plugins/tdk-utils/manifest.json',
      'Hook source: .specify/plugins/tdk-utils/hooks/hooks.json.',
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
    // Prose tdk- token gets blanket-rewritten
    expect(content).toContain('Use erc-scout to inspect docs.');
    // skills family is mapper-defined → drops plugin segment, converts to .claude/skills/erc-scout/SKILL.md
    expect(content).toContain('Source check: ls .claude/skills/erc-scout/SKILL.md');
    // manifest.json is mapper-undefined → stays verbatim as tdk-utils source ref (not converted, not blanketed)
    expect(content).toContain('.specify/plugins/tdk-utils/manifest.json');
    // hooks/hooks.json (with trailing punctuation) is mapper-undefined → stays verbatim
    expect(content).toContain('.specify/plugins/tdk-utils/hooks/hooks.json.');
    // Blanket never produces erc-utils as a plugin dir (plugin segment is dropped on conversion)
    expect(content).not.toContain('.specify/plugins/erc-utils/skills/erc-scout');
    // Manifest verbatim ref must not be converted to an erc-utils path
    expect(content).not.toContain('erc-utils');
  });

  test('rewrites installed brand words and placeholder source refs before checksumming', () => {
    const consumer = makeConsumer();
    const skill = [
      '# tdk-harness-guide',
      'TDK Skill Guide',
      'Use the tdk guide before tdk-scout.',
      'Preserve TDK_PROJECT_ROOT.',
      'Skill template: .specify/plugins/tdk-scaffold/skills/<name>/',
      'Agent template: .specify/plugins/tdk-scaffold/agents/<name>.md',
      'Existing skill dir: .specify/plugins/tdk-utils/skills/tdk-scout/',
      '',
    ].join('\n');
    const expected = [
      '# pav-harness-guide',
      'PAV Skill Guide',
      'Use the pav guide before pav-scout.',
      'Preserve TDK_PROJECT_ROOT.',
      'Skill template: .claude/skills/<name>/',
      'Agent template: .claude/agents/<name>.md',
      'Existing skill dir: .claude/skills/pav-scout/',
      '',
    ].join('\n');
    writePluginFile(consumer, 'skills/tdk-harness-guide/SKILL.md', skill, 'tdk-core');
    writeMultiPluginManifest(consumer, {
      'tdk-core': {
        version: '1.0.0',
        files: { 'skills/tdk-harness-guide/SKILL.md': sha256(skill) },
      },
    });
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

    const write = plan.writes.find((item) => item.sourceRelativePath === 'skills/tdk-harness-guide/SKILL.md');
    expect(write?.targetRelativePath).toBe('.claude/skills/pav-harness-guide/SKILL.md');
    expect(write?.content.toString('utf-8')).toBe(expected);
    expect(write?.sourceChecksum).toBe(sha256(skill));
    expect(write?.installedChecksum).toBe(sha256(expected));
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

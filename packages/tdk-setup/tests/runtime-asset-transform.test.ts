import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverPluginInventory } from '../src/plugin-discovery';
import { emptyHarnessManifest } from '../src/manifest-store';
import { buildClaudeInstallPlan } from '../src/install-plan';
import { makeConsumer, pluginRoot, sha256, writeMultiPluginManifest, writePluginFile } from './fixtures';

const cliPath = path.resolve('src/index.ts');

function buildPlan(consumer: ReturnType<typeof makeConsumer>, plugins: string[], targetPrefix = 'tdk-') {
  const inventory = discoverPluginInventory(consumer.root, plugins);
  return buildClaudeInstallPlan({
    consumerRoot: consumer.root,
    selectedPlugins: plugins,
    plugins: inventory.plugins,
    previousManifest: emptyHarnessManifest(),
    settings: {},
    sourcePrefix: 'tdk-',
    targetPrefix,
  });
}

function writeMemoryRuntimePlugin(consumer: ReturnType<typeof makeConsumer>, skillContent: string): void {
  const script = '#!/usr/bin/env python3\nprint("ok")\n';
  writePluginFile(consumer, 'scripts/compute-sha256-hashes.py', script, 'tdk-memory');
  writePluginFile(consumer, 'skills/tdk-memory-init/SKILL.md', skillContent, 'tdk-memory');
  writeMultiPluginManifest(consumer, {
    'tdk-memory': {
      version: '1.0.0',
      files: {
        'scripts/compute-sha256-hashes.py': sha256(script),
        'skills/tdk-memory-init/SKILL.md': sha256(skillContent),
      },
    },
  });
}

describe('runtime asset transform planning', () => {
  test('rewrites plugin-level script placeholders before checksumming installed bytes', () => {
    const consumer = makeConsumer();
    writeMemoryRuntimePlugin(
      consumer,
      '# Skill\nRun "${TDK_PLUGIN_SCRIPT_ROOT}/tdk-memory/compute-sha256-hashes.py"\n',
    );

    const plan = buildPlan(consumer, ['tdk-memory']);
    const write = plan.writes.find((item) => item.sourceRelativePath === 'skills/tdk-memory-init/SKILL.md');

    expect(write?.content.toString('utf-8')).toContain('$(pwd)/.claude/scripts/tdk-memory/compute-sha256-hashes.py');
    expect(write?.content.toString('utf-8')).not.toContain('TDK_PLUGIN_SCRIPT_ROOT');
    expect(write?.installedChecksum).toBe(sha256('# Skill\nRun "$(pwd)/.claude/scripts/tdk-memory/compute-sha256-hashes.py"\n'));
  });

  test('rewrites skill-local placeholders using transformed skill target paths', () => {
    const consumer = makeConsumer();
    const skill = '# Skill\nRun "${TDK_SKILL_ROOT}/scripts/validate.py"\n';
    const script = '#!/usr/bin/env python3\nprint("valid")\n';
    writePluginFile(consumer, 'skills/tdk-memory-checksum/SKILL.md', skill, 'tdk-memory');
    writePluginFile(consumer, 'skills/tdk-memory-checksum/scripts/validate.py', script, 'tdk-memory');
    writeMultiPluginManifest(consumer, {
      'tdk-memory': {
        version: '1.0.0',
        files: {
          'skills/tdk-memory-checksum/SKILL.md': sha256(skill),
          'skills/tdk-memory-checksum/scripts/validate.py': sha256(script),
        },
      },
    });

    const plan = buildPlan(consumer, ['tdk-memory'], 'sample-');
    const write = plan.writes.find((item) => item.sourceRelativePath === 'skills/tdk-memory-checksum/SKILL.md');

    expect(write?.targetRelativePath).toBe('.claude/skills/sample-memory-checksum/SKILL.md');
    expect(write?.content.toString('utf-8')).toContain('$(pwd)/.claude/skills/sample-memory-checksum/scripts/validate.py');
    expect(write?.content.toString('utf-8')).not.toContain('TDK_SKILL_ROOT');
  });

  test('fails planning when runtime asset placeholders cannot be resolved', () => {
    const consumer = makeConsumer();
    const skill = '# Skill\nRun "${TDK_PLUGIN_SCRIPT_ROOT}/tdk-memory/missing.py"\n';
    writePluginFile(consumer, 'skills/tdk-memory-init/SKILL.md', skill, 'tdk-memory');
    writeMultiPluginManifest(consumer, {
      'tdk-memory': {
        version: '1.0.0',
        files: {
          'skills/tdk-memory-init/SKILL.md': sha256(skill),
        },
      },
    });

    expect(() => buildPlan(consumer, ['tdk-memory'])).toThrow(/runtime asset/i);
  });

  test('rewrites exact source-plugin script refs in runnable and catalog mentions', () => {
    const consumer = makeConsumer();
    writeMemoryRuntimePlugin(
      consumer,
      [
        '# Skill',
        'Run "$(pwd)/.specify/plugins/tdk-memory/scripts/compute-sha256-hashes.py"',
        'Catalog mention: `.specify/plugins/tdk-memory/scripts/compute-sha256-hashes.py`',
        '',
      ].join('\n'),
    );

    const plan = buildPlan(consumer, ['tdk-memory']);
    const content = plan.writes
      .find((item) => item.sourceRelativePath === 'skills/tdk-memory-init/SKILL.md')
      ?.content.toString('utf-8');

    expect(content).toContain('Run "$(pwd)/.claude/scripts/tdk-memory/compute-sha256-hashes.py"');
    expect(content).toContain('Catalog mention: `.claude/scripts/tdk-memory/compute-sha256-hashes.py`');
  });

  test('rewrites exact executable skill-local source script refs', () => {
    const consumer = makeConsumer();
    const skill = '# Skill\nRun "$(pwd)/.specify/plugins/tdk-memory/skills/tdk-memory-checksum/scripts/validate.py"\n';
    const script = '#!/usr/bin/env python3\nprint("valid")\n';
    writePluginFile(consumer, 'skills/tdk-memory-checksum/SKILL.md', skill, 'tdk-memory');
    writePluginFile(consumer, 'skills/tdk-memory-checksum/scripts/validate.py', script, 'tdk-memory');
    writeMultiPluginManifest(consumer, {
      'tdk-memory': {
        version: '1.0.0',
        files: {
          'skills/tdk-memory-checksum/SKILL.md': sha256(skill),
          'skills/tdk-memory-checksum/scripts/validate.py': sha256(script),
        },
      },
    });

    const plan = buildPlan(consumer, ['tdk-memory']);
    const content = plan.writes
      .find((item) => item.sourceRelativePath === 'skills/tdk-memory-checksum/SKILL.md')
      ?.content.toString('utf-8');

    expect(content).toContain('Run "$(pwd)/.claude/skills/tdk-memory-checksum/scripts/validate.py"');
    expect(content).not.toContain('$(pwd)/.specify/plugins/tdk-memory/skills/tdk-memory-checksum/scripts');
  });

  test('installed output keeps runnable script refs after plugin source is removed', () => {
    const consumer = makeConsumer();
    writeMemoryRuntimePlugin(
      consumer,
      '# Skill\nRun "${CLAUDE_PLUGIN_ROOT}/scripts/compute-sha256-hashes.py"\n',
    );

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'install', '--harness', 'claude', '--plugins', 'tdk-memory', '--yes'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);

    fs.rmSync(pluginRoot(consumer, 'tdk-memory'), { recursive: true, force: true });
    const installedSkill = fs.readFileSync(
      path.join(consumer.root, '.claude', 'skills', 'tdk-memory-init', 'SKILL.md'),
      'utf-8',
    );

    expect(installedSkill).toContain('$(pwd)/.claude/scripts/tdk-memory/compute-sha256-hashes.py');
    expect(installedSkill).not.toContain('CLAUDE_PLUGIN_ROOT');
    expect(installedSkill).not.toContain('TDK_PLUGIN_SCRIPT_ROOT');
    expect(installedSkill).not.toContain('$(pwd)/.specify/plugins/tdk-memory/scripts');
    expect(fs.existsSync(path.join(consumer.root, '.claude', 'scripts', 'tdk-memory', 'compute-sha256-hashes.py'))).toBe(true);
  });

  test('rewrites plugin-level runtime asset refs to transformed script plugin folders', () => {
    const consumer = makeConsumer();
    writeMemoryRuntimePlugin(
      consumer,
      '# Skill\nRun "${CLAUDE_PLUGIN_ROOT}/scripts/compute-sha256-hashes.py"\n',
    );

    const plan = buildPlan(consumer, ['tdk-memory'], 'erc-');
    const write = plan.writes.find((item) => item.sourceRelativePath === 'skills/tdk-memory-init/SKILL.md');

    expect(plan.writes.map((item) => item.targetRelativePath)).toContain('.claude/scripts/erc-memory/compute-sha256-hashes.py');
    expect(write?.targetRelativePath).toBe('.claude/skills/erc-memory-init/SKILL.md');
    expect(write?.content.toString('utf-8')).toContain('$(pwd)/.claude/scripts/erc-memory/compute-sha256-hashes.py');
    expect(write?.content.toString('utf-8')).not.toContain('.claude/scripts/tdk-memory');
  });
});

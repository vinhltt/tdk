import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildClaudeInstallPlan } from '../src/install-plan';
import { emptyHarnessManifest } from '../src/manifest-store';
import { discoverPluginInventory } from '../src/plugin-discovery';
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

function writeChecksumSkill(consumer: ReturnType<typeof makeConsumer>, skill: string): void {
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
}

describe('runtime asset transform regressions', () => {
  test('rewrites custom-prefix legacy skill-local source script refs', () => {
    const consumer = makeConsumer();
    writeChecksumSkill(
      consumer,
      '# Skill\nRun "$(pwd)/.specify/plugins/tdk-memory/skills/tdk-memory-checksum/scripts/validate.py"\n',
    );

    const plan = buildPlan(consumer, ['tdk-memory'], 'sample-');
    const content = plan.writes
      .find((item) => item.sourceRelativePath === 'skills/tdk-memory-checksum/SKILL.md')
      ?.content.toString('utf-8');

    expect(content).toContain('$(pwd)/.claude/skills/sample-memory-checksum/scripts/validate.py');
    expect(content).not.toContain('.specify/plugins/tdk-memory/skills');
  });

  test('rewrites CLAUDE_SKILL_DIR using transformed skill target paths', () => {
    const consumer = makeConsumer();
    writeChecksumSkill(
      consumer,
      '# Skill\nRun "${CLAUDE_SKILL_DIR}/scripts/validate.py"\n',
    );

    const plan = buildPlan(consumer, ['tdk-memory'], 'sample-');
    const content = plan.writes
      .find((item) => item.sourceRelativePath === 'skills/tdk-memory-checksum/SKILL.md')
      ?.content.toString('utf-8');

    expect(content).toContain('$(pwd)/.claude/skills/sample-memory-checksum/scripts/validate.py');
    expect(content).not.toContain('CLAUDE_SKILL_DIR');
  });

  test('rewrites relative executable plugin script refs and catalog mentions', () => {
    const consumer = makeConsumer();
    const script = '#!/usr/bin/env python3\nprint("ok")\n';
    const skill = [
      '# Skill',
      'Run python .specify/plugins/tdk-memory/scripts/compute-sha256-hashes.py',
      'Catalog mention: `.specify/plugins/tdk-memory/scripts/compute-sha256-hashes.py`',
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

    const plan = buildPlan(consumer, ['tdk-memory']);
    const content = plan.writes
      .find((item) => item.sourceRelativePath === 'skills/tdk-memory-init/SKILL.md')
      ?.content.toString('utf-8');

    expect(content).toContain('Run python $(pwd)/.claude/scripts/tdk-memory/compute-sha256-hashes.py');
    expect(content).toContain('Catalog mention: `.claude/scripts/tdk-memory/compute-sha256-hashes.py`');
  });

  test('actual migrated memory and utility skills install runnable script refs without source plugins', () => {
    const consumer = makeConsumer();
    const sourcePlugins = path.resolve('../../.specify/plugins');
    fs.cpSync(path.join(sourcePlugins, 'tdk-memory'), pluginRoot(consumer, 'tdk-memory'), { recursive: true });
    fs.cpSync(path.join(sourcePlugins, 'tdk-utils'), pluginRoot(consumer, 'tdk-utils'), { recursive: true });
    fs.copyFileSync(
      path.join(sourcePlugins, 'manifest.json'),
      path.join(consumer.root, '.specify', 'plugins', 'manifest.json'),
    );

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'install', '--harness', 'claude', '--plugins', 'tdk-memory,tdk-utils', '--yes'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());

    fs.rmSync(pluginRoot(consumer, 'tdk-memory'), { recursive: true, force: true });
    fs.rmSync(pluginRoot(consumer, 'tdk-utils'), { recursive: true, force: true });

    const expectations = [
      ['skills/tdk-memory-changelog/SKILL.md', 'scripts/tdk-memory/compute-sha256-hashes.py'],
      ['skills/tdk-memory-checksum/SKILL.md', 'skills/tdk-memory-checksum/scripts/validate-memory-checksums-against-manifest.py'],
      ['skills/brainstorming/SKILL.md', 'skills/brainstorming/scripts/brainstorm.py'],
      ['skills/shard-doc/SKILL.md', 'skills/shard-doc/scripts/shard_doc.py'],
    ];

    for (const [skillPath, scriptPath] of expectations) {
      const installedSkill = fs.readFileSync(path.join(consumer.root, '.claude', skillPath), 'utf-8');
      expect(installedSkill).toContain(`$(pwd)/.claude/${scriptPath}`);
      expect(installedSkill).not.toContain('CLAUDE_PLUGIN_ROOT');
      expect(installedSkill).not.toContain('CLAUDE_SKILL_DIR');
      expect(installedSkill).not.toContain('TDK_PLUGIN_SCRIPT_ROOT');
      expect(installedSkill).not.toContain('TDK_SKILL_ROOT');
      expect(installedSkill).not.toContain('$(pwd)/.specify/plugins');
      expect(fs.existsSync(path.join(consumer.root, '.claude', scriptPath))).toBe(true);
    }
  });

  test('actual memory plugin custom-prefix install uses transformed script plugin folders', () => {
    const consumer = makeConsumer();
    const sourcePlugins = path.resolve('../../.specify/plugins');
    fs.cpSync(path.join(sourcePlugins, 'tdk-memory'), pluginRoot(consumer, 'tdk-memory'), { recursive: true });
    fs.copyFileSync(
      path.join(sourcePlugins, 'manifest.json'),
      path.join(consumer.root, '.specify', 'plugins', 'manifest.json'),
    );

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'install', '--harness', 'claude', '--plugins', 'tdk-memory', '--prefix', 'erc', '--yes'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());

    fs.rmSync(pluginRoot(consumer, 'tdk-memory'), { recursive: true, force: true });

    const installedSkill = fs.readFileSync(
      path.join(consumer.root, '.claude', 'skills', 'erc-memory-init', 'SKILL.md'),
      'utf-8',
    );
    expect(installedSkill).toContain('$(pwd)/.claude/scripts/erc-memory/compute-sha256-hashes.py');
    expect(installedSkill).not.toContain('.claude/scripts/tdk-memory');
    expect(fs.existsSync(path.join(consumer.root, '.claude', 'scripts', 'erc-memory', 'compute-sha256-hashes.py'))).toBe(true);
    expect(fs.existsSync(path.join(consumer.root, '.claude', 'scripts', 'tdk-memory', 'compute-sha256-hashes.py'))).toBe(false);
  });
});

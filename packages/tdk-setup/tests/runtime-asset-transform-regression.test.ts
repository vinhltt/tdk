import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildClaudeInstallPlan } from '../src/install-plan';
import { emptyHarnessManifest } from '../src/manifest-store';
import { discoverPluginInventory } from '../src/plugin-discovery';
import {
  makeConsumer,
  pluginRoot,
  sha256,
  writeMultiPluginManifest,
  writePluginDependencyPolicy,
  writePluginFile,
  type FixtureConsumer,
} from './fixtures';

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

function verifyInstalledMemoryRuntime(consumer: FixtureConsumer, prefix: string): void {
  const documents = [
    `${prefix}memory-changelog/SKILL.md`,
    `${prefix}memory-checksum/SKILL.md`,
    `${prefix}memory-init/references/fresh-init-flow.md`,
    `${prefix}memory-init/references/memory-root-and-asset-contract.md`,
    `${prefix}memory-update/references/flow-update.md`,
  ];
  const runtimeRefs = new Set<string>();
  for (const document of documents) {
    const content = fs.readFileSync(path.join(consumer.root, '.claude/skills', document), 'utf-8');
    const commands = [...content.matchAll(/^node\s+"([^"\n]+\.cjs)"\s+(?:hash|validate)\b/gm)];
    if (commands.length === 0) throw new Error(`No memory runtime command in installed ${document}`);
    for (const command of commands) runtimeRefs.add(command[1]);
  }
  expect([...runtimeRefs]).toEqual([
    `$(pwd)/.claude/skills/${prefix}memory-checksum/scripts/memory-manifest.cjs`,
  ]);
  const runtime = [...runtimeRefs][0].replace('$(pwd)', consumer.root);
  const memoryRoot = path.join(consumer.root, 'docs', 'brain');
  const note = '# Invoice\nAmount: 12500 VND.\n';
  const index = '# Memory\n[[data-model/invoice]]\n';
  fs.mkdirSync(path.join(memoryRoot, 'data-model'), { recursive: true });
  fs.writeFileSync(path.join(memoryRoot, 'data-model/invoice.md'), note);
  fs.writeFileSync(path.join(memoryRoot, 'memory-index.md'), index);
  fs.writeFileSync(path.join(memoryRoot, 'memory.yaml'), [
    'version: "2"',
    'generated_at: "2026-09-22T00:00:00Z"',
    `memory_index_sha256: ${sha256(index)}`,
    'files:',
    '  - path: data-model/invoice.md',
    `    sha256: ${sha256(note)}`,
    '    updated_at: "2026-09-22T00:00:00Z"',
    '    updated_by: integration-test',
    '',
  ].join('\n'));
  const env = { ...process.env };
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.CLAUDE_SKILL_DIR;
  delete env.CLAUDE_PROJECT_DIR;
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  const hash = Bun.spawnSync({
    cmd: ['node', runtime, 'hash', memoryRoot, 'data-model/invoice.md'],
    cwd: consumer.root, env, stdout: 'pipe', stderr: 'pipe',
  });
  if (hash.exitCode !== 0) throw new Error(hash.stderr.toString());
  expect(hash.stdout.toString().trim()).toBe(sha256(note));
  const validation = Bun.spawnSync({
    cmd: ['node', runtime, 'validate', memoryRoot],
    cwd: consumer.root, env, stdout: 'pipe', stderr: 'pipe',
  });
  if (validation.exitCode !== 0) throw new Error(validation.stderr.toString());
  expect(JSON.parse(validation.stdout.toString())).toEqual({
    mismatches: [],
    missing_from_manifest: [],
    missing_from_disk: [],
    verified_count: 1,
    index_mismatch: false,
    templates_mismatches: [],
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
    writePluginDependencyPolicy(consumer);

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'install', '--harness', 'claude', '--plugins', 'tdk-memory,tdk-utils', '--yes'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());

    fs.rmSync(pluginRoot(consumer, 'tdk-memory'), { recursive: true, force: true });
    fs.rmSync(pluginRoot(consumer, 'tdk-utils'), { recursive: true, force: true });
    verifyInstalledMemoryRuntime(consumer, 'tdk-');

    const expectations = [
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

  test('actual memory plugin custom-prefix install runs the transformed skill-local runtime without source plugins', () => {
    const consumer = makeConsumer();
    const sourcePlugins = path.resolve('../../.specify/plugins');
    fs.cpSync(path.join(sourcePlugins, 'tdk-memory'), pluginRoot(consumer, 'tdk-memory'), { recursive: true });
    fs.copyFileSync(
      path.join(sourcePlugins, 'manifest.json'),
      path.join(consumer.root, '.specify', 'plugins', 'manifest.json'),
    );
    writePluginDependencyPolicy(consumer);

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'install', '--harness', 'claude', '--plugins', 'tdk-memory', '--prefix', 'erc', '--yes'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());

    fs.rmSync(pluginRoot(consumer, 'tdk-memory'), { recursive: true, force: true });

    verifyInstalledMemoryRuntime(consumer, 'erc-');
    expect(fs.existsSync(path.join(consumer.root, '.claude', 'skills', 'tdk-memory-checksum'))).toBe(false);
  });
});

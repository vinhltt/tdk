import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  makeConsumer,
  sha256,
  writeBasicPlugin,
  writeMultiPluginManifest,
  writePluginDependencyPolicy,
  writePluginFile,
} from './fixtures';

const cliPath = path.resolve('src/index.ts');
const basePolicy = {
  requiredPlugins: ['tdk-core', 'tdk-inception'],
  dependencies: {
    'tdk-core': ['tdk-utils'],
    'tdk-inception': ['tdk-memory', 'tdk-utils'],
  },
};

function addPlugin(consumer: ReturnType<typeof makeConsumer>, plugin: string, skill: string): void {
  writePluginFile(consumer, `skills/${plugin}/SKILL.md`, skill, plugin);
  const manifestPath = path.join(consumer.root, '.specify', 'plugins', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { plugins: Record<string, unknown> };
  manifest.plugins[plugin] = {
    version: '1.0.0',
    components: { skills: {}, agents: {}, hooks: {}, commands: {} },
    files: { [`skills/${plugin}/SKILL.md`]: sha256(skill) },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

function writeBaseCatalog(consumer: ReturnType<typeof makeConsumer>, withEpic = false): void {
  writeBasicPlugin(consumer);
  addPlugin(consumer, 'tdk-inception', '# Inception\n');
  addPlugin(consumer, 'tdk-memory', '# Memory\n');
  addPlugin(consumer, 'tdk-utils', '# Utils\n');
  if (withEpic) addPlugin(consumer, 'tdk-epic', '# Epic\n');
  writePluginDependencyPolicy(consumer, basePolicy);
}

function runInstall(consumer: ReturnType<typeof makeConsumer>, args: string[]) {
  return Bun.spawnSync({
    cmd: ['bun', cliPath, 'install', ...args],
    cwd: consumer.scriptsDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

describe('harness install CLI', () => {
  test('base-only compatibility syntax resolves the required closure', () => {
    const consumer = makeConsumer();
    writeBaseCatalog(consumer);

    const result = runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Requested optional plugins: (none)');
    expect(result.stdout.toString()).toContain('Resolved plugins: tdk-core, tdk-inception, tdk-memory, tdk-utils');
    expect(result.stdout.toString()).toContain('.claude/skills/tdk-inception/SKILL.md');
  });

  test('accepts an explicit optional plugin and resolves it with the base', () => {
    const consumer = makeConsumer();
    writeBaseCatalog(consumer, true);

    const result = runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-epic', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Requested optional plugins: tdk-epic');
    expect(result.stdout.toString()).toContain('Resolved plugins: tdk-core, tdk-epic, tdk-inception, tdk-memory, tdk-utils');
    expect(result.stdout.toString()).toContain('.claude/skills/tdk-epic/SKILL.md');
  });

  test('--all-plugins requests the full optional catalog', () => {
    const consumer = makeConsumer();
    writeBaseCatalog(consumer, true);

    const result = runInstall(consumer, ['--harness', 'claude', '--all-plugins', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Requested optional plugins: tdk-epic');
    expect(result.stdout.toString()).toContain('Resolved plugins: tdk-core, tdk-epic, tdk-inception, tdk-memory, tdk-utils');
  });

  test('non-TTY omission errors even with a valid policy', () => {
    const consumer = makeConsumer();
    writeBaseCatalog(consumer);

    const result = runInstall(consumer, ['--harness', 'claude', '--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('No plugin selector provided');
  });

  test('preserves the --plugins and --all-plugins conflict', () => {
    const consumer = makeConsumer();
    writeBaseCatalog(consumer);

    const result = runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core', '--all-plugins', '--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('--plugins conflicts with --all-plugins');
  });

  test('codex preflight supports a minimal explicit fixture policy', () => {
    const consumer = makeConsumer('tdk-cli-codex-');
    const plugin = 'tdk-memory';
    const skill = '# demo\n';
    const agentMd = '---\nname: tdk-demo\ndescription: Demo\ntools: Read\n---\n\nDemo agent.\n';
    const codexBase = path.join(consumer.root, '.specify', 'codex-plugins', plugin);
    fs.mkdirSync(path.join(codexBase, 'skills', 'tdk-demo'), { recursive: true });
    fs.writeFileSync(path.join(codexBase, 'skills', 'tdk-demo', 'SKILL.md'), skill, 'utf-8');
    fs.mkdirSync(path.join(codexBase, '.codex-plugin'), { recursive: true });
    const pluginJson = '{"name":"tdk-memory","version":"1.0.0"}\n';
    fs.writeFileSync(path.join(codexBase, '.codex-plugin', 'plugin.json'), pluginJson, 'utf-8');
    writePluginFile(consumer, 'agents/tdk-demo.md', agentMd, plugin);
    writeMultiPluginManifest(consumer, {
      [plugin]: { version: '1.0.0', files: { 'agents/tdk-demo.md': sha256(agentMd) } },
    });
    fs.writeFileSync(path.join(consumer.root, '.specify', 'codex-plugins', 'manifest.json'), JSON.stringify({
      algorithm: 'sha256',
      plugins: {
        [plugin]: {
          version: '1.0.0',
          files: {
            'skills/tdk-demo/SKILL.md': sha256(skill),
            '.codex-plugin/plugin.json': sha256(pluginJson),
          },
        },
      },
    }, null, 2), 'utf-8');
    writePluginDependencyPolicy(consumer);

    const result = runInstall(consumer, ['--harness', 'codex', '--plugins', plugin, '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Resolved plugins: tdk-memory');
    expect(result.stdout.toString()).toContain('.agents/skills/tdk-demo/SKILL.md');
  });

  test('dry-run reports overwrite prompts without a blocker exit', () => {
    const consumer = makeConsumer();
    writeBaseCatalog(consumer);
    const target = path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'user content', 'utf-8');

    const result = runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Prompts:');
    expect(result.stdout.toString()).toContain('overwrite: .claude/skills/demo/SKILL.md');
  });
});

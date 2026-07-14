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
  writePrefixedSkillPlugin,
} from './fixtures';

const cliPath = path.resolve('src/index.ts');

function runInstall(consumer: ReturnType<typeof makeConsumer>, args: string[]) {
  return Bun.spawnSync({
    cmd: ['bun', cliPath, 'install', ...args],
    cwd: consumer.scriptsDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function addUtilsPlugin(consumer: ReturnType<typeof makeConsumer>): void {
  const coreSkill = '# tdk-demo\nUse tdk-demo from command text.\n';
  const utilsSkill = '# tdk-validate-task-id\n';

  writePluginFile(consumer, 'skills/tdk-validate-task-id/SKILL.md', utilsSkill, 'tdk-utils');
  writeMultiPluginManifest(consumer, {
    'tdk-core': {
      version: '1.0.0',
      files: { 'skills/tdk-demo/SKILL.md': sha256(coreSkill) },
    },
    'tdk-utils': {
      version: '1.0.0',
      files: { 'skills/tdk-validate-task-id/SKILL.md': sha256(utilsSkill) },
    },
  });
  writePluginDependencyPolicy(consumer);
}

const productionBasePolicy = {
  requiredPlugins: ['tdk-core', 'tdk-inception'],
  dependencies: {
    'tdk-core': ['tdk-utils'],
    'tdk-inception': ['tdk-memory', 'tdk-utils'],
  },
};

function addCatalogPlugin(consumer: ReturnType<typeof makeConsumer>, plugin: string): void {
  const skill = `# ${plugin}\n`;
  const manifestPath = path.join(consumer.root, '.specify', 'plugins', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { plugins: Record<string, unknown> };
  writePluginFile(consumer, `skills/${plugin}/SKILL.md`, skill, plugin);
  manifest.plugins[plugin] = {
    version: '1.0.0',
    components: { skills: {}, agents: {}, hooks: {}, commands: {} },
    files: { [`skills/${plugin}/SKILL.md`]: sha256(skill) },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

function writeProductionBaseCatalog(consumer: ReturnType<typeof makeConsumer>): void {
  writeBasicPlugin(consumer);
  for (const plugin of ['tdk-inception', 'tdk-memory', 'tdk-utils', 'tdk-epic']) addCatalogPlugin(consumer, plugin);
  writePluginDependencyPolicy(consumer, productionBasePolicy);
}

function writeCodexPackageCatalog(consumer: ReturnType<typeof makeConsumer>, plugins: string[]): void {
  const manifestPlugins: Record<string, unknown> = {};
  for (const plugin of plugins) {
    const pluginJson = `${JSON.stringify({ name: plugin, version: '1.0.0' })}\n`;
    const pluginJsonPath = path.join(consumer.root, '.specify', 'codex-plugins', plugin, '.codex-plugin', 'plugin.json');
    fs.mkdirSync(path.dirname(pluginJsonPath), { recursive: true });
    fs.writeFileSync(pluginJsonPath, pluginJson, 'utf-8');
    manifestPlugins[plugin] = {
      version: '1.0.0',
      files: { '.codex-plugin/plugin.json': sha256(pluginJson) },
    };
  }
  fs.writeFileSync(path.join(consumer.root, '.specify', 'codex-plugins', 'manifest.json'), JSON.stringify({
    algorithm: 'sha256',
    plugins: manifestPlugins,
  }, null, 2), 'utf-8');
}

describe('harness install CLI settings flow', () => {
  test('first non-TTY install persists custom prefix and transformed target', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);
    addUtilsPlugin(consumer);

    const result = runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core,tdk-utils', '--prefix', 'sample', '--yes']);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(consumer.root, '.claude', 'skills', 'sample-demo', 'SKILL.md'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(consumer.root, '.specify', 'install-settings.json'), 'utf-8')).defaults.targetPrefix).toBe('sample-');
  });

  test('existing settings never authorize non-TTY selector omission', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);
    addUtilsPlugin(consumer);
    expect(runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core,tdk-utils', '--yes']).exitCode).toBe(0);

    const result = runInstall(consumer, ['--harness', 'claude', '--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('No plugin selector provided');
  });

  test('claude,codex rejects combined harness installs for v1', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);

    const result = runInstall(consumer, ['--harness', 'claude,codex', '--plugins', 'tdk-core', '--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('Combined Claude+Codex installs are not supported');
    expect(result.stdout.toString()).not.toContain('Harness install plan');
  });

  test('base-only and Codex optional installs keep global intent separate from resolved harness ownership', () => {
    const consumer = makeConsumer();
    const baseClosure = ['tdk-core', 'tdk-inception', 'tdk-memory', 'tdk-utils'];
    const codexResolved = ['tdk-core', 'tdk-epic', 'tdk-inception', 'tdk-memory', 'tdk-utils'];
    writeProductionBaseCatalog(consumer);

    expect(runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core', '--yes']).exitCode).toBe(0);
    const claudeManifestPath = path.join(consumer.root, '.specify', 'state', 'harness-install', 'claude.json');
    const claudeBeforeCodex = fs.readFileSync(claudeManifestPath, 'utf-8');
    const afterClaude = JSON.parse(fs.readFileSync(path.join(consumer.root, '.specify', 'install-settings.json'), 'utf-8'));
    expect(afterClaude.defaults.selectedPlugins).toEqual([]);
    expect(JSON.parse(claudeBeforeCodex).selectedPlugins).toEqual(baseClosure);

    writeCodexPackageCatalog(consumer, codexResolved);
    expect(runInstall(consumer, ['--harness', 'codex', '--plugins', 'tdk-epic', '--yes']).exitCode).toBe(0);
    const settings = JSON.parse(fs.readFileSync(path.join(consumer.root, '.specify', 'install-settings.json'), 'utf-8'));
    const claude = JSON.parse(fs.readFileSync(claudeManifestPath, 'utf-8'));
    const codex = JSON.parse(fs.readFileSync(path.join(consumer.root, '.specify', 'state', 'harness-install', 'codex.json'), 'utf-8'));

    expect(settings.defaults.selectedPlugins).toEqual(['tdk-epic']);
    expect(claude.selectedPlugins).toEqual(baseClosure);
    expect(codex.selectedPlugins).toEqual(codexResolved);
    expect(fs.readFileSync(claudeManifestPath, 'utf-8')).toBe(claudeBeforeCodex);
  });

  test('blocks existing prefix changes unless explicit migration flag is used', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);
    addUtilsPlugin(consumer);
    expect(runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core,tdk-utils', '--prefix', 'sample', '--yes']).exitCode).toBe(0);

    const blocked = runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core,tdk-utils', '--prefix', 'ck', '--dry-run']);
    const migration = runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core,tdk-utils', '--migrate-prefix', 'ck', '--dry-run']);

    expect(blocked.exitCode).toBe(1);
    expect(blocked.stderr.toString()).toContain('--migrate-prefix');
    expect(migration.exitCode).toBe(0);
    expect(migration.stdout.toString()).toContain('Prefix migration: sample- -> ck-');
    expect(migration.stdout.toString()).toContain('create: .claude/skills/ck-demo/SKILL.md');
    expect(migration.stdout.toString()).toContain('remove: .claude/skills/sample-demo/SKILL.md');
  });
});

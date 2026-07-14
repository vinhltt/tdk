import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { buildCodexInstallPlan } from '../src/codex-install-plan';
import { emptyHarnessManifest } from '../src/manifest-store';
import { makeConsumer, sha256, writeMultiPluginManifest, writePluginFile } from './fixtures';

// --- helpers ---------------------------------------------------------------

function writeCodexPkgFile(root: string, plugin: string, relativePath: string, content: string): string {
  const filePath = path.join(root, '.specify', 'codex-plugins', plugin, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return sha256(content);
}

function writeCodexPkgBuffer(root: string, plugin: string, relativePath: string, content: Buffer): string {
  const filePath = path.join(root, '.specify', 'codex-plugins', plugin, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return createHash('sha256').update(content).digest('hex');
}

function writeCodexManifest(
  root: string,
  plugins: Record<string, { version: string; files: Record<string, string> }>,
): void {
  const manifestPath = path.join(root, '.specify', 'codex-plugins', 'manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const manifestPlugins: Record<string, unknown> = {};
  for (const [name, plugin] of Object.entries(plugins)) {
    manifestPlugins[name] = {
      version: plugin.version,
      components: { skills: {}, agents: {}, hooks: {}, commands: {} },
      files: plugin.files,
    };
  }
  fs.writeFileSync(manifestPath, JSON.stringify({
    algorithm: 'sha256',
    generated_at: '2026-06-15T00:00:00Z',
    plugins: manifestPlugins,
  }, null, 2), 'utf-8');
}

/**
 * Write a preconverted plugin fixture using the NEW official layout:
 * - Skills/hooks/lib at .specify/codex-plugins/<plugin>/ (no .codex-plugin/ prefix)
 * - Hook declaration at hooks/codex-hooks.json
 * - Source agents/*.md at .specify/plugins/<plugin>/agents/ (two-root model)
 * - NO committed agents/*.toml or config.toml
 * - Codex manifest at .specify/codex-plugins/manifest.json
 */
function writePreconvertedPlugin(consumer = makeConsumer('tdk-codex-install-')) {
  const root = consumer.root;
  const plugin = 'tdk-core';
  const codexFiles: Record<string, string> = {};

  // Package-root artifacts (official layout)
  codexFiles['skills/tdk-demo/SKILL.md'] = writeCodexPkgFile(root, plugin, 'skills/tdk-demo/SKILL.md', '# tdk-demo\nUse tdk-demo.\n');
  codexFiles['hooks/hook-gateway.cjs'] = writeCodexPkgFile(root, plugin, 'hooks/hook-gateway.cjs', 'require("../lib/demo.cjs");\n');
  codexFiles['hooks/wrappers/demo.cjs'] = writeCodexPkgFile(root, plugin, 'hooks/wrappers/demo.cjs', 'process.exit(0);\n');
  codexFiles['hooks/codex-hooks.json'] = writeCodexPkgFile(root, plugin, 'hooks/codex-hooks.json', JSON.stringify({
    PreToolUse: [{ command: 'node "hooks/wrappers/demo.cjs"', matcher: 'Read', _origin: 'tdk-core' }],
  }, null, 2) + '\n');
  codexFiles['lib/demo.cjs'] = writeCodexPkgFile(root, plugin, 'lib/demo.cjs', 'module.exports = {};\n');
  codexFiles['.codex-plugin/plugin.json'] = writeCodexPkgFile(root, plugin, '.codex-plugin/plugin.json', '{"name":"tdk-core","hooks":"./hooks/codex-hooks.json"}\n');

  // Source agent (two-root model): lives in .specify/plugins/<plugin>/agents/
  const agentMd = '---\nname: tdk-helper\ndescription: TDK helper\ntools: Read\n---\n\nHelp with TDK.\n';
  writePluginFile(consumer, 'agents/tdk-helper.md', agentMd);

  // Source plugins manifest (covers source files including agents/*.md)
  writeMultiPluginManifest(consumer, {
    [plugin]: {
      version: '1.0.0',
      files: {
        'agents/tdk-helper.md': sha256(agentMd),
      },
    },
  });

  // Codex manifest (covers generated package artifacts)
  writeCodexManifest(root, { [plugin]: { version: '1.0.0', files: codexFiles } });
  return consumer;
}

// --- tests -----------------------------------------------------------------

describe('codex install plan', () => {
  test('plans dual-target writes from preconverted artifacts (new layout)', () => {
    const consumer = writePreconvertedPlugin();
    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    });

    const targets = plan.writes.map((write) => write.targetRelativePath);
    expect(targets).toContain('.agents/skills/tdk-demo/SKILL.md');
    // Agent TOML generated at install time from source agents/*.md
    expect(targets).toContain('.codex/agents/tdk-helper.toml');
    expect(targets).toContain('.codex/hooks/hook-gateway.cjs');
    expect(targets).toContain('.codex/hooks/wrappers/demo.cjs');
    expect(targets).toContain('.codex/lib/demo.cjs');
    // config.toml generated at install time (from agent source)
    expect(targets).toContain('.codex/config.toml');
    // hooks.json assembled from codex-hooks.json
    expect(targets).toContain('.codex/hooks.json');
    expect(plan.nextManifest.harness).toBe('codex');
    expect(plan.nextManifest.managedFiles.every((file) => file.plugin !== 'convert-flat')).toBe(true);
  });

  test('rejects two Codex plugins that plan the same target before apply', () => {
    const consumer = makeConsumer('tdk-codex-duplicate-target-');
    const relativePath = 'skills/tdk-shared/SKILL.md';
    const coreChecksum = writeCodexPkgFile(consumer.root, 'tdk-core', relativePath, '# core shared skill\n');
    const utilsChecksum = writeCodexPkgFile(consumer.root, 'tdk-utils', relativePath, '# utils shared skill\n');
    writeMultiPluginManifest(consumer, {
      'tdk-core': { version: '1.0.0', files: {} },
      'tdk-utils': { version: '1.0.0', files: {} },
    });
    writeCodexManifest(consumer.root, {
      'tdk-core': { version: '1.0.0', files: { [relativePath]: coreChecksum } },
      'tdk-utils': { version: '1.0.0', files: { [relativePath]: utilsChecksum } },
    });

    expect(() => buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core', 'tdk-utils'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    })).toThrow(/more than once/);
    expect(fs.existsSync(path.join(consumer.root, '.agents', 'skills', 'tdk-shared', 'SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(consumer.root, '.specify', 'state', 'harness-install', 'codex.json'))).toBe(false);
  });

  test('install-time agent conversion reads source agents/*.md and writes .codex/agents/*.toml', () => {
    const consumer = writePreconvertedPlugin();
    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    });

    const agentWrite = plan.writes.find((w) => w.targetRelativePath === '.codex/agents/tdk-helper.toml');
    expect(agentWrite).toBeDefined();
    // Content should be TOML from agent conversion (has sandbox_mode)
    const tomlContent = agentWrite!.content.toString('utf-8');
    expect(tomlContent).toContain('sandbox_mode');
    // config.toml must include agent entry
    const configWrite = plan.writes.find((w) => w.targetRelativePath === '.codex/config.toml');
    expect(configWrite).toBeDefined();
    expect(configWrite!.content.toString('utf-8')).toContain('[agents.tdk-helper]');
  });

  test('rewrites custom prefixes across skill dirs, agent files, and config entries', () => {
    const consumer = writePreconvertedPlugin(makeConsumer('tdk-codex-prefix-'));
    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'sample-',
    });

    const targets = plan.writes.map((write) => write.targetRelativePath);
    expect(targets).toContain('.agents/skills/sample-demo/SKILL.md');
    expect(targets).toContain('.codex/agents/sample-helper.toml');
    const config = plan.writes.find((write) => write.targetRelativePath === '.codex/config.toml')?.content.toString('utf-8') ?? '';
    expect(config).toContain('[agents.sample-helper]');
    expect(config).toContain('config_file = "agents/sample-helper.toml"');
  });

  test('skips internal shared skill entrypoints while preserving shared reference files', () => {
    const consumer = writePreconvertedPlugin(makeConsumer('tdk-codex-shared-skill-'));
    const manifestPath = path.join(consumer.root, '.specify', 'codex-plugins', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.plugins['tdk-core'].files['skills/_shared/SKILL.md'] = writeCodexPkgFile(
      consumer.root,
      'tdk-core',
      'skills/_shared/SKILL.md',
      '---\nmetadata:\n  version: 0.1.0\n---\n\n# _shared\n',
    );
    manifest.plugins['tdk-core'].files['skills/_shared/retro-feedback-schema.md'] = writeCodexPkgFile(
      consumer.root,
      'tdk-core',
      'skills/_shared/retro-feedback-schema.md',
      '# Retro feedback schema\n',
    );
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    });

    const targets = plan.writes.map((write) => write.targetRelativePath);
    expect(targets).not.toContain('.agents/skills/shared/SKILL.md');
    expect(targets).not.toContain('.agents/skills/_shared/SKILL.md');
    expect(targets).toContain('.agents/skills/_shared/retro-feedback-schema.md');
  });

  test('rejects source artifacts whose bytes do not match codex manifest checksums', () => {
    const consumer = writePreconvertedPlugin(makeConsumer('tdk-codex-checksum-'));
    // Tamper with a committed codex artifact
    fs.writeFileSync(
      path.join(consumer.root, '.specify', 'codex-plugins', 'tdk-core', 'hooks', 'hook-gateway.cjs'),
      'tampered\n', 'utf-8',
    );

    expect(() => buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    })).toThrow(/checksum mismatch/);
  });

  test('rejects source agents whose bytes do not match source manifest checksums', () => {
    const consumer = writePreconvertedPlugin(makeConsumer('tdk-codex-agent-checksum-'));
    fs.writeFileSync(
      path.join(consumer.root, '.specify', 'plugins', 'tdk-core', 'agents', 'tdk-helper.md'),
      'tampered agent\n',
      'utf-8',
    );

    expect(() => buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    })).toThrow(/Source agent checksum mismatch/);
  });

  test('preserves preconverted bytes for default-prefix installs (binary skill asset)', () => {
    const consumer = writePreconvertedPlugin(makeConsumer('tdk-codex-bytes-'));
    const payload = Buffer.from([0xff, 0xfe, 0xfd, 0x00, 0x61]);
    const checksum = writeCodexPkgBuffer(consumer.root, 'tdk-core', 'skills/tdk-demo/assets/data.bin', payload);

    // Add to codex manifest
    const manifestPath = path.join(consumer.root, '.specify', 'codex-plugins', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.plugins['tdk-core'].files['skills/tdk-demo/assets/data.bin'] = checksum;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    });

    const write = plan.writes.find((item) => item.targetRelativePath === '.agents/skills/tdk-demo/assets/data.bin');
    expect(write?.content.equals(payload)).toBe(true);
  });

  test('rejects unexpected artifact shapes (e.g. agents/ paths in codex manifest)', () => {
    const consumer = writePreconvertedPlugin(makeConsumer('tdk-codex-bad-ext-'));
    const bad = 'bad\n';
    const manifestPath = path.join(consumer.root, '.specify', 'codex-plugins', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    // Write a file with a path that should be rejected
    writeCodexPkgFile(consumer.root, 'tdk-core', 'agents/tdk_bad.txt', bad);
    manifest.plugins['tdk-core'].files['agents/tdk_bad.txt'] = sha256(bad);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

    expect(() => buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    })).toThrow(/Unexpected.*artifact/);
  });

  test('codex-target-mapper targets unchanged: skills->.agents/skills, agents->.codex/agents', () => {
    const consumer = writePreconvertedPlugin(makeConsumer('tdk-codex-mapper-'));
    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    });
    const targets = plan.writes.map((w) => w.targetRelativePath);
    // Skills still go to .agents/skills/**
    expect(targets.some((t) => t.startsWith('.agents/skills/'))).toBe(true);
    // Agents still go to .codex/agents/
    expect(targets.some((t) => t.startsWith('.codex/agents/'))).toBe(true);
    // Hooks still go to .codex/hooks/
    expect(targets.some((t) => t.startsWith('.codex/hooks/'))).toBe(true);
    // Lib still goes to .codex/lib/
    expect(targets.some((t) => t.startsWith('.codex/lib/'))).toBe(true);
  });

  test('transfers an unchanged target to the newly selected Codex plugin once', () => {
    const consumer = makeConsumer('tdk-codex-owner-transfer-');
    const content = '# shared skill\n';
    const sourceRelativePath = 'skills/tdk-shared/SKILL.md';
    const targetRelativePath = '.agents/skills/tdk-shared/SKILL.md';
    const pluginJson = '{"name":"tdk-new","version":"1.0.0"}\n';
    const target = path.join(consumer.root, targetRelativePath);
    const skillChecksum = writeCodexPkgFile(consumer.root, 'tdk-new', sourceRelativePath, content);
    const pluginJsonChecksum = writeCodexPkgFile(consumer.root, 'tdk-new', '.codex-plugin/plugin.json', pluginJson);
    writeMultiPluginManifest(consumer, { 'tdk-new': { version: '1.0.0', files: {} } });
    writeCodexManifest(consumer.root, {
      'tdk-new': {
        version: '1.0.0',
        files: {
          [sourceRelativePath]: skillChecksum,
          '.codex-plugin/plugin.json': pluginJsonChecksum,
        },
      },
    });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');

    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-new'],
      previousManifest: {
        ...emptyHarnessManifest('codex'),
        managedFiles: [{
          plugin: 'tdk-old',
          sourceRelativePath: '.specify/codex-plugins/tdk-old/skills/tdk-shared/SKILL.md',
          targetRelativePath,
          sourceChecksum: skillChecksum,
          installedChecksum: skillChecksum,
        }],
      },
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    });

    expect(plan.removals).toEqual([]);
    expect(plan.collisions).toEqual([]);
    expect(plan.writes.filter((write) => write.targetRelativePath === targetRelativePath)).toEqual([]);
    expect(plan.nextManifest.managedFiles.filter((file) => file.targetRelativePath === targetRelativePath)).toEqual([
      expect.objectContaining({ plugin: 'tdk-new' }),
    ]);
  });

  test('preserves the previous Codex owner when the transfer target drifted', () => {
    const consumer = makeConsumer('tdk-codex-owner-drift-');
    const content = '# shared skill\n';
    const sourceRelativePath = 'skills/tdk-shared/SKILL.md';
    const targetRelativePath = '.agents/skills/tdk-shared/SKILL.md';
    const pluginJson = '{"name":"tdk-new","version":"1.0.0"}\n';
    const target = path.join(consumer.root, targetRelativePath);
    const skillChecksum = writeCodexPkgFile(consumer.root, 'tdk-new', sourceRelativePath, content);
    const pluginJsonChecksum = writeCodexPkgFile(consumer.root, 'tdk-new', '.codex-plugin/plugin.json', pluginJson);
    writeMultiPluginManifest(consumer, { 'tdk-new': { version: '1.0.0', files: {} } });
    writeCodexManifest(consumer.root, {
      'tdk-new': {
        version: '1.0.0',
        files: {
          [sourceRelativePath]: skillChecksum,
          '.codex-plugin/plugin.json': pluginJsonChecksum,
        },
      },
    });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '# user-edited shared skill\n', 'utf-8');

    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-new'],
      previousManifest: {
        ...emptyHarnessManifest('codex'),
        managedFiles: [{
          plugin: 'tdk-old',
          sourceRelativePath: '.specify/codex-plugins/tdk-old/skills/tdk-shared/SKILL.md',
          targetRelativePath,
          sourceChecksum: skillChecksum,
          installedChecksum: skillChecksum,
        }],
      },
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    });

    expect(plan.removals).toEqual([]);
    expect(plan.writes.filter((write) => write.targetRelativePath === targetRelativePath)).toEqual([]);
    expect(plan.collisions).toContainEqual(expect.objectContaining({ kind: 'managed-drift' }));
    expect(plan.nextManifest.managedFiles.filter((file) => file.targetRelativePath === targetRelativePath)).toEqual([
      expect.objectContaining({ plugin: 'tdk-old' }),
    ]);
  });

  test('preserves hook origins not authorized by previous Codex ownership', () => {
    const cases = [
      { name: 'duplicate selected plugin', selectedPlugins: ['tdk-memory', 'tdk-memory'], origin: 'tdk-memory', currentManifestIncludesOrigin: true },
      { name: 'unsafe selected plugin segment', selectedPlugins: ['../tdk-memory'], origin: '../tdk-memory' },
      { name: 'unknown selected plugin ID', selectedPlugins: ['external-plugin'], origin: 'external-plugin' },
      { name: 'stale selected plugin ID', selectedPlugins: ['tdk-memory'], origin: 'tdk-memory' },
    ];

    for (const scenario of cases) {
      const consumer = writePreconvertedPlugin(makeConsumer(`tdk-codex-${scenario.name.replaceAll(' ', '-')}-`));
      if (scenario.currentManifestIncludesOrigin) {
        const sourceManifestPath = path.join(consumer.root, '.specify', 'plugins', 'manifest.json');
        const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf-8'));
        sourceManifest.plugins['tdk-memory'] = {
          version: '1.0.0',
          components: { skills: {}, agents: {}, hooks: {}, commands: {} },
          files: {},
        };
        fs.writeFileSync(sourceManifestPath, `${JSON.stringify(sourceManifest, null, 2)}\n`, 'utf-8');
      }

      const existingHooks = path.join(consumer.root, '.codex', 'hooks.json');
      const priorCommand = `node ${scenario.origin}-prior.cjs`;
      const existingContent = `${JSON.stringify({
        PreToolUse: [{ command: priorCommand, _origin: scenario.origin }],
      }, null, 2)}\n`;
      fs.mkdirSync(path.dirname(existingHooks), { recursive: true });
      fs.writeFileSync(existingHooks, existingContent, 'utf-8');
      const previous = emptyHarnessManifest('codex');
      previous.selectedPlugins = scenario.selectedPlugins;
      previous.managedFiles = [{
        plugin: 'tdk-core',
        sourceRelativePath: '.specify/codex-plugins/tdk-core/hooks/codex-hooks.json',
        targetRelativePath: '.codex/hooks.json',
        sourceChecksum: sha256(existingContent),
        installedChecksum: sha256(existingContent),
      }];

      const plan = buildCodexInstallPlan({
        consumerRoot: consumer.root,
        selectedPlugins: ['tdk-core'],
        previousManifest: previous,
        sourcePrefix: 'tdk-',
        targetPrefix: 'tdk-',
      });
      const hooks = plan.writes.find((write) => write.targetRelativePath === '.codex/hooks.json')?.content.toString('utf-8') ?? '';

      expect(hooks).toContain(priorCommand);
      expect(hooks).toContain(`\"_origin\": \"${scenario.origin}\"`);
    }
  });

  test('replaces the current valid tdk-core hook origin', () => {
    const consumer = writePreconvertedPlugin(makeConsumer('tdk-codex-current-origin-'));
    const existingHooks = path.join(consumer.root, '.codex', 'hooks.json');
    const priorCommand = 'node tdk-core-prior.cjs';
    const existingContent = `${JSON.stringify({
      PreToolUse: [{ command: priorCommand, _origin: 'tdk-core' }],
    }, null, 2)}\n`;
    fs.mkdirSync(path.dirname(existingHooks), { recursive: true });
    fs.writeFileSync(existingHooks, existingContent, 'utf-8');
    const previous = emptyHarnessManifest('codex');
    previous.selectedPlugins = ['tdk-core'];
    previous.managedFiles = [{
      plugin: 'tdk-core',
      sourceRelativePath: '.specify/codex-plugins/tdk-core/hooks/codex-hooks.json',
      targetRelativePath: '.codex/hooks.json',
      sourceChecksum: sha256(existingContent),
      installedChecksum: sha256(existingContent),
    }];

    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: previous,
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    });
    const hooks = plan.writes.find((write) => write.targetRelativePath === '.codex/hooks.json')?.content.toString('utf-8') ?? '';

    expect(hooks).not.toContain(priorCommand);
    expect(hooks).toContain('hooks/wrappers/demo.cjs');
    expect((hooks.match(/\"_origin\": \"tdk-core\"/g) ?? [])).toHaveLength(1);
  });

  test('cleans an origin trusted only by prior Codex ownership', () => {
    const consumer = writePreconvertedPlugin(makeConsumer('tdk-codex-prior-origin-'));
    const sourceManifestPath = path.join(consumer.root, '.specify', 'plugins', 'manifest.json');
    const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf-8'));
    sourceManifest.plugins['tdk-memory'] = {
      version: '1.0.0',
      components: { skills: {}, agents: {}, hooks: {}, commands: {} },
      files: {},
    };
    fs.writeFileSync(sourceManifestPath, `${JSON.stringify(sourceManifest, null, 2)}\n`, 'utf-8');

    const existingHooks = path.join(consumer.root, '.codex', 'hooks.json');
    const priorCommand = 'node tdk-memory-prior.cjs';
    const existingContent = `${JSON.stringify({
      PreToolUse: [{ command: priorCommand, _origin: 'tdk-memory' }],
    }, null, 2)}\n`;
    fs.mkdirSync(path.dirname(existingHooks), { recursive: true });
    fs.writeFileSync(existingHooks, existingContent, 'utf-8');
    const previous = emptyHarnessManifest('codex');
    previous.selectedPlugins = ['tdk-memory'];
    previous.managedFiles = [{
      plugin: 'tdk-core',
      sourceRelativePath: '.specify/codex-plugins/tdk-core/hooks/codex-hooks.json',
      targetRelativePath: '.codex/hooks.json',
      sourceChecksum: sha256(existingContent),
      installedChecksum: sha256(existingContent),
    }];

    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: previous,
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    });
    const hooks = plan.writes.find((write) => write.targetRelativePath === '.codex/hooks.json')?.content.toString('utf-8') ?? '';

    expect(hooks).not.toContain(priorCommand);
    expect(hooks).not.toContain('"_origin": "tdk-memory"');
    expect(hooks).toContain('"_origin": "tdk-core"');
  });

  for (const scenario of [
    { name: '.agents top-level root', link: '.agents' },
    { name: '.agents nested skills directory', link: '.agents/skills' },
    { name: '.codex top-level root', link: '.codex' },
    { name: '.codex nested hooks directory', link: '.codex/hooks' },
  ]) {
    test(`rejects a symlinked ${scenario.name} before planning a Codex write`, () => {
      const consumer = writePreconvertedPlugin(makeConsumer('tdk-codex-symlink-'));
      const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-codex-outside-'));
      const sentinel = path.join(outside, 'sentinel.txt');
      const link = path.join(consumer.root, scenario.link);
      fs.writeFileSync(sentinel, 'unchanged', 'utf-8');
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.rmSync(link, { recursive: true, force: true });
      fs.symlinkSync(outside, link);

      expect(() => buildCodexInstallPlan({
        consumerRoot: consumer.root,
        selectedPlugins: ['tdk-core'],
        previousManifest: emptyHarnessManifest('codex'),
        sourcePrefix: 'tdk-',
        targetPrefix: 'tdk-',
      })).toThrow(/symlinked ancestor/);
      expect(fs.readFileSync(sentinel, 'utf-8')).toBe('unchanged');
    });
  }
});

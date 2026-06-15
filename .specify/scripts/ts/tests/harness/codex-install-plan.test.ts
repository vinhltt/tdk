import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { buildCodexInstallPlan } from '../../src/commands/harness/codex-install-plan';
import { emptyHarnessManifest } from '../../src/commands/harness/manifest-store';
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
    expect(targets).toContain('.agents/skills/tdk_demo/SKILL.md');
    // Agent TOML generated at install time from source agents/*.md
    expect(targets).toContain('.codex/agents/tdk_helper.toml');
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

  test('install-time agent conversion reads source agents/*.md and writes .codex/agents/*.toml', () => {
    const consumer = writePreconvertedPlugin();
    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    });

    const agentWrite = plan.writes.find((w) => w.targetRelativePath === '.codex/agents/tdk_helper.toml');
    expect(agentWrite).toBeDefined();
    // Content should be TOML from agent conversion (has sandbox_mode)
    const tomlContent = agentWrite!.content.toString('utf-8');
    expect(tomlContent).toContain('sandbox_mode');
    // config.toml must include agent entry
    const configWrite = plan.writes.find((w) => w.targetRelativePath === '.codex/config.toml');
    expect(configWrite).toBeDefined();
    expect(configWrite!.content.toString('utf-8')).toContain('[agents.tdk_helper]');
  });

  test('rewrites custom prefixes across skill dirs, agent files, and config entries', () => {
    const consumer = writePreconvertedPlugin(makeConsumer('tdk-codex-prefix-'));
    const plan = buildCodexInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      previousManifest: emptyHarnessManifest('codex'),
      sourcePrefix: 'tdk-',
      targetPrefix: 'pav-',
    });

    const targets = plan.writes.map((write) => write.targetRelativePath);
    expect(targets).toContain('.agents/skills/pav_demo/SKILL.md');
    expect(targets).toContain('.codex/agents/pav_helper.toml');
    const config = plan.writes.find((write) => write.targetRelativePath === '.codex/config.toml')?.content.toString('utf-8') ?? '';
    expect(config).toContain('[agents.pav_helper]');
    expect(config).toContain('config_file = "agents/pav_helper.toml"');
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

    const write = plan.writes.find((item) => item.targetRelativePath === '.agents/skills/tdk_demo/assets/data.bin');
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
});

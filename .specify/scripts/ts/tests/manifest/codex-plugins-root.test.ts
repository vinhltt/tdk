// manifest-compute produces .specify/codex-plugins/manifest.json for the codex package root.
// Tests cover: locator finds .codex-plugin/plugin.json; skills/hooks/lib are hashed;
// absent codex root is a no-op; --check detects drift in codex artifacts.

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

const manifestCliPath = path.resolve('src/commands/manifest/compute.ts');

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex');
}

/**
 * Creates a minimal fake project root with a .specify/codex-plugins/<plugin>/ package.
 * Plugin.json lives at .codex-plugin/plugin.json (official codex layout).
 * Also creates an empty .specify/plugins/ dir so the existing guard doesn't short-circuit.
 */
function makeCodexPluginFixture(): { root: string; pluginDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-manifest-codex-'));

  // Required: plugins dir must exist so compute.ts doesn't early-exit on missing plugins dir
  fs.mkdirSync(path.join(root, '.specify', 'plugins'), { recursive: true });

  const pluginDir = path.join(root, '.specify', 'codex-plugins', 'tdk-core');
  fs.mkdirSync(path.join(pluginDir, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(pluginDir, 'skills', 'tdk-demo'), { recursive: true });
  fs.mkdirSync(path.join(pluginDir, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(pluginDir, 'lib'), { recursive: true });

  // Plugin metadata — must be found via .codex-plugin/plugin.json locator
  fs.writeFileSync(
    path.join(pluginDir, '.codex-plugin', 'plugin.json'),
    JSON.stringify({ name: 'tdk-core', version: '1.2.0', description: 'Core plugin' }, null, 2) + '\n',
    'utf-8',
  );

  // Skill file
  fs.writeFileSync(path.join(pluginDir, 'skills', 'tdk-demo', 'SKILL.md'), '# tdk-demo\nUse it.\n', 'utf-8');

  // Hooks
  fs.writeFileSync(path.join(pluginDir, 'hooks', 'hook-gateway.cjs'), '"use strict";\n', 'utf-8');
  fs.writeFileSync(
    path.join(pluginDir, 'hooks', 'codex-hooks.json'),
    JSON.stringify({ hooks: {} }, null, 2) + '\n',
    'utf-8',
  );

  // Lib
  fs.writeFileSync(path.join(pluginDir, 'lib', 'core.cjs'), 'module.exports = {};\n', 'utf-8');

  return { root, pluginDir };
}

describe('manifest compute — codex root', () => {
  test('produces .specify/codex-plugins/manifest.json with all package files hashed', () => {
    const { root, pluginDir } = makeCodexPluginFixture();

    const result = Bun.spawnSync({
      cmd: ['bun', manifestCliPath, '--project-root', root, '--write'],
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);

    const manifestPath = path.join(root, '.specify', 'codex-plugins', 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const entry = manifest.plugins['tdk-core'];
    expect(entry).toBeDefined();

    // plugin.json locator must work — version read from .codex-plugin/plugin.json
    expect(entry.version).toBe('1.2.0');

    // All files hashed
    const files: Record<string, string> = entry.files;
    expect(files['.codex-plugin/plugin.json']).toBeDefined();
    expect(files['skills/tdk-demo/SKILL.md']).toBeDefined();
    expect(files['hooks/hook-gateway.cjs']).toBeDefined();
    expect(files['hooks/codex-hooks.json']).toBeDefined();
    expect(files['lib/core.cjs']).toBeDefined();

    // Spot-check one hash
    const expectedSkillHash = sha256(fs.readFileSync(path.join(pluginDir, 'skills', 'tdk-demo', 'SKILL.md'), 'utf-8'));
    expect(files['skills/tdk-demo/SKILL.md']).toBe(expectedSkillHash);
  });

  test('absent codex root is a no-op (no manifest created, exit 0)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-manifest-nocodex-'));
    // Only plugins dir — no codex-plugins dir
    fs.mkdirSync(path.join(root, '.specify', 'plugins'), { recursive: true });

    const result = Bun.spawnSync({
      cmd: ['bun', manifestCliPath, '--project-root', root, '--write'],
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);

    // No codex manifest should be created
    const manifestPath = path.join(root, '.specify', 'codex-plugins', 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(false);
  });

  test('--check detects drift in a codex artifact (exits 1)', () => {
    const { root, pluginDir } = makeCodexPluginFixture();

    // Write the manifest first
    const writeResult = Bun.spawnSync({
      cmd: ['bun', manifestCliPath, '--project-root', root, '--write'],
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(writeResult.exitCode, writeResult.stderr.toString()).toBe(0);

    // Tamper with the skill file
    fs.writeFileSync(path.join(pluginDir, 'skills', 'tdk-demo', 'SKILL.md'), '# tampered\n', 'utf-8');

    // --check should detect drift
    const checkResult = Bun.spawnSync({
      cmd: ['bun', manifestCliPath, '--project-root', root, '--check'],
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(checkResult.exitCode).toBe(1);
  });

  test('plugins-root manifest entry is identical with or without a codex root present', () => {
    // Run compute on a tree WITH codex root (the makeCodexPluginFixture creates both roots)
    const { root: rootWithCodex } = makeCodexPluginFixture();
    const pluginsDir = path.join(rootWithCodex, '.specify', 'plugins', 'my-plugin');
    fs.mkdirSync(path.join(pluginsDir, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginsDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'my-plugin', version: '0.5.0' }, null, 2) + '\n',
      'utf-8',
    );
    fs.writeFileSync(path.join(pluginsDir, 'README.md'), '# My Plugin\n', 'utf-8');

    const resWithCodex = Bun.spawnSync({
      cmd: ['bun', manifestCliPath, '--project-root', rootWithCodex, '--write'],
      cwd: rootWithCodex,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(resWithCodex.exitCode, resWithCodex.stderr.toString()).toBe(0);

    // Run compute on a tree WITHOUT codex root (only plugins dir)
    const rootNoCodex = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-manifest-nocodex-cmp-'));
    const pluginsDirB = path.join(rootNoCodex, '.specify', 'plugins', 'my-plugin');
    fs.mkdirSync(path.join(pluginsDirB, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginsDirB, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'my-plugin', version: '0.5.0' }, null, 2) + '\n',
      'utf-8',
    );
    fs.writeFileSync(path.join(pluginsDirB, 'README.md'), '# My Plugin\n', 'utf-8');

    const resNoCodex = Bun.spawnSync({
      cmd: ['bun', manifestCliPath, '--project-root', rootNoCodex, '--write'],
      cwd: rootNoCodex,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(resNoCodex.exitCode, resNoCodex.stderr.toString()).toBe(0);

    // The plugins map (excluding generated_at timestamp) must be identical
    const manifestA = JSON.parse(fs.readFileSync(path.join(rootWithCodex, '.specify', 'plugins', 'manifest.json'), 'utf-8'));
    const manifestB = JSON.parse(fs.readFileSync(path.join(rootNoCodex, '.specify', 'plugins', 'manifest.json'), 'utf-8'));
    expect(manifestA.plugins).toEqual(manifestB.plugins);

    // Codex manifest must NOT contain plugins-root packages
    const codexManifest = JSON.parse(fs.readFileSync(path.join(rootWithCodex, '.specify', 'codex-plugins', 'manifest.json'), 'utf-8'));
    expect(codexManifest.plugins['my-plugin']).toBeUndefined();
    expect(codexManifest.plugins['tdk-core']).toBeDefined();
  });
});

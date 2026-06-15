import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeConsumer, sha256, writeBasicPlugin, writeMultiPluginManifest, writePluginFile } from './fixtures';

const cliPath = path.resolve('src/index.ts');

describe('harness install CLI', () => {
  test('dry-run lists planned writes without mutation', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--harness', 'claude', '--plugins', 'tdk-core', '--dry-run'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Harness install plan');
    expect(result.stdout.toString()).toContain('.claude/skills/demo/SKILL.md');
  });

  test('non-TTY without selector fails with guidance', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--harness', 'claude', '--dry-run'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('No plugin selector provided');
  });

  test('codex dry-run lists dual-target planned writes (new sibling layout)', () => {
    const consumer = makeConsumer('tdk-cli-codex-');
    const root = consumer.root;
    const plugin = 'tdk-core';
    const skill = '# demo\n';
    const agentMd = '---\nname: tdk-demo\ndescription: Demo\ntools: Read\n---\n\nDemo agent.\n';

    // Write codex package artifacts in new location
    const codexBase = path.join(root, '.specify', 'codex-plugins', plugin);
    fs.mkdirSync(path.join(codexBase, 'skills', 'tdk-demo'), { recursive: true });
    fs.writeFileSync(path.join(codexBase, 'skills', 'tdk-demo', 'SKILL.md'), skill, 'utf-8');
    fs.mkdirSync(path.join(codexBase, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(path.join(codexBase, '.codex-plugin', 'plugin.json'), '{"name":"tdk-core"}\n', 'utf-8');

    // Write source agent in plugins source dir (two-root model)
    writePluginFile(consumer, 'agents/tdk-demo.md', agentMd);

    // Source plugins manifest
    writeMultiPluginManifest(consumer, {
      [plugin]: {
        version: '1.0.0',
        files: { 'agents/tdk-demo.md': sha256(agentMd) },
      },
    });

    // Codex manifest (covers package artifacts)
    const codexManifestPath = path.join(root, '.specify', 'codex-plugins', 'manifest.json');
    fs.writeFileSync(codexManifestPath, JSON.stringify({
      algorithm: 'sha256',
      generated_at: '2026-06-15T00:00:00Z',
      plugins: {
        [plugin]: {
          version: '1.0.0',
          components: { skills: {}, agents: {}, hooks: {}, commands: {} },
          files: {
            'skills/tdk-demo/SKILL.md': sha256(skill),
            '.codex-plugin/plugin.json': sha256('{"name":"tdk-core"}\n'),
          },
        },
      },
    }, null, 2), 'utf-8');

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--harness', 'codex', '--plugins', 'tdk-core', '--dry-run'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('.agents/skills/tdk_demo/SKILL.md');
    // Agent generated at install time from source agents/*.md
    expect(result.stdout.toString()).toContain('.codex/agents/tdk_demo.toml');
    expect(result.stdout.toString()).toContain('Codex config: .codex/config.toml');
  });

  test('codex combined with claude fails fast for v1', () => {
    const consumer = makeConsumer('tdk-cli-codex-combined-');
    writeBasicPlugin(consumer);

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--harness', 'claude,codex', '--plugins', 'tdk-core', '--dry-run'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('Combined Claude+Codex installs are not supported');
  });

  test('dry-run reports overwrite prompts without blocker exit', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const target = path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'user content', 'utf-8');

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--harness', 'claude', '--plugins', 'tdk-core', '--dry-run'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Prompts:');
    expect(result.stdout.toString()).toContain('overwrite: .claude/skills/demo/SKILL.md');
    expect(result.stdout.toString()).not.toContain('Blockers:');
  });
});

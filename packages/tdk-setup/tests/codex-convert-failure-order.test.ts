import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeConsumer, sha256, writeManifest, writePluginFile } from './fixtures';

const cliPath = path.resolve('src/index.ts');

describe('codex convert failure order', () => {
  test('preserves old-owner generated roots and manifest when source discovery fails', () => {
    const consumer = makeConsumer('tdk-codex-convert-failure-');
    const plugin = 'tdk-inception';
    const malformedPluginJson = '{ invalid json\n';
    writePluginFile(consumer, '.claude-plugin/plugin.json', malformedPluginJson, plugin);
    writeManifest(consumer, {
      '.claude-plugin/plugin.json': sha256(malformedPluginJson),
    }, plugin);

    const coreSentinel = path.join(
      consumer.root,
      '.specify/codex-plugins/tdk-core/skills/tdk-greenfield-start/SKILL.md',
    );
    const utilsSentinel = path.join(
      consumer.root,
      '.specify/codex-plugins/tdk-utils/skills/tdk-workspace-dependency-policy/SKILL.md',
    );
    const generatedManifest = path.join(consumer.root, '.specify/codex-plugins/manifest.json');
    fs.mkdirSync(path.dirname(coreSentinel), { recursive: true });
    fs.mkdirSync(path.dirname(utilsSentinel), { recursive: true });
    fs.writeFileSync(coreSentinel, 'old core owner\n');
    fs.writeFileSync(utilsSentinel, 'old utils owner\n');
    fs.writeFileSync(generatedManifest, '{"sentinel":"old generated manifest"}\n');

    const convert = Bun.spawnSync({
      cmd: ['bun', cliPath, 'convert', '--plugins', plugin],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(convert.exitCode).not.toBe(0);
    expect(convert.stderr.toString()).toContain('[tdk-setup convert] error:');
    expect(fs.readFileSync(coreSentinel, 'utf-8')).toBe('old core owner\n');
    expect(fs.readFileSync(utilsSentinel, 'utf-8')).toBe('old utils owner\n');
    expect(fs.readFileSync(generatedManifest, 'utf-8')).toBe('{"sentinel":"old generated manifest"}\n');
    expect(fs.existsSync(path.join(consumer.root, '.specify/codex-plugins/tdk-inception'))).toBe(false);
  });
});

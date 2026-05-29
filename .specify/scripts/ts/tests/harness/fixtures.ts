import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export interface FixtureConsumer {
  root: string;
  scriptsDir: string;
  pluginRoot: string;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function makeConsumer(prefix = 'tdk-harness-'): FixtureConsumer {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const scriptsDir = path.join(root, '.specify', 'scripts', 'ts');
  const pluginRoot = path.join(root, '.specify', 'plugins', 'tdk-core');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.mkdirSync(pluginRoot, { recursive: true });
  return { root, scriptsDir, pluginRoot };
}

export function writePluginFile(consumer: FixtureConsumer, relativePath: string, content: string): void {
  const filePath = path.join(consumer.pluginRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function writeManifest(consumer: FixtureConsumer, files: Record<string, string>): void {
  const manifestPath = path.join(consumer.root, '.specify', 'plugins', 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    algorithm: 'sha256',
    generated_at: '2026-05-29T00:00:00Z',
    plugins: {
      'tdk-core': {
        version: '1.0.0',
        components: { skills: {}, agents: {}, hooks: {}, commands: {} },
        files,
      },
    },
  }, null, 2), 'utf-8');
}

export function writeBasicPlugin(consumer: FixtureConsumer): void {
  const skill = '# Skill\n';
  const agent = '# Agent\n';
  const gateway = '#!/usr/bin/env node\n';
  const lib = 'module.exports = {};\n';
  const script = 'console.log("ok");\n';
  const hooksJson = JSON.stringify({
    hooks: {
      UserPromptSubmit: [
        {
          matcher: '*',
          hooks: [
            { type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" dev-context-injector' },
          ],
        },
      ],
    },
  }, null, 2);

  writePluginFile(consumer, 'skills/demo/SKILL.md', skill);
  writePluginFile(consumer, 'agents/demo.md', agent);
  writePluginFile(consumer, 'hooks/hook-gateway.cjs', gateway);
  writePluginFile(consumer, 'hooks/hooks.json', hooksJson);
  writePluginFile(consumer, 'lib/demo.cjs', lib);
  writePluginFile(consumer, 'scripts/demo.js', script);
  writeManifest(consumer, {
    'skills/demo/SKILL.md': sha256(skill),
    'agents/demo.md': sha256(agent),
    'hooks/hook-gateway.cjs': sha256(gateway),
    'hooks/hooks.json': sha256(hooksJson),
    'lib/demo.cjs': sha256(lib),
    'scripts/demo.js': sha256(script),
  });
}

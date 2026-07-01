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

export function pluginRoot(consumer: FixtureConsumer, plugin = 'tdk-core'): string {
  return path.join(consumer.root, '.specify', 'plugins', plugin);
}

export function writePluginFile(consumer: FixtureConsumer, relativePath: string, content: string, plugin = 'tdk-core'): void {
  const filePath = path.join(pluginRoot(consumer, plugin), relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function writeManifest(consumer: FixtureConsumer, files: Record<string, string>): void {
  writeMultiPluginManifest(consumer, {
    'tdk-core': { version: '1.0.0', files },
  });
}

export function writeMultiPluginManifest(consumer: FixtureConsumer, plugins: Record<string, { version: string; files: Record<string, string> }>): void {
  const manifestPath = path.join(consumer.root, '.specify', 'plugins', 'manifest.json');
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
    generated_at: '2026-05-29T00:00:00Z',
    plugins: manifestPlugins,
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

export function writePrefixedSkillPlugin(consumer: FixtureConsumer, plugin = 'tdk-core'): void {
  const skill = '# tdk-demo\nUse tdk-demo from command text.\n';
  writePluginFile(consumer, 'skills/tdk-demo/SKILL.md', skill, plugin);
  writeMultiPluginManifest(consumer, {
    [plugin]: {
      version: '1.0.0',
      files: { 'skills/tdk-demo/SKILL.md': sha256(skill) },
    },
  });
}

export function writeHookOnlyPlugin(consumer: FixtureConsumer, plugin: string, hookName = 'shared-gateway.cjs'): void {
  const gateway = `#!/usr/bin/env node\nconsole.log("${plugin}");\n`;
  const hooksJson = JSON.stringify({
    hooks: {
      UserPromptSubmit: [
        {
          matcher: '*',
          hooks: [
            { type: 'command', command: `node "\${CLAUDE_PLUGIN_ROOT}/hooks/${hookName}" ${plugin}` },
          ],
        },
      ],
    },
  }, null, 2);
  writePluginFile(consumer, `hooks/${hookName}`, gateway, plugin);
  writePluginFile(consumer, 'hooks/hooks.json', hooksJson, plugin);
}

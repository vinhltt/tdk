import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeConsumer, sha256, writeManifest, writePluginFile } from './fixtures';

const cliPath = path.resolve('src/index.ts');
const manifestCliPath = path.resolve('src/commands/manifest/compute.ts');

function writeConverterFixture() {
  const consumer = makeConsumer('tdk-codex-e2e-');
  const pluginJson = JSON.stringify({ name: 'tdk-core', description: 'Core plugin', version: '1.0.0' }, null, 2) + '\n';
  const skill = '---\nname: tdk-demo\ndescription: Demo skill\n---\n\nUse tdk-demo.\n';
  const agent = '---\nname: tdk-helper\ndescription: TDK helper\ntools: Read\n---\n\nHelp with TDK.\n';
  const gateway = '"use strict";\nprocess.stdin.pipe(process.stdout);\n';
  const hook = '"use strict";\nprocess.stdin.pipe(process.stdout);\n';
  const lib = 'module.exports = {};\n';
  const hooksJson = JSON.stringify({
    hooks: {
      PreToolUse: [{
        matcher: 'Read',
        hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" demo-hook' }],
      }],
    },
  }, null, 2) + '\n';

  writePluginFile(consumer, '.claude-plugin/plugin.json', pluginJson);
  writePluginFile(consumer, 'skills/tdk-demo/SKILL.md', skill);
  writePluginFile(consumer, 'agents/tdk-helper.md', agent);
  writePluginFile(consumer, 'hooks/hook-gateway.cjs', gateway);
  writePluginFile(consumer, 'hooks/demo-hook.cjs', hook);
  writePluginFile(consumer, 'hooks/hooks.json', hooksJson);
  writePluginFile(consumer, 'lib/demo.cjs', lib);
  writeManifest(consumer, {
    '.claude-plugin/plugin.json': sha256(pluginJson),
    'skills/tdk-demo/SKILL.md': sha256(skill),
    'agents/tdk-helper.md': sha256(agent),
    'hooks/hook-gateway.cjs': sha256(gateway),
    'hooks/demo-hook.cjs': sha256(hook),
    'hooks/hooks.json': sha256(hooksJson),
    'lib/demo.cjs': sha256(lib),
  });
  return consumer;
}

describe('codex convert/install e2e', () => {
  test('converts plugin source, installs dual-target Codex artifacts, and runs generated wrapper', () => {
    const consumer = writeConverterFixture();

    const convert = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'convert', '--plugins', 'tdk-core'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(convert.exitCode).toBe(0);

    const manifest = Bun.spawnSync({
      cmd: ['bun', manifestCliPath, '--project-root', consumer.root, '--write', '--output', 'table'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(manifest.exitCode).toBe(0);

    const install = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--harness', 'codex', '--plugins', 'tdk-core', '--yes'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(install.exitCode).toBe(0);

    expect(fs.existsSync(path.join(consumer.root, '.agents', 'skills', 'tdk-demo', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(consumer.root, '.codex', 'agents', 'tdk-helper.toml'))).toBe(true);
    expect(fs.existsSync(path.join(consumer.root, '.codex', 'hooks', 'hook-gateway.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(consumer.root, '.codex', 'lib', 'demo.cjs'))).toBe(true);
    expect(fs.readFileSync(path.join(consumer.root, '.codex', 'config.toml'), 'utf-8')).toContain('[agents.tdk-helper]');
    expect(JSON.parse(fs.readFileSync(path.join(consumer.root, '.codex', 'hooks.json'), 'utf-8')).PreToolUse).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(consumer.root, '.specify', 'state', 'harness-install', 'codex.json'), 'utf-8')).selectedPlugins).toEqual(['tdk-core']);

    const wrapperDir = path.join(consumer.root, '.codex', 'hooks', 'wrappers');
    const wrapper = fs.readdirSync(wrapperDir).find((file) => file.endsWith('.cjs'));
    expect(wrapper).toBeDefined();
    const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read' });
    const runWrapper = Bun.spawnSync({
      cmd: ['node', path.join(wrapperDir, wrapper!)],
      cwd: path.join(consumer.root, '.codex'),
      stdin: Buffer.from(payload),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(runWrapper.exitCode).toBe(0);
    expect(runWrapper.stdout.toString()).toBe(payload);
  });

  test('distributed harness help loads when maintainer converter module is absent', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-codex-dist-'));
    fs.cpSync(path.resolve('src'), path.join(dist, 'src'), { recursive: true });
    fs.symlinkSync(path.resolve('node_modules'), path.join(dist, 'node_modules'), 'dir');
    fs.rmSync(path.join(dist, 'src', 'commands', 'harness', 'codex-convert-command.ts'));

    const result = Bun.spawnSync({
      cmd: ['bun', path.join(dist, 'src', 'index.ts'), 'harness', 'install', '--help'],
      cwd: dist,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('--harness <names>');
  });
});

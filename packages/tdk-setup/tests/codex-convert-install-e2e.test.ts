import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeConsumer, sha256, writeManifest, writePluginDependencyPolicy, writePluginFile } from './fixtures';

const cliPath = path.resolve('src/index.ts');
// manifest compute lives in the sibling .specify/scripts/ts package, not in tdk-setup.
const manifestCliPath = path.resolve('../../.specify/scripts/ts/src/commands/manifest/compute.ts');

function writeConverterFixture() {
  const consumer = makeConsumer('tdk-codex-e2e-');
  const plugin = 'tdk-memory';
  const pluginJson = JSON.stringify({ name: plugin, description: 'Memory plugin', version: '1.0.0' }, null, 2) + '\n';
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

  writePluginFile(consumer, '.claude-plugin/plugin.json', pluginJson, plugin);
  writePluginFile(consumer, 'skills/tdk-demo/SKILL.md', skill, plugin);
  writePluginFile(consumer, 'agents/tdk-helper.md', agent, plugin);
  writePluginFile(consumer, 'hooks/hook-gateway.cjs', gateway, plugin);
  writePluginFile(consumer, 'hooks/demo-hook.cjs', hook, plugin);
  writePluginFile(consumer, 'hooks/hooks.json', hooksJson, plugin);
  writePluginFile(consumer, 'lib/demo.cjs', lib, plugin);
  writeManifest(consumer, {
    '.claude-plugin/plugin.json': sha256(pluginJson),
    'skills/tdk-demo/SKILL.md': sha256(skill),
    'agents/tdk-helper.md': sha256(agent),
    'hooks/hook-gateway.cjs': sha256(gateway),
    'hooks/demo-hook.cjs': sha256(hook),
    'hooks/hooks.json': sha256(hooksJson),
    'lib/demo.cjs': sha256(lib),
  }, plugin);
  writePluginDependencyPolicy(consumer);
  return { consumer, plugin };
}

describe('codex convert/install e2e', () => {
  test('converts plugin source, installs dual-target Codex artifacts, and runs generated wrapper', () => {
    const { consumer, plugin } = writeConverterFixture();

    const convert = Bun.spawnSync({
      cmd: ['bun', cliPath, 'convert', '--plugins', plugin],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(convert.exitCode).toBe(0);

    const freshCheck = Bun.spawnSync({
      cmd: ['bun', cliPath, 'convert', '--plugins', plugin, '--check'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(freshCheck.exitCode, freshCheck.stderr.toString()).toBe(0);

    const generatedSkillRelativePath = 'skills/tdk-demo/SKILL.md';
    const generatedSkillPath = path.join(
      consumer.root,
      '.specify',
      'codex-plugins',
      plugin,
      ...generatedSkillRelativePath.split('/'),
    );
    fs.appendFileSync(generatedSkillPath, '\nDrifted generated artifact.\n', 'utf-8');

    const driftCheck = Bun.spawnSync({
      cmd: ['bun', cliPath, 'convert', '--plugins', plugin, '--check'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(driftCheck.exitCode).toBe(1);
    expect(driftCheck.stdout.toString()).toContain(`${plugin}: different ${generatedSkillRelativePath}`);

    const restore = Bun.spawnSync({
      cmd: ['bun', cliPath, 'convert', '--plugins', plugin],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(restore.exitCode, restore.stderr.toString()).toBe(0);

    const restoredCheck = Bun.spawnSync({
      cmd: ['bun', cliPath, 'convert', '--plugins', plugin, '--check'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(restoredCheck.exitCode, restoredCheck.stderr.toString()).toBe(0);

    const manifest = Bun.spawnSync({
      cmd: ['bun', manifestCliPath, '--project-root', consumer.root, '--write', '--output', 'table'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(manifest.exitCode).toBe(0);

    const install = Bun.spawnSync({
      cmd: ['bun', cliPath, 'install', '--harness', 'codex', '--plugins', plugin, '--yes'],
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
    expect(JSON.parse(fs.readFileSync(path.join(consumer.root, '.specify', 'state', 'harness-install', 'codex.json'), 'utf-8')).selectedPlugins).toEqual([plugin]);

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
});

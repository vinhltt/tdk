import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyInstallPlan } from '../src/install-writer';
import { buildClaudeInstallPlan } from '../src/install-plan';
import { discoverPluginInventory } from '../src/plugin-discovery';
import { emptyHarnessManifest } from '../src/manifest-store';
import { makeConsumer, sha256, writeManifest, writePluginDependencyPolicy, writePluginFile } from './fixtures';

const cliPath = path.resolve('src/index.ts');
// manifest compute lives in the sibling .specify/scripts/ts package, not in tdk-setup.
const manifestCliPath = path.resolve('../../.specify/scripts/ts/src/commands/manifest/compute.ts');
const SOURCE_PLUGINS_DIR = path.resolve(import.meta.dir, '../../../.specify/plugins');
const SOURCE_PLUGIN_DIR = path.join(SOURCE_PLUGINS_DIR, 'tdk-core');
const SOURCE_MANIFEST_PATH = path.join(SOURCE_PLUGINS_DIR, 'manifest.json');

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

/** Consumer carrying the real tdk-core plugin source, not an echo stub. */
function writeRealPluginFixture(prefix: string) {
  const consumer = makeConsumer(prefix);
  fs.cpSync(SOURCE_PLUGIN_DIR, consumer.pluginRoot, { recursive: true });

  const sourceManifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST_PATH, 'utf8'));
  fs.writeFileSync(
    path.join(consumer.root, '.specify', 'plugins', 'manifest.json'),
    `${JSON.stringify({ ...sourceManifest, plugins: { 'tdk-core': sourceManifest.plugins['tdk-core'] } }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(consumer.root, '.specify', '.specify.json'),
    `${JSON.stringify({
      version: '1.0',
      name: 'codex-e2e',
      subWorkspaces: [],
      git: { mainBranch: 'main', prefixList: 'CD' },
      specs: { root: '.specify', defaultFolder: 'specs', ticketFormat: '^CD-\\d+$' },
    }, null, 2)}\n`,
    'utf8',
  );
  writePluginDependencyPolicy(consumer);
  fs.mkdirSync(path.join(consumer.root, '.specify', 'specs', 'cd-001'), { recursive: true });
  return consumer;
}

function runCli(cwd: string, args: string[]) {
  return Bun.spawnSync({ cmd: ['bun', cliPath, ...args], cwd, stdout: 'pipe', stderr: 'pipe' });
}

function treeSnapshot(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, encoding: 'utf-8' }).sort();
}

function findWrapper(wrapperDir: string, hookName?: string): string {
  const wrappers = fs.readdirSync(wrapperDir)
    .map((file) => path.join(wrapperDir, file))
    .filter((file) => fs.statSync(file).isFile());
  if (wrappers.length === 0) throw new Error(`No generated wrapper under ${wrapperDir}`);
  if (!hookName) return wrappers[0]!;
  // Wrapper filenames are content hashes, so the target hook is identified by
  // the invocation the wrapper carries.
  const match = wrappers.find((file) => fs.readFileSync(file, 'utf-8').includes(hookName));
  if (!match) throw new Error(`No generated wrapper for ${hookName} under ${wrapperDir}`);
  return match;
}

function runWrapper(wrapperPath: string, consumerRoot: string, payload: Record<string, unknown>) {
  return Bun.spawnSync({
    cmd: ['node', wrapperPath],
    // Generated invocations are relative to the Codex home directory.
    cwd: path.join(consumerRoot, '.codex'),
    env: { ...process.env, CLAUDE_PROJECT_DIR: consumerRoot },
    stdin: Buffer.from(JSON.stringify(payload)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function sessionRecords(file: string): Array<Record<string, unknown>> {
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Strips the codex dispatch from an installed lib to simulate an older install. */
function downgradeHarnessPayload(libPath: string): void {
  const source = fs.readFileSync(libPath, 'utf-8');
  const downgraded = source.replace(/\n\s*case 'codex':\n\s*return loadPayloadCodexHarness\(rawPayload\);/, '');
  if (downgraded === source) throw new Error(`Failed to downgrade ${libPath}: codex dispatch not found`);
  fs.writeFileSync(libPath, downgraded, 'utf-8');
}

describe('codex convert/install e2e', () => {
  test('converts plugin source, installs dual-target Codex artifacts, and runs generated wrapper', () => {
    const { consumer, plugin } = writeConverterFixture();

    const convert = runCli(consumer.scriptsDir, ['convert', '--plugins', plugin]);
    expect(convert.exitCode).toBe(0);

    const freshCheck = runCli(consumer.scriptsDir, ['convert', '--plugins', plugin, '--check']);
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

    const driftCheck = runCli(consumer.scriptsDir, ['convert', '--plugins', plugin, '--check']);
    expect(driftCheck.exitCode).toBe(1);
    expect(driftCheck.stdout.toString()).toContain(`${plugin}: different ${generatedSkillRelativePath}`);

    const restore = runCli(consumer.scriptsDir, ['convert', '--plugins', plugin]);
    expect(restore.exitCode, restore.stderr.toString()).toBe(0);

    const restoredCheck = runCli(consumer.scriptsDir, ['convert', '--plugins', plugin, '--check']);
    expect(restoredCheck.exitCode, restoredCheck.stderr.toString()).toBe(0);

    const manifest = Bun.spawnSync({
      cmd: ['bun', manifestCliPath, '--project-root', consumer.root, '--write', '--output', 'table'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(manifest.exitCode).toBe(0);

    const install = runCli(consumer.scriptsDir, ['install', '--harness', 'codex', '--plugins', plugin, '--yes']);
    expect(install.exitCode).toBe(0);

    expect(fs.existsSync(path.join(consumer.root, '.agents', 'skills', 'tdk-demo', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(consumer.root, '.codex', 'agents', 'tdk-helper.toml'))).toBe(true);
    expect(fs.existsSync(path.join(consumer.root, '.codex', 'hooks', 'hook-gateway.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(consumer.root, '.codex', 'lib', 'demo.cjs'))).toBe(true);
    expect(fs.readFileSync(path.join(consumer.root, '.codex', 'config.toml'), 'utf-8')).toContain('[agents.tdk-helper]');
    expect(JSON.parse(fs.readFileSync(path.join(consumer.root, '.codex', 'hooks.json'), 'utf-8')).PreToolUse).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(consumer.root, '.specify', 'state', 'harness-install', 'codex.json'), 'utf-8')).selectedPlugins).toEqual([plugin]);

    const wrapperPath = findWrapper(path.join(consumer.root, '.codex', 'hooks', 'wrappers'));
    const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read' });
    const wrapperRun = Bun.spawnSync({
      cmd: ['node', wrapperPath],
      cwd: path.join(consumer.root, '.codex'),
      stdin: Buffer.from(payload),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(wrapperRun.exitCode).toBe(0);
    expect(wrapperRun.stdout.toString()).toBe(payload);
  });

  test('T40/T42 the emitter path produces a wrapper that labels codex and still denies', () => {
    const consumer = writeRealPluginFixture('tdk-codex-real-emitter-');

    const convert = runCli(consumer.scriptsDir, ['convert', '--plugins', 'tdk-core']);
    expect(convert.exitCode, convert.stderr.toString()).toBe(0);

    const manifest = Bun.spawnSync({
      cmd: ['bun', manifestCliPath, '--project-root', consumer.root, '--write', '--output', 'table'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(manifest.exitCode, manifest.stderr.toString()).toBe(0);

    const install = runCli(consumer.scriptsDir, ['install', '--harness', 'codex', '--plugins', 'tdk-core', '--yes']);
    expect(install.exitCode, install.stderr.toString()).toBe(0);

    const wrapperDir = path.join(consumer.root, '.codex', 'hooks', 'wrappers');
    const injectorWrapper = findWrapper(wrapperDir, 'dev-context-injector');
    expect(fs.readFileSync(injectorWrapper, 'utf-8')).toContain('TDK_HARNESS: "codex"');

    // T40: a real UserPromptSubmit run through the generated wrapper.
    const promptRun = runWrapper(injectorWrapper, consumer.root, {
      session_id: 'codex-emitter-session-001',
      transcript_path: path.join(consumer.root, 'missing-transcript.jsonl'),
      cwd: consumer.root,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'status of CD-001',
    });
    expect(promptRun.exitCode, promptRun.stderr.toString()).toBe(0);

    const records = sessionRecords(path.join(consumer.root, '.specify', 'specs', 'cd-001', 'sessions.jsonl'));
    expect(records.map((record) => record.session)).toEqual(['codex-emitter-session-001']);
    expect(records[0]!.harness).toBe('codex');
    expect(records[0]!.harnessSource).toBe('env');

    // T42: the destructive blocker must still deny through the same wrapper.
    const denyRun = runWrapper(findWrapper(wrapperDir, 'destructive-command-block'), consumer.root, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    });
    expect(denyRun.exitCode).not.toBe(1);
    const decision = JSON.parse(denyRun.stdout.toString());
    expect(decision.permissionDecision).toBe('deny');
  }, 60000);

  test('T41/T43 the flat path produces a wrapper that labels codex and still denies', async () => {
    const consumer = writeRealPluginFixture('tdk-codex-real-flat-');
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    await applyInstallPlan(buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    }), { yes: true, interactive: false });

    const convert = runCli(consumer.root, ['convert-flat', consumer.root, '--harness', 'codex', '--yes']);
    expect(convert.exitCode, convert.stderr.toString()).toBe(0);

    const wrapperDir = path.join(consumer.root, '.codex', 'hooks', 'wrappers');
    const injectorWrapper = findWrapper(wrapperDir, 'dev-context-injector');
    expect(fs.readFileSync(injectorWrapper, 'utf-8')).toContain('TDK_HARNESS: "codex"');

    const promptRun = runWrapper(injectorWrapper, consumer.root, {
      session_id: 'codex-flat-session-001',
      transcript_path: path.join(consumer.root, 'missing-transcript.jsonl'),
      cwd: consumer.root,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'status of CD-001',
    });
    expect(promptRun.exitCode, promptRun.stderr.toString()).toBe(0);

    const records = sessionRecords(path.join(consumer.root, '.specify', 'specs', 'cd-001', 'sessions.jsonl'));
    expect(records.map((record) => record.session)).toEqual(['codex-flat-session-001']);
    expect(records[0]!.harness).toBe('codex');
    expect(records[0]!.harnessSource).toBe('env');

    const denyRun = runWrapper(findWrapper(wrapperDir, 'destructive-command-block'), consumer.root, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    });
    expect(denyRun.exitCode).not.toBe(1);
    expect(JSON.parse(denyRun.stdout.toString()).permissionDecision).toBe('deny');
  }, 60000);

  test('T38/T44 the emitter path refuses an incompatible lib before writing anything', () => {
    const consumer = writeRealPluginFixture('tdk-codex-reject-emitter-');
    downgradeHarnessPayload(path.join(consumer.pluginRoot, 'lib', 'harness-payload.cjs'));
    fs.rmSync(path.join(consumer.pluginRoot, '.claude-plugin', 'interface.json'), { force: true });

    const before = treeSnapshot(path.join(consumer.root, '.specify', 'codex-plugins'));
    const convert = runCli(consumer.scriptsDir, ['convert', '--plugins', 'tdk-core']);

    expect(convert.exitCode).not.toBe(0);
    expect(convert.stderr.toString()).toContain('Codex harness preflight failed');
    expect(convert.stderr.toString()).toContain('no "codex" dispatch');
    expect(treeSnapshot(path.join(consumer.root, '.specify', 'codex-plugins'))).toEqual(before);
    expect(fs.existsSync(path.join(consumer.pluginRoot, '.claude-plugin', 'interface.json'))).toBe(false);
  }, 60000);

  test('T39/T44 the flat path refuses an incompatible lib before writing anything', async () => {
    const consumer = writeRealPluginFixture('tdk-codex-reject-flat-');
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    await applyInstallPlan(buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    }), { yes: true, interactive: false });
    downgradeHarnessPayload(path.join(consumer.root, '.claude', 'hooks', 'tdk-core', 'lib', 'harness-payload.cjs'));

    const convert = runCli(consumer.root, ['convert-flat', consumer.root, '--harness', 'codex', '--yes']);

    expect(convert.exitCode).not.toBe(0);
    expect(convert.stderr.toString()).toContain('Codex harness preflight failed');
    expect(fs.existsSync(path.join(consumer.root, '.codex'))).toBe(false);
    expect(fs.existsSync(path.join(consumer.root, '.agents', 'skills'))).toBe(false);
  }, 60000);
});

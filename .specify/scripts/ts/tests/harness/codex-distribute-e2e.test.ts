// Fresh-consumer distribute exclusion guard.
// Proves distribute.sh intentionally does NOT carry .specify/codex-plugins/ to consumers:
// generated Codex packages are a local/source artifact, deliberately kept out of the
// distributed contract (codex-plugins/ is absent from distribute.sh SPECIFY_INCLUDES).
// Two-dir construction: Dir A is a synthetic source with codex-plugins/ generated via
// harness convert + compute --write. Dir B is a fresh consumer. distribute.sh is invoked
// as `bash A/distribute.sh B --yes --no-delete` so BASH_SOURCE[0] resolves SOURCE_ROOT = A.
// The synthetic source deliberately contains a generated codex-plugins/ tree so the test
// proves the tree is EXCLUDED from distribution even when present at the source.

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeConsumer, sha256, writeManifest, writePluginFile } from './fixtures';

const cliPath = path.resolve('src/index.ts');
const manifestCliPath = path.resolve('src/commands/manifest/compute.ts');
// Real distribute.sh lives alongside the project root (resolved from scripts/ts up 3 levels)
const distributeShPath = path.resolve('..', '..', '..', 'distribute.sh');

/** Build a synthetic source (Dir A): plugins/tdk-core + harness convert + compute --write. */
function buildSyntheticSource(): string {
  const consumer = makeConsumer('tdk-dist-src-');

  // Write a minimal tdk-core plugin (same shape as the convert e2e)
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

  // Run harness convert to generate .specify/codex-plugins/tdk-core/
  const convert = Bun.spawnSync({
    cmd: ['bun', cliPath, 'harness', 'convert', '--plugins', 'tdk-core'],
    cwd: consumer.scriptsDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (convert.exitCode !== 0) {
    throw new Error(`convert failed in buildSyntheticSource: ${convert.stderr.toString()}`);
  }

  // Run compute --write to generate .specify/codex-plugins/manifest.json
  const compute = Bun.spawnSync({
    cmd: ['bun', manifestCliPath, '--project-root', consumer.root, '--write', '--output', 'table'],
    cwd: consumer.scriptsDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (compute.exitCode !== 0) {
    throw new Error(`compute --write failed in buildSyntheticSource: ${compute.stderr.toString()}`);
  }

  return consumer.root;
}

describe('codex distribute exclusion', () => {
  test('distribute.sh does NOT carry .specify/codex-plugins/ into a fresh consumer', () => {
    // Graceful skip if distribute.sh is not accessible
    if (!fs.existsSync(distributeShPath)) {
      process.stderr.write(`[skip] distribute.sh not found at ${distributeShPath}\n`);
      return;
    }
    // Graceful skip if bash is not available
    const bashCheck = Bun.spawnSync({ cmd: ['bash', '--version'], stdout: 'pipe', stderr: 'pipe' });
    if (bashCheck.exitCode !== 0) {
      process.stderr.write('[skip] bash not available\n');
      return;
    }

    // Dir A: synthetic source with plugins + generated codex-plugins
    const sourceRoot = buildSyntheticSource();
    // Sanity: the source genuinely contains a codex-plugins/ tree, otherwise the
    // exclusion assertion below would pass vacuously.
    expect(
      fs.existsSync(path.join(sourceRoot, '.specify', 'codex-plugins', 'tdk-core')),
      'precondition: synthetic source must contain a generated codex-plugins/ tree',
    ).toBe(true);

    // Copy distribute.sh into Dir A so BASH_SOURCE[0] makes SOURCE_ROOT = sourceRoot
    const localDistributeSh = path.join(sourceRoot, 'distribute.sh');
    fs.copyFileSync(distributeShPath, localDistributeSh);
    fs.chmodSync(localDistributeSh, 0o755);

    // Dir B: fresh empty consumer (just needs to exist as a directory)
    const consumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-dist-consumer-'));

    // Run distribute.sh from Dir A → Dir B
    const distribute = Bun.spawnSync({
      cmd: ['bash', localDistributeSh, consumerRoot, '--yes', '--no-delete'],
      cwd: sourceRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(
      distribute.exitCode,
      `distribute.sh failed:\nstdout: ${distribute.stdout.toString()}\nstderr: ${distribute.stderr.toString()}`,
    ).toBe(0);

    // distribute.sh DID run and carry the Claude source tree (plugins/) — proves the
    // exclusion below is specific to codex-plugins/, not a wholesale distribute failure.
    expect(
      fs.existsSync(path.join(consumerRoot, '.specify', 'plugins', 'tdk-core')),
      '.specify/plugins/tdk-core/ must be distributed to the consumer',
    ).toBe(true);

    // PRIMARY guard: codex-plugins/ is intentionally NOT shipped to consumers.
    const codexPluginsDir = path.join(consumerRoot, '.specify', 'codex-plugins');
    expect(
      fs.existsSync(codexPluginsDir),
      '.specify/codex-plugins/ must NOT be distributed to consumers (intentionally excluded)',
    ).toBe(false);
  });
});

// Fresh-consumer distribute guard.
// Proves distribute.sh carries .specify/codex-plugins/ to consumers:
// generated Codex packages are part of the consumer payload because
// `tdk-setup install --harness codex` installs from .specify/codex-plugins/.
// Two-dir construction: Dir A is a synthetic source with codex-plugins/ generated via
// the tdk-setup CLI's convert command + compute --write. Dir B is a fresh consumer.
// distribute.sh is invoked as `bash A/distribute.sh B --yes --no-delete` so
// BASH_SOURCE[0] resolves SOURCE_ROOT = A.
// The synthetic source deliberately contains a generated codex-plugins/ tree so the test
// proves the tree is distributed when present at the source.

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

interface FixtureConsumer {
  root: string;
  scriptsDir: string;
  pluginRoot: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeConsumer(prefix = 'tdk-harness-'): FixtureConsumer {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const scriptsDir = path.join(root, '.specify', 'scripts', 'ts');
  const pluginRoot = path.join(root, '.specify', 'plugins', 'tdk-core');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.mkdirSync(pluginRoot, { recursive: true });
  return { root, scriptsDir, pluginRoot };
}

function pluginRootPath(consumer: FixtureConsumer, plugin = 'tdk-core'): string {
  return path.join(consumer.root, '.specify', 'plugins', plugin);
}

function writePluginFile(consumer: FixtureConsumer, relativePath: string, content: string, plugin = 'tdk-core'): void {
  const filePath = path.join(pluginRootPath(consumer, plugin), relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function writeManifest(consumer: FixtureConsumer, files: Record<string, string>): void {
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

const setupCliPath = path.resolve('..', '..', '..', 'packages', 'tdk-setup', 'src', 'index.ts');
const manifestCliPath = path.resolve('src/commands/manifest/compute.ts');
// Real distribute.sh lives alongside the project root (resolved from scripts/ts up 3 levels)
const distributeShPath = path.resolve('..', '..', '..', 'distribute.sh');

function copyDistributeScript(sourceRoot: string): string {
  const localDistributeSh = path.join(sourceRoot, 'distribute.sh');
  fs.copyFileSync(distributeShPath, localDistributeSh);
  fs.chmodSync(localDistributeSh, 0o755);
  return localDistributeSh;
}

function runDistribute(sourceRoot: string, consumerRoot: string, args: string[] = []) {
  return Bun.spawnSync({
    cmd: ['bash', path.join(sourceRoot, 'distribute.sh'), consumerRoot, ...args],
    cwd: sourceRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function fileMode(filePath: string): number {
  return fs.statSync(filePath).mode & 0o777;
}

/** Build a synthetic source (Dir A): plugins/tdk-core + setup CLI convert + compute --write. */
function buildSyntheticSource(): string {
  const consumer = makeConsumer('tdk-dist-src-');
  fs.writeFileSync(path.join(consumer.scriptsDir, 'package.json'), '{"type":"module"}\n', 'utf-8');

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

  const docsIndexPath = path.join(consumer.root, '.specify', 'docs', 'en', 'index.md');
  fs.mkdirSync(path.dirname(docsIndexPath), { recursive: true });
  fs.writeFileSync(docsIndexPath, '# TDK Guides\n\nDistributed docs fixture.\n', 'utf-8');

  const schemaPath = path.join(consumer.root, '.specify', 'schemas', 'specify.schema.json');
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  fs.writeFileSync(schemaPath, '{"$schema":"https://json-schema.org/draft/2020-12/schema"}\n', 'utf-8');

  const memoryTemplatePath = path.join(consumer.root, '.specify', 'templates', 'memory', 'decision-record-template.md.tpl');
  fs.mkdirSync(path.dirname(memoryTemplatePath), { recursive: true });
  fs.writeFileSync(memoryTemplatePath, '# Decision Record\n\nDistributed memory template fixture.\n', 'utf-8');

  const memoryStatePath = path.join(consumer.root, '.specify', 'memory', 'constitution.md');
  fs.mkdirSync(path.dirname(memoryStatePath), { recursive: true });
  fs.writeFileSync(memoryStatePath, '# Local consumer memory must not distribute.\n', 'utf-8');

  // Run the tdk-setup CLI's convert command to generate .specify/codex-plugins/tdk-core/
  const convert = Bun.spawnSync({
    cmd: ['bun', setupCliPath, 'convert', '--plugins', 'tdk-core'],
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

describe('codex distribute payload', () => {
  test('distribute.sh carries .specify/codex-plugins/ into a fresh consumer', () => {
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
    copyDistributeScript(sourceRoot);

    // Dir B: fresh empty consumer (just needs to exist as a directory)
    const consumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-dist-consumer-'));

    // Run distribute.sh from Dir A → Dir B
    const distribute = runDistribute(sourceRoot, consumerRoot, ['--yes', '--no-delete']);
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
    expect(
      fs.existsSync(path.join(consumerRoot, '.specify', 'docs', 'en', 'index.md')),
      '.specify/docs/ must be distributed to the consumer',
    ).toBe(true);
    expect(
      fs.existsSync(path.join(consumerRoot, '.specify', 'schemas', 'specify.schema.json')),
      '.specify/schemas/ must be distributed to the consumer',
    ).toBe(true);
    expect(
      fs.existsSync(path.join(consumerRoot, '.specify', 'templates', 'memory', 'decision-record-template.md.tpl')),
      '.specify/templates/memory/ must be distributed to the consumer',
    ).toBe(true);
    expect(
      fs.existsSync(path.join(consumerRoot, '.specify', 'memory', 'constitution.md')),
      '.specify/memory/ state must stay local to the source project',
    ).toBe(false);

    // PRIMARY guard: codex-plugins/ is required for consumer Codex install.
    const codexPluginsDir = path.join(consumerRoot, '.specify', 'codex-plugins');
    expect(
      fs.existsSync(codexPluginsDir),
      '.specify/codex-plugins/ must be distributed to consumers for Codex install',
    ).toBe(true);

    const install = Bun.spawnSync({
      cmd: ['bun', setupCliPath, 'install', consumerRoot, '--harness', 'codex', '--plugins', 'tdk-core', '--dry-run'],
      cwd: sourceRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(
      install.exitCode,
      `tdk-setup codex install dry-run failed:\nstdout: ${install.stdout.toString()}\nstderr: ${install.stderr.toString()}`,
    ).toBe(0);
    expect(install.stdout.toString()).toContain('.agents/skills/tdk-demo/SKILL.md');
  });

  test('distribute.sh can brand safe payload text while preserving plugin and codex package bytes', () => {
    if (!fs.existsSync(distributeShPath)) {
      process.stderr.write(`[skip] distribute.sh not found at ${distributeShPath}\n`);
      return;
    }

    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-dist-brand-src-'));
    const specifyRoot = path.join(sourceRoot, '.specify');

    const setupText = [
      '#!/usr/bin/env bash',
      '# TDK setup for tdk consumers',
      'echo "/tdk-plan uses tdk-core"',
      'echo "TDK_PROJECT_ROOT and ${TDK} stay runtime-looking"',
      '',
    ].join('\n');
    const docsText = [
      '# TDK Guide',
      '',
      'Run `/tdk-specify` for a tdk feature.',
      'Keep asset link [graph](../assets/tdk-diagram.svg).',
      'Keep plugin path `.specify/plugins/tdk-core/skills/tdk-demo/SKILL.md`.',
      'Keep codex plugin path `.specify/codex-plugins/tdk-core/skills/tdk-demo/SKILL.md`.',
      '',
    ].join('\n');
    const templateText = 'Generated by /tdk-plan for TDK.\n';
    const pluginText = 'Plugin bytes mention TDK, tdk, and tdk-core but must not be branded.\n';
    const codexText = 'Codex package bytes mention TDK, tdk, and tdk-demo but must not be branded.\n';
    const assetText = '<svg><text>TDK /tdk-plan asset stays unmodified</text></svg>\n';

    const files: Record<string, string> = {
      'setup.sh': setupText,
      'docs/en/index.md': docsText,
      'templates/demo.md.tpl': templateText,
      'plugins/tdk-core/skills/tdk-demo/SKILL.md': pluginText,
      'codex-plugins/tdk-core/skills/tdk-demo/SKILL.md': codexText,
      'docs/assets/tdk-diagram.svg': assetText,
    };

    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(specifyRoot, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
    }
    fs.chmodSync(path.join(specifyRoot, 'setup.sh'), 0o755);
    copyDistributeScript(sourceRoot);

    const plainConsumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-dist-brand-plain-'));
    const plain = runDistribute(sourceRoot, plainConsumerRoot, ['--yes', '--no-delete']);
    expect(
      plain.exitCode,
      `plain distribute failed:\nstdout: ${plain.stdout.toString()}\nstderr: ${plain.stderr.toString()}`,
    ).toBe(0);
    expect(fs.readFileSync(path.join(plainConsumerRoot, '.specify', 'setup.sh'), 'utf-8')).toBe(setupText);
    expect(fileMode(path.join(plainConsumerRoot, '.specify', 'setup.sh'))).toBe(0o755);

    const dryRun = runDistribute(sourceRoot, plainConsumerRoot, ['--prefix', 'pav', '--dry-run', '--no-delete']);
    expect(
      dryRun.exitCode,
      `branded dry-run failed:\nstdout: ${dryRun.stdout.toString()}\nstderr: ${dryRun.stderr.toString()}`,
    ).toBe(0);
    expect(dryRun.stdout.toString()).toContain('~ setup.sh');
    expect(fs.readFileSync(path.join(plainConsumerRoot, '.specify', 'setup.sh'), 'utf-8')).toBe(setupText);

    const brandedConsumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-dist-brand-branded-'));
    const branded = runDistribute(sourceRoot, brandedConsumerRoot, ['--prefix', 'pav', '--yes', '--no-delete']);
    expect(
      branded.exitCode,
      `branded distribute failed:\nstdout: ${branded.stdout.toString()}\nstderr: ${branded.stderr.toString()}`,
    ).toBe(0);

    const brandedSetup = fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'setup.sh'), 'utf-8');
    expect(brandedSetup).toContain('# PAV setup for pav consumers');
    expect(brandedSetup).toContain('"/pav-plan uses pav-core"');
    expect(brandedSetup).toContain('TDK_PROJECT_ROOT and ${TDK}');
    expect(fileMode(path.join(brandedConsumerRoot, '.specify', 'setup.sh'))).toBe(0o755);

    const brandedDocs = fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'docs', 'en', 'index.md'), 'utf-8');
    expect(brandedDocs).toContain('# PAV Guide');
    expect(brandedDocs).toContain('`/pav-specify` for a pav feature');
    expect(brandedDocs).toContain('../assets/tdk-diagram.svg');
    expect(brandedDocs).toContain('.specify/plugins/tdk-core/skills/tdk-demo/SKILL.md');
    expect(brandedDocs).toContain('.specify/codex-plugins/tdk-core/skills/tdk-demo/SKILL.md');
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'templates', 'demo.md.tpl'), 'utf-8')).toBe('Generated by /pav-plan for PAV.\n');
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'plugins', 'tdk-core', 'skills', 'tdk-demo', 'SKILL.md'), 'utf-8')).toBe(pluginText);
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'codex-plugins', 'tdk-core', 'skills', 'tdk-demo', 'SKILL.md'), 'utf-8')).toBe(codexText);
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'docs', 'assets', 'tdk-diagram.svg'), 'utf-8')).toBe(assetText);
  });
});

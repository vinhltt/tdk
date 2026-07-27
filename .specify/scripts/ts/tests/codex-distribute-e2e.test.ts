// Fresh-consumer distribute guard.
// Proves distribute.sh carries the configured default payload to consumers.
// Two-dir construction: Dir A is a synthetic source with codex-plugins/ generated via
// the tdk-setup CLI's convert command + compute --write. Dir B is a fresh consumer.
// distribute.sh is invoked as `bash A/distribute.sh B --yes --no-delete` so
// BASH_SOURCE[0] resolves SOURCE_ROOT = A.
// The synthetic source deliberately contains a generated codex-plugins/ tree so the test
// proves the tree is omitted unless distribute.json opts into it.

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

const tdkRoot = path.resolve(import.meta.dir, '../../../..');
const setupCliPath = path.resolve(tdkRoot, 'packages', 'tdk-setup', 'src', 'index.ts');
const manifestCliPath = path.resolve(import.meta.dir, '..', 'src', 'commands', 'manifest', 'compute.ts');
const distributeShPath = path.resolve(tdkRoot, 'distribute.sh');
const releaseManifestCliPath = path.resolve(tdkRoot, '.claude', 'skills', 'tdk-bump', 'scripts', 'generate-release-manifest.ts');
const releaseManifestToolingPath = path.resolve(tdkRoot, '.claude', 'skills', 'tdk-bump', 'scripts');

const defaultDistributeConfig = {
  ship: [
    '.specify/_shared',
    '.specify/plugins/',
    '.specify/claude-rules/',
    '.specify/scripts',
    '.specify/templates/',
    '.specify/setup.sh',
    '.specify/schemas/',
    '.specify/docs/',
    '.specify/.specify.json.example',
    '.specify/release-manifest.json',
  ],
  doNotShip: [
    '.specify/configurations/',
    '.specify/memory/',
    '.specify/CHANGELOG.md',
    '.claude/settings.local.json',
    '.claude/session-state/',
    '.claude/worktrees/',
    '.claude/rules/',
  ],
};

function copyDistributeScript(sourceRoot: string): string {
  const localDistributeSh = path.join(sourceRoot, 'distribute.sh');
  fs.copyFileSync(distributeShPath, localDistributeSh);
  fs.chmodSync(localDistributeSh, 0o755);
  return localDistributeSh;
}

function prepareDistributeSource(sourceRoot: string): void {
  copyDistributeScript(sourceRoot);
  fs.writeFileSync(path.join(sourceRoot, 'distribute.json'), JSON.stringify(defaultDistributeConfig, null, 2) + '\n', 'utf-8');
  fs.cpSync(releaseManifestToolingPath, path.join(sourceRoot, '.claude', 'skills', 'tdk-bump', 'scripts'), {
    recursive: true,
  });
  const manifest = Bun.spawnSync({
    cmd: ['bun', releaseManifestCliPath, '--project-root', sourceRoot, '--write'],
    cwd: sourceRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (manifest.exitCode !== 0) {
    throw new Error(`release manifest generation failed: ${manifest.stderr.toString()}`);
  }
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

function expectFileModeWhenSupported(filePath: string, mode: number): void {
  if (process.platform === 'win32') {
    expect(fs.statSync(filePath).isFile()).toBe(true);
    return;
  }
  expect(fileMode(filePath)).toBe(mode);
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
  test('distribute.sh carries configured default payload into a fresh consumer', () => {
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

    // Prepare Dir A so BASH_SOURCE[0] makes SOURCE_ROOT = sourceRoot and release manifest exists.
    prepareDistributeSource(sourceRoot);

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

    // codex-plugins are generated in source but omitted by the current default distribute.json.
    const codexPluginsDir = path.join(consumerRoot, '.specify', 'codex-plugins');
    expect(
      fs.existsSync(codexPluginsDir),
      '.specify/codex-plugins/ must stay omitted unless distribute.json opts into it',
    ).toBe(false);
    expect(
      fs.existsSync(path.join(consumerRoot, '.specify', 'release-manifest.json')),
      '.specify/release-manifest.json must be distributed to consumers',
    ).toBe(true);

    const emptyDocsDir = path.join(consumerRoot, '.specify', 'docs', 'keep-empty');
    const staleTemplatePath = path.join(consumerRoot, '.specify', 'templates', 'stale-orphan.md.tpl');
    fs.mkdirSync(emptyDocsDir, { recursive: true });
    fs.writeFileSync(staleTemplatePath, '# stale template orphan\n', 'utf-8');

    const deleteOrphan = runDistribute(sourceRoot, consumerRoot, ['--yes', '--yes-delete']);
    expect(
      deleteOrphan.exitCode,
      `distribute.sh default orphan cleanup failed:\nstdout: ${deleteOrphan.stdout.toString()}\nstderr: ${deleteOrphan.stderr.toString()}`,
    ).toBe(0);
    expect(fs.existsSync(staleTemplatePath), 'unmanaged target files must not be deleted by manifest fast path').toBe(true);
    expect(fs.existsSync(emptyDocsDir), 'manifest cleanup must preserve unmanaged empty docs directories').toBe(true);
  }, 20000);

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
      '- [Why TDK?](#why-tdk)',
      'See [TDK Skills Guide](guides/skills-guide.md#why-tdk).',
      'Run `/tdk-specify` for a tdk feature.',
      'Open [TDK Skills Guide](guides/skills-guide.md).',
      'Keep source package path `packages/tdk-setup/README.md` and `packages/tdk-setup/`.',
      'Keep asset link [graph](../assets/diagram.svg).',
      'Keep plugin path `.specify/plugins/tdk-core/skills/tdk-demo/SKILL.md`.',
      'Keep codex plugin path `.specify/codex-plugins/tdk-core/skills/tdk-demo/SKILL.md`.',
      '',
    ].join('\n');
    const templateText = 'Generated by /tdk-plan for TDK.\n';
    const claudeRuleText = '# TDK primary workflow\nRun `tdk-specify` before `tdk-plan`.\n';
    const pluginText = 'Plugin bytes mention TDK, tdk, and tdk-core but must not be branded.\n';
    const codexText = 'Codex package bytes mention TDK, tdk, and tdk-demo but must not be branded.\n';
    const assetText = '<svg><text>TDK /tdk-plan asset text brands</text><desc>lifecycle-share-graph.png</desc></svg>\n';
    const setupOutputHelpersText = [
      "export const banner = 'TDK Installer';",
      "export const ready = \"Run '/tdk-' commands in Claude Code to verify TDK is ready.\";",
      '',
    ].join('\n');
    const setupTsText = 'console.log("Automates TDK setup from docs.");\n';
    const scriptsPackageText = '{\n  "name": "@tdk/tdk"\n}\n';
    const scriptText = [
      "console.log('TDK script runs /tdk-plan for tdk features.');",
      "console.log('Keep plugin path .specify/plugins/tdk-core/skills/tdk-demo/SKILL.md');",
      "console.log('Keep codex path .specify/codex-plugins/tdk-core/skills/tdk-demo/SKILL.md');",
      "console.log('Keep cache path .specify/cache/tdk-scout');",
      "console.log('Keep installed parser .claude/skills/tdk-test-api-plan/scripts/parse_openapi_spec.py');",
      "const pluginManifest = { 'tdk-core': { version: '1.0.0' } };",
      '',
    ].join('\n');
    const cliIndexText = [
      "program.name('tdk')",
      "  .description('TDK specification toolkit CLI');",
      '// CLI users run tdk config detect.',
      '',
    ].join('\n');
    const testScriptText = 'test("TDK test fixture keeps /tdk-plan and @tdk/tdk source text", () => {});\n';

    const files: Record<string, string> = {
      'setup.sh': setupText,
      'docs/en/index.md': docsText,
      'docs/en/guides/skills-guide.md': '# TDK Skills Guide\n',
      'templates/demo.md.tpl': templateText,
      'claude-rules/primary-workflow-routing.md': claudeRuleText,
      'plugins/tdk-core/skills/tdk-demo/SKILL.md': pluginText,
      'codex-plugins/tdk-core/skills/tdk-demo/SKILL.md': codexText,
      'docs/assets/diagram.svg': assetText,
      'scripts/ts/package.json': scriptsPackageText,
      'scripts/ts/src/index.ts': cliIndexText,
      'scripts/ts/src/commands/setup/utils/output-helpers.ts': setupOutputHelpersText,
      'scripts/ts/src/commands/setup/setup.ts': setupTsText,
      'scripts/ts/src/commands/scout/index.ts': scriptText,
      'scripts/ts/tests/sample.test.ts': testScriptText,
    };

    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(specifyRoot, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
    }
    fs.chmodSync(path.join(specifyRoot, 'setup.sh'), 0o755);
    prepareDistributeSource(sourceRoot);

    const plainConsumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-dist-brand-plain-'));
    const plain = runDistribute(sourceRoot, plainConsumerRoot, ['--yes', '--no-delete']);
    expect(
      plain.exitCode,
      `plain distribute failed:\nstdout: ${plain.stdout.toString()}\nstderr: ${plain.stderr.toString()}`,
    ).toBe(0);
    expect(fs.readFileSync(path.join(plainConsumerRoot, '.specify', 'setup.sh'), 'utf-8')).toBe(setupText);
    expect(fs.readFileSync(path.join(plainConsumerRoot, '.specify', 'claude-rules', 'primary-workflow-routing.md'), 'utf-8')).toBe(claudeRuleText);
    expect(fs.readFileSync(path.join(plainConsumerRoot, '.specify', 'scripts', 'ts', 'package.json'), 'utf-8')).toBe(scriptsPackageText);
    expect(fs.readFileSync(path.join(plainConsumerRoot, '.specify', 'scripts', 'ts', 'tests', 'sample.test.ts'), 'utf-8')).toBe(testScriptText);
    expect(fs.existsSync(path.join(plainConsumerRoot, '.specify', 'docs', 'en', 'index.md'))).toBe(true);
    expect(fs.existsSync(path.join(plainConsumerRoot, '.specify', 'release-manifest.json'))).toBe(true);
    expectFileModeWhenSupported(path.join(plainConsumerRoot, '.specify', 'setup.sh'), 0o755);
    fs.mkdirSync(path.join(plainConsumerRoot, '.specify', 'docs', 'en', 'guides'), { recursive: true });
    fs.mkdirSync(path.join(plainConsumerRoot, '.specify', 'docs', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(plainConsumerRoot, '.specify', 'docs', 'en', 'guides', 'tdk-skills-guide.md'), '# stale old guide\n', 'utf-8');
    fs.writeFileSync(path.join(plainConsumerRoot, '.specify', 'docs', 'assets', 'tdk-diagram.svg'), '<svg>stale old asset</svg>\n', 'utf-8');

    const dryRun = runDistribute(sourceRoot, plainConsumerRoot, ['--prefix', 'sample', '--dry-run', '--no-delete']);
    expect(
      dryRun.exitCode,
      `branded dry-run failed:\nstdout: ${dryRun.stdout.toString()}\nstderr: ${dryRun.stderr.toString()}`,
    ).toBe(0);
    expect(dryRun.stdout.toString()).toContain('~ .specify/setup.sh');
    expect(dryRun.stdout.toString()).toContain('~ .specify/scripts/ts/package.json');
    expect(fs.readFileSync(path.join(plainConsumerRoot, '.specify', 'setup.sh'), 'utf-8')).toBe(setupText);

    const migrated = runDistribute(sourceRoot, plainConsumerRoot, ['--prefix', 'sample', '--yes', '--yes-delete']);
    expect(
      migrated.exitCode,
      `branded migration failed:\nstdout: ${migrated.stdout.toString()}\nstderr: ${migrated.stderr.toString()}`,
    ).toBe(0);
    expect(fs.existsSync(path.join(plainConsumerRoot, '.specify', 'docs', 'en', 'guides', 'skills-guide.md'))).toBe(true);
    expect(fs.existsSync(path.join(plainConsumerRoot, '.specify', 'docs', 'en', 'guides', 'tdk-skills-guide.md'))).toBe(true);
    expect(fs.existsSync(path.join(plainConsumerRoot, '.specify', 'docs', 'assets', 'diagram.svg'))).toBe(true);
    expect(fs.existsSync(path.join(plainConsumerRoot, '.specify', 'docs', 'assets', 'tdk-diagram.svg'))).toBe(true);

    const brandedConsumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-dist-brand-branded-'));
    const branded = runDistribute(sourceRoot, brandedConsumerRoot, ['--prefix', 'sample', '--yes', '--no-delete']);
    expect(
      branded.exitCode,
      `branded distribute failed:\nstdout: ${branded.stdout.toString()}\nstderr: ${branded.stderr.toString()}`,
    ).toBe(0);

    const brandedSetup = fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'setup.sh'), 'utf-8');
    expect(brandedSetup).toContain('# SAMPLE setup for sample consumers');
    expect(brandedSetup).toContain('"/sample-plan uses sample-core"');
    expect(brandedSetup).toContain('TDK_PROJECT_ROOT and ${TDK}');
    expectFileModeWhenSupported(path.join(brandedConsumerRoot, '.specify', 'setup.sh'), 0o755);

    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'docs', 'en', 'index.md'), 'utf-8')).toContain('# SAMPLE Guide');
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'templates', 'demo.md.tpl'), 'utf-8')).toBe('Generated by /sample-plan for SAMPLE.\n');
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'claude-rules', 'primary-workflow-routing.md'), 'utf-8')).toBe('# SAMPLE primary workflow\nRun `sample-specify` before `sample-plan`.\n');
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'scripts', 'ts', 'src', 'commands', 'setup', 'utils', 'output-helpers.ts'), 'utf-8')).toContain('SAMPLE Installer');
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'scripts', 'ts', 'src', 'commands', 'setup', 'utils', 'output-helpers.ts'), 'utf-8')).toContain("Run '/sample-' commands in Claude Code to verify SAMPLE is ready.");
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'scripts', 'ts', 'src', 'commands', 'setup', 'setup.ts'), 'utf-8')).toContain('Automates SAMPLE setup');
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'scripts', 'ts', 'package.json'), 'utf-8')).toContain('"name": "@sample/sample"');
    const brandedCliIndex = fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'scripts', 'ts', 'src', 'index.ts'), 'utf-8');
    expect(brandedCliIndex).toContain("program.name('sample')");
    expect(brandedCliIndex).toContain('SAMPLE specification toolkit CLI');
    expect(brandedCliIndex).toContain('sample config detect');
    const brandedScoutScript = fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'scripts', 'ts', 'src', 'commands', 'scout', 'index.ts'), 'utf-8');
    expect(brandedScoutScript).toContain('SAMPLE script runs /sample-plan for sample features.');
    expect(brandedScoutScript).toContain('.specify/plugins/tdk-core/skills/tdk-demo/SKILL.md');
    expect(brandedScoutScript).toContain('.specify/codex-plugins/tdk-core/skills/tdk-demo/SKILL.md');
    expect(brandedScoutScript).toContain('.specify/cache/tdk-scout');
    expect(brandedScoutScript).toContain('.claude/skills/tdk-test-api-plan/scripts/parse_openapi_spec.py');
    expect(brandedScoutScript).toContain("'tdk-core': { version: '1.0.0' }");
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'scripts', 'ts', 'tests', 'sample.test.ts'), 'utf-8')).toBe(testScriptText);
    expect(fs.existsSync(path.join(brandedConsumerRoot, '.specify', 'release-manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(brandedConsumerRoot, '.specify', 'docs', 'en', 'guides', 'skills-guide.md'))).toBe(true);
    expect(fs.existsSync(path.join(brandedConsumerRoot, '.specify', 'docs', 'en', 'guides', 'tdk-skills-guide.md'))).toBe(false);
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'plugins', 'tdk-core', 'skills', 'tdk-demo', 'SKILL.md'), 'utf-8')).toBe(pluginText);
    expect(fs.existsSync(path.join(brandedConsumerRoot, '.specify', 'codex-plugins', 'tdk-core', 'skills', 'tdk-demo', 'SKILL.md'))).toBe(false);
    expect(fs.readFileSync(path.join(brandedConsumerRoot, '.specify', 'docs', 'assets', 'diagram.svg'), 'utf-8')).toContain('SAMPLE /sample-plan');
  }, 60000);
});

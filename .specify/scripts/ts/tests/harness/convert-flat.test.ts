import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCodexReconcilePlan } from '../../src/commands/harness/codex-reconcile';
import { buildCodexWritePlan } from '../../src/commands/harness/codex-output-writer';
import { discoverFlatClaudeInventory } from '../../src/commands/harness/flat-claude-adapter';
import { buildMigrationReport } from '../../src/commands/harness/flat-claude-migration-report';
import { loadHarnessManifest, saveHarnessManifest } from '../../src/commands/harness/manifest-store';
import { sha256Buffer } from '../../src/commands/harness/checksum';
import { makeConsumer } from './fixtures';
import type { CodexTargetFile, MigrationReport } from '../../src/commands/harness/flat-claude-types';
import type { HarnessInstallManifest } from '../../src/commands/harness/types';

const cliPath = path.resolve('src/index.ts');

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function isCommandAvailable(command: string): boolean {
  return Bun.spawnSync({
    cmd: ['bash', '-lc', `command -v ${command} >/dev/null 2>&1`],
    stdout: 'pipe',
    stderr: 'pipe',
  }).exitCode === 0;
}

function writeFile(root: string, relativePath: string, content: string): string {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function writeFlatClaudeFixture(root: string): void {
  writeFile(root, '.claude/agents/reviewer.md', [
    '---',
    'name: reviewer',
    'description: Review code',
    'tools: Read, Write',
    '---',
    'Review the code.',
  ].join('\n'));
  writeFile(root, '.claude/commands/plan.md', [
    '---',
    'description: Plan work',
    '---',
    'Plan with $ARGUMENTS.',
  ].join('\n'));
  writeFile(root, '.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description: Demo skill',
    '---',
    '# Demo',
  ].join('\n'));
  writeFile(root, '.claude/hooks/hook-gateway.cjs', 'process.stdout.write("{}");\n');
  writeFile(root, '.claude/settings.json', JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'node ".claude/hooks/hook-gateway.cjs" privacy-block' }],
        },
      ],
    },
  }, null, 2));
  writeFile(root, '.claude/unknown.bin', 'unknown');
}

function runConvertFlat(root: string, args: string[]) {
  return Bun.spawnSync({
    cmd: ['bun', cliPath, 'harness', 'convert-flat', root, ...args],
    cwd: path.join(root, '.specify', 'scripts', 'ts'),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, TDK_CODEX_COMPAT: 'optimistic' },
  });
}

function desiredFile(root: string, targetRelativePath: string, content: string): CodexTargetFile {
  const sourcePath = writeFile(root, '.claude/source.txt', 'source');
  const payload = Buffer.from(content, 'utf-8');
  return {
    sourcePath,
    sourceRelativePath: '.claude/source.txt',
    targetRelativePath,
    sourceChecksum: sha256Buffer(Buffer.from('source')),
    installedChecksum: sha256Buffer(payload),
    content: payload,
  };
}

function emptyReport(): MigrationReport {
  return { recognized: [], reported: [], skipped: [], warnings: [] };
}

describe('harness convert-flat', () => {
  test('adapter recognizes known flat .claude shapes and reports unknowns', () => {
    const consumer = makeConsumer('tdk-convert-flat-adapter-');
    writeFlatClaudeFixture(consumer.root);

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const report = buildMigrationReport(inventory);

    expect(inventory.records.some((record) => record.kind === 'agent')).toBe(true);
    expect(inventory.records.some((record) => record.kind === 'command')).toBe(true);
    expect(inventory.records.some((record) => record.kind === 'skill')).toBe(true);
    expect(inventory.records.some((record) => record.kind === 'hooks')).toBe(true);
    expect(report.reported.map((entry) => entry.path)).toContain('.claude/unknown.bin');
  });

  test('dry-run renders migration and reconcile reports without writing targets', () => {
    const consumer = makeConsumer('tdk-convert-flat-dry-');
    writeFlatClaudeFixture(consumer.root);

    const result = runConvertFlat(consumer.root, ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Flat Claude migration report');
    expect(result.stdout.toString()).toContain('Codex convert-flat reconcile plan');
    expect(result.stdout.toString()).toContain('.claude/unknown.bin');
    expect(fs.existsSync(path.join(consumer.root, '.codex', 'config.toml'))).toBe(false);
    expect(fs.existsSync(path.join(consumer.root, '.agents', 'skills', 'demo', 'SKILL.md'))).toBe(false);
  });

  test('dry-run tolerates Claude agent descriptions with unquoted colons', () => {
    const consumer = makeConsumer('tdk-convert-flat-loose-agent-frontmatter-');
    writeFile(consumer.root, '.claude/agents/code-reviewer.md', [
      '---',
      'name: code-reviewer',
      'description: Use this agent when you need comprehensive code review and quality assurance. Context: before merging.',
      'tools: Read, Grep',
      '---',
      'Review code.',
    ].join('\n'));

    const result = runConvertFlat(consumer.root, ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('.codex/agents/code-reviewer.toml');
    expect(result.stderr.toString()).not.toContain('Nested mappings are not allowed');
  });

  test('dev-only ck oracle agrees on known agent and command shapes when available', () => {
    if (!isCommandAvailable('ck')) {
      console.warn('Skipping ck differential oracle: ck is not on PATH.');
      return;
    }
    const consumer = makeConsumer('tdk-convert-flat-oracle-');
    writeFlatClaudeFixture(consumer.root);

    const tdkResult = runConvertFlat(consumer.root, ['--dry-run']);
    const ckResult = Bun.spawnSync({
      cmd: ['ck', 'migrate', '--agent', 'codex', '--dry-run', '--yes', '--reconcile'],
      cwd: consumer.root,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    });

    if (ckResult.exitCode !== 0) {
      console.warn(`Skipping ck differential oracle: ${stripAnsi(ckResult.stderr.toString() || ckResult.stdout.toString())}`);
      return;
    }

    const tdkOut = tdkResult.stdout.toString();
    const ckOut = stripAnsi(ckResult.stdout.toString());

    expect(tdkResult.exitCode).toBe(0);
    expect(tdkOut).toContain('.codex/agents/reviewer.toml');
    expect(tdkOut).toContain('.agents/skills/plan/SKILL.md');
    expect(ckOut).toContain('reviewer -> codex');
    expect(ckOut).toContain('plan -> codex');
  });

  test('convert-flat runtime code does not invoke ck', () => {
    const files = [
      'src/commands/harness/convert-flat.ts',
      'src/commands/harness/flat-claude-adapter.ts',
      'src/commands/harness/codex-output-writer.ts',
      'src/commands/harness/codex-reconcile.ts',
    ];
    const combined = files
      .map((file) => fs.readFileSync(path.resolve(file), 'utf-8'))
      .join('\n');

    expect(combined).not.toMatch(/['"`]ck['"`]|spawn(?:Sync)?\s*\(/);
  });

  test('real run writes codex artifacts and codex ownership manifest', () => {
    const consumer = makeConsumer('tdk-convert-flat-real-');
    writeFlatClaudeFixture(consumer.root);

    const result = runConvertFlat(consumer.root, ['--yes']);
    const secondRun = runConvertFlat(consumer.root, ['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(consumer.root, '.codex', 'agents', 'reviewer.toml'), 'utf-8')).toContain('Review the code.');
    expect(fs.readFileSync(path.join(consumer.root, '.codex', 'config.toml'), 'utf-8')).toContain('[agents.reviewer]');
    expect(fs.readFileSync(path.join(consumer.root, '.codex', 'config.toml'), 'utf-8')).toContain('hooks = true');
    expect(fs.existsSync(path.join(consumer.root, '.codex', 'hooks', 'hook-gateway.cjs'))).toBe(true);
    expect(fs.readFileSync(path.join(consumer.root, '.claude', 'hooks', 'hook-gateway.cjs'), 'utf-8')).toBe('process.stdout.write("{}");\n');
    expect(fs.readFileSync(path.join(consumer.root, '.codex', 'hooks.json'), 'utf-8')).toContain('wrappers');
    expect(fs.existsSync(path.join(consumer.root, '.agents', 'skills', 'demo', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(consumer.root, '.agents', 'skills', 'plan', 'SKILL.md'))).toBe(true);
    const manifest = loadHarnessManifest(consumer.root, 'codex');
    expect(manifest.harness).toBe('codex');
    expect(manifest.managedFiles.some((file) => file.plugin === 'convert-flat')).toBe(true);
    expect(secondRun.exitCode).toBe(0);
    expect(secondRun.stdout.toString()).toContain('skip: .codex/agents/reviewer.toml');
    expect(secondRun.stdout.toString()).toContain('skip: .codex/config.toml');
  });

  test('convert-flat skips internal shared skill entrypoints while preserving shared references', async () => {
    const consumer = makeConsumer('tdk-convert-flat-shared-skill-');
    writeFile(consumer.root, '.claude/skills/_shared/SKILL.md', [
      '---',
      'metadata:',
      '  version: 0.1.0',
      '---',
      '# _shared',
    ].join('\n'));
    writeFile(consumer.root, '.claude/skills/_shared/retro-feedback-schema.md', '# Retro feedback schema\n');
    writeFile(consumer.root, '.claude/skills/tdk-retro-collect/SKILL.md', [
      '---',
      'name: tdk-retro-collect',
      'description: Collect retro feedback',
      '---',
      'Read `../_shared/retro-feedback-schema.md`.',
    ].join('\n'));

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const writePlan = await buildCodexWritePlan(inventory);
    const targets = writePlan.files.map((file) => file.targetRelativePath);

    expect(targets).not.toContain('.agents/skills/shared/SKILL.md');
    expect(targets).not.toContain('.agents/skills/_shared/SKILL.md');
    expect(targets).toContain('.agents/skills/_shared/retro-feedback-schema.md');
    expect(targets).toContain('.agents/skills/tdk-retro-collect/SKILL.md');
  });

  test('unowned existing target conflicts by default and force converts it to an update', () => {
    const consumer = makeConsumer('tdk-convert-flat-conflict-');
    const target = '.codex/agents/reviewer.toml';
    writeFile(consumer.root, target, 'user owned');
    const previous: HarnessInstallManifest = {
      version: 1,
      harness: 'codex',
      selectedPlugins: [],
      installerVersion: '0.1.0',
      installedAt: '',
      managedFiles: [],
      managedHooks: [],
    };
    const file = desiredFile(consumer.root, target, 'generated');

    const blocked = buildCodexReconcilePlan({
      consumerRoot: consumer.root,
      desiredFiles: [file],
      previousManifest: previous,
      migrationReport: emptyReport(),
    });
    const forced = buildCodexReconcilePlan({
      consumerRoot: consumer.root,
      desiredFiles: [file],
      previousManifest: previous,
      migrationReport: emptyReport(),
      force: true,
    });

    expect(blocked.conflicts).toHaveLength(1);
    expect(blocked.installPlan.writes).toHaveLength(0);
    expect(forced.conflicts).toHaveLength(0);
    expect(forced.installPlan.writes).toHaveLength(1);
  });

  test('force does not overwrite targets owned by another codex manifest entry', () => {
    const consumer = makeConsumer('tdk-convert-flat-other-owner-');
    const target = '.codex/agents/reviewer.toml';
    writeFile(consumer.root, target, 'other owner');
    const previous: HarnessInstallManifest = {
      version: 1,
      harness: 'codex',
      selectedPlugins: ['tdk-core'],
      installerVersion: '0.1.0',
      installedAt: '',
      managedFiles: [
        {
          plugin: 'tdk-core',
          sourceRelativePath: '.specify/plugins/tdk-core/agents/reviewer.md',
          targetRelativePath: target,
          sourceChecksum: 'other',
          installedChecksum: sha256Buffer(Buffer.from('other owner')),
        },
      ],
      managedHooks: [],
    };
    const file = desiredFile(consumer.root, target, 'generated');

    const forced = buildCodexReconcilePlan({
      consumerRoot: consumer.root,
      desiredFiles: [file],
      previousManifest: previous,
      migrationReport: emptyReport(),
      force: true,
    });

    expect(forced.conflicts.map((item) => item.targetRelativePath)).toContain(target);
    expect(forced.installPlan.writes).toHaveLength(0);
    expect(forced.installPlan.nextManifest.managedFiles).toEqual(previous.managedFiles);
  });

  test('reconcile covers install update skip delete and conflict states', () => {
    const consumer = makeConsumer('tdk-convert-flat-states-');
    const install = desiredFile(consumer.root, '.codex/agents/install.toml', 'install');
    const update = desiredFile(consumer.root, '.codex/agents/update.toml', 'new');
    const skip = desiredFile(consumer.root, '.codex/agents/skip.toml', 'same');
    const conflict = desiredFile(consumer.root, '.codex/agents/conflict.toml', 'desired');
    const stalePath = '.codex/agents/stale.toml';
    writeFile(consumer.root, update.targetRelativePath, 'old');
    writeFile(consumer.root, skip.targetRelativePath, 'same');
    writeFile(consumer.root, conflict.targetRelativePath, 'user');
    writeFile(consumer.root, stalePath, 'stale');
    const previous: HarnessInstallManifest = {
      version: 1,
      harness: 'codex',
      selectedPlugins: ['convert-flat'],
      installerVersion: '0.1.0',
      installedAt: '',
      managedFiles: [
        {
          plugin: 'convert-flat',
          sourceRelativePath: update.sourceRelativePath,
          targetRelativePath: update.targetRelativePath,
          sourceChecksum: 'old',
          installedChecksum: sha256Buffer(Buffer.from('old')),
        },
        {
          plugin: 'convert-flat',
          sourceRelativePath: skip.sourceRelativePath,
          targetRelativePath: skip.targetRelativePath,
          sourceChecksum: skip.sourceChecksum,
          installedChecksum: skip.installedChecksum,
        },
        {
          plugin: 'convert-flat',
          sourceRelativePath: conflict.sourceRelativePath,
          targetRelativePath: conflict.targetRelativePath,
          sourceChecksum: 'old',
          installedChecksum: sha256Buffer(Buffer.from('old')),
        },
        {
          plugin: 'convert-flat',
          sourceRelativePath: '.claude/stale.txt',
          targetRelativePath: stalePath,
          sourceChecksum: 'old',
          installedChecksum: sha256Buffer(Buffer.from('stale')),
        },
      ],
      managedHooks: [],
    };

    const plan = buildCodexReconcilePlan({
      consumerRoot: consumer.root,
      desiredFiles: [install, update, skip, conflict],
      previousManifest: previous,
      migrationReport: emptyReport(),
    });

    const byTarget = new Map(plan.items.map((item) => [item.targetRelativePath, item.action]));
    expect(byTarget.get(install.targetRelativePath)).toBe('install');
    expect(byTarget.get(update.targetRelativePath)).toBe('update');
    expect(byTarget.get(skip.targetRelativePath)).toBe('skip');
    expect(byTarget.get(stalePath)).toBe('delete');
    expect(byTarget.get(conflict.targetRelativePath)).toBe('conflict');
  });

  test('stale merge targets are retained instead of whole-file deleted', () => {
    const consumer = makeConsumer('tdk-convert-flat-merge-stale-');
    writeFile(consumer.root, '.codex/config.toml', '[features]\nuser_flag = true\n');
    writeFile(consumer.root, '.codex/hooks.json', '{ "UserPromptSubmit": [{ "command": "user" }] }\n');
    const previous: HarnessInstallManifest = {
      version: 1,
      harness: 'codex',
      selectedPlugins: ['convert-flat'],
      installerVersion: '0.1.0',
      installedAt: '',
      managedFiles: [
        {
          plugin: 'convert-flat',
          sourceRelativePath: '.claude/settings.json',
          targetRelativePath: '.codex/config.toml',
          sourceChecksum: 'old',
          installedChecksum: sha256Buffer(Buffer.from('[features]\nuser_flag = true\n')),
        },
        {
          plugin: 'convert-flat',
          sourceRelativePath: '.claude/settings.json',
          targetRelativePath: '.codex/hooks.json',
          sourceChecksum: 'old',
          installedChecksum: sha256Buffer(Buffer.from('{ "UserPromptSubmit": [{ "command": "user" }] }\n')),
        },
      ],
      managedHooks: [],
    };

    const plan = buildCodexReconcilePlan({
      consumerRoot: consumer.root,
      desiredFiles: [],
      previousManifest: previous,
      migrationReport: emptyReport(),
    });

    expect(plan.installPlan.removals).toHaveLength(0);
    expect(plan.conflicts.map((item) => item.targetRelativePath)).toContain('.codex/config.toml');
    expect(plan.conflicts.map((item) => item.targetRelativePath)).toContain('.codex/hooks.json');
  });

  test('non-node hook commands and quoted args are preserved through a shell wrapper', async () => {
    const consumer = makeConsumer('tdk-convert-flat-hook-shell-');
    writeFile(consumer.root, '.claude/hooks/foo.sh', 'printf "{}"');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'bash .claude/hooks/foo.sh "two words"' }],
          },
        ],
      },
    }, null, 2));

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const writePlan = await buildCodexWritePlan(inventory);
    const wrapper = writePlan.files.find((file) => file.targetRelativePath.includes('.codex/hooks/wrappers/'));

    expect(wrapper?.content.toString('utf-8')).toContain('bash .codex/hooks/foo.sh \\"two words\\"');
    expect(wrapper?.content.toString('utf-8')).toContain(process.platform === 'win32' ? '"cmd.exe"' : '"sh"');
  });

  test('stale convert-flat hook events are removed from existing hooks json', async () => {
    const consumer = makeConsumer('tdk-convert-flat-stale-hook-event-');
    writeFile(consumer.root, '.codex/hooks.json', JSON.stringify({
      PreToolUse: [{ command: 'node "hooks/wrappers/old-sh"', _origin: 'convert-flat' }],
      UserPromptSubmit: [{ command: 'user-owned' }],
    }, null, 2));
    writeFile(consumer.root, '.claude/hooks/foo.sh', 'printf "{}"');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'bash .claude/hooks/foo.sh' }],
          },
        ],
      },
    }, null, 2));

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const writePlan = await buildCodexWritePlan(inventory);
    const hooksJson = writePlan.files.find((file) => file.targetRelativePath === '.codex/hooks.json');
    const parsed = JSON.parse(hooksJson?.content.toString('utf-8') ?? '{}');

    expect(parsed.PreToolUse).toBeUndefined();
    expect(parsed.UserPromptSubmit).toEqual([{ command: 'user-owned' }]);
    expect(parsed.PostToolUse).toHaveLength(1);
  });

  test('stale convert-flat hooks are removed when source no longer has hooks', async () => {
    const consumer = makeConsumer('tdk-convert-flat-no-source-hooks-');
    writeFile(consumer.root, '.codex/hooks.json', JSON.stringify({
      PreToolUse: [{ command: 'node "hooks/wrappers/old-sh"', _origin: 'convert-flat' }],
      UserPromptSubmit: [{ command: 'user-owned' }],
    }, null, 2));
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({ hooks: {} }, null, 2));

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const writePlan = await buildCodexWritePlan(inventory);
    const hooksJson = writePlan.files.find((file) => file.targetRelativePath === '.codex/hooks.json');
    const parsed = JSON.parse(hooksJson?.content.toString('utf-8') ?? '{}');

    expect(hooksJson).toBeDefined();
    expect(parsed.PreToolUse).toBeUndefined();
    expect(parsed.UserPromptSubmit).toEqual([{ command: 'user-owned' }]);
  });

  test('same hook command with different timeouts gets distinct wrappers', async () => {
    const consumer = makeConsumer('tdk-convert-flat-hook-timeouts-');
    writeFile(consumer.root, '.claude/hooks/foo.sh', 'printf "{}"');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              { type: 'command', command: 'bash .claude/hooks/foo.sh', timeout: 1000 },
              { type: 'command', command: 'bash .claude/hooks/foo.sh', timeout: 2000 },
            ],
          },
        ],
      },
    }, null, 2));

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const writePlan = await buildCodexWritePlan(inventory);
    const wrappers = writePlan.files.filter((file) => file.targetRelativePath.includes('.codex/hooks/wrappers/'));
    const hooksJson = writePlan.files.find((file) => file.targetRelativePath === '.codex/hooks.json');
    const parsed = JSON.parse(hooksJson?.content.toString('utf-8') ?? '{}');
    const commands = parsed.PreToolUse.map((hook: { command: string }) => hook.command);

    expect(wrappers).toHaveLength(2);
    expect(new Set(commands).size).toBe(2);
    expect(parsed.PreToolUse.map((hook: { timeout: number }) => hook.timeout).sort()).toEqual([1000, 2000]);
  });

  test('duplicate target mappings warn instead of silently replacing content', async () => {
    const consumer = makeConsumer('tdk-convert-flat-duplicate-');
    writeFile(consumer.root, '.claude/skills/plan/SKILL.md', [
      '---',
      'name: plan',
      'description: Existing plan skill',
      '---',
      '# Existing',
    ].join('\n'));
    writeFile(consumer.root, '.claude/commands/plan.md', [
      '---',
      'description: Command plan',
      '---',
      'Command body.',
    ].join('\n'));

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const writePlan = await buildCodexWritePlan(inventory);

    expect(writePlan.warnings.some((warning) => warning.includes('Skipped duplicate Codex target .agents/skills/plan/SKILL.md'))).toBe(true);
    expect(writePlan.files.filter((file) => file.targetRelativePath === '.agents/skills/plan/SKILL.md')).toHaveLength(1);
  });

  test('malformed hook settings are reported as warnings', () => {
    const consumer = makeConsumer('tdk-convert-flat-hook-warning-');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      hooks: {
        PreToolUse: { hooks: [] },
        PostToolUse: [{ hooks: [{ type: 'matcher' }, { type: 'command' }] }],
      },
    }, null, 2));

    const inventory = discoverFlatClaudeInventory(consumer.root);

    expect(inventory.warnings).toContain('Skipped hook event PreToolUse: expected an array of hook groups');
    expect(inventory.warnings).toContain('Skipped hook in PostToolUse: unsupported hook type matcher');
    expect(inventory.warnings).toContain('Skipped hook in PostToolUse: missing command');
  });

  test('malformed top-level hooks settings are reported as warnings', () => {
    const consumer = makeConsumer('tdk-convert-flat-hooks-top-level-warning-');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({ hooks: false }, null, 2));

    const inventory = discoverFlatClaudeInventory(consumer.root);

    expect(inventory.warnings).toContain('Skipped .claude/settings.json hooks: hooks must be an object');
  });

  test('manifest store round-trips codex manifests', () => {
    const consumer = makeConsumer('tdk-convert-flat-manifest-');
    const manifest: HarnessInstallManifest = {
      version: 1,
      harness: 'codex',
      selectedPlugins: ['convert-flat'],
      installerVersion: '0.1.0',
      installedAt: '2026-06-14T00:00:00.000Z',
      managedFiles: [],
      managedHooks: [],
    };

    saveHarnessManifest(consumer.root, manifest, 'codex');

    expect(loadHarnessManifest(consumer.root, 'codex').harness).toBe('codex');
  });

  test('codex manifests reject source .claude managed paths', () => {
    const consumer = makeConsumer('tdk-convert-flat-manifest-safety-');
    const manifest: HarnessInstallManifest = {
      version: 1,
      harness: 'codex',
      selectedPlugins: ['convert-flat'],
      installerVersion: '0.1.0',
      installedAt: '2026-06-14T00:00:00.000Z',
      managedFiles: [
        {
          plugin: 'convert-flat',
          sourceRelativePath: '.claude/agents/a.md',
          targetRelativePath: '.claude/agents/a.md',
          sourceChecksum: 'x',
          installedChecksum: 'x',
        },
      ],
      managedHooks: [],
    };

    saveHarnessManifest(consumer.root, manifest, 'codex');

    expect(() => loadHarnessManifest(consumer.root, 'codex')).toThrow('Unsafe managed target path');
  });
});

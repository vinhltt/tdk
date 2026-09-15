import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCodexReconcilePlan } from '../src/convert-reconcile';
import { buildCodexWritePlan } from '../src/codex-output-writer';
import { discoverFlatClaudeInventory } from '../src/flat-claude-adapter';
import { buildMigrationReport } from '../src/flat-claude-migration-report';
import { emptyHarnessManifest, loadHarnessManifest, manifestPathFor, saveHarnessManifest } from '../src/manifest-store';
import { sha256Buffer } from '../src/checksum';
import { defaultInstallSettings, settingsPathFor } from '../src/install-settings';
import { extractOmpManagedPayload, mergeConfigYaml } from '../src/lib/harness-transform/config-yaml-merge';
import { makeConsumer } from './fixtures';
import type { CodexTargetFile, MigrationReport } from '../src/flat-claude-types';
import type { HarnessInstallManifest } from '../src/types';

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

function runConvertFlat(root: string, args: string[], harness: 'codex' | 'omp' = 'codex') {
  return Bun.spawnSync({
    cmd: ['bun', cliPath, 'convert-flat', root, '--harness', harness, ...args],
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
  test('requires an explicit supported harness', () => {
    const consumer = makeConsumer('tdk-convert-flat-harness-');
    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'convert-flat', consumer.root, '--dry-run'],
      cwd: path.join(consumer.root, '.specify', 'scripts', 'ts'),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toMatch(/--harness.*codex.*omp/);
  });
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
      'src/convert-flat.ts',
      'src/flat-claude-adapter.ts',
      'src/codex-output-writer.ts',
      'src/convert-reconcile.ts',
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

  test('converts, reapplies, and explicitly removes OMP agents without touching Claude sources', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-agents-');
    writeFlatClaudeFixture(consumer.root);
    writeFile(consumer.root, '.claude/agents/reviewer.md', [
      '---',
      'name: reviewer',
      'description: Review code',
      'tools: Read, Write, WebFetch',
      'model: sonnet',
      'memory: project',
      '---',
      'Review the code.',
    ].join('\n'));
    const auditSourcePath = writeFile(consumer.root, '.claude/agents/audit.md', [
      '---',
      'name: audit',
      'description: Audit code',
      'tools:',
      '  - Grep',
      '---',
      'Audit the code.',
    ].join('\n'));
    const settings = defaultInstallSettings();
    settings.harnesses.omp!.modelMap.sonnet = '@review';
    fs.writeFileSync(settingsPathFor(consumer.root), JSON.stringify(settings), 'utf-8');
    const sourcePath = path.join(consumer.root, '.claude/agents/reviewer.md');
    const sourceBefore = fs.readFileSync(sourcePath);
    const auditSourceBefore = fs.readFileSync(auditSourcePath);

    const dryRun = runConvertFlat(consumer.root, ['--parts', 'agents', '--dry-run'], 'omp');
    const applied = runConvertFlat(consumer.root, ['--parts', 'agents', '--yes'], 'omp');
    const reviewerTargetPath = path.join(consumer.root, '.omp/agents/reviewer.md');
    const auditTargetPath = path.join(consumer.root, '.omp/agents/audit.md');
    const reviewerBeforeReapply = fs.readFileSync(reviewerTargetPath);
    const auditBeforeReapply = fs.readFileSync(auditTargetPath);
    const secondRun = runConvertFlat(consumer.root, ['--parts', 'agents', '--yes'], 'omp');

    expect(dryRun.exitCode).toBe(0);
    expect(dryRun.stdout.toString()).toContain('install: .omp/agents/audit.md');
    expect(dryRun.stdout.toString()).toContain('install: .omp/agents/reviewer.md');
    expect(dryRun.stdout.toString()).toContain('dropped unsupported tool: WebFetch');
    expect(dryRun.stdout.toString()).toContain('dropped unsupported field: memory');
    expect(applied.exitCode).toBe(0);
    const reviewerTarget = fs.readFileSync(reviewerTargetPath, 'utf-8');
    const auditTarget = fs.readFileSync(auditTargetPath, 'utf-8');
    expect(reviewerTarget).toContain('name: reviewer');
    expect(reviewerTarget).toContain('  - read');
    expect(reviewerTarget).toContain('  - write');
    expect(reviewerTarget).toContain('  - yield');
    expect(reviewerTarget).toContain('  - "@review"');
    expect(reviewerTarget).toContain('output:');
    expect(reviewerTarget).toContain('type: string');
    expect(auditTarget).toContain('name: audit');
    expect(auditTarget).toContain('  - grep');
    expect(auditTarget).toContain('  - yield');
    expect(auditTarget).toContain('output:');
    expect(fs.readFileSync(sourcePath)).toEqual(sourceBefore);
    expect(fs.readFileSync(auditSourcePath)).toEqual(auditSourceBefore);
    const manifest = loadHarnessManifest(consumer.root, 'omp');
    expect(manifest.convertedParts).toEqual(['agents']);
    expect(manifest.managedFiles).toHaveLength(2);
    expect(manifest.managedFiles.every((file) => file.part === 'agents')).toBe(true);
    expect(secondRun.exitCode).toBe(0);
    expect(secondRun.stdout.toString()).toContain('skip: .omp/agents/audit.md');
    expect(secondRun.stdout.toString()).toContain('skip: .omp/agents/reviewer.md');
    expect(secondRun.stdout.toString()).toContain('Written: 0');
    expect(secondRun.stdout.toString()).toContain('Removed: 0');
    expect(fs.readFileSync(reviewerTargetPath)).toEqual(reviewerBeforeReapply);
    expect(fs.readFileSync(auditTargetPath)).toEqual(auditBeforeReapply);

    const removed = runConvertFlat(consumer.root, ['--remove-parts', 'agents', '--yes'], 'omp');
    expect(removed.exitCode).toBe(0);
    expect(fs.existsSync(reviewerTargetPath)).toBe(false);
    expect(fs.existsSync(auditTargetPath)).toBe(false);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual([]);
    expect(fs.readFileSync(sourcePath)).toEqual(sourceBefore);
    expect(fs.readFileSync(auditSourcePath)).toEqual(auditSourceBefore);
  });

  test('converts consumer-shaped OMP agents while excluding Claude worktree snapshots', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-agent-compat-');
    const source = [
      '---',
      'name: backlog-task-analyzer',
      'description: Use this agent for Backlog context. Example scenarios:\\n\\n- Read task details',
      'tools: Read, Grep',
      'metadata:',
      '  version: "0.2.0"',
      '---',
      'Analyze the task.',
    ].join('\n');
    writeFile(consumer.root, '.claude/agents/backlog-task-analyzer.md', source);
    writeFile(
      consumer.root,
      '.claude/worktrees/agent-123/.claude/agents/backlog-task-analyzer.md',
      source,
    );


    const result = runConvertFlat(consumer.root, ['--parts', 'agents', '--yes'], 'omp');
    const output = result.stdout.toString();
    const targetPath = path.join(consumer.root, '.omp/agents/backlog-task-analyzer.md');

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toBe('');
    expect(output).toContain('[tdk-setup convert-flat] Start: harness=omp mode=apply');
    expect(output).toContain('[tdk-setup convert-flat] Scanning source .claude tree...');
    expect(output).toContain('[tdk-setup convert-flat] Source inventory: 1 recognized record.');
    expect(output).toContain('[tdk-setup convert-flat] Validating and rendering OMP targets...');
    expect(output).toContain('[tdk-setup convert-flat] Building reconcile plan...');
    expect(output).toContain('[tdk-setup convert-flat] Applying reconcile plan...');
    expect(output).toContain('[tdk-setup convert-flat] Complete.');
    expect(output).not.toContain('.claude/worktrees');
    expect(fs.readFileSync(targetPath, 'utf-8')).toContain('Analyze the task.');
    expect(loadHarnessManifest(consumer.root, 'omp').managedFiles).toHaveLength(1);
  });

  test('aggregates invalid OMP agents and writes nothing', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-invalid-');
    writeFile(consumer.root, '.claude/agents/missing-name.md', [
      '---',
      'description: Missing name',
      '---',
      'body',
    ].join('\n'));
    writeFile(consumer.root, '.claude/agents/missing-description.md', [
      '---',
      'name: missing-description',
      '---',
      'body',
    ].join('\n'));
    writeFile(consumer.root, '.claude/agents/invalid-yaml.md', [
      '---',
      'name: invalid-yaml',
      'description: Invalid YAML',
      'tools: [Read',
      '---',
      'body',
    ].join('\n'));

    const result = runConvertFlat(consumer.root, ['--parts', 'agents', '--yes'], 'omp');
    const error = result.stderr.toString();

    expect(result.exitCode).not.toBe(0);
    expect(error).toMatch(/missing-name\.md.*missing explicit name/);
    expect(error).toMatch(/missing-description\.md.*missing description/);
    expect(error).toMatch(/invalid-yaml\.md.*Invalid YAML frontmatter/);
    expect(fs.existsSync(path.join(consumer.root, '.omp'))).toBe(false);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
  });

  test('rejects duplicate explicit OMP agent names before writing', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-duplicate-');
    writeFile(consumer.root, '.claude/agents/reviewer.md', [
      '---',
      'name: reviewer',
      'description: Review code',
      '---',
      'body',
    ].join('\n'));
    writeFile(consumer.root, '.claude/agents/security.md', [
      '---',
      'name: reviewer',
      'description: Review security',
      '---',
      'body',
    ].join('\n'));

    const result = runConvertFlat(consumer.root, ['--parts', 'agents', '--yes'], 'omp');
    const error = result.stderr.toString();

    expect(result.exitCode).not.toBe(0);
    expect(error).toMatch(/duplicate explicit name "reviewer".*reviewer\.md.*security\.md/);
    expect(fs.existsSync(path.join(consumer.root, '.omp'))).toBe(false);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
  });

  test('converts and removes OMP rules while preserving active agents and Claude sources', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-rules-');
    writeFlatClaudeFixture(consumer.root);
    const agentApplied = runConvertFlat(consumer.root, ['--parts', 'agents', '--yes'], 'omp');
    expect(agentApplied.exitCode).toBe(0);
    const agentTargetPath = path.join(consumer.root, '.omp/agents/reviewer.md');

    const userSourcePath = writeFile(consumer.root, '.claude/rules/user.md', [
      '---',
      'paths:',
      '  - \"src/**/*.ts\"',
      '---',
      '# User rule',
      'User body.',
    ].join('\n'));
    const managedTargetPath = writeFile(consumer.root, '.claude/rules/managed.md', '# Installed rule output\n');
    const managedSourceRelativePath = '.specify/claude-rules/managed.md';
    const managedSourcePath = writeFile(consumer.root, managedSourceRelativePath, '# Managed canonical rule\n');
    const claudeManifest = emptyHarnessManifest('claude');
    claudeManifest.managedFiles.push({
      plugin: 'claude-rules',
      sourceRelativePath: managedSourceRelativePath,
      targetRelativePath: '.claude/rules/managed.md',
      sourceChecksum: sha256Buffer(fs.readFileSync(managedSourcePath)),
      installedChecksum: sha256Buffer(fs.readFileSync(managedTargetPath)),
    });
    saveHarnessManifest(consumer.root, claudeManifest, 'claude');
    const userSourceBefore = fs.readFileSync(userSourcePath);
    const managedTargetBefore = fs.readFileSync(managedTargetPath);
    const managedSourceBefore = fs.readFileSync(managedSourcePath);

    const mixedDryRun = runConvertFlat(consumer.root, ['--parts', 'agents,rules', '--dry-run'], 'omp');
    const applied = runConvertFlat(consumer.root, ['--parts', 'rules', '--yes'], 'omp');
    const userTargetPath = path.join(consumer.root, '.omp/rules/user.md');
    const managedRuleTargetPath = path.join(consumer.root, '.omp/rules/managed.md');
    const userTargetBeforeReapply = fs.readFileSync(userTargetPath);
    const managedRuleBeforeReapply = fs.readFileSync(managedRuleTargetPath);
    const secondRun = runConvertFlat(consumer.root, ['--parts', 'rules', '--yes'], 'omp');

    expect(mixedDryRun.exitCode).toBe(0);
    expect(mixedDryRun.stdout.toString()).toContain('skip: .omp/agents/reviewer.md');
    expect(mixedDryRun.stdout.toString()).toContain('install: .omp/rules/managed.md');
    expect(mixedDryRun.stdout.toString()).toContain('install: .omp/rules/user.md');
    expect(applied.exitCode).toBe(0);
    expect(applied.stdout.toString()).toContain(
      'Placeholder rule description: .specify/claude-rules/managed.md -> .omp/rules/managed.md: \"Managed canonical rule\"',
    );
    expect(applied.stdout.toString()).toContain(
      'Placeholder rule description: .claude/rules/user.md -> .omp/rules/user.md: \"User rule\"',
    );
    expect(fs.readFileSync(userTargetPath, 'utf-8')).toContain('globs:');
    expect(fs.readFileSync(userTargetPath, 'utf-8')).toContain('description: User rule');
    expect(fs.readFileSync(managedRuleTargetPath, 'utf-8')).toContain('# Managed canonical rule');
    expect(fs.readFileSync(managedRuleTargetPath, 'utf-8')).not.toContain('Installed rule output');
    expect(fs.existsSync(agentTargetPath)).toBe(true);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['agents', 'rules']);
    expect(secondRun.exitCode).toBe(0);
    expect(secondRun.stdout.toString()).toContain('Written: 0');
    expect(secondRun.stdout.toString()).toContain('Removed: 0');
    expect(fs.readFileSync(userTargetPath)).toEqual(userTargetBeforeReapply);
    expect(fs.readFileSync(managedRuleTargetPath)).toEqual(managedRuleBeforeReapply);

    const removed = runConvertFlat(consumer.root, ['--remove-parts', 'rules', '--yes'], 'omp');
    expect(removed.exitCode).toBe(0);
    expect(fs.existsSync(userTargetPath)).toBe(false);
    expect(fs.existsSync(managedRuleTargetPath)).toBe(false);
    expect(fs.existsSync(agentTargetPath)).toBe(true);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['agents']);
    expect(fs.readFileSync(userSourcePath)).toEqual(userSourceBefore);
    expect(fs.readFileSync(managedTargetPath)).toEqual(managedTargetBefore);
    expect(fs.readFileSync(managedSourcePath)).toEqual(managedSourceBefore);
  });

  test('rejects reserved and duplicate OMP rule names before writing', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-rule-invalid-');
    writeFile(consumer.root, '.claude/rules/x.md', '# First x\n');
    writeFile(consumer.root, '.claude/rules/x.mdc', '# Second x\n');
    writeFile(consumer.root, '.claude/rules/RULES.md', '# Reserved\n');

    const result = runConvertFlat(consumer.root, ['--parts', 'rules', '--yes'], 'omp');
    const error = result.stderr.toString();

    expect(result.exitCode).not.toBe(0);
    expect(error).toMatch(/RULES[\s\S]*duplicate logical rule name "x".*x\.md.*x\.mdc/);
    expect(fs.existsSync(path.join(consumer.root, '.omp'))).toBe(false);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
  });

  test('adopts, backs up, reapplies, edits, and removes a handwritten OMP config safely', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-settings-');
    const userConfig = 'retry:\r\n  enabled: true\r\n\r\n';
    const secret = 'LOCAL_SECRET_MUST_NOT_LEAK';
    writeFile(consumer.root, '.omp/config.yml', userConfig);
    writeFile(consumer.root, '.omp/agents/existing.md', 'existing agent\n');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      model: 'opus',
      effortLevel: 'high',
      alwaysThinkingEnabled: false,
      permissions: {
        allow: ['Read', 'Read(src/**)', 'Bash(git status)'],
        deny: ['Bash(git push:*)'],
        ask: ['Edit'],
      },
      env: { TOKEN: secret },
    }, null, 2));
    writeFile(consumer.root, '.claude/settings.local.json', JSON.stringify({
      hooks: { token: secret },
      permissions: { token: secret },
      env: { TOKEN: secret },
    }));
    const backupsRoot = path.join(consumer.root, '.specify/state/harness-install/backups');

    const dryRun = runConvertFlat(consumer.root, ['--parts', 'settings', '--dry-run'], 'omp');
    expect(dryRun.exitCode).toBe(0);
    expect(dryRun.stdout.toString()).toContain('update: .omp/config.yml (adopt unowned merge target)');
    expect(dryRun.stdout.toString()).toContain('[local-not-converted] .claude/settings.local.json#hooks');
    expect(dryRun.stdout.toString()).not.toContain(secret);
    expect(fs.existsSync(backupsRoot)).toBe(false);

    const applied = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');
    const targetPath = path.join(consumer.root, '.omp/config.yml');
    const firstContent = fs.readFileSync(targetPath, 'utf-8');
    const firstPayload = extractOmpManagedPayload(firstContent);
    const manifest = loadHarnessManifest(consumer.root, 'omp');
    const managedConfig = manifest.managedFiles.find((file) => file.targetRelativePath === '.omp/config.yml');
    const backupStamps = fs.readdirSync(backupsRoot);

    expect(applied.exitCode).toBe(0);
    expect(mergeConfigYaml(firstContent, '').content).toBe(userConfig);
    expect(firstContent).toContain('defaultThinkingLevel: high');
    expect(firstContent).toContain('default: \"@slow\"');
    expect(firstContent).not.toContain(secret);
    expect(firstPayload).toBeDefined();
    expect(managedConfig?.part).toBeUndefined();
    expect(managedConfig?.managedRegionChecksum).toBe(sha256Buffer(Buffer.from(firstPayload!)));
    expect(backupStamps).toHaveLength(1);
    expect(fs.readFileSync(path.join(backupsRoot, backupStamps[0]!, '.omp/config.yml'), 'utf-8')).toBe(userConfig);
    expect(fs.readFileSync(path.join(backupsRoot, backupStamps[0]!, '.omp/agents/existing.md'), 'utf-8')).toBe('existing agent\n');

    const second = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');
    expect(second.exitCode).toBe(0);
    expect(second.stdout.toString()).toContain('Written: 0');
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(firstContent);
    expect(fs.readdirSync(backupsRoot)).toEqual(backupStamps);

    const editedUserConfig = `${firstContent}userFlag: true\r\n`;
    fs.writeFileSync(targetPath, editedUserConfig, 'utf-8');
    const afterUserEdit = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');
    expect(afterUserEdit.exitCode).toBe(0);
    const updatedContent = fs.readFileSync(targetPath, 'utf-8');
    expect(mergeConfigYaml(updatedContent, '').content).toBe(`${userConfig}userFlag: true\r\n`);
    expect(loadHarnessManifest(consumer.root, 'omp').managedFiles.find(
      (file) => file.targetRelativePath === '.omp/config.yml',
    )?.managedRegionChecksum).toBe(managedConfig?.managedRegionChecksum);

    const removed = runConvertFlat(consumer.root, ['--remove-parts', 'settings', '--yes'], 'omp');
    expect(removed.exitCode).toBe(0);
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(`${userConfig}userFlag: true\r\n`);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual([]);
    expect(loadHarnessManifest(consumer.root, 'omp').managedFiles.some(
      (file) => file.targetRelativePath === '.omp/config.yml',
    )).toBe(false);
  });

  test('aborts selected settings and hooks reconciliation before modifying managed OMP output for malformed source JSON', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-malformed-settings-');
    writeFile(consumer.root, '.claude/hooks/keep.cjs', 'process.stdout.write("{}");\n');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      effortLevel: 'high',
      hooks: {
        PreToolUse: [{
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'node .claude/hooks/keep.cjs' }],
        }],
      },
    }));

    const initial = runConvertFlat(consumer.root, ['--parts', 'settings,hooks', '--yes'], 'omp');
    const configPath = path.join(consumer.root, '.omp/config.yml');
    const hookPath = path.join(consumer.root, '.omp/hooks/pre/pretooluse-bash-001.ts');
    const manifestPath = manifestPathFor(consumer.root, 'omp');
    const configBefore = fs.readFileSync(configPath, 'utf-8');
    const hookBefore = fs.readFileSync(hookPath, 'utf-8');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf-8');
    fs.writeFileSync(path.join(consumer.root, '.claude/settings.json'), '{ malformed json\n', 'utf-8');

    const malformed = runConvertFlat(consumer.root, ['--parts', 'settings,hooks', '--yes'], 'omp');

    expect(initial.exitCode).toBe(0);
    expect(malformed.exitCode).not.toBe(0);
    expect(malformed.stderr.toString()).toMatch(/Cannot reconcile OMP .*\.claude\/settings\.json is malformed/);
    expect(fs.readFileSync(configPath, 'utf-8')).toBe(configBefore);
    expect(fs.readFileSync(hookPath, 'utf-8')).toBe(hookBefore);
    expect(fs.readFileSync(manifestPath, 'utf-8')).toBe(manifestBefore);

    // Removing an unrelated active part still rebuilds the shared config from every part that
    // remains active. Malformed settings must block that rebuild too; otherwise this hooks-only
    // operation strips the previously managed settings contribution.
    const unrelatedRemoval = runConvertFlat(consumer.root, ['--remove-parts', 'hooks', '--yes'], 'omp');
    expect(unrelatedRemoval.exitCode).not.toBe(0);
    expect(unrelatedRemoval.stderr.toString()).toMatch(/Cannot reconcile OMP settings: .*\.claude\/settings\.json is malformed/);
    expect(fs.readFileSync(configPath, 'utf-8')).toBe(configBefore);
    expect(fs.readFileSync(hookPath, 'utf-8')).toBe(hookBefore);
    expect(fs.readFileSync(manifestPath, 'utf-8')).toBe(manifestBefore);

    const removed = runConvertFlat(consumer.root, ['--remove-parts', 'settings,hooks', '--yes'], 'omp');

    expect(removed.exitCode).toBe(0);
    expect(extractOmpManagedPayload(fs.readFileSync(configPath, 'utf-8'))).toBeUndefined();
    expect(fs.existsSync(hookPath)).toBe(false);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual([]);
  });

  test('rebuilds shared config from active settings and skills during independent removals', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-shared-config-');
    const userConfig = 'retry:\n  enabled: true\n';
    writeFile(consumer.root, '.omp/config.yml', userConfig);
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({ effortLevel: 'medium' }));
    const previous = emptyHarnessManifest('omp');
    previous.convertedParts = ['skills'];
    saveHarnessManifest(consumer.root, previous, 'omp');

    const applied = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');
    const targetPath = path.join(consumer.root, '.omp/config.yml');
    expect(applied.exitCode).toBe(0);
    expect(fs.readFileSync(targetPath, 'utf-8')).toContain('enableClaudeProject: false');
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['settings', 'skills']);

    const settingsRemoved = runConvertFlat(consumer.root, ['--remove-parts', 'settings', '--yes'], 'omp');
    expect(settingsRemoved.exitCode).toBe(0);
    expect(fs.readFileSync(targetPath, 'utf-8')).not.toContain('defaultThinkingLevel');
    expect(fs.readFileSync(targetPath, 'utf-8')).toContain('enableClaudeProject: false');
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['skills']);

    const skillsRemoved = runConvertFlat(consumer.root, ['--remove-parts', 'skills', '--yes'], 'omp');
    expect(skillsRemoved.exitCode).toBe(0);
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(userConfig);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual([]);
    expect(loadHarnessManifest(consumer.root, 'omp').managedFiles.some(
      (file) => file.targetRelativePath === '.omp/config.yml',
    )).toBe(false);
  });

  test('keeps an unowned config untouched when active settings emit no managed fragment', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-settings-empty-');
    const userConfig = 'retry:\n  enabled: true\n';
    const targetPath = writeFile(consumer.root, '.omp/config.yml', userConfig);
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({ env: { VALUE: 'not-copied' } }));

    const result = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Written: 0');
    expect(result.stdout.toString()).toContain('Backups: 0');
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(userConfig);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['settings']);
    expect(loadHarnessManifest(consumer.root, 'omp').managedFiles).toEqual([]);
  });

  test('blocks settings reapply after a managed-region edit', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-settings-drift-');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({ effortLevel: 'high' }));
    const applied = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');
    expect(applied.exitCode).toBe(0);
    const targetPath = path.join(consumer.root, '.omp/config.yml');
    const edited = fs.readFileSync(targetPath, 'utf-8').replace('defaultThinkingLevel: high', 'defaultThinkingLevel: medium');
    fs.writeFileSync(targetPath, edited, 'utf-8');
    const manifestPath = manifestPathFor(consumer.root, 'omp');
    const manifestBefore = fs.readFileSync(manifestPath);

    const result = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('managed region has user edits');
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(edited);
    expect(fs.readFileSync(manifestPath)).toEqual(manifestBefore);
  });

  test('rejects a user YAML document end that would strand the managed block', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-settings-doc-end-');
    const userConfig = 'retry:\n  enabled: true\n...\n';
    const targetPath = writeFile(consumer.root, '.omp/config.yml', userConfig);
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({ effortLevel: 'high' }));

    const result = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toMatch(/Invalid merged YAML.*exactly one YAML document/);
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(userConfig);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
  });

  test('rejects OMP config ownership duplicates before backup or write', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-settings-duplicate-');
    const userConfig = 'tools:\n  approval: {}\n';
    const targetPath = writeFile(consumer.root, '.omp/config.yml', userConfig);
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      permissions: { allow: ['Read'] },
    }));

    const result = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toMatch(/ownership conflict.*tools/);
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(userConfig);
    expect(fs.existsSync(path.join(consumer.root, '.specify/state/harness-install/backups'))).toBe(false);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
  });

  test('blocks settings conversion when durable OMP backup encounters a symlink', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-settings-backup-');
    const userConfig = 'retry:\n  enabled: true\n';
    const targetPath = writeFile(consumer.root, '.omp/config.yml', userConfig);
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({ effortLevel: 'medium' }));
    const external = writeFile(consumer.root, '../external-backup-source.txt', 'external\n');
    fs.symlinkSync(external, path.join(consumer.root, '.omp/external-link'));

    const result = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('Refusing symlink in durable backup source');
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(userConfig);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
  });

  test('takes over skills without duplicates and rolls back files plus config toggles atomically', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-skills-');
    const skillPath = writeFile(consumer.root, '.claude/skills/release/SKILL.md', [
      '---',
      'name: release-helper',
      'description: Release safely',
      '---',
      '# Release',
    ].join('\n'));
    const assetPath = writeFile(consumer.root, '.claude/skills/release/references/checklist.md', '# Checklist\n');
    const internalPath = writeFile(consumer.root, '.claude/skills/_shared/SKILL.md', '# Internal\n');
    const sharedPath = writeFile(consumer.root, '.claude/skills/_shared/schema.md', '# Schema\n');
    writeFile(consumer.root, '.claude/commands/hello.md', '---\ndescription: Hello\n---\nHello\n');
    writeFile(consumer.root, '.claude/settings.json', '{}\n');
    const sourceBytes = new Map([
      [skillPath, fs.readFileSync(skillPath)],
      [assetPath, fs.readFileSync(assetPath)],
      [internalPath, fs.readFileSync(internalPath)],
      [sharedPath, fs.readFileSync(sharedPath)],
    ]);

    const applied = runConvertFlat(consumer.root, ['--parts', 'settings,skills', '--yes'], 'omp');
    const configPath = path.join(consumer.root, '.omp/config.yml');
    const config = fs.readFileSync(configPath, 'utf-8');
    const manifest = loadHarnessManifest(consumer.root, 'omp');

    expect(applied.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(consumer.root, '.omp/skills/release/SKILL.md'))).toEqual(sourceBytes.get(skillPath)!);
    expect(fs.readFileSync(path.join(consumer.root, '.omp/skills/release/references/checklist.md'))).toEqual(sourceBytes.get(assetPath)!);
    expect(fs.existsSync(path.join(consumer.root, '.omp/skills/_shared/SKILL.md'))).toBe(false);
    expect(fs.readFileSync(path.join(consumer.root, '.omp/skills/_shared/schema.md'))).toEqual(sourceBytes.get(sharedPath)!);
    expect(config).toContain('enableClaudeUser: false');
    expect(config).toContain('enableClaudeProject: false');
    expect(config).not.toContain('disabledProviders');
    expect(config).not.toContain('commands:');
    expect(manifest.convertedParts).toEqual(['settings', 'skills']);
    expect(manifest.managedFiles.filter((file) => file.targetRelativePath.startsWith('.omp/skills/')).every(
      (file) => file.part === 'skills',
    )).toBe(true);

    const additive = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');
    expect(additive.exitCode).toBe(0);
    expect(fs.existsSync(path.join(consumer.root, '.omp/skills/release/SKILL.md'))).toBe(true);
    expect(fs.readFileSync(configPath, 'utf-8')).toContain('enableClaudeProject: false');

    const repeated = runConvertFlat(consumer.root, ['--parts', 'skills', '--yes'], 'omp');
    expect(repeated.exitCode).toBe(0);
    expect(repeated.stdout.toString()).toContain('Written: 0');

    const removed = runConvertFlat(consumer.root, ['--remove-parts', 'skills', '--yes'], 'omp');
    expect(removed.exitCode).toBe(0);
    expect(fs.existsSync(path.join(consumer.root, '.omp/skills/release/SKILL.md'))).toBe(false);
    expect(fs.readFileSync(configPath, 'utf-8')).not.toContain('enableClaudeProject');
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['settings']);
    for (const [sourcePath, content] of sourceBytes) expect(fs.readFileSync(sourcePath)).toEqual(content);
  });

  test('removes stale managed skill files while preserving remaining skills and toggles', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-skills-stale-');
    writeFile(consumer.root, '.claude/skills/keep/SKILL.md', [
      '---',
      'description: Keep',
      '---',
      '# Keep',
    ].join('\n'));
    const staleSource = writeFile(consumer.root, '.claude/skills/stale/SKILL.md', [
      '---',
      'description: Stale',
      '---',
      '# Stale',
    ].join('\n'));

    const applied = runConvertFlat(consumer.root, ['--parts', 'skills', '--yes'], 'omp');
    expect(applied.exitCode).toBe(0);
    fs.rmSync(path.dirname(staleSource), { recursive: true, force: true });

    const reapplied = runConvertFlat(consumer.root, ['--parts', 'skills', '--yes'], 'omp');

    expect(reapplied.exitCode).toBe(0);
    expect(fs.existsSync(path.join(consumer.root, '.omp/skills/keep/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(consumer.root, '.omp/skills/stale/SKILL.md'))).toBe(false);
    expect(fs.readFileSync(path.join(consumer.root, '.omp/config.yml'), 'utf-8')).toContain(
      'enableClaudeProject: false',
    );
  });

  test('does not overwrite an unowned OMP skill collision', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-skills-collision-');
    writeFile(consumer.root, '.claude/skills/demo/SKILL.md', [
      '---',
      'description: Source',
      '---',
      '# Source',
    ].join('\n'));
    const targetPath = writeFile(consumer.root, '.omp/skills/demo/SKILL.md', '# User target\n');

    const result = runConvertFlat(consumer.root, ['--parts', 'skills', '--yes'], 'omp');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('target exists outside convert-flat ownership');
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('# User target\n');
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
  });

  test('revalidates settings precedence whenever skill takeover remains active', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-skills-active-conflict-');
    writeFile(consumer.root, '.claude/skills/demo/SKILL.md', [
      '---',
      'description: Demo',
      '---',
      '# Demo',
    ].join('\n'));
    const settingsPath = writeFile(consumer.root, '.claude/settings.json', '{}\n');
    const applied = runConvertFlat(consumer.root, ['--parts', 'settings,skills', '--yes'], 'omp');
    expect(applied.exitCode).toBe(0);
    const configPath = path.join(consumer.root, '.omp/config.yml');
    const manifestPath = manifestPathFor(consumer.root, 'omp');
    const configBefore = fs.readFileSync(configPath);
    const manifestBefore = fs.readFileSync(manifestPath);
    fs.writeFileSync(settingsPath, JSON.stringify({ skills: { enableClaudeProject: true } }));

    const result = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes'], 'omp');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toMatch(/settings precedence/i);
    expect(fs.readFileSync(configPath)).toEqual(configBefore);
    expect(fs.readFileSync(manifestPath)).toEqual(manifestBefore);

    const removed = runConvertFlat(consumer.root, ['--remove-parts', 'skills', '--yes'], 'omp');
    expect(removed.exitCode).toBe(0);
    expect(fs.existsSync(path.join(consumer.root, '.omp/skills/demo/SKILL.md'))).toBe(false);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['settings']);
  });

  test('rejects symlinks anywhere in a selected skill tree before mutation', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-skills-symlink-');
    writeFile(consumer.root, '.claude/skills/demo/SKILL.md', [
      '---',
      'description: Demo',
      '---',
      '# Demo',
    ].join('\n'));
    const external = writeFile(consumer.root, 'external-script.js', 'console.log(\"external\");\n');
    fs.symlinkSync(external, path.join(consumer.root, '.claude/skills/demo/script.js'));

    const result = runConvertFlat(consumer.root, ['--parts', 'skills', '--yes'], 'omp');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('.claude/skills/demo/script.js');
    expect(result.stderr.toString()).toMatch(/symlink/i);
    expect(fs.existsSync(path.join(consumer.root, '.omp'))).toBe(false);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
  });

  test('rejects a symlinked skill root before mutation', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-skills-root-symlink-');
    const externalRoot = path.join(consumer.root, 'external-skills');
    writeFile(consumer.root, 'external-skills/demo/SKILL.md', [
      '---',
      'description: Demo',
      '---',
      '# Demo',
    ].join('\n'));
    fs.symlinkSync(externalRoot, path.join(consumer.root, '.claude/skills'), 'dir');

    const result = runConvertFlat(consumer.root, ['--parts', 'skills', '--yes'], 'omp');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('.claude/skills');
    expect(result.stderr.toString()).toMatch(/symlink/i);
    expect(fs.existsSync(path.join(consumer.root, '.omp'))).toBe(false);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
  });

  test('aggregates invalid skill sources before convert-flat mutates the consumer', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-skills-invalid-');

    const first = writeFile(consumer.root, '.claude/skills/first/SKILL.md', '---\nname: duplicate\n---\n# First\n');
    const second = writeFile(consumer.root, '.claude/skills/second/SKILL.md', [
      '---',
      'name: duplicate',
      'description: Second',
      '---',
      '# Second',
    ].join('\n'));
    const third = writeFile(
      consumer.root,
      '.claude/skills/third/SKILL.md',
      '---\ndescription: [unterminated\n---\n# Third\n',
    );
    const settingsPath = writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      skills: { enableClaudeProject: true },
      disabledProviders: ['omp'],
    }));
    const before = [first, second, third, settingsPath].map(
      (sourcePath) => [sourcePath, fs.readFileSync(sourcePath)] as const,
    );

    const result = runConvertFlat(consumer.root, ['--parts', 'skills', '--yes'], 'omp');
    const error = result.stderr.toString();

    expect(result.exitCode).not.toBe(0);
    expect(error).toContain('.claude/skills/first/SKILL.md');
    expect(error).toContain('.claude/skills/second/SKILL.md');
    expect(error).toContain('.claude/skills/third/SKILL.md');
    expect(error).toMatch(/missing description/i);
    expect(error).toMatch(/frontmatter/i);
    expect(error).toMatch(/duplicate effective name "duplicate"/i);
    expect(error).toContain('.claude/settings.json#skills');
    expect(error).toContain('.claude/settings.json#disabledProviders');
    expect(error).toMatch(/settings precedence/i);
    expect(fs.existsSync(path.join(consumer.root, '.omp'))).toBe(false);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
    for (const [sourcePath, content] of before) expect(fs.readFileSync(sourcePath)).toEqual(content);
  });

  test('installs, reapplies, and removes the OMP context import without copying CLAUDE.md', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-context-');
    const sourceContent = '# Project instructions\n\nKeep this source authoritative.\n';
    const sourcePath = writeFile(consumer.root, 'CLAUDE.md', sourceContent);
    const targetPath = path.join(consumer.root, '.omp/AGENTS.md');

    const applied = runConvertFlat(consumer.root, ['--parts', 'context', '--yes'], 'omp');
    expect(applied.exitCode).toBe(0);
    expect(applied.stdout.toString()).toContain('Mapped root CLAUDE.md to .omp/AGENTS.md');
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('@../CLAUDE.md\n');
    expect(fs.readFileSync(sourcePath, 'utf-8')).toBe(sourceContent);
    const installedManifest = loadHarnessManifest(consumer.root, 'omp');
    expect(installedManifest.convertedParts).toEqual(['context']);
    expect(installedManifest.managedFiles).toContainEqual(expect.objectContaining({
      sourceRelativePath: 'CLAUDE.md',
      targetRelativePath: '.omp/AGENTS.md',
      part: 'context',
    }));

    const repeated = runConvertFlat(consumer.root, ['--parts', 'context', '--yes'], 'omp');
    expect(repeated.exitCode).toBe(0);
    expect(repeated.stdout.toString()).toContain('Written: 0');
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('@../CLAUDE.md\n');
    const unrelatedPath = writeFile(consumer.root, '.omp/keep.txt', 'preserve me\n');

    const removed = runConvertFlat(consumer.root, ['--remove-parts', 'context', '--yes'], 'omp');
    expect(removed.exitCode).toBe(0);
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(fs.readFileSync(sourcePath, 'utf-8')).toBe(sourceContent);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual([]);
    expect(fs.readFileSync(unrelatedPath, 'utf-8')).toBe('preserve me\n');
  });

  test('records an active zero-output context part when root CLAUDE.md is absent', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-context-missing-');

    const result = runConvertFlat(consumer.root, ['--parts', 'context', '--yes'], 'omp');

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Consumer has no root CLAUDE.md');
    expect(fs.existsSync(path.join(consumer.root, '.omp/AGENTS.md'))).toBe(false);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['context']);
  });

  test('does not overwrite an unowned OMP context file', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-context-collision-');
    writeFile(consumer.root, 'CLAUDE.md', '# Source instructions\n');
    const targetPath = writeFile(consumer.root, '.omp/AGENTS.md', '# User-owned instructions\n');

    const result = runConvertFlat(consumer.root, ['--parts', 'context', '--yes'], 'omp');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('target exists outside convert-flat ownership');
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('# User-owned instructions\n');
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
  });

  test('installs, reapplies, preserves, and explicitly removes OMP hook bridges', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-hooks-');
    writeFlatClaudeFixture(consumer.root);
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      hooks: {
        PreToolUse: [{
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'node ".claude/hooks/hook-gateway.cjs" pre' }],
        }],
        Stop: [{ hooks: [{ type: 'command', command: 'node ".claude/hooks/hook-gateway.cjs" stop' }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node ".claude/hooks/hook-gateway.cjs" prompt' }] }],
        SubagentStart: [{ hooks: [{ type: 'command', command: 'node ".claude/hooks/hook-gateway.cjs" start' }] }],
        SubagentStop: [{ hooks: [{ type: 'command', command: 'node ".claude/hooks/hook-gateway.cjs" end' }] }],
      },
    }, null, 2));
    const settingsPath = path.join(consumer.root, '.claude/settings.json');
    const hookPath = path.join(consumer.root, '.claude/hooks/hook-gateway.cjs');
    const settingsBefore = fs.readFileSync(settingsPath);
    const hookBefore = fs.readFileSync(hookPath);

    const applied = runConvertFlat(consumer.root, ['--parts', 'hooks', '--yes'], 'omp');
    const hookRoot = path.join(consumer.root, '.omp/hooks');
    const preRoot = path.join(hookRoot, 'pre');
    const targets = fs.readdirSync(preRoot).sort();

    expect(applied.exitCode).toBe(0);
    expect(applied.stdout.toString()).toContain(`Hook target platform: ${process.platform} (host-default).`);
    expect(targets).toEqual([
      'pretooluse-bash-001.ts',
      'stop-all-001.ts',
      'subagentstart-all-001.ts',
      'subagentstop-all-001.ts',
      'userpromptsubmit-all-001.ts',
    ]);
    expect(fs.readdirSync(hookRoot)).toEqual(['pre']);
    expect(applied.stdout.toString()).toContain('Stop hooks run on terminal OMP agent_end');
    expect(applied.stdout.toString()).toContain('cannot block or rewrite the prompt');
    expect(applied.stdout.toString()).toContain('without agent_id or agent_type');
    expect(applied.stdout.toString()).toContain('without subagent-specific payload');
    expect(fs.readFileSync(settingsPath)).toEqual(settingsBefore);
    expect(fs.readFileSync(hookPath)).toEqual(hookBefore);

    const manifest = loadHarnessManifest(consumer.root, 'omp');
    expect(manifest.convertedParts).toEqual(['hooks']);
    expect(manifest.hookTargetPlatform).toBe(process.platform);
    expect(manifest.managedFiles).toHaveLength(5);
    expect(manifest.managedFiles.every((file) => file.part === 'hooks')).toBe(true);

    const repeated = runConvertFlat(consumer.root, ['--parts', 'hooks', '--yes'], 'omp');
    expect(repeated.exitCode).toBe(0);
    expect(repeated.stdout.toString()).toContain('Written: 0');
    const contextAdded = runConvertFlat(consumer.root, ['--parts', 'context', '--yes'], 'omp');
    expect(contextAdded.exitCode).toBe(0);
    expect(fs.readdirSync(preRoot).sort()).toEqual(targets);
    expect(loadHarnessManifest(consumer.root, 'omp').hookTargetPlatform).toBe(manifest.hookTargetPlatform);

    const unrelated = writeFile(consumer.root, '.omp/hooks/keep.txt', 'preserve me\n');
    const removed = runConvertFlat(consumer.root, ['--remove-parts', 'hooks', '--yes'], 'omp');
    expect(removed.exitCode).toBe(0);
    expect(fs.readdirSync(preRoot)).toEqual([]);
    expect(fs.readFileSync(unrelated, 'utf-8')).toBe('preserve me\n');
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['context']);
    expect(loadHarnessManifest(consumer.root, 'omp').hookTargetPlatform).toBeUndefined();
    expect(fs.readFileSync(settingsPath)).toEqual(settingsBefore);
    expect(fs.readFileSync(hookPath)).toEqual(hookBefore);
  });

  test('uses explicit selected hook target over a saved cross-host target', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-hook-target-precedence-');
    writeFlatClaudeFixture(consumer.root);
    const previous = emptyHarnessManifest('omp');
    previous.convertedParts = ['hooks'];
    previous.hookTargetPlatform = 'win32';
    saveHarnessManifest(consumer.root, previous, 'omp');

    const saved = runConvertFlat(consumer.root, ['--parts', 'hooks', '--dry-run'], 'omp');
    const explicit = runConvertFlat(consumer.root, [
      '--parts', 'hooks',
      '--target-platform', 'linux',
      '--dry-run',
    ], 'omp');

    expect(saved.exitCode).toBe(0);
    expect(saved.stdout.toString()).toContain('Hook target platform: win32 (saved).');
    expect(explicit.exitCode).toBe(0);
    expect(explicit.stdout.toString()).toContain('Hook target platform: linux (explicit).');
  });

  test('rejects invalid and inapplicable hook target flags before conversion writes', () => {
    const consumer = makeConsumer('tdk-convert-flat-omp-hook-target-flags-');
    writeFlatClaudeFixture(consumer.root);

    const invalid = runConvertFlat(consumer.root, [
      '--parts', 'hooks',
      '--target-platform', 'unsupported',
      '--yes',
    ], 'omp');
    const noHooks = runConvertFlat(consumer.root, [
      '--parts', 'agents',
      '--target-platform', 'win32',
      '--yes',
    ], 'omp');
    const codex = runConvertFlat(consumer.root, ['--target-platform', 'win32', '--yes'], 'codex');

    expect(invalid.exitCode).not.toBe(0);
    expect(invalid.stderr.toString()).toContain('Invalid hook target platform');
    expect(noHooks.exitCode).not.toBe(0);
    expect(noHooks.stderr.toString()).toContain('--target-platform requires hooks in --parts');
    expect(codex.exitCode).not.toBe(0);
    expect(codex.stderr.toString()).toContain('--target-platform are supported only with --harness omp');
    expect(fs.existsSync(path.join(consumer.root, '.omp'))).toBe(false);
    expect(fs.existsSync(manifestPathFor(consumer.root, 'omp'))).toBe(false);
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

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { emptyHarnessManifest } from '../src/manifest-store';
import { harnessAllowedRoots, validateHarnessTargetPath, validateInstallPlanTargets } from '../src/target-path-safety';
import { makeConsumer } from './fixtures';
import type { InstallPlan } from '../src/types';

function validateClaude(consumerRoot: string, targetPath: string): string {
  return validateHarnessTargetPath({
    consumerRoot,
    targetPath,
    allowedRoots: [path.join(consumerRoot, '.claude')],
    label: 'Claude target',
  });
}

function singleWritePlan(consumerRoot: string): InstallPlan {
  const targetPath = path.join(consumerRoot, '.claude', 'managed.txt');
  return {
    harness: 'claude',
    consumerRoot,
    selectedPlugins: ['tdk-core'],
    targetDir: '.claude',
    claudeSettingsPath: '.claude/settings.json',
    manifestPath: path.join(consumerRoot, '.specify', 'state', 'harness-install', 'claude.json'),
    writes: [{
      plugin: 'tdk-core',
      sourcePath: path.join(consumerRoot, '.specify', 'source.txt'),
      sourceRelativePath: '.specify/source.txt',
      targetPath,
      targetRelativePath: '.claude/managed.txt',
      sourceChecksum: 'source-checksum',
      installedChecksum: 'installed-checksum',
      content: Buffer.from('managed', 'utf-8'),
      action: 'create',
    }],
    removals: [],
    hookMutations: [],
    collisions: [],
    prompts: [],
    warnings: [],
    nextManifest: emptyHarnessManifest(),
    settingsChanged: false,
    installSettingsChanged: false,
    operationStamp: 'duplicate-target-tests',
  };
}

describe('harness target path safety', () => {
  test('accepts a contained target and rejects a target outside an explicit allowed root', () => {
    const consumer = makeConsumer();
    const target = path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md');

    expect(validateClaude(consumer.root, target)).toBe(target);
    expect(() => validateClaude(consumer.root, path.join(consumer.root, '.agents', 'skills', 'demo', 'SKILL.md'))).toThrow(/outside allowed/);
    expect(() => validateClaude(consumer.root, path.join(consumer.root, '.claude.tmp-attacker', 'payload'))).toThrow(/outside allowed/);
    expect(() => validateHarnessTargetPath({
      consumerRoot: consumer.root,
      targetPath: path.join(consumer.root, '.specify', 'install-settings.json.tmp-attacker'),
      allowedRoots: [path.join(consumer.root, '.specify', 'install-settings.json')],
      label: 'Install settings temporary path',
    })).toThrow(/outside allowed/);
    expect(() => validateClaude(consumer.root, path.join(consumer.root, '..', 'outside'))).toThrow(/escapes consumer root/);
  });

  test('rejects a symlinked top-level allowed root before writes can follow it', () => {
    const consumer = makeConsumer();
    const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-outside-'));
    fs.rmSync(path.join(consumer.root, '.claude'), { recursive: true });
    fs.symlinkSync(outside, path.join(consumer.root, '.claude'));

    expect(() => validateClaude(consumer.root, path.join(consumer.root, '.claude', 'settings.json'))).toThrow(/symlinked ancestor/);
  });

  test('rejects nested symlink ancestors and symlink leaves', () => {
    const consumer = makeConsumer();
    const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-outside-'));
    const nested = path.join(consumer.root, '.claude', 'skills');
    fs.symlinkSync(outside, nested);

    expect(() => validateClaude(consumer.root, path.join(nested, 'demo', 'SKILL.md'))).toThrow(/symlinked ancestor/);

    fs.unlinkSync(nested);
    const leaf = path.join(consumer.root, '.claude', 'settings.json');
    fs.symlinkSync(path.join(outside, 'settings.json'), leaf);
    expect(() => validateClaude(consumer.root, leaf)).toThrow(/symlinked ancestor/);
  });

  for (const scenario of [
    { name: 'Claude top-level root', harness: 'claude' as const, link: '.claude', target: '.claude/settings.json' },
    { name: 'Claude nested root', harness: 'claude' as const, link: '.claude/skills', target: '.claude/skills/demo/SKILL.md' },
    { name: 'Codex .agents top-level root', harness: 'codex' as const, link: '.agents', target: '.agents/skills/demo/SKILL.md' },
    { name: 'Codex .agents nested root', harness: 'codex' as const, link: '.agents/skills', target: '.agents/skills/demo/SKILL.md' },
    { name: 'Codex .codex top-level root', harness: 'codex' as const, link: '.codex', target: '.codex/config.toml' },
    { name: 'Codex .codex nested root', harness: 'codex' as const, link: '.codex/hooks', target: '.codex/hooks/hook-gateway.cjs' },
  ]) {
    test(`rejects ${scenario.name} symlink ancestors without touching outside files`, () => {
      const consumer = makeConsumer();
      const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-outside-'));
      const sentinel = path.join(outside, 'sentinel.txt');
      const link = path.join(consumer.root, scenario.link);
      fs.writeFileSync(sentinel, 'unchanged', 'utf-8');
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.rmSync(link, { recursive: true, force: true });
      fs.symlinkSync(outside, link);

      expect(() => validateHarnessTargetPath({
        consumerRoot: consumer.root,
        targetPath: path.join(consumer.root, scenario.target),
        allowedRoots: harnessAllowedRoots(consumer.root, scenario.harness),
        label: scenario.name,
      })).toThrow(/symlinked ancestor/);
      expect(fs.readFileSync(sentinel, 'utf-8')).toBe('unchanged');
    });
  }

  for (const scenario of [
    { name: 'state root', link: '.specify/state', target: '.specify/state/harness-install/claude.json' },
    { name: 'install settings root', link: '.specify/install-settings.json', target: '.specify/install-settings.json' },
    { name: 'ownership manifest root', link: '.specify/state/harness-install', target: '.specify/state/harness-install/claude.json' },
    { name: 'migration journal root', link: '.specify/state/harness-install/migrations', target: '.specify/state/harness-install/migrations/claude-prefix-test.json' },
    { name: 'backup root', link: '.specify/state/harness-install/backups', target: '.specify/state/harness-install/backups/test/.claude/skills/demo/SKILL.md' },
  ]) {
    test(`rejects a symlinked ${scenario.name} with no outside mutation`, () => {
      const consumer = makeConsumer();
      const outside = fs.mkdtempSync(path.join(consumer.root, '..', 'tdk-state-outside-'));
      const sentinel = path.join(outside, 'sentinel.txt');
      const link = path.join(consumer.root, scenario.link);
      fs.writeFileSync(sentinel, 'unchanged', 'utf-8');
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.rmSync(link, { recursive: true, force: true });
      fs.symlinkSync(outside, link);

      expect(() => validateHarnessTargetPath({
        consumerRoot: consumer.root,
        targetPath: path.join(consumer.root, scenario.target),
        allowedRoots: harnessAllowedRoots(consumer.root, 'claude'),
        label: scenario.name,
      })).toThrow(/symlinked ancestor/);
      expect(fs.readFileSync(sentinel, 'utf-8')).toBe('unchanged');
    });
  }

  test('rejects duplicate generic mutation targets but permits prompt authorization for a write', () => {
    const consumer = makeConsumer();
    const duplicateWritePlan = singleWritePlan(consumer.root);
    duplicateWritePlan.writes.push({ ...duplicateWritePlan.writes[0]! });

    expect(() => validateInstallPlanTargets(duplicateWritePlan)).toThrow(/more than once/);

    const stateConflictPlan = singleWritePlan(consumer.root);
    stateConflictPlan.manifestPath = stateConflictPlan.writes[0]!.targetPath;

    expect(() => validateInstallPlanTargets(stateConflictPlan)).toThrow(/more than once/);

    const approvedWritePlan = singleWritePlan(consumer.root);
    approvedWritePlan.prompts = [{
      type: 'unmanaged-target-overwrite',
      path: approvedWritePlan.writes[0]!.targetPath,
      targetRelativePath: approvedWritePlan.writes[0]!.targetRelativePath,
    }];

    expect(() => validateInstallPlanTargets(approvedWritePlan)).not.toThrow();
  });
});

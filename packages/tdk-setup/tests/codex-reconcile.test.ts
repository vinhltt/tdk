import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCodexReconcilePlan } from '../src/codex-reconcile';
import { sha256Buffer } from '../src/checksum';
import { makeConsumer } from './fixtures';
import type { CodexTargetFile, MigrationReport } from '../src/flat-claude-types';
import type { HarnessInstallManifest } from '../src/types';

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function desiredFile(root: string, targetRelativePath: string, content: string): CodexTargetFile {
  const sourcePath = path.join(root, '.claude/source.txt');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, 'source', 'utf-8');
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

function emptyManifest(): HarnessInstallManifest {
  return {
    version: 1,
    harness: 'codex',
    selectedPlugins: [],
    installerVersion: '0.1.0',
    installedAt: '',
    managedFiles: [],
    managedHooks: [],
  };
}

function emptyReport(): MigrationReport {
  return { recognized: [], reported: [], skipped: [], warnings: [] };
}

describe('codex reconcile', () => {
  test('unowned existing target conflicts by default and force plans update', () => {
    const consumer = makeConsumer('tdk-reconcile-unowned-');
    const target = '.codex/agents/reviewer.toml';
    writeFile(consumer.root, target, 'user-owned');
    const desired = desiredFile(consumer.root, target, 'generated');

    const blocked = buildCodexReconcilePlan({
      consumerRoot: consumer.root,
      desiredFiles: [desired],
      previousManifest: emptyManifest(),
      migrationReport: emptyReport(),
    });
    const forced = buildCodexReconcilePlan({
      consumerRoot: consumer.root,
      desiredFiles: [desired],
      previousManifest: emptyManifest(),
      migrationReport: emptyReport(),
      force: true,
    });

    expect(blocked.conflicts.map((item) => item.reason)).toContain('target exists outside convert-flat ownership');
    expect(blocked.installPlan.writes).toHaveLength(0);
    expect(forced.conflicts).toHaveLength(0);
    expect(forced.installPlan.writes).toHaveLength(1);
  });

  test('force does not take over another manifest owner', () => {
    const consumer = makeConsumer('tdk-reconcile-other-owner-');
    const target = '.codex/agents/reviewer.toml';
    writeFile(consumer.root, target, 'other owner');
    const previous = emptyManifest();
    previous.selectedPlugins = ['tdk-core'];
    previous.managedFiles = [{
      plugin: 'tdk-core',
      sourceRelativePath: '.specify/plugins/tdk-core/agents/reviewer.md',
      targetRelativePath: target,
      sourceChecksum: 'old',
      installedChecksum: sha256Buffer(Buffer.from('other owner')),
    }];

    const plan = buildCodexReconcilePlan({
      consumerRoot: consumer.root,
      desiredFiles: [desiredFile(consumer.root, target, 'generated')],
      previousManifest: previous,
      migrationReport: emptyReport(),
      force: true,
    });

    expect(plan.conflicts.map((item) => item.reason)).toContain('target is owned by another manifest entry');
    expect(plan.installPlan.writes).toHaveLength(0);
    expect(plan.installPlan.nextManifest.managedFiles).toEqual(previous.managedFiles);
  });

  test('retains stale merge targets instead of whole-file deleting user content', () => {
    const consumer = makeConsumer('tdk-reconcile-merge-target-');
    writeFile(consumer.root, '.codex/hooks.json', '{ "UserPromptSubmit": [{ "command": "user" }] }\n');
    const previous = emptyManifest();
    previous.selectedPlugins = ['convert-flat'];
    previous.managedFiles = [{
      plugin: 'convert-flat',
      sourceRelativePath: '.claude/settings.json',
      targetRelativePath: '.codex/hooks.json',
      sourceChecksum: 'old',
      installedChecksum: sha256Buffer(Buffer.from('{ "UserPromptSubmit": [{ "command": "user" }] }\n')),
    }];

    const plan = buildCodexReconcilePlan({
      consumerRoot: consumer.root,
      desiredFiles: [],
      previousManifest: previous,
      migrationReport: emptyReport(),
    });

    expect(plan.installPlan.removals).toHaveLength(0);
    expect(plan.conflicts.map((item) => item.targetRelativePath)).toContain('.codex/hooks.json');
    expect(plan.installPlan.nextManifest.managedFiles).toEqual(previous.managedFiles);
  });
});

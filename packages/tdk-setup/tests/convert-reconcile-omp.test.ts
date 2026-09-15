import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256Buffer } from '../src/checksum';
import { buildConvertReconcilePlan, OMP_HARNESS_SPEC } from '../src/convert-reconcile';
import type { ConvertReconcilePlan } from '../src/convert-reconcile-types';
import { applyInstallPlan } from '../src/install-writer';
import { emptyHarnessManifest, loadHarnessManifest, saveHarnessManifest } from '../src/manifest-store';
import { extractOmpManagedPayload } from '../src/lib/harness-transform/config-yaml-merge';
import { makeConsumer } from './fixtures';
import type { ConvertTargetFile, MigrationReport } from '../src/flat-claude-types';
import { resolveActiveConvertParts } from '../src/convert-parts';
import type { ConvertPart } from '../src/convert-parts';
import type { HookTargetPlatform } from '../src/lib/harness-transform/hook-command';
import type { HarnessInstallManifest } from '../src/types';

function report(): MigrationReport {
  return { recognized: [], reported: [], skipped: [], warnings: [] };
}

function desiredFile(
  root: string,
  targetRelativePath: string,
  content: string,
  part?: ConvertPart,
  unmanageAfterWrite = false,
): ConvertTargetFile {
  const sourceContent = `source:${targetRelativePath}`;
  const sourceRelativePath = `.claude/source/${targetRelativePath.replaceAll('/', '-')}`;
  const sourcePath = path.join(root, sourceRelativePath);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, sourceContent, 'utf-8');
  const payload = Buffer.from(content, 'utf-8');
  return {
    sourcePath,
    sourceRelativePath,
    targetRelativePath,
    sourceChecksum: sha256Buffer(Buffer.from(sourceContent)),
    installedChecksum: sha256Buffer(payload),
    content: payload,
    part,
    unmanageAfterWrite,
  };
}

function plan(params: {
  root: string;
  desiredFiles: ConvertTargetFile[];
  previousManifest: HarnessInstallManifest;
  selectedParts?: ConvertPart[];
  removedParts?: ConvertPart[];
  hookTargetPlatform?: HookTargetPlatform;
}) {
  const selectedParts = params.selectedParts ?? [];
  const removedParts = params.removedParts ?? [];
  return buildConvertReconcilePlan({
    consumerRoot: params.root,
    desiredFiles: params.desiredFiles,
    previousManifest: params.previousManifest,
    migrationReport: report(),
    harnessSpec: OMP_HARNESS_SPEC,
    selection: {
      selectedParts,
      removedParts,
      activeParts: resolveActiveConvertParts(
        params.previousManifest.convertedParts ?? [],
        selectedParts,
        removedParts,
      ),
    },
    hookTargetPlatform: params.hookTargetPlatform,
  });
}

async function apply(planResult: ConvertReconcilePlan): Promise<void> {
  const result = await applyInstallPlan(planResult.installPlan, { yes: true, interactive: false });
  expect(result.warnings).toEqual([]);
}

describe('OMP convert reconcile', () => {
  test('applies a real test-only OMP desired file and writes the OMP manifest', async () => {
    const consumer = makeConsumer('tdk-omp-reconcile-apply-');
    const desired = desiredFile(consumer.root, '.omp/agents/reviewer.md', 'reviewer\n', 'agents');

    await apply(plan({
      root: consumer.root,
      desiredFiles: [desired],
      previousManifest: emptyHarnessManifest('omp'),
      selectedParts: ['agents'],
    }));

    expect(fs.readFileSync(path.join(consumer.root, '.omp/agents/reviewer.md'), 'utf-8')).toBe('reviewer\n');
    const manifest = loadHarnessManifest(consumer.root, 'omp');
    expect(manifest.harness).toBe('omp');
    expect(manifest.convertedParts).toEqual(['agents']);
    expect(manifest.managedFiles[0]?.part).toBe('agents');
  });

  test('keeps other active parts while updating one part, then removes only an explicit part', async () => {
    const consumer = makeConsumer('tdk-omp-reconcile-parts-');
    const agent = desiredFile(consumer.root, '.omp/agents/reviewer.md', 'reviewer\n', 'agents');
    await apply(plan({
      root: consumer.root,
      desiredFiles: [agent],
      previousManifest: emptyHarnessManifest('omp'),
      selectedParts: ['agents'],
    }));

    const rule = desiredFile(consumer.root, '.omp/rules/security.md', 'security\n', 'rules');
    await apply(plan({
      root: consumer.root,
      desiredFiles: [rule],
      previousManifest: loadHarnessManifest(consumer.root, 'omp'),
      selectedParts: ['rules'],
    }));

    expect(fs.existsSync(path.join(consumer.root, '.omp/agents/reviewer.md'))).toBe(true);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['agents', 'rules']);

    await apply(plan({
      root: consumer.root,
      desiredFiles: [],
      previousManifest: loadHarnessManifest(consumer.root, 'omp'),
      removedParts: ['agents'],
    }));

    const manifest = loadHarnessManifest(consumer.root, 'omp');
    expect(fs.existsSync(path.join(consumer.root, '.omp/agents/reviewer.md'))).toBe(false);
    expect(fs.existsSync(path.join(consumer.root, '.omp/rules/security.md'))).toBe(true);
    expect(manifest.convertedParts).toEqual(['rules']);
    expect(manifest.managedFiles.map((file) => file.targetRelativePath)).toEqual(['.omp/rules/security.md']);
  });

  test('removes stale files inside a selected part without touching another part', async () => {
    const consumer = makeConsumer('tdk-omp-reconcile-stale-');
    const first = desiredFile(consumer.root, '.omp/agents/first.md', 'first\n', 'agents');
    const second = desiredFile(consumer.root, '.omp/agents/second.md', 'second\n', 'agents');
    const rule = desiredFile(consumer.root, '.omp/rules/security.md', 'security\n', 'rules');
    await apply(plan({
      root: consumer.root,
      desiredFiles: [first, second, rule],
      previousManifest: emptyHarnessManifest('omp'),
      selectedParts: ['agents', 'rules'],
    }));

    await apply(plan({
      root: consumer.root,
      desiredFiles: [first],
      previousManifest: loadHarnessManifest(consumer.root, 'omp'),
      selectedParts: ['agents'],
    }));

    expect(fs.existsSync(path.join(consumer.root, '.omp/agents/first.md'))).toBe(true);
    expect(fs.existsSync(path.join(consumer.root, '.omp/agents/second.md'))).toBe(false);
    expect(fs.existsSync(path.join(consumer.root, '.omp/rules/security.md'))).toBe(true);
  });

  test('strips and unmanages the shared config target after the last contributing part is removed', async () => {
    const consumer = makeConsumer('tdk-omp-reconcile-shared-');
    const targetRelativePath = '.omp/config.yml';
    const targetPath = path.join(consumer.root, targetRelativePath);
    const managedContent = 'user: true\n# --- tdk-managed-start ---\nskills: false\n# --- tdk-managed-end ---\n';
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, managedContent, 'utf-8');
    const previous = emptyHarnessManifest('omp');
    previous.convertedParts = ['settings'];
    previous.selectedPlugins = ['convert-flat'];
    previous.managedFiles = [{
      plugin: 'convert-flat',
      sourceRelativePath: '.claude/settings.json',
      targetRelativePath,
      sourceChecksum: 'source',
      installedChecksum: sha256Buffer(Buffer.from(managedContent)),
    }];
    const stripped = desiredFile(consumer.root, targetRelativePath, 'user: true\n', undefined, true);

    await apply(plan({
      root: consumer.root,
      desiredFiles: [stripped],
      previousManifest: previous,
      removedParts: ['settings'],
    }));

    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('user: true\n');
    const manifest = loadHarnessManifest(consumer.root, 'omp');
    expect(manifest.convertedParts).toEqual([]);
    expect(manifest.managedFiles).toEqual([]);
  });

  test('blocks conflicting part transitions before the manifest can advance', async () => {
    const consumer = makeConsumer('tdk-omp-reconcile-conflict-');
    const previous = emptyHarnessManifest('omp');
    saveHarnessManifest(consumer.root, previous);
    const manifestPath = path.join(consumer.root, '.specify/state/harness-install/omp.json');
    const manifestBefore = fs.readFileSync(manifestPath);
    const targetPath = path.join(consumer.root, '.omp/agents/reviewer.md');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, 'user-owned\n', 'utf-8');
    const result = plan({
      root: consumer.root,
      desiredFiles: [desiredFile(consumer.root, '.omp/agents/reviewer.md', 'managed\n', 'agents')],
      previousManifest: previous,
      selectedParts: ['agents'],
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.installPlan.collisions).toHaveLength(1);
    await expect(applyInstallPlan(result.installPlan, { yes: true, interactive: false })).rejects.toThrow(/blockers/);
    expect(fs.readFileSync(manifestPath)).toEqual(manifestBefore);
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('user-owned\n');
  });

  test('uses managed-region drift while preserving user edits outside the shared sentinel', async () => {
    const consumer = makeConsumer('tdk-omp-reconcile-user-region-');
    const targetRelativePath = '.omp/config.yml';
    const targetPath = path.join(consumer.root, targetRelativePath);
    const managedRegion = '# --- tdk-managed-start ---\nskills: false\n# --- tdk-managed-end ---\n';
    const installedContent = `user: old\n${managedRegion}`;
    const currentContent = `user: edited\n${managedRegion}`;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, currentContent, 'utf-8');
    const previous = emptyHarnessManifest('omp');
    previous.convertedParts = ['settings'];
    previous.managedFiles = [{
      plugin: 'convert-flat',
      sourceRelativePath: '.claude/settings.json',
      targetRelativePath,
      sourceChecksum: 'source',
      installedChecksum: sha256Buffer(Buffer.from(installedContent)),
      managedRegionChecksum: sha256Buffer(Buffer.from(extractOmpManagedPayload(managedRegion)!)),
    }];
    const stripped = desiredFile(consumer.root, targetRelativePath, 'user: edited\n', undefined, true);
    stripped.currentManagedRegionChecksum = sha256Buffer(Buffer.from(extractOmpManagedPayload(managedRegion)!));

    const result = plan({
      root: consumer.root,
      desiredFiles: [stripped],
      previousManifest: previous,
      removedParts: ['settings'],
    });
    expect(result.conflicts).toEqual([]);
    await apply(result);

    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('user: edited\n');
    expect(loadHarnessManifest(consumer.root, 'omp').managedFiles).toEqual([]);
  });

  test('blocks shared-target writes when the managed region was edited', async () => {
    const consumer = makeConsumer('tdk-omp-reconcile-managed-drift-');
    const targetRelativePath = '.omp/config.yml';
    const targetPath = path.join(consumer.root, targetRelativePath);
    const oldRegion = '# --- tdk-managed-start ---\nskills: false\n# --- tdk-managed-end ---\n';
    const editedRegion = '# --- tdk-managed-start ---\nskills: true\n# --- tdk-managed-end ---\n';
    const installedContent = `user: true\n${oldRegion}`;
    const currentContent = `user: true\n${editedRegion}`;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, currentContent, 'utf-8');
    const previous = emptyHarnessManifest('omp');
    previous.convertedParts = ['settings'];
    previous.managedFiles = [{
      plugin: 'convert-flat',
      sourceRelativePath: '.claude/settings.json',
      targetRelativePath,
      sourceChecksum: 'source',
      installedChecksum: sha256Buffer(Buffer.from(installedContent)),
      managedRegionChecksum: sha256Buffer(Buffer.from(extractOmpManagedPayload(oldRegion)!)),
    }];
    saveHarnessManifest(consumer.root, previous);
    const manifestPath = path.join(consumer.root, '.specify/state/harness-install/omp.json');
    const manifestBefore = fs.readFileSync(manifestPath);
    const stripped = desiredFile(consumer.root, targetRelativePath, 'user: true\n', undefined, true);
    stripped.currentManagedRegionChecksum = sha256Buffer(Buffer.from(extractOmpManagedPayload(editedRegion)!));
    const result = plan({
      root: consumer.root,
      desiredFiles: [stripped],
      previousManifest: previous,
      removedParts: ['settings'],
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.installPlan.collisions).toHaveLength(1);
    await expect(applyInstallPlan(result.installPlan, { yes: true, interactive: false })).rejects.toThrow(/blockers/);
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(currentContent);
    expect(fs.readFileSync(manifestPath)).toEqual(manifestBefore);
  });

  test('rejects a part owner on a shared merge target', () => {
    const consumer = makeConsumer('tdk-omp-reconcile-shared-owner-');
    const shared = desiredFile(consumer.root, '.omp/config.yml', 'managed\n', 'settings');

    expect(() => plan({
      root: consumer.root,
      desiredFiles: [shared],
      previousManifest: emptyHarnessManifest('omp'),
      selectedParts: ['settings'],
    })).toThrow(/shared merge target.*part owner/);
  });

  test('persists an active zero-output part in manifest state', async () => {
    const consumer = makeConsumer('tdk-omp-reconcile-zero-output-');
    await apply(plan({
      root: consumer.root,
      desiredFiles: [],
      previousManifest: emptyHarnessManifest('omp'),
      selectedParts: ['context'],
    }));

    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['context']);
  });

  test('preserves an unselected hook target, records zero-output selection, and clears it on removal', async () => {
    const consumer = makeConsumer('tdk-omp-reconcile-hook-target-lifecycle-');
    const previous = emptyHarnessManifest('omp');
    previous.convertedParts = ['hooks'];
    previous.hookTargetPlatform = 'win32';

    await apply(plan({
      root: consumer.root,
      desiredFiles: [],
      previousManifest: previous,
      selectedParts: ['agents'],
    }));
    expect(loadHarnessManifest(consumer.root, 'omp').hookTargetPlatform).toBe('win32');

    await apply(plan({
      root: consumer.root,
      desiredFiles: [],
      previousManifest: loadHarnessManifest(consumer.root, 'omp'),
      selectedParts: ['hooks'],
      hookTargetPlatform: 'linux',
    }));
    const selected = loadHarnessManifest(consumer.root, 'omp');
    expect(selected.convertedParts).toEqual(['agents', 'hooks']);
    expect(selected.hookTargetPlatform).toBe('linux');

    await apply(plan({
      root: consumer.root,
      desiredFiles: [],
      previousManifest: selected,
      removedParts: ['hooks'],
    }));
    const removed = loadHarnessManifest(consumer.root, 'omp');
    expect(removed.convertedParts).toEqual(['agents']);
    expect(Object.prototype.hasOwnProperty.call(removed, 'hookTargetPlatform')).toBe(false);
  });

  test('does not advance a changed hook target when hook regeneration conflicts', async () => {
    const consumer = makeConsumer('tdk-omp-reconcile-hook-target-conflict-');
    const desired = desiredFile(consumer.root, '.omp/hooks/pre/tool-001.ts', 'generated\n', 'hooks');
    const targetPath = path.join(consumer.root, desired.targetRelativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, 'user-edited\n', 'utf-8');
    const previous = emptyHarnessManifest('omp');
    previous.selectedPlugins = ['convert-flat'];
    previous.convertedParts = ['hooks'];
    previous.hookTargetPlatform = 'linux';
    previous.managedFiles = [{
      plugin: 'convert-flat',
      sourceRelativePath: desired.sourceRelativePath,
      targetRelativePath: desired.targetRelativePath,
      sourceChecksum: desired.sourceChecksum,
      installedChecksum: desired.installedChecksum,
      part: 'hooks',
    }];
    saveHarnessManifest(consumer.root, previous);

    const result = plan({
      root: consumer.root,
      desiredFiles: [desired],
      previousManifest: previous,
      selectedParts: ['hooks'],
      hookTargetPlatform: 'win32',
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.installPlan.nextManifest.hookTargetPlatform).toBe('win32');
    await expect(applyInstallPlan(result.installPlan, { yes: true, interactive: false })).rejects.toThrow(/blockers/);
    expect(loadHarnessManifest(consumer.root, 'omp').hookTargetPlatform).toBe('linux');
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe('user-edited\n');
  });

  test('uses the full current file as the atomic preimage for shared-target writes', async () => {
    const consumer = makeConsumer('tdk-omp-reconcile-race-');
    const targetRelativePath = '.omp/config.yml';
    const targetPath = path.join(consumer.root, targetRelativePath);
    const managedRegion = '# --- tdk-managed-start ---\nskills: false\n# --- tdk-managed-end ---\n';
    const currentContent = `user: edited\n${managedRegion}`;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, currentContent, 'utf-8');
    const previous = emptyHarnessManifest('omp');
    previous.convertedParts = ['settings'];
    previous.managedFiles = [{
      plugin: 'convert-flat',
      sourceRelativePath: '.claude/settings.json',
      targetRelativePath,
      sourceChecksum: 'source',
      installedChecksum: sha256Buffer(Buffer.from(`user: old\n${managedRegion}`)),
      managedRegionChecksum: sha256Buffer(Buffer.from(extractOmpManagedPayload(managedRegion)!)),
    }];
    saveHarnessManifest(consumer.root, previous);
    const stripped = desiredFile(consumer.root, targetRelativePath, 'user: edited\n', undefined, true);
    stripped.currentManagedRegionChecksum = sha256Buffer(Buffer.from(extractOmpManagedPayload(managedRegion)!));
    const result = plan({
      root: consumer.root,
      desiredFiles: [stripped],
      previousManifest: previous,
      removedParts: ['settings'],
    });
    fs.writeFileSync(targetPath, `user: concurrent\n${managedRegion}`, 'utf-8');

    await expect(applyInstallPlan(result.installPlan, { yes: true, interactive: false })).rejects.toThrow(/changed after planning/);
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(`user: concurrent\n${managedRegion}`);
    expect(loadHarnessManifest(consumer.root, 'omp').convertedParts).toEqual(['settings']);
  });
});

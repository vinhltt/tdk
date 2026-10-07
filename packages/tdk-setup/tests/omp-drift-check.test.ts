import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { mergeConfigYaml } from '../src/lib/harness-transform/config-yaml-merge';
import { loadHarnessManifest, manifestPathFor, saveHarnessManifest } from '../src/manifest-store';
import { makeConsumer } from './fixtures';

const cliPath = path.resolve('src/index.ts');

function writeFile(root: string, relativePath: string, content: string): string {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function runConvertFlat(root: string, args: string[]) {
  return Bun.spawnSync({
    cmd: ['bun', cliPath, 'convert-flat', root, '--harness', 'omp', ...args],
    cwd: path.join(root, '.specify', 'scripts', 'ts'),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, TDK_CODEX_COMPAT: 'optimistic' },
  });
}

function installAgent(root: string): { sourcePath: string; targetPath: string } {
  const sourcePath = writeFile(root, '.claude/agents/reviewer.md', [
    '---',
    'name: reviewer',
    'description: Review code',
    'tools: Read',
    '---',
    'Review the code.',
  ].join('\n'));
  const result = runConvertFlat(root, ['--parts', 'agents', '--yes']);
  expect(result.exitCode).toBe(0);
  return { sourcePath, targetPath: path.join(root, '.omp/agents/reviewer.md') };
}

function snapshotFiles(root: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  function visit(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) snapshot[path.relative(root, fullPath)] = fs.readFileSync(fullPath).toString('base64');
    }
  }
  visit(root);
  return snapshot;
}

describe('OMP convert-flat drift check', () => {
  test('reports a clean conversion and leaves the consumer tree unchanged', () => {
    const consumer = makeConsumer('tdk-omp-drift-clean-');
    installAgent(consumer.root);
    const before = snapshotFiles(consumer.root);

    const result = runConvertFlat(consumer.root, ['--check']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('No OMP convert-flat drift detected.');
    expect(result.stderr.toString()).toBe('');
    expect(snapshotFiles(consumer.root)).toEqual(before);
  });

  test('uses exit 2 for check parser errors and exit 1 only for detected drift', () => {
    const consumer = makeConsumer('tdk-omp-drift-exit-codes-');
    const source = installAgent(consumer.root);
    const before = snapshotFiles(consumer.root);
    for (const args of [
      ['--check', '--unknown-check-option'],
      ['--check', '--parts'],
      ['--parts', '--check'],
    ]) {
      const result = runConvertFlat(consumer.root, args);
      expect(result.exitCode, result.stderr.toString()).toBe(2);
      expect(snapshotFiles(consumer.root)).toEqual(before);
    }
    expect(runConvertFlat(consumer.root, ['--check', '--help']).exitCode).toBe(0);
    fs.appendFileSync(source.sourcePath, '\nChanged source.\n');
    expect(runConvertFlat(consumer.root, ['--check']).exitCode).toBe(1);
  });

  test('distinguishes source changes, target edits, missing targets, and simultaneous drift', () => {
    const sourceConsumer = makeConsumer('tdk-omp-drift-source-');
    const source = installAgent(sourceConsumer.root);
    fs.appendFileSync(source.sourcePath, '\nSource changed.\n');
    const sourceResult = runConvertFlat(sourceConsumer.root, ['--check']);
    expect(sourceResult.exitCode).not.toBe(0);
    expect(sourceResult.stdout.toString()).toContain('source-changed:');
    expect(sourceResult.stdout.toString()).toContain('.claude/agents/reviewer.md -> .omp/agents/reviewer.md');
    expect(sourceResult.stdout.toString()).not.toContain('target-modified:');

    const targetConsumer = makeConsumer('tdk-omp-drift-target-');
    const target = installAgent(targetConsumer.root);
    fs.appendFileSync(target.targetPath, '\nTarget changed.\n');
    const targetResult = runConvertFlat(targetConsumer.root, ['--check']);
    expect(targetResult.exitCode).not.toBe(0);
    expect(targetResult.stdout.toString()).toContain('target-modified:');
    expect(targetResult.stdout.toString()).not.toContain('source-changed:');

    const missingConsumer = makeConsumer('tdk-omp-drift-missing-');
    const missing = installAgent(missingConsumer.root);
    fs.rmSync(missing.targetPath);
    const missingResult = runConvertFlat(missingConsumer.root, ['--check']);
    expect(missingResult.exitCode).not.toBe(0);
    expect(missingResult.stdout.toString()).toContain('target-missing:');
    expect(missingResult.stdout.toString()).not.toContain('target-modified:');

    const bothConsumer = makeConsumer('tdk-omp-drift-both-');
    const both = installAgent(bothConsumer.root);
    fs.appendFileSync(both.sourcePath, '\nSource changed.\n');
    fs.appendFileSync(both.targetPath, '\nTarget changed.\n');
    const bothResult = runConvertFlat(bothConsumer.root, ['--check']);
    expect(bothResult.exitCode).not.toBe(0);
    expect(bothResult.stdout.toString()).toContain('source-changed:');
    expect(bothResult.stdout.toString()).toContain('target-modified:');
  });

  test('checks only the managed sentinel payload in OMP config', () => {
    const consumer = makeConsumer('tdk-omp-drift-config-');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({ effortLevel: 'high' }));
    writeFile(consumer.root, '.omp/config.yml', 'retry:\n  enabled: true\n');
    const applied = runConvertFlat(consumer.root, ['--parts', 'settings', '--yes']);
    expect(applied.exitCode).toBe(0);
    const targetPath = path.join(consumer.root, '.omp/config.yml');

    fs.appendFileSync(targetPath, 'userFlag: true\n');
    const outside = runConvertFlat(consumer.root, ['--check']);
    expect(outside.exitCode).toBe(0);
    expect(outside.stdout.toString()).toContain('No OMP convert-flat drift detected.');

    const managedEdit = fs.readFileSync(targetPath, 'utf-8')
      .replace('defaultThinkingLevel: high', 'defaultThinkingLevel: medium');
    fs.writeFileSync(targetPath, managedEdit, 'utf-8');
    const inside = runConvertFlat(consumer.root, ['--check']);
    expect(inside.exitCode).not.toBe(0);
    expect(inside.stdout.toString()).toContain('target-modified:');

    fs.writeFileSync(targetPath, mergeConfigYaml(managedEdit, '').content, 'utf-8');
    const removed = runConvertFlat(consumer.root, ['--check']);
    expect(removed.exitCode).not.toBe(0);
    expect(removed.stdout.toString()).toContain('target-modified:');
  });

  test('handles absent and legacy manifests with actionable errors', () => {
    const missingConsumer = makeConsumer('tdk-omp-drift-no-manifest-');
    const missing = runConvertFlat(missingConsumer.root, ['--check']);
    expect(missing.exitCode).not.toBe(0);
    expect(missing.stderr.toString()).toContain('Run convert-flat with --harness omp before --check');

    const legacyConsumer = makeConsumer('tdk-omp-drift-legacy-');
    writeFile(legacyConsumer.root, '.claude/settings.json', JSON.stringify({ effortLevel: 'high' }));
    const applied = runConvertFlat(legacyConsumer.root, ['--parts', 'settings', '--yes']);
    expect(applied.exitCode).toBe(0);
    const manifest = loadHarnessManifest(legacyConsumer.root, 'omp');
    delete manifest.managedFiles.find((file) => file.targetRelativePath === '.omp/config.yml')!.managedRegionChecksum;
    saveHarnessManifest(legacyConsumer.root, manifest, 'omp');

    const legacy = runConvertFlat(legacyConsumer.root, ['--check']);
    expect(legacy.exitCode).not.toBe(0);
    expect(legacy.stderr.toString()).toContain('rerun convert-flat for part settings to record it');
  });

  test('rejects conversion flags in check mode', () => {
    const consumer = makeConsumer('tdk-omp-drift-flags-');
    installAgent(consumer.root);

    const result = runConvertFlat(consumer.root, ['--check', '--dry-run']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('--check cannot be combined with conversion options: --dry-run');
  });

  test('rejects symlinked source ancestors and ownership manifests instead of following them', () => {
    const sourceConsumer = makeConsumer('tdk-omp-drift-source-link-');
    const source = installAgent(sourceConsumer.root);
    const externalSourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-omp-drift-external-source-'));
    try {
      const externalAgents = path.join(externalSourceRoot, 'agents');
      fs.mkdirSync(externalAgents);
      fs.copyFileSync(source.sourcePath, path.join(externalAgents, 'reviewer.md'));
      fs.rmSync(path.dirname(source.sourcePath), { recursive: true });
      fs.symlinkSync(externalAgents, path.dirname(source.sourcePath), 'dir');

      const linkedSource = runConvertFlat(sourceConsumer.root, ['--check']);
      expect(linkedSource.exitCode).not.toBe(0);
      expect(linkedSource.stderr.toString()).toContain('source path has symlinked ancestor');
    } finally {
      fs.rmSync(externalSourceRoot, { recursive: true, force: true });
    }

    const manifestConsumer = makeConsumer('tdk-omp-drift-manifest-link-');
    installAgent(manifestConsumer.root);
    const originalManifestPath = manifestPathFor(manifestConsumer.root, 'omp');
    const externalManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-omp-drift-external-manifest-'));
    try {
      const externalManifestPath = path.join(externalManifestRoot, 'omp.json');
      fs.copyFileSync(originalManifestPath, externalManifestPath);
      fs.rmSync(originalManifestPath);
      fs.symlinkSync(externalManifestPath, originalManifestPath, 'file');

      const linkedManifest = runConvertFlat(manifestConsumer.root, ['--check']);
      expect(linkedManifest.exitCode).not.toBe(0);
      expect(linkedManifest.stderr.toString()).toContain('OMP ownership manifest has symlinked ancestor');
    } finally {
      fs.rmSync(externalManifestRoot, { recursive: true, force: true });
    }
  });

  test('records actual malformed settings bytes during a skills-only conversion', () => {
    const consumer = makeConsumer('tdk-omp-drift-skills-malformed-settings-');
    writeFile(consumer.root, '.claude/settings.json', '{ invalid json');
    writeFile(consumer.root, '.claude/skills/demo/SKILL.md', [
      '---',
      'name: demo',
      'description: Demo skill',
      '---',
      '# Demo',
    ].join('\n'));
    const applied = runConvertFlat(consumer.root, ['--parts', 'skills', '--yes']);
    expect(applied.exitCode).toBe(0);

    const result = runConvertFlat(consumer.root, ['--check']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('No OMP convert-flat drift detected.');
  });

  test('reports deletion of an empty settings source after a skills-only conversion', () => {
    const consumer = makeConsumer('tdk-omp-drift-empty-settings-');
    const settingsPath = writeFile(consumer.root, '.claude/settings.json', '');
    writeFile(consumer.root, '.claude/skills/demo/SKILL.md', [
      '---',
      'name: demo',
      'description: Demo skill',
      '---',
      '# Demo',
    ].join('\n'));
    const applied = runConvertFlat(consumer.root, ['--parts', 'skills', '--yes']);
    expect(applied.exitCode).toBe(0);
    fs.rmSync(settingsPath);

    const result = runConvertFlat(consumer.root, ['--check']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.toString()).toContain('source-changed:');
    expect(result.stdout.toString()).toContain('.claude/settings.json -> .omp/config.yml');
  });

  test('does not report the intentionally absent settings source for a skills-only conversion', () => {
    const consumer = makeConsumer('tdk-omp-drift-skills-only-');
    writeFile(consumer.root, '.claude/skills/demo/SKILL.md', [
      '---',
      'name: demo',
      'description: Demo skill',
      '---',
      '# Demo',
    ].join('\n'));
    const applied = runConvertFlat(consumer.root, ['--parts', 'skills', '--yes']);
    expect(applied.exitCode).toBe(0);

    const result = runConvertFlat(consumer.root, ['--check']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('No OMP convert-flat drift detected.');
    const manifest = loadHarnessManifest(consumer.root, 'omp');
    const configEntry = manifest.managedFiles.find((file) => file.targetRelativePath === '.omp/config.yml')!;
    expect(configEntry.sourcePresent).toBe(false);
    delete configEntry.sourcePresent;
    saveHarnessManifest(consumer.root, manifest, 'omp');

    const legacy = runConvertFlat(consumer.root, ['--check']);
    expect(legacy.exitCode).not.toBe(0);
    expect(legacy.stderr.toString()).toContain('Source-presence metadata is missing');
  });
});

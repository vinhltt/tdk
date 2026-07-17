import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import type { ArtifactMigrationManifest, ArtifactMigrationPlan, MigrationBackupRecord } from './artifact-migration-types';
import { atomicReplaceTextFile } from './artifact-migration-atomic-file';
import { parsePhasesTable } from './phases-table-parser';

function hashFile(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function writeManifest(path: string, manifest: ArtifactMigrationManifest): void {
  atomicReplaceTextFile(path, `${JSON.stringify(manifest, null, 2)}\n`, `${path}.next`);
}

function demoteHeadings(markdown: string): string {
  return markdown.trim().replace(/^(#{1,4})\s/gm, '##$1 ');
}

function appendToSection(markdown: string, section: string, source: string, relativeSource: string): string {
  const marker = `<!-- migrated-from: ${relativeSource} -->`;
  if (markdown.includes(marker)) return markdown;
  const block = `### Migrated from \`${relativeSource}\`\n\n${demoteHeadings(source)}\n\n${marker}`;
  const start = markdown.split(/\r?\n/).findIndex((line) => line.trim() === section);
  if (start < 0) return `${markdown.trimEnd()}\n\n${section}\n\n${block}\n`;

  const lines = markdown.split(/\r?\n/);
  const next = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line.trim()));
  const insertAt = next < 0 ? lines.length : start + 1 + next;
  lines.splice(insertAt, 0, '', block, '');
  return lines.join('\n');
}

function targetReference(featureDir: string, documentPath: string, ownerPath: string, section: string): string {
  const anchor = section.slice(3).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (documentPath === ownerPath) return `#${anchor}`;
  return `${relative(dirname(documentPath), ownerPath).replaceAll('\\', '/')}#${anchor}`;
}

function buildWrites(plan: ArtifactMigrationPlan): Map<string, string> {
  const writes = new Map<string, string>();
  for (const operation of plan.operations) {
    const targetPath = operation.ownerPhasePath ?? operation.replacementPath;
    if (!targetPath || !operation.targetSection) continue;
    const source = readFileSync(operation.sourcePath, 'utf8');
    const affected = new Set([targetPath, ...operation.linkFiles.map((path) => join(plan.featureDir, path))]);
    for (const path of affected) {
      let markdown = writes.get(path) ?? readFileSync(path, 'utf8');
      const target = targetReference(plan.featureDir, path, targetPath, operation.targetSection);
      markdown = markdown.replaceAll(operation.relativeSource, target);
      if (path === targetPath && operation.appendSourceContent !== false) {
        markdown = appendToSection(markdown, operation.targetSection, source, operation.relativeSource);
      }
      writes.set(path, markdown);
    }
  }
  return writes;
}

function phaseStatusSignature(markdown: string): string {
  const parsed = parsePhasesTable(markdown);
  if (parsed.errors.length > 0) throw new Error(`Plan phase validation failed: ${parsed.errors[0]!.message}`);
  return parsed.phases.map((phase) => `${phase.number}:${phase.status}`).join('|');
}

function hasLegacyMarkdownLink(markdown: string, relativeSource: string): boolean {
  const escaped = relativeSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\]\\((?:\\./)?${escaped}(?:#[^)]+)?\\)`).test(markdown);
}

function backupPaths(plan: ArtifactMigrationPlan, writes: Map<string, string>, transactionDir: string): MigrationBackupRecord[] {
  const paths = new Set([...plan.operations.map((operation) => operation.sourcePath), ...writes.keys()]);
  return [...paths].sort().map((path) => {
    const backupPath = join(transactionDir, 'backups', relative(plan.featureDir, path));
    const existed = existsSync(path);
    if (existed) {
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(path, backupPath);
    }
    return { path, backupPath, existed, originalHash: hashFile(path) };
  });
}

export function findPendingArtifactMigration(featureDir: string): string | null {
  const root = join(featureDir, '.tdk-tmp', 'migrate-artifacts');
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => b.name.localeCompare(a.name))) {
    const path = join(root, entry.name, 'manifest.json');
    if (!entry.isDirectory() || !existsSync(path)) continue;
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as ArtifactMigrationManifest;
    if (manifest.state === 'planned' || manifest.state === 'applying' || manifest.state === 'failed') return path;
  }
  return null;
}

export function rollbackArtifactMigration(manifestPath: string): ArtifactMigrationManifest {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ArtifactMigrationManifest;
  const currentHashes = new Map<string, string | null>();
  for (const record of manifest.backups) {
    const currentHash = hashFile(record.path);
    const acceptedHashes = record.appliedHash === undefined
      ? [record.originalHash]
      : [record.originalHash, record.appliedHash];
    if (!acceptedHashes.includes(currentHash)) {
      throw new Error(`Rollback conflict: ${record.path} changed after migration; refusing to overwrite user edits`);
    }
    currentHashes.set(record.path, currentHash);
  }
  for (const record of manifest.backups) {
    if (record.existed) {
      mkdirSync(dirname(record.path), { recursive: true });
      const rollbackTemp = join(manifest.transactionDir, 'rollback-staged', relative(manifest.featureDir, record.path));
      atomicReplaceTextFile(record.path, readFileSync(record.backupPath, 'utf8'), rollbackTemp, {
        expectedCurrentHash: currentHashes.get(record.path)!,
      });
    } else {
      if (hashFile(record.path) !== currentHashes.get(record.path)) {
        throw new Error(`Rollback conflict: ${record.path} changed during rollback; refusing to remove user edits`);
      }
      rmSync(record.path, { force: true });
    }
  }
  manifest.state = 'rolled_back';
  delete manifest.error;
  writeManifest(manifestPath, manifest);
  return manifest;
}

export function applyArtifactMigration(
  plan: ArtifactMigrationPlan,
  options: { yes: boolean; interruptAfterPrepare?: boolean; interruptAfterWrites?: boolean },
): ArtifactMigrationManifest {
  if (!options.yes) throw new Error('Artifact deletion requires explicit confirmation (--yes)');
  if (plan.errors.length > 0) throw new Error(plan.errors.join('; '));
  const stamp = String(Date.now());
  const transactionDir = join(plan.featureDir, '.tdk-tmp', 'migrate-artifacts', stamp);
  const manifestPath = join(transactionDir, 'manifest.json');
  const writes = buildWrites(plan);
  const planPath = join(plan.featureDir, 'plan.md');
  const phaseStatusesBefore = phaseStatusSignature(readFileSync(planPath, 'utf8'));
  mkdirSync(transactionDir, { recursive: true });
  const manifest: ArtifactMigrationManifest = {
    ...plan,
    transactionDir,
    state: 'planned',
    backups: backupPaths(plan, writes, transactionDir),
  };
  delete (manifest as Partial<ArtifactMigrationPlan>).dryRun;

  // Persist every intended post-mutation hash before the first write/delete.
  // Recovery can then distinguish original bytes, expected migration bytes,
  // and unrelated user edits even if the process exits between filesystem and
  // manifest operations.
  for (const [path, markdown] of writes) {
    manifest.backups.find((record) => record.path === path)!.appliedHash = hashContent(markdown);
  }
  for (const operation of plan.operations) {
    manifest.backups.find((record) => record.path === operation.sourcePath)!.appliedHash = null;
  }
  writeManifest(manifestPath, manifest);

  try {
    manifest.state = 'applying';
    writeManifest(manifestPath, manifest);
    if (options.interruptAfterPrepare) throw new Error('SIMULATED_INTERRUPT');
    for (const [path, markdown] of writes) {
      const record = manifest.backups.find((item) => item.path === path)!;
      const stagedPath = join(transactionDir, 'staged', relative(plan.featureDir, path));
      atomicReplaceTextFile(path, markdown, stagedPath, { expectedCurrentHash: record.originalHash });
    }
    if (options.interruptAfterWrites) throw new Error('SIMULATED_INTERRUPT');
    for (const operation of plan.operations.filter((item) => item.ownerPhasePath || item.replacementPath)) {
      const targetPath = operation.ownerPhasePath ?? operation.replacementPath!;
      const target = readFileSync(targetPath, 'utf8');
      if (operation.appendSourceContent !== false
          && !target.includes(`<!-- migrated-from: ${operation.relativeSource} -->`)) {
        throw new Error(`Validation failed for ${operation.relativeSource}`);
      }
      for (const linkFile of operation.linkFiles) {
        if (hasLegacyMarkdownLink(readFileSync(join(plan.featureDir, linkFile), 'utf8'), operation.relativeSource)) {
          throw new Error(`Legacy link remains in ${linkFile}: ${operation.relativeSource}`);
        }
      }
    }
    if (phaseStatusSignature(readFileSync(planPath, 'utf8')) !== phaseStatusesBefore) {
      throw new Error('Plan phase statuses changed during artifact migration');
    }
    for (const operation of plan.operations) {
      rmSync(operation.sourcePath);
      if (hashFile(operation.sourcePath) !== null) throw new Error(`Legacy artifact deletion failed: ${operation.sourcePath}`);
    }
    for (const dir of ['contracts', 'checklists']) {
      const path = join(plan.featureDir, dir);
      if (existsSync(path) && readdirSync(path).length === 0) rmSync(path, { recursive: true });
    }
    manifest.state = 'committed';
    writeManifest(manifestPath, manifest);
    return manifest;
  } catch (error) {
    if (error instanceof Error && error.message === 'SIMULATED_INTERRUPT') throw error;
    manifest.state = 'failed';
    manifest.error = error instanceof Error ? error.message : String(error);
    writeManifest(manifestPath, manifest);
    rollbackArtifactMigration(manifestPath);
    throw new Error(`Migration failed and was rolled back: ${manifest.error}`);
  }
}

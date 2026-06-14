import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { sha256Buffer, sha256File } from './checksum';
import { blockingCollisions, isPromptableCollision } from './collisions';
import { normalizeTargetRelativePath } from './target-relative-path';
import type { ApplyOptions, ApplyResult, InstallPlan, PlannedRemoval, PlannedWrite, RequiredPrompt } from './types';
function writeFileAtomic(target: string, data: Buffer | string, expectedChecksum?: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`;
  let fd: number | undefined;
  try {
    fd = fs.openSync(tmp, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
    fs.writeFileSync(fd, payload);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    const replacingExisting = fs.existsSync(target);
    if (replacingExisting) {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) throw new Error(`Refusing to replace symlink: ${target}`);
      if (!stat.isFile()) throw new Error(`Target is not a file: ${target}`);
    }
    fs.renameSync(tmp, target);
    const expected = expectedChecksum ?? sha256Buffer(payload);
    const installed = sha256File(target);
    if (installed !== expected) {
      if (!replacingExisting) fs.unlinkSync(target);
      throw new Error(`Checksum mismatch after writing ${target}`);
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function backupPath(consumerRoot: string, targetRelativePath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(consumerRoot, '.specify', 'state', 'harness-install', 'backups', stamp, normalizeTargetRelativePath(targetRelativePath));
}

function migrationJournalPath(consumerRoot: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(consumerRoot, '.specify', 'state', 'harness-install', 'migrations', `claude-prefix-${stamp}.json`);
}

function writeMigrationJournal(plan: InstallPlan): string | undefined {
  if (!plan.migration) return undefined;
  const journalPath = migrationJournalPath(plan.consumerRoot);
  writeFileAtomic(journalPath, `${JSON.stringify({
    version: 1,
    harness: plan.harness,
    fromPrefix: plan.migration.fromPrefix,
    toPrefix: plan.migration.toPrefix,
    createdAt: new Date().toISOString(),
    writes: plan.writes.map((write) => ({
      targetRelativePath: write.targetRelativePath,
      installedChecksum: write.installedChecksum,
    })),
    removals: plan.removals.map((removal) => ({
      targetRelativePath: removal.targetRelativePath,
      installedChecksum: removal.previous.installedChecksum,
    })),
  }, null, 2)}\n`);
  return journalPath;
}

function backupFile(consumerRoot: string, prompt: RequiredPrompt): string {
  const backup = backupPath(consumerRoot, prompt.targetRelativePath);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(prompt.path, backup);
  return backup;
}

interface FileSnapshot {
  path: string;
  existed: boolean;
  content?: Buffer;
}

function snapshotFile(filePath: string): FileSnapshot {
  if (!fs.existsSync(filePath)) return { path: filePath, existed: false };
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) return { path: filePath, existed: false };
  return { path: filePath, existed: true, content: fs.readFileSync(filePath) };
}

function restoreSnapshots(snapshots: FileSnapshot[]): void {
  for (const snapshot of [...snapshots].reverse()) {
    if (snapshot.existed && snapshot.content !== undefined) {
      fs.mkdirSync(path.dirname(snapshot.path), { recursive: true });
      fs.writeFileSync(snapshot.path, snapshot.content);
    } else if (!snapshot.existed && fs.existsSync(snapshot.path)) {
      const stat = fs.lstatSync(snapshot.path);
      if (stat.isFile() && !stat.isSymbolicLink()) fs.unlinkSync(snapshot.path);
    }
  }
}

function isCleanupPrompt(prompt: RequiredPrompt): boolean {
  return prompt.type === 'unmanaged-stale-hooks-json-cleanup';
}

function assertCleanBeforeWrite(write: PlannedWrite): void {
  if (!fs.existsSync(write.targetPath)) return;
  const stat = fs.lstatSync(write.targetPath);
  if (!stat.isFile()) throw new Error(`Target is not a file: ${write.targetRelativePath}`);
  if (write.expectedTargetChecksum) {
    const currentChecksum = sha256File(write.targetPath);
    if (currentChecksum !== write.expectedTargetChecksum) {
      throw new Error(`Target changed after planning: ${write.targetRelativePath}`);
    }
  }
}

function assertCleanBeforePrompt(prompt: RequiredPrompt): void {
  if (!prompt.expectedTargetChecksum || !fs.existsSync(prompt.path)) return;
  const stat = fs.lstatSync(prompt.path);
  if (!stat.isFile()) throw new Error(`Prompt target is not a file: ${prompt.targetRelativePath}`);
  const currentChecksum = sha256File(prompt.path);
  if (currentChecksum !== prompt.expectedTargetChecksum) {
    throw new Error(`Prompt target changed after planning: ${prompt.targetRelativePath}`);
  }
}

function assertCleanBeforeRemoval(removal: PlannedRemoval): void {
  if (!fs.existsSync(removal.targetPath)) return;
  const stat = fs.lstatSync(removal.targetPath);
  if (!stat.isFile()) throw new Error(`Managed target is not a file: ${removal.targetRelativePath}`);
  const currentChecksum = sha256File(removal.targetPath);
  if (currentChecksum !== removal.previous.installedChecksum) {
    throw new Error(`Managed target changed after planning: ${removal.targetRelativePath}`);
  }
}

export async function applyInstallPlan(plan: InstallPlan, options: ApplyOptions): Promise<ApplyResult> {
  const blocking = options.yes || !options.interactive
    ? plan.collisions
    : blockingCollisions(plan.collisions, plan.prompts);
  if (blocking.length > 0) {
    throw new Error(`Install plan has blockers:\n${blocking.map((collision) => `- ${collision.message}`).join('\n')}`);
  }

  const backedUp: string[] = [];
  const approvedCleanupPrompts: RequiredPrompt[] = [];
  if (plan.prompts.length > 0) {
    if (!options.interactive || options.yes) {
      throw new Error('Overwriting or cleaning existing files requires interactive confirmation; --yes cannot approve these changes.');
    }
    for (const prompt of plan.prompts) {
      const approved = await options.approveOverwrite?.(prompt);
      if (!approved) throw new Error(`Cancelled overwrite for ${prompt.targetRelativePath}`);
      assertCleanBeforePrompt(prompt);
      backedUp.push(backupFile(plan.consumerRoot, prompt));
      if (isCleanupPrompt(prompt)) approvedCleanupPrompts.push(prompt);
    }
  }

  const promptableCollisions = plan.collisions.filter((collision) => isPromptableCollision(collision, plan.prompts));
  if (promptableCollisions.length > plan.prompts.length) {
    throw new Error('Internal error: promptable collision count does not match overwrite prompts.');
  }

  for (const write of plan.writes) assertCleanBeforeWrite(write);
  for (const removal of plan.removals) assertCleanBeforeRemoval(removal);

  const snapshots = new Map<string, FileSnapshot>();
  const capture = (filePath: string) => {
    if (!snapshots.has(filePath)) snapshots.set(filePath, snapshotFile(filePath));
  };
  for (const write of plan.writes) capture(write.targetPath);
  if (plan.nextSettings !== undefined && plan.settingsChanged) capture(path.join(plan.consumerRoot, plan.claudeSettingsPath));
  if (plan.nextInstallSettings !== undefined && plan.installSettingsChanged && plan.installSettingsPath) capture(plan.installSettingsPath);
  for (const removal of plan.removals) capture(removal.targetPath);
  for (const prompt of approvedCleanupPrompts) capture(prompt.path);
  capture(plan.manifestPath);

  let migrationJournalPath: string | undefined;
  const written: string[] = [];
  const removed: string[] = [];
  const warnings: string[] = [];
  let settingsWritten = false;
  let installSettingsWritten = false;

  const writeManifest = () => {
    writeFileAtomic(plan.manifestPath, `${JSON.stringify(plan.nextManifest, null, 2)}\n`);
  };

  try {
    migrationJournalPath = writeMigrationJournal(plan);
    for (const write of plan.writes) {
      writeFileAtomic(write.targetPath, write.content, write.installedChecksum);
      written.push(write.targetRelativePath);
    }

    if (plan.nextSettings !== undefined && plan.settingsChanged) {
      writeFileAtomic(path.join(plan.consumerRoot, plan.claudeSettingsPath), `${JSON.stringify(plan.nextSettings, null, 2)}\n`);
      settingsWritten = true;
    }

    if (plan.nextInstallSettings !== undefined && plan.installSettingsChanged) {
      if (!plan.installSettingsPath) throw new Error('Install settings path is missing from plan.');
      writeFileAtomic(plan.installSettingsPath, `${JSON.stringify(plan.nextInstallSettings, null, 2)}\n`);
      installSettingsWritten = true;
    }

    if (plan.migration) writeManifest();

    for (const removal of plan.removals) {
      try {
        if (fs.existsSync(removal.targetPath)) {
          fs.unlinkSync(removal.targetPath);
          removed.push(removal.targetRelativePath);
        }
      } catch (err) {
        if (!plan.migration) throw err;
        warnings.push(`Cleanup failed for old managed file ${removal.targetRelativePath}: ${(err as Error).message}`);
      }
    }
    for (const prompt of approvedCleanupPrompts) {
      assertCleanBeforePrompt(prompt);
      if (fs.existsSync(prompt.path)) {
        fs.unlinkSync(prompt.path);
        removed.push(prompt.targetRelativePath);
      }
    }

    if (!plan.migration) writeManifest();
  } catch (err) {
    restoreSnapshots([...snapshots.values()]);
    if (migrationJournalPath && fs.existsSync(migrationJournalPath)) {
      fs.unlinkSync(migrationJournalPath);
    }
    throw err;
  }

  return {
    written,
    removed,
    backedUp,
    manifestPath: plan.manifestPath,
    settingsWritten,
    installSettingsWritten,
    migrationJournalPath,
    warnings,
  };
}

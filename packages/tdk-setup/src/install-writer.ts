import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { sha256Buffer, sha256File } from './checksum';
import { blockingCollisions, isPromptableCollision } from './collisions';
import {
  backupTargetPath,
  ensureInstallPlanOperationStamp,
  harnessAllowedRoots,
  migrationJournalTargetPath,
  validateHarnessTargetPath,
  validateInstallPlanTargets,
} from './target-path-safety';
import type { ApplyOptions, ApplyResult, InstallPlan, PlannedRemoval, PlannedWrite, RequiredPrompt } from './types';

function validateMutationTarget(plan: InstallPlan, targetPath: string, label: string): string {
  return validateHarnessTargetPath({
    consumerRoot: plan.consumerRoot,
    targetPath,
    allowedRoots: harnessAllowedRoots(plan.consumerRoot, plan.harness),
    label,
  });
}

function validateTemporaryMutationTarget(plan: InstallPlan, target: string, temporaryTarget: string, label: string): void {
  validateMutationTarget(plan, target, label);
  validateHarnessTargetPath({
    consumerRoot: plan.consumerRoot,
    targetPath: temporaryTarget,
    allowedRoots: harnessAllowedRoots(plan.consumerRoot, plan.harness),
    trustedInternalPaths: [temporaryTarget],
    label: `${label} temp file`,
  });
}

function writeFileAtomic(
  plan: InstallPlan,
  target: string,
  data: Buffer | string,
  label: string,
  transaction: InstallTransaction,
  expectedPreimage: FileSnapshot,
  expectedChecksum?: string,
): void {
  validateMutationTarget(plan, target, label);
  const directory = path.dirname(target);
  const firstCreatedDirectory = fs.mkdirSync(directory, { recursive: true });
  recordCreatedDirectories(directory, firstCreatedDirectory, transaction);
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
  const payloadChecksum = sha256Buffer(payload);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`;
  let fd: number | undefined;
  let payloadMode: number | undefined;
  try {
    validateTemporaryMutationTarget(plan, target, tmp, label);
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, payload);
    fs.fsyncSync(fd);
    payloadMode = fs.fstatSync(fd).mode & 0o7777;
    fs.closeSync(fd);
    fd = undefined;
    assertMatchesSnapshot(plan, expectedPreimage, label);
    validateTemporaryMutationTarget(plan, target, tmp, label);
    fs.renameSync(tmp, target);
    recordPublishedFile(transaction, target, payloadChecksum, payloadMode);
    const expected = expectedChecksum ?? payloadChecksum;
    const installed = sha256File(target);
    if (installed !== expected) throw new Error(`Checksum mismatch after writing ${target}`);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(tmp)) {
      validateTemporaryMutationTarget(plan, target, tmp, label);
      fs.unlinkSync(tmp);
    }
  }
}

function writeMigrationJournal(
  plan: InstallPlan,
  transaction: InstallTransaction,
  expectedPreimage: FileSnapshot,
): string | undefined {
  const journalPath = migrationJournalTargetPath(plan);
  if (!journalPath || !plan.migration) return undefined;
  writeFileAtomic(plan, journalPath, `${JSON.stringify({
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
  }, null, 2)}\n`, 'Migration journal', transaction, expectedPreimage);
  return journalPath;
}

type MutationPostState =
  | { state: 'absent' }
  | { state: 'file'; checksum: string; mode: number };

interface InstallTransaction {
  backupFiles: string[];
  createdDirectories: string[];
  postStates: Map<string, MutationPostState>;
}

function recordPublishedFile(
  transaction: InstallTransaction,
  targetPath: string,
  checksum: string,
  mode: number | undefined,
): void {
  if (mode === undefined) throw new Error(`Missing published file mode: ${targetPath}`);
  transaction.postStates.set(path.resolve(targetPath), { state: 'file', checksum, mode });
}

function recordPublishedRemoval(transaction: InstallTransaction, targetPath: string): void {
  transaction.postStates.set(path.resolve(targetPath), { state: 'absent' });
}

function assertBackupAvailable(plan: InstallPlan, prompt: RequiredPrompt): string {
  const backup = backupTargetPath(plan, prompt);
  validateMutationTarget(plan, backup, `Managed backup ${prompt.targetRelativePath}`);
  if (fs.existsSync(backup)) throw new Error(`Backup already exists: ${backup}`);
  return backup;
}

function pathsReferToSameLocation(left: string, right: string): boolean {
  const normalizedLeft = path.toNamespacedPath(path.resolve(left));
  const normalizedRight = path.toNamespacedPath(path.resolve(right));
  return path.relative(normalizedLeft, normalizedRight) === '';
}

function recordCreatedDirectories(
  directory: string,
  firstCreatedDirectory: string | undefined,
  transaction: InstallTransaction,
): void {
  if (!firstCreatedDirectory) return;
  const firstCreated = path.resolve(firstCreatedDirectory);
  let current = path.resolve(directory);
  const createdDirectories: string[] = [];
  while (true) {
    createdDirectories.push(current);
    if (pathsReferToSameLocation(current, firstCreated)) break;
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Directory creation escaped its target: ${directory}`);
    current = parent;
  }
  for (const createdDirectory of createdDirectories.reverse()) {
    if (!transaction.createdDirectories.includes(createdDirectory)) transaction.createdDirectories.push(createdDirectory);
  }
}

function backupFile(plan: InstallPlan, prompt: RequiredPrompt, transaction: InstallTransaction): void {
  const backup = assertBackupAvailable(plan, prompt);
  assertCleanBeforePrompt(plan, prompt);
  const backupDirectory = path.dirname(backup);
  const firstCreatedDirectory = fs.mkdirSync(backupDirectory, { recursive: true });
  recordCreatedDirectories(backupDirectory, firstCreatedDirectory, transaction);
  const temporary = `${backup}.tmp-${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`;
  try {
    validateTemporaryMutationTarget(plan, backup, temporary, `Managed backup ${prompt.targetRelativePath}`);
    assertCleanBeforePrompt(plan, prompt);
    fs.copyFileSync(prompt.path, temporary, fs.constants.COPYFILE_EXCL);
    validateTemporaryMutationTarget(plan, backup, temporary, `Managed backup ${prompt.targetRelativePath}`);
    fs.linkSync(temporary, backup);
    transaction.backupFiles.push(backup);
  } finally {
    if (fs.existsSync(temporary)) {
      validateTemporaryMutationTarget(plan, backup, temporary, `Managed backup ${prompt.targetRelativePath}`);
      fs.unlinkSync(temporary);
    }
  }
}

type FileSnapshot =
  | { path: string; state: 'absent' }
  | { path: string; state: 'file'; content: Buffer; mode: number };

function snapshotFile(filePath: string): FileSnapshot {
  if (!fs.existsSync(filePath)) return { path: filePath, state: 'absent' };
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: filePath, state: 'absent' };
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Cannot capture expected preimage for non-regular file: ${filePath}`);
  }
  return {
    path: filePath,
    state: 'file',
    content: fs.readFileSync(filePath),
    mode: stat.mode & 0o7777,
  };
}

function assertMatchesSnapshot(plan: InstallPlan, snapshot: FileSnapshot, label: string): void {
  let stat: fs.Stats | undefined;
  try {
    stat = fs.lstatSync(snapshot.path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  validateMutationTarget(plan, snapshot.path, label);
  if (snapshot.state === 'absent') {
    if (stat === undefined) return;
    throw new Error(`${label} changed after transaction start/planning: ${snapshot.path} was created`);
  }
  if (stat === undefined) {
    throw new Error(`${label} changed after transaction start/planning: ${snapshot.path} was removed`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} changed after transaction start/planning: ${snapshot.path} is no longer a regular file`);
  }
  if ((stat.mode & 0o7777) !== snapshot.mode) {
    throw new Error(`${label} changed after transaction start/planning: ${snapshot.path} mode changed`);
  }
  if (!fs.readFileSync(snapshot.path).equals(snapshot.content)) {
    throw new Error(`${label} changed after transaction start/planning: ${snapshot.path} bytes changed`);
  }
}

function matchesPostState(targetPath: string, postState: MutationPostState): boolean {
  let stat: fs.Stats | undefined;
  try {
    stat = fs.lstatSync(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (postState.state === 'absent') return stat === undefined;
  return stat !== undefined
    && stat.isFile()
    && !stat.isSymbolicLink()
    && (stat.mode & 0o7777) === postState.mode
    && sha256File(targetPath) === postState.checksum;
}

function restoreSnapshots(plan: InstallPlan, snapshots: FileSnapshot[], transaction: InstallTransaction): string[] {
  const preservedTargets: string[] = [];
  for (const snapshot of [...snapshots].reverse()) {
    const postState = transaction.postStates.get(path.resolve(snapshot.path));
    if (!postState) continue;
    if (!matchesPostState(snapshot.path, postState)) {
      preservedTargets.push(snapshot.path);
      continue;
    }
    if (snapshot.state === 'file') {
      validateMutationTarget(plan, snapshot.path, 'Install rollback target');
      fs.mkdirSync(path.dirname(snapshot.path), { recursive: true });
      validateMutationTarget(plan, snapshot.path, 'Install rollback target');
      fs.writeFileSync(snapshot.path, snapshot.content);
      fs.chmodSync(snapshot.path, snapshot.mode);
    } else {
      validateMutationTarget(plan, snapshot.path, 'Install rollback target');
      fs.unlinkSync(snapshot.path);
    }
  }
  return preservedTargets;
}

function isCleanupPrompt(prompt: RequiredPrompt): boolean {
  return prompt.type === 'unmanaged-stale-hooks-json-cleanup';
}

function assertCleanBeforeWrite(plan: InstallPlan, write: PlannedWrite): void {
  validateMutationTarget(plan, write.targetPath, `Managed write ${write.targetRelativePath}`);
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

function assertCleanBeforePrompt(plan: InstallPlan, prompt: RequiredPrompt): void {
  validateMutationTarget(plan, prompt.path, `Managed prompt target ${prompt.targetRelativePath}`);
  if (!prompt.expectedTargetChecksum || !fs.existsSync(prompt.path)) return;
  const stat = fs.lstatSync(prompt.path);
  if (!stat.isFile()) throw new Error(`Prompt target is not a file: ${prompt.targetRelativePath}`);
  const currentChecksum = sha256File(prompt.path);
  if (currentChecksum !== prompt.expectedTargetChecksum) {
    throw new Error(`Prompt target changed after planning: ${prompt.targetRelativePath}`);
  }
}

function assertCleanBeforeRemoval(plan: InstallPlan, removal: PlannedRemoval, finalCheck = false): void {
  validateMutationTarget(plan, removal.targetPath, `Managed removal ${removal.targetRelativePath}`);
  let stat: fs.Stats;
  if (finalCheck) {
    try {
      stat = fs.lstatSync(removal.targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  } else {
    if (!fs.existsSync(removal.targetPath)) return;
    stat = fs.lstatSync(removal.targetPath);
  }
  if (!stat.isFile()) throw new Error(`Managed target is not a file: ${removal.targetRelativePath}`);
  const currentChecksum = sha256File(removal.targetPath);
  if (currentChecksum !== removal.previous.installedChecksum) {
    throw new Error(`Managed target changed after planning: ${removal.targetRelativePath}`);
  }
}

function removeBackupFiles(plan: InstallPlan, transaction: InstallTransaction): void {
  for (const backup of [...transaction.backupFiles].reverse()) {
    if (!fs.existsSync(backup)) continue;
    validateMutationTarget(plan, backup, 'Install rollback backup');
    const stat = fs.lstatSync(backup);
    if (stat.isFile() && !stat.isSymbolicLink()) fs.unlinkSync(backup);
  }
}

function removeCreatedDirectories(plan: InstallPlan, transaction: InstallTransaction): void {
  for (const directory of [...transaction.createdDirectories].reverse()) {
    if (!fs.existsSync(directory)) continue;
    validateHarnessTargetPath({
      consumerRoot: plan.consumerRoot,
      targetPath: directory,
      allowedRoots: harnessAllowedRoots(plan.consumerRoot, plan.harness),
      trustedInternalPaths: [directory],
      label: 'Install rollback created directory',
    });
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    try {
      fs.rmdirSync(directory);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTEMPTY') throw error;
    }
  }
}

export async function applyInstallPlan(plan: InstallPlan, options: ApplyOptions): Promise<ApplyResult> {
  ensureInstallPlanOperationStamp(plan);
  validateInstallPlanTargets(plan);
  const blocking = options.yes || !options.interactive
    ? plan.collisions
    : blockingCollisions(plan.collisions, plan.prompts);
  if (blocking.length > 0) {
    throw new Error(`Install plan has blockers:\n${blocking.map((collision) => `- ${collision.message}`).join('\n')}`);
  }

  const promptableCollisions = plan.collisions.filter((collision) => isPromptableCollision(collision, plan.prompts));
  if (promptableCollisions.length > plan.prompts.length) {
    throw new Error('Internal error: promptable collision count does not match overwrite prompts.');
  }

  if (plan.prompts.length > 0) {
    if (!options.interactive || options.yes) {
      throw new Error('Overwriting or cleaning existing files requires interactive confirmation; --yes cannot approve these changes.');
    }
    for (const prompt of plan.prompts) {
      const approved = await options.approveOverwrite?.(prompt);
      if (!approved) throw new Error(`Cancelled overwrite for ${prompt.targetRelativePath}`);
    }
  }

  validateInstallPlanTargets(plan);
  for (const prompt of plan.prompts) {
    assertCleanBeforePrompt(plan, prompt);
    assertBackupAvailable(plan, prompt);
  }
  for (const write of plan.writes) assertCleanBeforeWrite(plan, write);
  for (const removal of plan.removals) assertCleanBeforeRemoval(plan, removal);

  const approvedCleanupPrompts = plan.prompts.filter(isCleanupPrompt);
  const snapshots = new Map<string, FileSnapshot>();
  const capture = (filePath: string): FileSnapshot => {
    const existing = snapshots.get(filePath);
    if (existing) return existing;
    validateMutationTarget(plan, filePath, 'Install expected preimage');
    const snapshot = snapshotFile(filePath);
    snapshots.set(filePath, snapshot);
    return snapshot;
  };
  const expectedPreimage = (filePath: string): FileSnapshot => {
    const snapshot = snapshots.get(filePath);
    if (!snapshot) throw new Error(`Missing expected preimage: ${filePath}`);
    return snapshot;
  };
  for (const write of plan.writes) capture(write.targetPath);
  if (plan.nextSettings !== undefined && plan.settingsChanged) capture(path.join(plan.consumerRoot, plan.claudeSettingsPath));
  if (plan.nextInstallSettings !== undefined && plan.installSettingsChanged && plan.installSettingsPath) capture(plan.installSettingsPath);
  for (const removal of plan.removals) capture(removal.targetPath);
  for (const prompt of approvedCleanupPrompts) capture(prompt.path);
  capture(plan.manifestPath);
  const plannedJournalPath = migrationJournalTargetPath(plan);
  if (plannedJournalPath) capture(plannedJournalPath);

  const transaction: InstallTransaction = {
    backupFiles: [],
    createdDirectories: [],
    postStates: new Map<string, MutationPostState>(),
  };
  let migrationJournalPath: string | undefined;
  const written: string[] = [];
  const removed: string[] = [];
  const warnings: string[] = [];
  let settingsWritten = false;
  let installSettingsWritten = false;

  const writeManifest = () => {
    writeFileAtomic(
      plan,
      plan.manifestPath,
      `${JSON.stringify(plan.nextManifest, null, 2)}\n`,
      'Ownership manifest',
      transaction,
      expectedPreimage(plan.manifestPath),
    );
  };

  try {
    for (const prompt of plan.prompts) backupFile(plan, prompt, transaction);
    if (plannedJournalPath) {
      migrationJournalPath = writeMigrationJournal(plan, transaction, expectedPreimage(plannedJournalPath));
    }
    for (const write of plan.writes) {
      assertCleanBeforeWrite(plan, write);
      writeFileAtomic(
        plan,
        write.targetPath,
        write.content,
        `Managed write ${write.targetRelativePath}`,
        transaction,
        expectedPreimage(write.targetPath),
        write.installedChecksum,
      );
      written.push(write.targetRelativePath);
    }

    if (plan.nextSettings !== undefined && plan.settingsChanged) {
      writeFileAtomic(
        plan,
        path.join(plan.consumerRoot, plan.claudeSettingsPath),
        `${JSON.stringify(plan.nextSettings, null, 2)}\n`,
        'Harness settings',
        transaction,
        expectedPreimage(path.join(plan.consumerRoot, plan.claudeSettingsPath)),
      );
      settingsWritten = true;
    }

    if (plan.nextInstallSettings !== undefined && plan.installSettingsChanged) {
      if (!plan.installSettingsPath) throw new Error('Install settings path is missing from plan.');
      writeFileAtomic(
        plan,
        plan.installSettingsPath,
        `${JSON.stringify(plan.nextInstallSettings, null, 2)}\n`,
        'Install settings',
        transaction,
        expectedPreimage(plan.installSettingsPath),
      );
      installSettingsWritten = true;
    }

    if (plan.migration) writeManifest();

    for (const removal of plan.removals) {
      try {
        assertCleanBeforeRemoval(plan, removal, true);
        if (fs.existsSync(removal.targetPath)) {
          validateMutationTarget(plan, removal.targetPath, `Managed removal ${removal.targetRelativePath}`);
          fs.unlinkSync(removal.targetPath);
          recordPublishedRemoval(transaction, removal.targetPath);
          removed.push(removal.targetRelativePath);
        }
      } catch (err) {
        if (!plan.migration) throw err;
        warnings.push(`Cleanup failed for old managed file ${removal.targetRelativePath}: ${(err as Error).message}`);
      }
    }
    for (const prompt of approvedCleanupPrompts) {
      assertCleanBeforePrompt(plan, prompt);
      if (fs.existsSync(prompt.path)) {
        validateMutationTarget(plan, prompt.path, `Managed prompt target ${prompt.targetRelativePath}`);
        fs.unlinkSync(prompt.path);
        recordPublishedRemoval(transaction, prompt.path);
        removed.push(prompt.targetRelativePath);
      }
    }

    if (!plan.migration) writeManifest();
  } catch (err) {
    let preservedTargets: string[] = [];
    try {
      preservedTargets = restoreSnapshots(plan, [...snapshots.values()], transaction);
    } finally {
      removeBackupFiles(plan, transaction);
      removeCreatedDirectories(plan, transaction);
    }
    if (preservedTargets.length > 0) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${message}\nRollback preserved targets changed after installer publication: ${preservedTargets.join(', ')}`);
    }
    throw err;
  }

  return {
    written,
    removed,
    backedUp: transaction.backupFiles,
    manifestPath: plan.manifestPath,
    settingsWritten,
    installSettingsWritten,
    migrationJournalPath,
    warnings,
  };
}

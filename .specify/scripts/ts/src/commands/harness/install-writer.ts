import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256File } from './checksum';
import { blockingCollisions, isPromptableCollision } from './collisions';
import { manifestPathFor, saveHarnessManifest } from './manifest-store';
import type { ApplyOptions, ApplyResult, InstallPlan, PlannedRemoval, PlannedWrite, RequiredPrompt } from './types';

function writeFileAtomic(target: string, data: Buffer | string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, target);
}

function backupPath(consumerRoot: string, targetRelativePath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(consumerRoot, '.specify', 'state', 'harness-install', 'backups', stamp, targetRelativePath);
}

function backupFile(consumerRoot: string, prompt: RequiredPrompt): string {
  const backup = backupPath(consumerRoot, prompt.targetRelativePath);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(prompt.path, backup);
  return backup;
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

  const written: string[] = [];
  for (const write of plan.writes) {
    writeFileAtomic(write.targetPath, fs.readFileSync(write.sourcePath));
    const installed = sha256File(write.targetPath);
    if (installed !== write.sourceChecksum) {
      throw new Error(`Checksum mismatch after writing ${write.targetRelativePath}`);
    }
    written.push(write.targetRelativePath);
  }

  const removed: string[] = [];
  let settingsWritten = false;
  if (plan.nextSettings !== undefined && plan.settingsChanged) {
    const settingsPath = path.join(plan.consumerRoot, '.claude', 'settings.json');
    writeFileAtomic(settingsPath, `${JSON.stringify(plan.nextSettings, null, 2)}\n`);
    settingsWritten = true;
  }

  for (const removal of plan.removals) {
    if (fs.existsSync(removal.targetPath)) {
      fs.unlinkSync(removal.targetPath);
      removed.push(removal.targetRelativePath);
    }
  }
  for (const prompt of approvedCleanupPrompts) {
    assertCleanBeforePrompt(prompt);
    if (fs.existsSync(prompt.path)) {
      fs.unlinkSync(prompt.path);
      removed.push(prompt.targetRelativePath);
    }
  }

  saveHarnessManifest(plan.consumerRoot, plan.nextManifest);

  return {
    written,
    removed,
    backedUp,
    manifestPath: manifestPathFor(plan.consumerRoot),
    settingsWritten,
  };
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InstallPlan, RequiredPrompt } from './types';

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function canonicalPathFromRoot(rootInput: string, rootReal: string, inputPath: string, label: string): string {
  const requested = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(rootInput, inputPath);
  if (!isInside(rootInput, requested)) throw new Error(`${label} escapes consumer root: ${inputPath}`);
  return path.resolve(rootReal, path.relative(rootInput, requested));
}

export function validateHarnessTargetPath(input: {
  consumerRoot: string;
  targetPath: string;
  allowedRoots: string[];
  label: string;
  trustedInternalPaths?: string[];
}): string {
  const rootInput = path.resolve(input.consumerRoot);
  const rootReal = fs.realpathSync(rootInput);
  const targetPath = canonicalPathFromRoot(rootInput, rootReal, input.targetPath, input.label);
  const allowedRoots = input.allowedRoots.map((allowedRoot) =>
    canonicalPathFromRoot(rootInput, rootReal, path.isAbsolute(allowedRoot) ? allowedRoot : path.join(rootInput, allowedRoot), input.label));
  const trustedInternalPaths = (input.trustedInternalPaths ?? []).map((trustedPath) =>
    canonicalPathFromRoot(rootInput, rootReal, trustedPath, input.label));
  if (!allowedRoots.some((allowedRoot) => isInside(allowedRoot, targetPath)) && !trustedInternalPaths.includes(targetPath)) {
    throw new Error(`${input.label} is outside allowed harness roots: ${input.targetPath}`);
  }

  const relative = path.relative(rootReal, targetPath);
  let current = rootReal;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`${input.label} has symlinked ancestor: ${current}`);
    }
  }
  return targetPath;
}

export function harnessAllowedRoots(consumerRoot: string, harness: InstallPlan['harness']): string[] {
  const stateRoot = path.join(consumerRoot, '.specify', 'state', 'harness-install');
  const installSettingsPath = path.join(consumerRoot, '.specify', 'install-settings.json');
  return harness === 'claude'
    ? [path.join(consumerRoot, '.claude'), stateRoot, installSettingsPath]
    : [path.join(consumerRoot, '.agents'), path.join(consumerRoot, '.codex'), stateRoot, installSettingsPath];
}

export function ensureInstallPlanOperationStamp(plan: InstallPlan): string {
  if (!plan.operationStamp) plan.operationStamp = new Date().toISOString().replace(/[:.]/g, '-');
  return plan.operationStamp;
}

export function backupTargetPath(plan: InstallPlan, prompt: RequiredPrompt): string {
  const stamp = ensureInstallPlanOperationStamp(plan);
  return path.join(plan.consumerRoot, '.specify', 'state', 'harness-install', 'backups', stamp, prompt.targetRelativePath);
}

export function migrationJournalTargetPath(plan: InstallPlan): string | undefined {
  if (!plan.migration) return undefined;
  const stamp = ensureInstallPlanOperationStamp(plan);
  return path.join(plan.consumerRoot, '.specify', 'state', 'harness-install', 'migrations', `claude-prefix-${stamp}.json`);
}

export function validateInstallPlanTargets(plan: InstallPlan): void {
  const allowedRoots = harnessAllowedRoots(plan.consumerRoot, plan.harness);
  const mutatedTargets = new Map<string, string>();
  const validate = (targetPath: string, label: string): string => (
    validateHarnessTargetPath({ consumerRoot: plan.consumerRoot, targetPath, allowedRoots, label })
  );
  const validateMutation = (targetPath: string, label: string): void => {
    const canonicalTarget = validate(targetPath, label);
    const previousLabel = mutatedTargets.get(canonicalTarget);
    if (previousLabel) {
      throw new Error(`Install plan mutates canonical target more than once: ${previousLabel}; ${label}`);
    }
    mutatedTargets.set(canonicalTarget, label);
  };

  for (const write of plan.writes) validateMutation(write.targetPath, `Managed write ${write.targetRelativePath}`);
  for (const removal of plan.removals) validateMutation(removal.targetPath, `Managed removal ${removal.targetRelativePath}`);
  for (const prompt of plan.prompts) {
    validate(prompt.path, `Managed prompt target ${prompt.targetRelativePath}`);
    validateMutation(backupTargetPath(plan, prompt), `Managed backup ${prompt.targetRelativePath}`);
  }
  if (plan.nextSettings !== undefined && plan.settingsChanged) {
    validateMutation(path.join(plan.consumerRoot, plan.claudeSettingsPath), 'Harness settings');
  }
  if (plan.nextInstallSettings !== undefined && plan.installSettingsChanged && plan.installSettingsPath) {
    validateMutation(plan.installSettingsPath, 'Install settings');
  }
  validateMutation(plan.manifestPath, 'Ownership manifest');
  const journalPath = migrationJournalTargetPath(plan);
  if (journalPath) validateMutation(journalPath, 'Migration journal');
}

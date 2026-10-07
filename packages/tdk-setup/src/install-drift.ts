import { isPromptableCollision } from './collisions';
import type { HarnessInstallManifest, InstallPlan } from './types';

interface StaleItem {
  path: string;
  reason: string;
}

/** Compare projected bytes, not the presence of managed update writes. */
export function claudeInstallIsStale(plan: InstallPlan, previous: HarnessInstallManifest): StaleItem[] {
  const previousByTarget = new Map(previous.managedFiles.map((file) => [file.targetRelativePath, file]));
  const items: StaleItem[] = [];

  for (const write of plan.writes) {
    const old = previousByTarget.get(write.targetRelativePath);
    if (write.action === 'create') {
      items.push({ path: write.targetRelativePath, reason: 'missing target' });
    } else if (!old) {
      items.push({ path: write.targetRelativePath, reason: 'unmanaged target differs from payload' });
    } else if (write.installedChecksum !== old.installedChecksum) {
      items.push({ path: write.targetRelativePath, reason: 'payload changed' });
    }
  }

  for (const removal of plan.removals) {
    items.push({ path: removal.targetRelativePath, reason: 'no longer in selected payload; removal required' });
  }
  for (const mutation of plan.hookMutations) {
    items.push({
      path: plan.claudeSettingsPath,
      reason: `hook ${mutation.action}: ${mutation.hook.plugin} ${mutation.hook.event}:${mutation.hook.matcher}`,
    });
  }
  if (plan.settingsChanged) {
    items.push({ path: plan.claudeSettingsPath, reason: 'hook settings differ from payload' });
  }
  for (const collision of plan.collisions) {
    if ((collision.kind === 'managed-drift' || collision.kind === 'unmanaged-target-exists')
      && isPromptableCollision(collision, plan.prompts)) continue;
    items.push({ path: collision.path ?? plan.claudeSettingsPath, reason: `${collision.kind}: ${collision.message}` });
  }
  return items;
}

/** User-only edits are informational when the desired installed bytes did not change. */
export function claudeInstallLocalModifications(plan: InstallPlan, previous: HarnessInstallManifest): string[] {
  const previousByTarget = new Map(previous.managedFiles.map((file) => [file.targetRelativePath, file]));
  return plan.writes.filter((write) => {
    const old = previousByTarget.get(write.targetRelativePath);
    return old !== undefined
      && write.expectedTargetChecksum !== undefined
      && write.expectedTargetChecksum !== old.installedChecksum
      && write.installedChecksum === old.installedChecksum;
  }).map((write) => write.targetRelativePath);
}

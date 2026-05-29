import type { ApplyResult, InstallPlan } from './types';

export function renderInstallPlan(plan: InstallPlan): string {
  const lines: string[] = [];
  lines.push(`Harness install plan: ${plan.selectedPlugins.join(', ') || '(none)'}`);
  lines.push(`Writes: ${plan.writes.length}`);
  for (const write of plan.writes) {
    lines.push(`  ${write.action}: ${write.targetRelativePath}`);
  }
  lines.push(`Removals: ${plan.removals.length}`);
  for (const removal of plan.removals) {
    lines.push(`  remove: ${removal.targetRelativePath}`);
  }
  lines.push(`Hook mutations: ${plan.hookMutations.length}`);
  for (const mutation of plan.hookMutations) {
    lines.push(`  ${mutation.action}: ${mutation.hook.event} ${mutation.hook.matcher}`);
  }
  lines.push(`Manifest: ${plan.nextManifest.managedFiles.length} managed files, ${plan.nextManifest.managedHooks.length} managed hooks`);

  if (plan.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of plan.warnings) lines.push(`  - ${warning}`);
  }
  if (plan.collisions.length > 0) {
    lines.push('Blockers:');
    for (const collision of plan.collisions) lines.push(`  - ${collision.message}`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderApplyResult(result: ApplyResult): string {
  return [
    'Harness install applied.',
    `Written: ${result.written.length}`,
    `Removed: ${result.removed.length}`,
    `Backups: ${result.backedUp.length}`,
    `Settings updated: ${result.settingsWritten ? 'yes' : 'no'}`,
    `Manifest: ${result.manifestPath}`,
  ].join('\n') + '\n';
}

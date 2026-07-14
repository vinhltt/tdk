import type { ApplyResult, InstallPlan } from './types';
import { blockingCollisions } from './collisions';

export function renderInstallPlan(plan: InstallPlan, requestedOptionalPlugins: string[] = []): string {
  const lines: string[] = [];
  const blockers = blockingCollisions(plan.collisions, plan.prompts);
  lines.push(`Requested optional plugins: ${requestedOptionalPlugins.join(', ') || '(none)'}`);
  lines.push(`Resolved plugins: ${plan.selectedPlugins.join(', ') || '(none)'}`);
  lines.push(`Target dir: ${plan.targetDir}`);
  lines.push(`${plan.harness === 'codex' ? 'Codex config' : 'Claude settings'}: ${plan.claudeSettingsPath}`);
  lines.push(`Manifest: ${plan.manifestPath}`);
  if (plan.installSettingsPath) lines.push(`Install settings: ${plan.installSettingsPath}`);
  if (plan.migration) lines.push(`Prefix migration: ${plan.migration.fromPrefix} -> ${plan.migration.toPrefix}`);
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
  if (plan.prompts.length > 0) {
    lines.push('Prompts:');
    for (const prompt of plan.prompts) {
      const action = prompt.type === 'unmanaged-stale-hooks-json-cleanup' ? 'cleanup' : 'overwrite';
      lines.push(`  - ${action}: ${prompt.targetRelativePath}`);
    }
  }
  if (blockers.length > 0) {
    lines.push('Blockers:');
    for (const collision of blockers) lines.push(`  - ${collision.message}`);
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
    `Install settings updated: ${result.installSettingsWritten ? 'yes' : 'no'}`,
    `Manifest: ${result.manifestPath}`,
    ...(result.migrationJournalPath ? [`Migration journal: ${result.migrationJournalPath}`] : []),
    ...(result.warnings.length > 0 ? ['Warnings:', ...result.warnings.map((warning) => `  - ${warning}`)] : []),
  ].join('\n') + '\n';
}

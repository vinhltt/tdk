import type { FlatClaudeInventory, MigrationReport, UnrecognizedEntry } from './flat-claude-types';

function recordPaths(inventory: FlatClaudeInventory): string[] {
  const paths = new Set<string>();
  for (const record of inventory.records) {
    paths.add(record.sourceRelativePath);
    if (record.kind === 'skill' || record.kind === 'hooks') {
      for (const file of record.files) paths.add(file.sourceRelativePath);
    }
  }
  return [...paths].sort();
}

export function buildMigrationReport(
  inventory: FlatClaudeInventory,
  skipped: UnrecognizedEntry[] = [],
): MigrationReport {
  return {
    recognized: recordPaths(inventory),
    reported: inventory.unrecognized.map((entry) => ({ path: entry.path, reason: entry.reason })),
    skipped: skipped.map((entry) => ({ path: entry.path, reason: entry.reason })),
    warnings: inventory.warnings,
  };
}

export function renderMigrationReport(report: MigrationReport): string {
  const lines = [
    'Flat Claude migration report',
    `Recognized: ${report.recognized.length}`,
    `Reported unknown: ${report.reported.length}`,
    `Skipped: ${report.skipped.length}`,
  ];
  if (report.reported.length > 0) {
    lines.push('Reported unknown entries:');
    for (const entry of report.reported) lines.push(`  - ${entry.path}: ${entry.reason}`);
  }
  if (report.skipped.length > 0) {
    lines.push('Skipped entries:');
    for (const entry of report.skipped) lines.push(`  - ${entry.path}: ${entry.reason}`);
  }
  if (report.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of report.warnings) lines.push(`  - ${warning}`);
  }
  return `${lines.join('\n')}\n`;
}

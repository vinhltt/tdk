// CLI: update-phase-status — update a phase's status in plan.md ## Phases table
// Usage: bun src/commands/util/update-phase-status.ts <plan-path> <phase-number> <status>

import { readFileSync, writeFileSync } from 'node:fs';
import { type PhaseStatus, parsePhasesTable, updatePhaseStatus, VALID_STATUSES } from './phases-table-parser';

const [filePath, phaseNumStr, status] = process.argv.slice(2);

if (!filePath || !phaseNumStr || !status) {
  console.error('Usage: bun update-phase-status.ts <plan-path> <phase-number> <status>');
  console.error(`Valid statuses: ${[...VALID_STATUSES].join(', ')}`);
  process.exit(1);
}

const phaseNumber = parseInt(phaseNumStr, 10);
if (isNaN(phaseNumber)) {
  console.error(`✗ invalid phase number '${phaseNumStr}'`);
  process.exit(1);
}

if (!VALID_STATUSES.has(status)) {
  console.error(`✗ invalid status '${status}'. Valid: ${[...VALID_STATUSES].join(', ')}`);
  process.exit(1);
}

let md: string;
try {
  md = readFileSync(filePath, 'utf-8');
} catch {
  console.error(`✗ cannot read '${filePath}'`);
  process.exit(1);
}

// Legacy format gate: parser silently normalizes legacy vocab — detect by comparing raw vs parsed
const result = parsePhasesTable(md);
if (result.errors.length > 0) {
  for (const err of result.errors) console.error(`error line ${err.line}: ${err.message}`);
  process.exit(1);
}

const lines = md.split('\n');
const legacyRows: string[] = [];
for (const row of result.phases) {
  const rawCells = (lines[row.rowLineNumber - 1] ?? '').split('|').slice(1, -1).map(s => s.trim());
  const rawStatus = rawCells[2];
  if (rawStatus && rawStatus !== row.status) {
    legacyRows.push(`  line ${row.rowLineNumber}: '${rawStatus}' → should be '${row.status}'`);
  }
}
if (legacyRows.length > 0) {
  console.error(`Legacy format detected in ${filePath}. Fix manually before updating:\n${legacyRows.join('\n')}`);
  process.exit(1);
}

try {
  const updated = updatePhaseStatus(md, phaseNumber, status as PhaseStatus);
  if (updated === md) {
    console.log(`— phase ${String(phaseNumber).padStart(2, '0')} already ${status}`);
  } else {
    writeFileSync(filePath, updated, 'utf-8');
    console.log(`✓ phase ${String(phaseNumber).padStart(2, '0')} → ${status}`);
  }
} catch (err) {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
}

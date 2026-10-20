// CLI: update-phase-status — update a phase's status in plan.md ## Phases table, then keep the
// plan root and sibling spec.md lifecycle status in sync with the derived value.
// Usage: bun src/commands/util/update-phase-status.ts <plan-path> <phase-number> <status>
//        bun src/commands/util/update-phase-status.ts --reconcile-root <plan-path>

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type PhaseStatus, parsePhasesTable, VALID_STATUSES } from './phases-table-parser';
import {
  type LifecycleStatus,
  normalizeLifecycleStatus,
  readFrontmatterStatus,
  renderPlanStatuses,
  renderSpecLifecycleStatus,
} from './plan-root-status';

const args = process.argv.slice(2);
const reconcileRoot = args[0] === '--reconcile-root';
const [filePath, phaseNumStr, status] = reconcileRoot ? [args[1]] : args;

if (reconcileRoot ? args.length !== 2 || !filePath : !filePath || !phaseNumStr || !status || args.includes('--reconcile-root')) {
  console.error('Usage: bun update-phase-status.ts <plan-path> <phase-number> <status>');
  console.error('       bun update-phase-status.ts --reconcile-root <plan-path>');
  console.error(`Valid statuses: ${[...VALID_STATUSES].join(', ')}`);
  process.exit(1);
}

const phaseNumber = parseInt(phaseNumStr ?? '', 10);
if (!reconcileRoot && isNaN(phaseNumber)) {
  console.error(`✗ invalid phase number '${phaseNumStr}'`);
  process.exit(1);
}

if (!reconcileRoot && !VALID_STATUSES.has(status!)) {
  console.error(`✗ invalid status '${status}'. Valid: ${[...VALID_STATUSES].join(', ')}`);
  process.exit(1);
}

let md: string;
try {
  md = readFileSync(filePath!, 'utf-8');
} catch {
  console.error(`✗ cannot read '${filePath}'`);
  process.exit(1);
}

const storedRoot = readFrontmatterStatus(md);
if (storedRoot !== null && normalizeLifecycleStatus(storedRoot, 'plan').status === 'archived') {
  console.error(`✗ plan is archived: ${filePath}`);
  process.exit(1);
}

// Legacy format gate: parser silently normalizes legacy vocab — detect by comparing raw vs parsed
const result = parsePhasesTable(md);
if (result.errors.length > 0) {
  for (const err of result.errors) console.error(`error line ${err.line}: ${err.message}`);
  process.exit(1);
}

/**
 * Mirror the lifecycle value into sibling spec.md; returns true when spec bytes were written.
 * A plan without a root `status:` key is not lifecycle-managed, so spec is left alone.
 */
function mirrorSpecStatus(lifecycle: LifecycleStatus): boolean {
  if (storedRoot === null) {
    console.error(`⚠ ${filePath} has no frontmatter status: key; spec status not mirrored`);
    return false;
  }
  const specPath = join(dirname(filePath!), 'spec.md');
  if (!existsSync(specPath)) {
    console.error(`⚠ spec.md not found next to ${filePath}; spec status not mirrored`);
    return false;
  }
  const before = readFileSync(specPath, 'utf-8');
  const { specMd, hasStatusKey } = renderSpecLifecycleStatus(before, lifecycle);
  if (!hasStatusKey) {
    console.error(`⚠ ${specPath} has no frontmatter status: key; spec status not mirrored`);
    return false;
  }
  if (specMd === before) return false;
  writeFileSync(specPath, specMd, 'utf-8');
  return true;
}

function writtenLabel(plan: boolean, spec: boolean): string {
  return [plan ? 'plan' : null, spec ? 'spec' : null].filter(Boolean).join(', ');
}

if (reconcileRoot) {
  try {
    const rendered = renderPlanStatuses(md, new Map());
    if (rendered.changed) writeFileSync(filePath!, rendered.planMd, 'utf-8');
    const specWritten = mirrorSpecStatus(rendered.status);
    if (rendered.changed || specWritten) {
      console.log(`✓ status → ${rendered.status} (${writtenLabel(rendered.changed, specWritten)})`);
    } else {
      console.log(`— status already ${rendered.status}`);
    }
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  }
  process.exit(0);
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
  const label = String(phaseNumber).padStart(2, '0');
  const current = result.phases.find((row) => row.number === phaseNumber);
  if (current?.status === status) {
    console.log(`— phase ${label} already ${status}`);
  } else {
    const rendered = renderPlanStatuses(md, new Map([[phaseNumber, status as PhaseStatus]]));
    writeFileSync(filePath!, rendered.planMd, 'utf-8');
    console.log(`✓ phase ${label} → ${status}`);
    if (rendered.changed) {
      const specWritten = mirrorSpecStatus(rendered.status);
      console.log(`✓ status → ${rendered.status} (${writtenLabel(true, specWritten)})`);
    }
  }
} catch (err) {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
}

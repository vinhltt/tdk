// CLI: plan-status-validator - validate raw ## Phases status cells for write paths
// Usage: bun src/commands/util/plan-status-validator.ts <plan-path> [--json]

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeAgentJson } from '../../utils/index';
import { isStoredStatusMismatch, readOptionalFile, readStoredStatuses } from '../feature/feature-lifecycle-status';
import { parsePhasesTable, VALID_STATUSES } from './phases-table-parser';
import { derivePlanRootStatus, normalizeLifecycleStatus } from './plan-root-status';

const args = process.argv.slice(2);
const jsonFlag = args.includes('--json');
const filePath = args.find(a => a !== '--json');
const expected = [...VALID_STATUSES];

if (!filePath) {
  console.error('Usage: bun plan-status-validator.ts <plan-path> [--json]');
  process.exit(2);
}

let md: string;
try {
  md = readFileSync(filePath, 'utf-8');
} catch {
  console.error(`cannot read '${filePath}'`);
  process.exit(2);
}

const result = parsePhasesTable(md);
const lines = md.split('\n');
const invalidStatuses = result.phases.flatMap(row => {
  const rawCells = (lines[row.rowLineNumber - 1] ?? '').split('|').slice(1, -1).map(s => s.trim());
  const raw = rawCells[2] ?? '';
  return VALID_STATUSES.has(raw)
    ? []
    : [{ phaseNumber: row.number, line: row.rowLineNumber, raw, expected }];
});

// Report-only drift between stored spec/plan status and the value the rows derive. A partial table
// never drives the root, so any parse error leaves `derived` null and `mismatch` false.
const stored = readStoredStatuses(readOptionalFile(join(dirname(filePath), 'spec.md')), md);
const derived = result.errors.length > 0
  ? null
  : derivePlanRootStatus(
      result.phases,
      stored.plan === null ? null : normalizeLifecycleStatus(stored.plan, 'plan').status,
    );
const lifecycle = {
  plan: stored.plan,
  spec: stored.spec,
  derived,
  mismatch: derived !== null
    && (isStoredStatusMismatch(stored.plan, 'plan', derived) || isStoredStatusMismatch(stored.spec, 'spec', derived)),
};
const output = {
  ok: result.errors.length === 0 && invalidStatuses.length === 0,
  errors: result.errors,
  invalidStatuses,
  lifecycle,
};

if (jsonFlag) {
  writeAgentJson(output);
} else {
  for (const err of output.errors) {
    console.error(`error line ${err.line}: ${err.message}`);
  }
  for (const invalid of output.invalidStatuses) {
    const phase = String(invalid.phaseNumber).padStart(2, '0');
    console.error(`invalid status line ${invalid.line} phase ${phase}: '${invalid.raw}'`);
  }
  if (lifecycle.mismatch) {
    process.stderr.write(
      `warning: lifecycle mismatch: plan status '${lifecycle.plan ?? '-'}', spec status '${lifecycle.spec ?? '-'}', `
      + `derived '${lifecycle.derived}'; fix: (cd .specify/scripts/ts && bun src/commands/util/update-phase-status.ts --reconcile-root "${filePath}")\n`,
    );
  }
}

process.exit(output.ok ? 0 : 1);

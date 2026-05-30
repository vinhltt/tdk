// CLI: plan-status-validator - validate raw ## Phases status cells for write paths
// Usage: bun src/commands/util/plan-status-validator.ts <plan-path> [--json]

import { readFileSync } from 'node:fs';
import { parsePhasesTable, VALID_STATUSES } from './phases-table-parser';

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
const output = {
  ok: result.errors.length === 0 && invalidStatuses.length === 0,
  errors: result.errors,
  invalidStatuses,
};

if (jsonFlag) {
  console.log(JSON.stringify(output, null, 2));
} else {
  for (const err of output.errors) {
    console.error(`error line ${err.line}: ${err.message}`);
  }
  for (const invalid of output.invalidStatuses) {
    const phase = String(invalid.phaseNumber).padStart(2, '0');
    console.error(`invalid status line ${invalid.line} phase ${phase}: '${invalid.raw}'`);
  }
}

process.exit(output.ok ? 0 : 1);

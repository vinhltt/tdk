// CLI: parse-phases-table — parse ## Phases table from plan.md, output JSON or human-readable
// Usage: bun src/commands/util/parse-phases-table.ts <plan-path> [--json]

import { readFileSync } from 'node:fs';
import { parsePhasesTable } from './phases-table-parser';

const args = process.argv.slice(2);
const jsonFlag = args.includes('--json');
const filePath = args.find(a => a !== '--json');

if (!filePath) {
  console.error('Usage: bun parse-phases-table.ts <plan-path> [--json]');
  process.exit(1);
}

let md: string;
try {
  md = readFileSync(filePath, 'utf-8');
} catch {
  console.error(`✗ cannot read '${filePath}'`);
  process.exit(1);
}

const result = parsePhasesTable(md);

if (jsonFlag) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const row of result.phases) {
    const num = String(row.number).padStart(2, '0');
    console.log(`Phase ${num}: ${row.status} — ${row.fileLabel}`);
  }
  for (const err of result.errors) {
    console.error(`error line ${err.line}: ${err.message}`);
  }
}

process.exit(result.errors.length > 0 ? 1 : 0);

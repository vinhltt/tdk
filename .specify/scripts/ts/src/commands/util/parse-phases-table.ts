// CLI: parse-phases-table — parse ## Phases table from plan.md, output JSON or human-readable
// Usage: bun src/commands/util/parse-phases-table.ts <plan-path> [--json] [--validate-deps]

import { readFileSync } from 'node:fs';
import { writeAgentJson } from '../../utils/index';
import { parsePhasesTable, validateDependencies } from './phases-table-parser';

const args = process.argv.slice(2);
const jsonFlag = args.includes('--json');
const validateDepsFlag = args.includes('--validate-deps');
const filePath = args.find(a => a !== '--json' && a !== '--validate-deps');

if (!filePath) {
  console.error('Usage: bun parse-phases-table.ts <plan-path> [--json] [--validate-deps]');
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
if (validateDepsFlag) {
  result.errors.push(...validateDependencies(result.phases));
}

if (jsonFlag) {
  writeAgentJson(result);
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

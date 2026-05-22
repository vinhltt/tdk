// CLI: UT command group factory — backfill workflow subgroup

import { Command } from 'commander';
import { createBackfillCommandGroup } from './backfill/index';

/** Create the UT command group: tdk ut <backfill> */
export function createUtCommandGroup(): Command {
  return new Command('ut')
    .description('Unit-test commands (backfill workflow)')
    .addCommand(createBackfillCommandGroup());
}

// Standalone mode: bun src/commands/ut/index.ts
if (import.meta.main) {
  createUtCommandGroup().parse();
}

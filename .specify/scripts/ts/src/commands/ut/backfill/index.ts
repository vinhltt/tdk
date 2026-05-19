// CLI: UT backfill subgroup factory — composes 3 workflow commands under `tdk ut backfill <op>`

import { Command } from 'commander';
import { createAutoCommand } from './auto';
import { createPlanCommand } from './plan';
import { createImplCommand } from './impl';

/** Create the UT backfill subgroup: tdk ut backfill auto|plan|impl */
export function createBackfillCommandGroup(): Command {
  return new Command('backfill')
    .description('Backfill workflow: retrofit unit tests onto existing code')
    .addCommand(createAutoCommand())
    .addCommand(createPlanCommand())
    .addCommand(createImplCommand());
}

// Standalone mode: bun src/commands/ut/backfill/index.ts
if (import.meta.main) {
  createBackfillCommandGroup().parse();
}

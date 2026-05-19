// CLI: UT command group factory — common rules infra (top level) + backfill workflow (subgroup)

import { Command } from 'commander';
import { createCheckRulesCommand } from './check-rules';
import { createCreateRulesCommand } from './create-rules';
import { createBackfillCommandGroup } from './backfill/index';

/** Create the UT command group: tdk ut <check-rules|create-rules|backfill> */
export function createUtCommandGroup(): Command {
  return new Command('ut')
    .description('Unit-test commands (rules infra + workflow subgroups)')
    .addCommand(createCheckRulesCommand())
    .addCommand(createCreateRulesCommand())
    .addCommand(createBackfillCommandGroup());
}

// Standalone mode: bun src/commands/ut/index.ts
if (import.meta.main) {
  createUtCommandGroup().parse();
}

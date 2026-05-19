// Unified CLI entry point for @tdk/tdk
// Individual commands can still be invoked directly via bun src/commands/*.ts

import { Command } from 'commander';
import { createConfigIndexCommand } from './commands/config/index';
import { createConfigDiffCommand } from './commands/config/diff';
import { createDetectConfigCommand } from './commands/detect-config';
import { createUtCommandGroup } from './commands/ut/index';
import { createScoutCommand } from './commands/scout/index';
import { createDocsCommand } from './commands/sub-workspace/docs';

const program = new Command()
  .name('tdk')
  .description('TDK specification toolkit CLI')
  .version('0.1.0');

// Config command group: tdk config <detect|index|diff>
const configGroup = new Command('config')
  .description('Configuration management commands');
configGroup.addCommand(createDetectConfigCommand());
configGroup.addCommand(createConfigIndexCommand());
configGroup.addCommand(createConfigDiffCommand());
program.addCommand(configGroup);

// UT command group: tdk ut <auto|plan|impl|check-rules|create-rules>
program.addCommand(createUtCommandGroup());

// Scout command: tdk scout --scope <dir> | --from-pack <file>
program.addCommand(createScoutCommand());

// Sub-workspace command group: tdk sub-workspace <docs|...>
const subWsGroup = new Command('sub-workspace')
  .description('Sub-workspace doc generation and management');
subWsGroup.addCommand(createDocsCommand());
program.addCommand(subWsGroup);

program.parse();

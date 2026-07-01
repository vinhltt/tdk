// CLI entry point for @tihon/tdk-setup
// Standalone harness install/convert/convert-flat CLI, invoked via `bun src/index.ts`.
// Commands are registered directly, top-level — this package is never partially
// distributed to consumers, so no dynamic-import proxy layer is needed.

import { Command } from 'commander';
import { createConvertCommand } from './codex-convert-command';
import { createConvertFlatCommand } from './convert-flat';
import { createInstallCommand } from './install';

const program = new Command()
  .name('tdk-setup')
  .description('Standalone TDK harness setup CLI')
  .version('0.1.0');

program.addCommand(createInstallCommand());
program.addCommand(createConvertCommand());
program.addCommand(createConvertFlatCommand());

program.parse();

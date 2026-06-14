import { Command } from 'commander';
import { createHarnessConvertFlatCommand } from './convert-flat';
import { createHarnessInstallCommand } from './install';

export function createHarnessCommandGroup(): Command {
  return new Command('harness')
    .description('Harness installation commands')
    .addCommand(createHarnessConvertFlatCommand())
    .addCommand(createHarnessInstallCommand());
}

if (import.meta.main) {
  createHarnessCommandGroup().parse();
}

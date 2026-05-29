import { Command } from 'commander';
import { createHarnessInstallCommand } from './install';

export function createHarnessCommandGroup(): Command {
  return new Command('harness')
    .description('Harness installation commands')
    .addCommand(createHarnessInstallCommand());
}

if (import.meta.main) {
  createHarnessCommandGroup().parse();
}

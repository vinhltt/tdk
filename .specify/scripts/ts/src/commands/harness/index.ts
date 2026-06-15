import { Command } from 'commander';
import { createHarnessConvertFlatCommand } from './convert-flat';
import { createHarnessInstallCommand } from './install';

function createHarnessConvertProxyCommand(): Command {
  return new Command('convert')
    .description('Maintainer-only: emit generated Codex packages under .specify/codex-plugins/ from TDK plugin source trees')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async (_opts, command: Command) => {
      const { createHarnessConvertCommand } = await import('./codex-convert-command');
      const convert = createHarnessConvertCommand();
      convert.exitOverride();
      convert.parse(['node', 'tdk harness convert', ...command.args], { from: 'node' });
    });
}

export function createHarnessCommandGroup(): Command {
  return new Command('harness')
    .description('Harness installation commands')
    .addCommand(createHarnessConvertProxyCommand())
    .addCommand(createHarnessConvertFlatCommand())
    .addCommand(createHarnessInstallCommand());
}

if (import.meta.main) {
  createHarnessCommandGroup().parse();
}

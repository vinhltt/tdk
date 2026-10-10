import { Command } from 'commander';
import { createDelegateRoutingCommand } from './delegate';
import { createPhaseDelegatesCommand } from './phase-delegates';

export function createRoutingCommandGroup(): Command {
  const command = new Command('routing')
    .description('Routing file management commands');
  command.addCommand(createDelegateRoutingCommand());
  command.addCommand(createPhaseDelegatesCommand());
  return command;
}

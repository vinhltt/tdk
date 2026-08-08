import { Command } from 'commander';
import { createDelegateRoutingCommand } from './delegate';

export function createRoutingCommandGroup(): Command {
  const command = new Command('routing')
    .description('Routing file management commands');
  command.addCommand(createDelegateRoutingCommand());
  return command;
}

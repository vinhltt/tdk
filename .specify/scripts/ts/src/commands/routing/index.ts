import { Command } from 'commander';
import { createPlanSkillRoutingCommand } from './plan-skill';

export function createRoutingCommandGroup(): Command {
  const command = new Command('routing')
    .description('Routing file management commands');
  command.addCommand(createPlanSkillRoutingCommand());
  return command;
}

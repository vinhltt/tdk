import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import { findConfigFile, parseConfig } from '../../../utils/config';
import { writeAgentJson } from '../../../utils/agent-output';
import { deriveSpecifyConfig, formatTopologyDiff } from './patch';
import { parseWorkspaceTopology } from './schema';

interface TopologyApplyOptions {
  topology?: string;
  dryRun?: boolean;
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function resolveTopologyPath(configPath: string, topologyPath?: string): string {
  if (topologyPath) {
    return resolve(topologyPath);
  }
  const workspaceRoot = dirname(dirname(configPath));
  return join(workspaceRoot, '.specify', 'configurations', 'workspace-topology', 'workspace-topology.json');
}

export function createConfigTopologyApplyCommand(): Command {
  return new Command('apply')
    .description('Preview .specify/.specify.json changes from workspace-topology.json')
    .option('--topology <path>', 'Path to workspace-topology.json')
    .option('--dry-run', 'Preview changes without writing files', true)
    .action((opts: TopologyApplyOptions) => {
      try {
        const configPath = findConfigFile(process.cwd());
        if (!configPath) {
          throw new Error('Could not find .specify/.specify.json');
        }

        const topologyPath = resolveTopologyPath(configPath, opts.topology);
        if (!existsSync(topologyPath)) {
          throw new Error(`Topology file not found: ${topologyPath}`);
        }

        const parsedConfig = parseConfig(configPath);
        if (!parsedConfig.config) {
          throw new Error(parsedConfig.error ?? `Could not parse config: ${configPath}`);
        }

        const parsedTopology = parseWorkspaceTopology(readJsonFile(topologyPath));
        const result = deriveSpecifyConfig(
          parsedConfig.config,
          parsedTopology.topology,
          parsedTopology.warnings,
        );

        writeAgentJson({
          mode: 'dry-run',
          topologyPath,
          configPath,
          changes: {
            before: parsedConfig.config,
            after: result.config,
          },
          warnings: result.warnings,
          requiresConfirmation: result.requiresConfirmation,
          confirmationFindings: result.confirmationFindings,
          diff: formatTopologyDiff(parsedConfig.config, result.config),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        process.exit(1);
      }
    });
}

if (import.meta.main) {
  createConfigTopologyApplyCommand().parse();
}

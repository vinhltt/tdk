// CLI: Config detection — thin wrapper over tdk
// Replaces: detect-config.sh (294L)

import { Command } from 'commander';
import {
  detectConfig,
  findConfigFile,
  parseConfig,
  loadFeatureEnv,
  readTestApiConfig,
  formatAgentJson,
  writeAgentJson,
  getRepoRoot,
} from '../utils/index';

/** Create detect-config command for CLI registration */
export function createDetectConfigCommand(): Command {
  return new Command('detect')
    .description('Detect .specify config and resolve workspace/module')
    .option('--sub-workspace <name>', 'Target sub-workspace')
    .option('--module <name>', 'Target module within sub-workspace')
    .action((opts) => {
      // One root for the whole invocation: config discovery, the feature env and the reported
      // workspace all have to name the same artifact host, or the caller writes under one root
      // while reading under another.
      const root = getRepoRoot();
      const result = detectConfig({
        configAnchor: root,
        cwd: process.cwd(),
        subWorkspace: opts.subWorkspace,
        module: opts.module,
      });
      const configFile = findConfigFile(root);
      const { config } = configFile ? parseConfig(configFile) : { config: null };
      const output = {
        ...result,
        featureEnv: loadFeatureEnv(configFile ?? undefined),
        testConfig: readTestApiConfig(config ?? undefined),
      };
      if (result.error) {
        process.stdout.write(formatAgentJson(output));
        process.exit(1);
      }
      writeAgentJson(output);
    });
}

// Standalone mode: bun src/commands/detect-config.ts
if (import.meta.main) {
  createDetectConfigCommand().parse();
}

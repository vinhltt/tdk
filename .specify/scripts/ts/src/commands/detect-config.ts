// CLI: Config detection — thin wrapper over tdk
// Replaces: detect-config.sh (294L)

import { Command } from 'commander';
import {
  detectConfig,
  findConfigFile,
  parseConfig,
  loadFeatureEnv,
  readTestApiConfig,
} from '../utils/index';

/** Create detect-config command for CLI registration */
export function createDetectConfigCommand(): Command {
  return new Command('detect')
    .description('Detect .specify config and resolve workspace/module')
    .option('--sub-workspace <name>', 'Target sub-workspace')
    .option('--module <name>', 'Target module within sub-workspace')
    .action((opts) => {
      const result = detectConfig({
        subWorkspace: opts.subWorkspace,
        module: opts.module,
      });
      const configFile = findConfigFile();
      const { config } = configFile ? parseConfig(configFile) : { config: null };
      const output = {
        ...result,
        featureEnv: loadFeatureEnv(configFile ?? undefined),
        testConfig: readTestApiConfig(config ?? undefined),
      };
      console.log(JSON.stringify(output, null, 2));
      if (result.error) process.exit(1);
    });
}

// Standalone mode: bun src/commands/detect-config.ts
if (import.meta.main) {
  createDetectConfigCommand().parse();
}

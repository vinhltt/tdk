// Shared setup for test-api skill environment scripts
// Resolves workspace, feature ID, and test API config from CLI args

import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import {
  detectConfig,
  findConfigFile,
  parseConfig,
  loadFeatureEnv,
  readTestApiConfig,
  resolveSkillWorkspace,
  getRepoRoot,
  parseFeatureId,
  type TestApiConfig,
} from '../../utils/index';

export interface TestApiArgs {
  featureId: string;
  subWorkspace?: string;
  force: boolean;
  openapi?: string;
  url?: string;
}

export interface TestApiSetup {
  workspaceRoot: string;
  outputRoot: string;
  featureId: string;
  featureDir: string;
  apiTestDir: string;
  testApi: TestApiConfig;
  forceMode: boolean;
}

export function parseTestApiArgs(argv: string[]): TestApiArgs {
  const result: TestApiArgs = { featureId: '', force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--sub-workspace') { result.subWorkspace = argv[++i]; }
    else if (arg === '--openapi') { result.openapi = argv[++i]; }
    else if (arg === '--url') { result.url = argv[++i]; }
    else if (arg === '--force') { result.force = true; }
    else if (!result.featureId) { result.featureId = arg; }
  }
  return result;
}

export function setupTestApiEnv(args: TestApiArgs): TestApiSetup {
  if (!args.featureId) {
    process.stderr.write('Error: Feature ID required\n');
    process.exit(1);
  }

  const featureId = args.featureId.toLowerCase();
  const repoRoot = getRepoRoot();
  const configResult = detectConfig({ subWorkspace: args.subWorkspace });

  if (configResult.error) {
    process.stderr.write(`Error: ${configResult.error}\n`);
    if (configResult.availableSubWorkspaces?.length) {
      process.stderr.write(`Available sub-workspaces: ${configResult.availableSubWorkspaces.join(', ')}\n`);
    }
    process.exit(1);
  }

  const workspace = resolveSkillWorkspace({
    subWorkspaceName: args.subWorkspace,
    configJson: configResult as unknown as Record<string, unknown>,
    repoRoot,
  });

  const configPath = findConfigFile();
  const { config } = configPath ? parseConfig(configPath) : { config: null };
  const env = loadFeatureEnv(configPath ?? undefined);
  const feature = parseFeatureId(featureId, repoRoot, env.specsRoot, env.defaultFolder);
  const testApi = readTestApiConfig(config ?? undefined);

  return {
    workspaceRoot: workspace.workspaceRoot,
    outputRoot: workspace.outputRoot,
    featureId,
    featureDir: feature.featureDir,
    apiTestDir: join(workspace.outputRoot, testApi.outputDir),
    testApi,
    forceMode: args.force,
  };
}

export function findFilesRecursive(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findFilesRecursive(fullPath, pattern));
      } else if (pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch { /* dir unreadable */ }
  return results.sort();
}

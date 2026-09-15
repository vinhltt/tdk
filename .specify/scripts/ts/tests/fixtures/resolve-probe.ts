// Probe used by tests/repo-root-resolution.test.ts.
//
// Runs the production resolution path in a child process so each matrix row gets its own real
// `process.cwd()` and `CLAUDE_PROJECT_DIR`, then prints what every consumer of that root sees.
// Nothing here may call a reset hook or reach into module internals: the point is to observe
// exactly what a CLI command observes.

import {
  getRepoRoot,
  detectConfig,
  findConfigFile,
  loadFeatureEnv,
  runGit,
} from '../../src/utils/index';

const repoRoot = getRepoRoot();
const configFile = findConfigFile(repoRoot);
const config = detectConfig({ configAnchor: repoRoot, cwd: process.cwd() });
const env = loadFeatureEnv(configFile);

let gitToplevel: string | null = null;
try {
  gitToplevel = runGit(['rev-parse', '--show-toplevel'], { cwd: repoRoot });
} catch { gitToplevel = null; }

process.stdout.write(`${JSON.stringify({
  cwd: process.cwd(),
  repoRoot,
  configFile,
  configFound: config.configFound,
  workspaceRoot: config.workspaceRoot,
  workspaceName: config.workspaceName,
  targetSubWorkspace: config.targetSubWorkspace?.name ?? null,
  targetModule: config.targetModule?.name ?? null,
  defaultFolder: env.defaultFolder,
  specsRoot: env.specsRoot,
  gitToplevel,
})}\n`);

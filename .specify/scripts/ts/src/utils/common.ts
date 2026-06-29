// Full conversion of common-env.sh
// Env loading, ticket parsing, validation hooks, skill workspace, feature workflows
// [V2-2] Size limit relaxed — migration exception, ~280 LOC expected

import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process'; // [RT4-7] Never execSync
import { findConfigFile, parseConfig } from './config';
import type { SpecifyConfig } from './types';

// --- Feature environment ---

export interface FeatureEnv {
  prefixList: string;
  defaultFolder: string;
  mainBranch: string;
  specsRoot: string;
  ticketFormat: string;
  hookTimeout: number;
  hookFailBehavior: 'exit' | 'warn';
  validationHook: string;
}

const FEATURE_ENV_DEFAULTS: FeatureEnv = {
  prefixList: 'feat',
  defaultFolder: 'feature',
  mainBranch: 'master',
  specsRoot: '.specify',
  ticketFormat: '^([a-zA-Z]+/)?([a-zA-Z]+)-([0-9]+)$',
  hookTimeout: 30,
  hookFailBehavior: 'exit',
  validationHook: '',
};

export function loadFeatureEnv(configPath?: string | null): FeatureEnv {
  const path = configPath === undefined ? findConfigFile() : configPath;
  if (!path) return { ...FEATURE_ENV_DEFAULTS };
  const { config } = parseConfig(path);
  if (!config) return { ...FEATURE_ENV_DEFAULTS };

  return {
    prefixList: config.git?.prefixList ?? FEATURE_ENV_DEFAULTS.prefixList,
    defaultFolder: config.specs?.defaultFolder ?? FEATURE_ENV_DEFAULTS.defaultFolder,
    mainBranch: config.git?.mainBranch ?? FEATURE_ENV_DEFAULTS.mainBranch,
    specsRoot: config.specs?.root ?? FEATURE_ENV_DEFAULTS.specsRoot,
    ticketFormat: config.specs?.ticketFormat ?? FEATURE_ENV_DEFAULTS.ticketFormat,
    hookTimeout: config.validation?.timeout ?? FEATURE_ENV_DEFAULTS.hookTimeout,
    hookFailBehavior: config.validation?.failBehavior ?? FEATURE_ENV_DEFAULTS.hookFailBehavior,
    validationHook: config.validation?.hook ?? FEATURE_ENV_DEFAULTS.validationHook,
  };
}

// --- Prefix validation ---

function validatePrefix(prefix: string, allowed: string): boolean {
  if (allowed === '*') return true;
  const prefixLower = prefix.toLowerCase();
  const allowedList = allowed.split(',').map(s => s.trim().toLowerCase());
  return allowedList.includes(prefixLower);
}

// --- Ticket parsing ---

export interface TicketParts {
  folder: string;
  prefix: string;
  number: string;
}

// [RT2-10] Validate ticketFormat regex before use — reject ReDoS-prone patterns
function isSafeRegex(pattern: string): boolean {
  // Reject nested quantifiers like (a+)+, (a*)+, (a+)*, etc.
  if (/\([^)]*[+*][^)]*\)[+*]/.test(pattern)) return false;
  // Reject catastrophic backtracking patterns
  if (/(\.\*){3,}/.test(pattern)) return false;
  return true;
}

export function parseTicketId(ticketId: string, env: FeatureEnv): TicketParts | null {
  if (!isSafeRegex(env.ticketFormat)) {
    process.stderr.write(`[tdk] WARNING: Unsafe ticketFormat regex rejected: ${env.ticketFormat}\n`);
    return null;
  }

  let regex: RegExp;
  try {
    regex = new RegExp(env.ticketFormat);
  } catch {
    process.stderr.write(`[tdk] WARNING: Invalid ticketFormat regex: ${env.ticketFormat}\n`);
    return null;
  }

  const match = ticketId.match(regex);
  if (!match) return null;

  const folder = (match[1] ?? '').replace(/\/$/, '') || env.defaultFolder;
  const prefix = match[2] ?? '';
  const number = match[3] ?? '';

  if (!validatePrefix(prefix, env.prefixList)) return null;

  return { folder, prefix, number };
}

// --- Validation hook ---

export function runValidationHook(opts: {
  prefix: string;
  number: string;
  folder: string;
  phase?: string;
  hookPath: string;
  repoRoot: string;
  timeout?: number;
  failBehavior?: string;
}): boolean {
  const { prefix, number, folder, phase = 'create', hookPath, repoRoot, timeout = 30, failBehavior = 'exit' } = opts;

  const absHook = hookPath.startsWith('/') ? hookPath : resolve(repoRoot, hookPath);
  if (!existsSync(absHook)) {
    process.stderr.write(`[tdk] Warning: Hook not found: ${hookPath}\n`);
    return true;
  }

  try {
    // [RT4-7] execFileSync with array args — no shell injection
    execFileSync('bash', [absHook], {
      timeout: timeout * 1000,
      env: {
        ...process.env,
        ERCSPEC_HOOK_PREFIX: prefix,
        ERCSPEC_HOOK_NUMBER: number,
        ERCSPEC_HOOK_FOLDER: folder,
        ERCSPEC_HOOK_PHASE: phase,
        ERCSPEC_HOOK_TICKET_ID: `${prefix}-${number}`,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch (e: unknown) {
    const err = e as { status?: number; killed?: boolean };
    if (err.killed) {
      process.stderr.write(`[tdk] Validation hook timed out after ${timeout}s\n`);
    } else {
      process.stderr.write(`[tdk] Validation failed (exit code: ${err.status ?? 'unknown'})\n`);
    }
    return failBehavior === 'warn';
  }
}

// --- Test API config ---

export interface TestApiConfig {
  found: boolean;
  outputDir: string;
  authStrategy: string;
  baseUrlEnv: string;
  tokenEnv: string;
}

export function readTestApiConfig(config?: SpecifyConfig): TestApiConfig {
  const defaults: TestApiConfig = {
    found: false, outputDir: 'tests/api', authStrategy: 'bearer',
    baseUrlEnv: 'API_BASE_URL', tokenEnv: 'API_TOKEN',
  };
  const testApi = (config?.test as Record<string, Record<string, string>> | undefined)?.api;
  if (!testApi) return defaults;
  return {
    found: true,
    outputDir: testApi.outputDir ?? testApi.output_dir ?? defaults.outputDir,
    authStrategy: testApi.authStrategy ?? testApi.auth_strategy ?? defaults.authStrategy,
    baseUrlEnv: testApi.baseUrlEnv ?? testApi.base_url_env ?? defaults.baseUrlEnv,
    tokenEnv: testApi.tokenEnv ?? testApi.token_env ?? defaults.tokenEnv,
  };
}

// --- Skill workspace resolution ---

export interface SkillWorkspace {
  workspaceRoot: string;
  outputRoot: string;
  targetRoot: string;
}

export function resolveSkillWorkspace(opts: {
  subWorkspaceName?: string;
  configJson?: Record<string, unknown>;
  repoRoot?: string;
}): SkillWorkspace {
  const repoRoot = opts.repoRoot ?? getRepoRoot();
  const result: SkillWorkspace = { workspaceRoot: repoRoot, outputRoot: repoRoot, targetRoot: '' };

  if (!opts.configJson) return result;
  const configFound = (opts.configJson as Record<string, unknown>).configFound;
  if (!configFound) return result;

  result.workspaceRoot = String((opts.configJson as Record<string, unknown>).workspaceRoot ?? repoRoot);
  const target = (opts.configJson as Record<string, unknown>).targetSubWorkspace as Record<string, string> | undefined;
  if (target?.root) {
    result.targetRoot = target.root;
    result.outputRoot = target.root;
  } else {
    result.outputRoot = result.workspaceRoot;
  }
  return result;
}

// --- Feature workflow functions ---

export function getRepoRoot(): string {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
  } catch {
    return process.cwd();
  }
}

export function checkFeatureBranch(branch: string, prefixList: string): boolean {
  const prefixPattern = prefixList.split(',').map(p => p.trim()).join('|');
  const pattern = new RegExp(`^[a-zA-Z]+/(${prefixPattern})-[0-9]+$`, 'i');
  return pattern.test(branch);
}

export function findFeatureDirByPrefix(branchName: string, repoRoot: string, specsRoot: string, defaultFolder: string): string {
  const match = branchName.match(/^([a-z]+)\/(.+)$/);
  if (match) return join(repoRoot, specsRoot, match[1]!, match[2]!);
  return join(repoRoot, specsRoot, defaultFolder, branchName);
}

// [RT3-5, RT4-13] Return fields matching ACTUAL bash get_feature_paths() output
// Bash outputs: REPO_ROOT, TASK_ID, HAS_GIT, FEATURE_DIR, FEATURE_SPEC, IMPL_PLAN,
//               TASKS, RESEARCH, DATA_MODEL, QUICKSTART, CONTRACTS_DIR (11 fields)
export function getFeaturePaths(featureDir: string, repoRoot: string, taskId: string): Record<string, string | boolean> {
  let hasGit = false;
  try {
    execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: 'pipe' });
    hasGit = true;
  } catch { /* not a git repo */ }

  return {
    repoRoot,
    taskId,
    hasGit,
    featureDir,
    featureSpec: join(featureDir, 'spec.md'),
    implPlan: join(featureDir, 'plan.md'),
    /** @deprecated Use getPlanPath() from phases-table-parser instead. Legacy path — consumers migrated per Phase 02-07. */
    tasks: join(featureDir, 'tasks.md'),
    research: join(featureDir, 'research.md'),
    dataModel: join(featureDir, 'data-model.md'),
    quickstart: join(featureDir, 'quickstart.md'),
    contractsDir: join(featureDir, 'contracts'),
  };
}

// --- Feature sub-directory helpers ---
// All require featureDir to be resolved first via getFeaturePaths().

export function getContractsDir(featureDir: string): string {
  return join(featureDir, 'contracts');
}

export function getReviewReportsDir(featureDir: string): string {
  return join(featureDir, 'review-reports');
}

export function getChangesDir(featureDir: string): string {
  return join(featureDir, 'changes');
}

export function getBugsDir(featureDir: string): string {
  return join(featureDir, 'test-specifications');
}

export function createOrSwitchBranch(branchName: string, mainBranch: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    process.stderr.write('Warning: Git repository not detected; skipped branch validation\n');
    return true;
  }

  let currentBranch: string;
  try {
    currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch {
    currentBranch = mainBranch;
  }

  if (/^(feature|test|hotfix)\//.test(currentBranch)) {
    return true; // Already on feature branch
  }

  process.stderr.write(`Warning: Not on feature branch. Current: ${currentBranch}\n`);
  process.stderr.write(`Create branch manually: git checkout -b ${branchName}\n`);
  return false;
}

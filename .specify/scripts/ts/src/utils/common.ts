// Full conversion of common-env.sh
// Env loading, ticket parsing, validation hooks, skill workspace, feature workflows
// [V2-2] Size limit relaxed — migration exception, ~280 LOC expected

import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process'; // [RT4-7] Never execSync — bash validation hook only
import {
  findConfigFile, parseConfig, hostOf, createResolveContext, realpathOrSelf, isWithin,
} from './config';
import { runGit } from './git-env';
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

  // The config may name its own workspaceRoot. Honour it only when it agrees with the root we
  // already resolved — equal to it, or an ancestor of it. A config pointing somewhere else means
  // this process would read under one host and write under another; say so instead of picking one.
  const declaredRoot = (opts.configJson as Record<string, unknown>).workspaceRoot;
  if (declaredRoot !== undefined && declaredRoot !== null && String(declaredRoot) !== '') {
    const declared = realpathOrSelf(String(declaredRoot));
    if (!isWithin(declared, realpathOrSelf(repoRoot))) {
      throw new Error(
        `config_workspace_root_conflict:config declares workspaceRoot ${String(declaredRoot)} ` +
        `which does not contain the resolved artifact host ${repoRoot}`,
      );
    }
    result.workspaceRoot = String(declaredRoot);
  } else {
    result.workspaceRoot = repoRoot;
  }
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

/**
 * The artifact host this invocation reads and writes under.
 *
 * Both candidate sources — `CLAUDE_PROJECT_DIR` and the process cwd — are normalized to an
 * artifact host *before* they are compared. Comparing a raw path against a project root compares
 * two different kinds of thing: `CLAUDE_PROJECT_DIR` pointing at a directory *inside* a host
 * (say `<host>/.specify/scripts/ts`) used to win outright and every artifact path was then built
 * under that subdirectory.
 *
 * Ladder (see the phase-02 decision table):
 *   E1  both hosts, equal                      -> that host
 *   E2a both hosts, cwd host inside env host    -> cwd host   (innermost host wins)
 *   E2b both hosts, env host inside cwd host    -> env host   (innermost host wins)
 *   E2c both hosts, unrelated trees             -> env host   (explicit caller intent)
 *   E3  cwd host only, env set, cwd host not under env -> realpath(env)
 *   E4  cwd host only, env set, cwd host under env     -> cwd host  (the original bug)
 *   E5  cwd host only, env unset                -> cwd host
 *   E6  env host only                           -> env host
 *   E7  no host, env set                        -> realpath(env)
 *   E8  no host, env unset                      -> git toplevel (anchored at cwd), else cwd
 */
export function getRepoRoot(): string {
  // A fresh context per call: the cache exists to stop hostOf() traversing twice within this
  // one resolve, not to remember a host across filesystem changes.
  const ctx = createResolveContext();
  const envRaw = process.env.CLAUDE_PROJECT_DIR;
  const envPath = envRaw ? realpathOrSelf(envRaw) : null;
  const envHost = envPath === null ? null : hostOf(envPath, ctx);
  const cwdPath = realpathOrSelf(process.cwd());
  const cwdHost = hostOf(cwdPath, ctx);

  if (envHost !== null && cwdHost !== null) {
    if (envHost === cwdHost) return envHost;                    // E1
    if (isWithin(envHost, cwdHost)) return cwdHost;             // E2a
    if (isWithin(cwdHost, envHost)) return envHost;             // E2b
    return envHost;                                             // E2c
  }

  if (cwdHost !== null) {
    if (envPath === null) return cwdHost;                       // E5
    return isWithin(envPath, cwdHost) ? cwdHost : envPath;      // E4 / E3
  }

  if (envHost !== null) return envHost;                         // E6
  if (envPath !== null) return envPath;                         // E7

  try {                                                         // E8
    return runGit(['rev-parse', '--show-toplevel'], { cwd: cwdPath });
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
  // Anchored at repoRoot: unanchored this answered for whatever repository the caller's cwd
  // happened to sit in, which on a multi-repo checkout is a different repository entirely.
  let hasGit = false;
  try {
    runGit(['rev-parse', '--show-toplevel'], { cwd: repoRoot });
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
    /** @deprecated Legacy standalone artifact. New research uses conditional research/*.md. */
    research: join(featureDir, 'research.md'),
    /** @deprecated Legacy standalone artifact. New data models live in owner phases. */
    dataModel: join(featureDir, 'data-model.md'),
    /** @deprecated Legacy standalone artifact. New runbooks live in owner phases. */
    quickstart: join(featureDir, 'quickstart.md'),
    /** Conditional directory for declared machine-consumable contracts only. */
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

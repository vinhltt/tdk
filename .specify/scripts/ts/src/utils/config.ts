// Config loading, workspace/sub-workspace/module detection
// Replaces: detect-config.sh core logic

import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, dirname, join, normalize, isAbsolute } from 'node:path';
import { SpecifyConfigSchema, type SpecifyConfig, type SubWorkspace, type Module } from './types';

const MAX_SEARCH_DEPTH = 20;

// --- Public interfaces ---

export interface ModuleInfo {
  name: string;
  path: string;        // relative to sub-workspace
  root: string;        // absolute path
}

export interface SubWorkspaceInfo {
  name: string;
  path: string;        // relative to workspace
  root: string;        // absolute path
  docsPath: string;    // absolute path to this sub-workspace's docs directory
  modules?: ModuleInfo[]; // V2-4: full Module type
  hasModules: boolean;    // RT#3: smart default from config or modules[]
}

export interface ConfigResult {
  configFound: boolean;
  workspaceRoot: string;
  workspaceName: string;
  docsPath: string;
  memoryPath: string;
  subWorkspaces: SubWorkspace[];
  targetSubWorkspace?: SubWorkspaceInfo;
  targetModule?: ModuleInfo;
  error?: string;
  // Extended fields for bash parity
  docsSyncBackup: boolean;
  docsSyncExclude: string[];
  rulesFiles: string[];
  inlineRules: unknown[];
  metadata: Record<string, unknown>;
  commands: Record<string, unknown>;
  specsRoot: string;
  defaultFolder: string;
  // Error context
  warnings: string[];
  requestedSubWorkspace?: string;
  availableSubWorkspaces?: string[];
  requestedModule?: string;
  availableModules?: string[];
  /** Conflicting `subWorkspaces[].path` values, keyed by the duplicated name. */
  duplicateSubWorkspaceNames?: Record<string, string[]>;
}

// --- Config discovery ---

export function findConfigFile(startDir?: string): string | null {
  let current = resolve(startDir ?? process.cwd());
  for (let i = 0; i < MAX_SEARCH_DEPTH; i++) {
    // Prefer JSON over YAML
    const configJson = join(current, '.specify', '.specify.json');
    if (existsSync(configJson)) return configJson;
    const configYaml = join(current, '.specify', '.specify.yaml');
    if (existsSync(configYaml)) return configYaml;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

// --- Artifact host resolution ---

/**
 * Per-invocation cache for host resolution.
 *
 * Deliberately NOT a module-level singleton. `(cwd, env)` does not describe the filesystem,
 * but the answer depends on it: creating or deleting a `.specify/.specify.json`, or repointing
 * a symlink, changes the host for the very same `(cwd, env)`. A long-lived cache would keep
 * serving the stale host and no reset hook can fix that in production — a reset hook only makes
 * *tests* deterministic. So the cache lives for exactly one resolve and then dies.
 *
 * The key is the already-normalized `dir`, never `(cwd, env)`: one resolve calls `hostOf` twice
 * with two different directories (`hostOf(env)` then `hostOf(cwd)`), so a `(cwd, env)` key would
 * make the second call read back the first call's answer.
 */
export interface ResolveContext {
  hosts: Map<string, string | null>;
}

export function createResolveContext(): ResolveContext {
  return { hosts: new Map() };
}

/** True when `configPath` points at a config declaring itself a sub-workspace, not a workspace. */
function isSubWorkspaceConfig(configPath: string): boolean {
  try {
    const raw = readFileSync(configPath, 'utf-8');
    if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) return false;
    return (JSON.parse(raw) as { type?: unknown } | null)?.type === 'sub-workspace';
  } catch {
    // Unreadable or malformed config: treat as a workspace so the caller reports the parse
    // error against this host rather than silently walking past it to an outer one.
    return false;
  }
}

/**
 * The artifact host for `dir`: the nearest enclosing directory holding a **workspace**
 * `.specify/.specify.json`, with its symlinks resolved. Child `type: "sub-workspace"` configs are
 * skipped — they describe a member repository, not the place artifacts are read from and written to.
 *
 * Returns `null` when no workspace config encloses `dir`.
 */
export function hostOf(dir: string, ctx: ResolveContext = createResolveContext()): string | null {
  const start = realpathOrSelf(dir);
  const cached = ctx.hosts.get(start);
  if (cached !== undefined) return cached;

  let search: string | null = start;
  let host: string | null = null;
  for (let i = 0; i < MAX_SEARCH_DEPTH && search !== null; i++) {
    const configPath: string | null = findConfigFile(search);
    if (configPath === null) break;
    const candidate = dirname(dirname(configPath));
    if (!isSubWorkspaceConfig(configPath)) {
      host = realpathOrSelf(candidate);
      break;
    }
    // Skip this child config and keep climbing from above the directory that holds it.
    const parent = dirname(candidate);
    search = parent === candidate ? null : parent;
  }

  ctx.hosts.set(start, host);
  return host;
}

/** `realpathSync.native` when the path exists, otherwise the resolved-but-unrealized path. */
export function realpathOrSelf(dir: string): string {
  try {
    return realpathSync.native(resolve(dir));
  } catch {
    return resolve(dir);
  }
}

/** True when `descendant` is `ancestor` itself or nested inside it. Both must already be real paths. */
export function isWithin(ancestor: string, descendant: string): boolean {
  if (ancestor === descendant) return true;
  const rel = relative(ancestor, descendant);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export function parseConfig(configPath: string): { config: SpecifyConfig | null; error: string | null } {
  try {
    const raw = readFileSync(configPath, 'utf-8');
    if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
      return { config: null, error: 'yaml_not_supported:run migrate-yaml-to-json.sh first' };
    }
    const parsed = JSON.parse(raw);
    // [V4-1] .parse() — strict schema, unknown keys stripped
    const validated = SpecifyConfigSchema.parse(parsed);
    return { config: validated, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { config: null, error: `parse_error:${msg}` };
  }
}

/** Read raw JSON without Zod validation — for diff comparisons [RT3-9] */
export function parseConfigRaw(configPath: string): { raw: Record<string, unknown> | null; error: string | null } {
  try {
    const content = readFileSync(configPath, 'utf-8');
    if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
      return { raw: null, error: 'yaml_not_supported' };
    }
    return { raw: JSON.parse(content) as Record<string, unknown>, error: null };
  } catch (e) {
    return { raw: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// --- Sub-workspace lookup ---

export function findSubWorkspace(config: SpecifyConfig, name: string): SubWorkspace | undefined {
  return config.subWorkspaces?.find(sw => sw.name === name);
}

// Single source of truth for where a sub-workspace's docs live. Keyed by name, not
// path, so a sub-workspace at apps/web keeps a flat docs directory named web.
// The hook runtime has no access to this module and keeps its own copy in
// .specify/plugins/tdk-core/lib/speckit-config-reader.cjs; the two are pinned
// together by tests/utils/sub-workspace-docs-dir-parity.test.ts.
export function subWorkspaceDocsDir(
  workspaceRoot: string,
  docsPath: string,
  subWorkspaceName: string,
): string {
  return resolve(workspaceRoot, docsPath, 'sub-workspaces', subWorkspaceName);
}

export function autoDetectSubWorkspace(config: SpecifyConfig, workspaceRoot: string, cwd?: string): string | null {
  const currentDir = resolve(cwd ?? process.cwd());
  let bestMatch: string | null = null;
  let bestDepth = -1;
  for (const sw of config.subWorkspaces ?? []) {
    const swPath = resolve(workspaceRoot, sw.path);
    // [RT-13] Normalize paths for Windows compat
    const normCwd = currentDir.replace(/\\/g, '/');
    const normSwPath = swPath.replace(/\\/g, '/');
    // [C-12] Ensure prefix safety: backend/ must not match backend-v2/
    if (normCwd === normSwPath || normCwd.startsWith(normSwPath + '/')) {
      const depth = normSwPath.split('/').length;
      if (depth > bestDepth) {
        bestMatch = sw.name;
        bestDepth = depth;
      }
    }
  }
  return bestMatch;
}

// --- Module lookup ---

export function findModule(sw: SubWorkspace, name: string): Module | undefined {
  return sw.modules?.find(m => m.name === name);
}

export function autoDetectModule(sw: SubWorkspace, swRoot: string, cwd?: string): string | null {
  const currentDir = resolve(cwd ?? process.cwd());
  let bestMatch: string | null = null;
  let bestDepth = -1;
  for (const mod of sw.modules ?? []) {
    const modPath = resolve(swRoot, mod.path);
    const normCwd = currentDir.replace(/\\/g, '/');
    const normModPath = modPath.replace(/\\/g, '/');
    if (normCwd === normModPath || normCwd.startsWith(normModPath + '/')) {
      const depth = normModPath.split('/').length;
      if (depth > bestDepth) {
        bestMatch = mod.name;
        bestDepth = depth;
      }
    }
  }
  return bestMatch;
}

// --- Validation ---

export function validateModules(config: SpecifyConfig): string[] {
  const warnings: string[] = [];
  const swNameRegex = /^[a-zA-Z0-9._-]+$/;
  for (const sw of config.subWorkspaces ?? []) {
    // V2-3/C-1: Post-parse warning — doesn't reject, just warns
    if (!swNameRegex.test(sw.name)) {
      warnings.push(`Sub-workspace name "${sw.name}" contains special characters. Recommended: alphanumeric, dots, hyphens only.`);
    }
    const names = new Set<string>();
    const paths = new Set<string>();
    for (const mod of sw.modules ?? []) {
      if (names.has(mod.name)) {
        warnings.push(`Duplicate module name '${mod.name}' in sub-workspace '${sw.name}'`);
      }
      names.add(mod.name);
      const normPath = normalize(mod.path);
      if (paths.has(normPath)) {
        warnings.push(`Overlapping module path '${mod.path}' in sub-workspace '${sw.name}'`);
      }
      paths.add(normPath);
    }
  }
  return warnings;
}

/**
 * Sub-workspace names that appear more than once, with the paths that collide.
 *
 * Every per-repository map — the spec's `milestone_branch`, `base_commit_by_repo`,
 * `cleaning_by_repo`, `cleaned_by_repo` — is keyed by this name, while the schema only requires it
 * to be non-empty. Two entries sharing a name therefore share one slot: the later one overwrites
 * the earlier, resume compares one repository against the other's commit, and cleaning one marks
 * both. No concurrency is needed; a plain sequential loop does it.
 *
 * Reported rather than repaired: merging or suffixing names would silently change which repository
 * a recorded value belongs to.
 */
export function findDuplicateSubWorkspaceNames(config: SpecifyConfig): Record<string, string[]> {
  const pathsByName: Record<string, string[]> = Object.create(null);
  for (const sub of config.subWorkspaces ?? []) (pathsByName[sub.name] ??= []).push(sub.path);

  const duplicates: Record<string, string[]> = Object.create(null);
  for (const [name, paths] of Object.entries(pathsByName)) {
    if (paths.length > 1) duplicates[name] = paths;
  }
  return duplicates;
}

export function validatePathContainment(basePath: string, targetPath: string): void {
  const absBase = resolve(basePath);
  const absTarget = resolve(targetPath);
  const rel = relative(absBase, absTarget);
  if (rel.startsWith('..') || resolve(absBase, rel) !== absTarget) {
    throw new Error(`Path '${targetPath}' escapes base '${basePath}'`);
  }
}

// --- Main orchestrator ---

export interface DetectConfigOptions {
  subWorkspace?: string;
  module?: string;
  /**
   * Where the user is standing. Drives sub-workspace and module autodetection, and — when
   * `configAnchor` is absent — also the config search. Keep passing the real cwd.
   */
  cwd?: string;
  /**
   * Where to start looking for `.specify/.specify.json`. Callers that already resolved the
   * artifact host pass it here so config discovery and the rest of the process agree on one root.
   *
   * This is a separate knob on purpose: `cwd` also decides which sub-workspace/module the user is
   * targeting, so folding the host into `cwd` resolves the right root while destroying the target
   * (`autoDetectSubWorkspace`/`autoDetectModule` would see the host instead of the user's location).
   */
  configAnchor?: string;
}

export function detectConfig(opts: DetectConfigOptions = {}): ConfigResult {
  const configPath = findConfigFile(opts.configAnchor ?? opts.cwd);

  const emptyResult: ConfigResult = {
    configFound: false, workspaceRoot: '', workspaceName: '', docsPath: '', memoryPath: '.specify/memory',
    subWorkspaces: [], docsSyncBackup: true, docsSyncExclude: [], rulesFiles: [],
    inlineRules: [], metadata: {}, commands: {}, specsRoot: '.specify',
    defaultFolder: 'feature', warnings: [],
  };

  if (!configPath) return emptyResult;

  const workspaceRoot = dirname(dirname(configPath));
  const { config, error } = parseConfig(configPath);

  if (error || !config) {
    return { ...emptyResult, configFound: false, error: error ?? 'unknown_error', workspaceRoot };
  }

  const warnings = validateModules(config);

  // A blocking config error, not a warning: every per-repository map is keyed by sub-workspace
  // name, so duplicates silently make two repositories share one record. Surfaced before any
  // caller can seed, migrate or mutate anything.
  const duplicates = findDuplicateSubWorkspaceNames(config);
  if (Object.keys(duplicates).length > 0) {
    return {
      ...emptyResult,
      workspaceRoot,
      subWorkspaces: config.subWorkspaces ?? [],
      error: 'duplicate_sub_workspace_names',
      duplicateSubWorkspaceNames: duplicates,
      warnings,
    };
  }

  const result: ConfigResult = {
    configFound: true,
    workspaceRoot,
    workspaceName: config.name,
    docsPath: config.docs?.path ?? '.specify/configurations',
    memoryPath: config.memory?.path ?? '.specify/memory',
    subWorkspaces: config.subWorkspaces ?? [],
    docsSyncBackup: config.docs?.sync?.backup ?? true,
    docsSyncExclude: config.docs?.sync?.exclude ?? [],
    rulesFiles: config.docs?.rules ?? [],
    inlineRules: Array.isArray(config.rules) ? config.rules : [],
    metadata: config.metadata ?? {},
    commands: config.commands ?? {},
    specsRoot: config.specs?.root ?? '.specify',
    defaultFolder: config.specs?.defaultFolder ?? 'feature',
    warnings,
  };

  // Sub-workspace targeting
  let swName = opts.subWorkspace ?? autoDetectSubWorkspace(config, workspaceRoot, opts.cwd);
  if (swName) {
    const sw = findSubWorkspace(config, swName);
    if (!sw) {
      result.error = 'sub_workspace_not_found';
      result.requestedSubWorkspace = swName;
      result.availableSubWorkspaces = (config.subWorkspaces ?? []).map(s => s.name);
      return result;
    }
    const swRoot = resolve(workspaceRoot, sw.path);
    const swDocsPath = subWorkspaceDocsDir(workspaceRoot, result.docsPath, sw.name);
    result.targetSubWorkspace = {
      name: sw.name, path: sw.path, root: swRoot, docsPath: swDocsPath,
      modules: (sw.modules ?? []).map<ModuleInfo>(m => ({ name: m.name, path: m.path, root: resolve(swRoot, m.path) })),
      hasModules: sw.hasModules ?? ((sw.modules?.length ?? 0) > 0),
    };
    // Module targeting
    let modName = opts.module ?? autoDetectModule(sw, swRoot, opts.cwd);
    if (opts.module && !modName) modName = opts.module; // explicit request
    if (modName) {
      const mod = findModule(sw, modName);
      if (!mod) {
        result.error = 'module_not_found';
        result.requestedModule = modName;
        result.availableModules = (sw.modules ?? []).map(m => m.name);
        return result;
      }
      result.targetModule = {
        name: mod.name,
        path: mod.path,
        root: resolve(swRoot, mod.path),
      };
    }
  }

  return result;
}

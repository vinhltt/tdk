// Config loading, workspace/sub-workspace/module detection
// Replaces: detect-config.sh core logic

import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, join, normalize } from 'node:path';
import { SpecifyConfigSchema, type SpecifyConfig, type SubWorkspace, type Module } from './types';

const MAX_SEARCH_DEPTH = 20;

// --- Public interfaces ---

export interface ModuleInfo {
  name: string;
  path: string;        // relative to sub-workspace
  root: string;        // absolute path
  testPath?: string;
}

export interface SubWorkspaceInfo {
  name: string;
  path: string;        // relative to workspace
  root: string;        // absolute path
  docsPath: string;
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
  cwd?: string;
}

export function detectConfig(opts: DetectConfigOptions = {}): ConfigResult {
  const configPath = findConfigFile(opts.cwd);

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
    const swDocsPath = sw.docs?.path ?? result.docsPath;
    result.targetSubWorkspace = {
      name: sw.name, path: sw.path, root: swRoot, docsPath: swDocsPath,
      modules: (sw.modules ?? []).map<ModuleInfo>(m => ({ name: m.name, path: m.path, root: resolve(swRoot, m.path), testPath: m.testPath })),
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
        testPath: mod.testPath,
      };
    }
  }

  return result;
}

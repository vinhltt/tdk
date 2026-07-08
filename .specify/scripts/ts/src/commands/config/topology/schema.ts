import { isAbsolute, win32 } from 'node:path';
import { z } from 'zod';

const reportOnlyFields = ['boundaryType', 'owner', 'contracts', 'allowedDependencies', 'routing'] as const;
const shellLikePattern = /(&&|\|\||;|`|\$\(|\||>|<|\r|\n)/;

const TopologyModuleSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  testPath: z.string().optional(),
});

const TopologySubWorkspaceSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  owner: z.unknown().optional(),
  contracts: z.unknown().optional(),
  allowedDependencies: z.unknown().optional(),
  routing: z.unknown().optional(),
  docs: z.object({
    path: z.string().optional(),
  }).optional(),
  modules: z.array(TopologyModuleSchema).optional(),
});

const WorkspaceTopologySchema = z.object({
  architecture: z.object({
    type: z.string().optional(),
    boundaryType: z.unknown().optional(),
  }).optional(),
  subWorkspaces: z.array(TopologySubWorkspaceSchema).default([]),
});

export type WorkspaceTopology = z.infer<typeof WorkspaceTopologySchema>;
export type WorkspaceTopologySubWorkspace = WorkspaceTopology['subWorkspaces'][number];

export interface TopologyParseResult {
  topology: WorkspaceTopology;
  warnings: string[];
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function dedupeWarnings(warnings: string[]): string[] {
  return Array.from(new Set(warnings));
}

function validateRelativePath(label: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Empty path not allowed for ${label}`);
  }
  if (value.includes('\0')) {
    throw new Error(`Null byte path not allowed for ${label}`);
  }
  if (isAbsolute(value) || win32.isAbsolute(value)) {
    throw new Error(`absolute paths are not allowed for ${label}`);
  }

  const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.includes('..')) {
    throw new Error(`path traversal not allowed for ${label}`);
  }
}

function validateUniqueName(seen: Set<string>, label: string, name: string): void {
  const key = name.toLocaleLowerCase();
  if (seen.has(key)) {
    throw new Error(`Duplicate ${label}: ${name}`);
  }
  seen.add(key);
}

function hasShellLikeRouting(value: unknown): boolean {
  if (typeof value === 'string') {
    return shellLikePattern.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasShellLikeRouting(entry));
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some((entry) => hasShellLikeRouting(entry));
  }
  return false;
}

function pushReportOnlyWarning(warnings: string[], scope: string, field: typeof reportOnlyFields[number]): void {
  warnings.push(`${scope}.${field} is report-only and ignored for runtime config`);
}

function failOnShellLikeRouting(value: unknown, scope: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => failOnShellLikeRouting(entry, `${scope}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const entryScope = `${scope}.${key}`;
    if (key === 'routing' && hasShellLikeRouting(entry)) {
      throw new Error(`shell-like routing value not allowed in ${entryScope}`);
    }
    failOnShellLikeRouting(entry, entryScope);
  }
}

function warnReportOnlyFields(warnings: string[], scope: string, value: unknown): void {
  if (!isRecord(value)) {
    return;
  }
  for (const field of reportOnlyFields) {
    if (hasOwn(value, field)) {
      pushReportOnlyWarning(warnings, scope, field);
    }
  }
}

function scanRawReportOnlyFields(raw: unknown, warnings: string[]): void {
  warnReportOnlyFields(warnings, 'topology', raw);
  if (!isRecord(raw)) {
    return;
  }
  warnReportOnlyFields(warnings, 'architecture', raw.architecture);
  if (Array.isArray(raw.subWorkspaces)) {
    for (const [index, entry] of raw.subWorkspaces.entries()) {
      const name = isRecord(entry) && typeof entry.name === 'string' ? entry.name : String(index);
      warnReportOnlyFields(warnings, `subWorkspaces.${name}`, entry);
    }
  }
}

function validateTopologyPathsAndNames(topology: WorkspaceTopology): void {
  const subWorkspaceNames = new Set<string>();
  for (const subWorkspace of topology.subWorkspaces) {
    validateUniqueName(subWorkspaceNames, 'sub-workspace name', subWorkspace.name);
    validateRelativePath(`subWorkspaces.${subWorkspace.name}.path`, subWorkspace.path);

    if (subWorkspace.docs?.path !== undefined) {
      validateRelativePath(`subWorkspaces.${subWorkspace.name}.docs.path`, subWorkspace.docs.path);
    }

    const moduleNames = new Set<string>();
    for (const module of subWorkspace.modules ?? []) {
      validateUniqueName(moduleNames, 'module name', module.name);
      validateRelativePath(`subWorkspaces.${subWorkspace.name}.modules.${module.name}.path`, module.path);
      if (module.testPath !== undefined) {
        validateRelativePath(`subWorkspaces.${subWorkspace.name}.modules.${module.name}.testPath`, module.testPath);
      }
    }
  }
}

export function parseWorkspaceTopology(raw: unknown): TopologyParseResult {
  const warnings: string[] = [];
  failOnShellLikeRouting(raw, 'topology');
  scanRawReportOnlyFields(raw, warnings);

  const topology = WorkspaceTopologySchema.parse(raw);
  validateTopologyPathsAndNames(topology);

  return { topology, warnings: dedupeWarnings(warnings) };
}

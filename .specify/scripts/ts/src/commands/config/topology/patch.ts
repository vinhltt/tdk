import { posix } from 'node:path';
import {
  ArchitectureSchema,
  SpecifyConfigSchema,
  SubWorkspaceSchema,
  type SpecifyConfig,
  type SubWorkspace,
} from '../../../utils/types';
import type { WorkspaceTopology, WorkspaceTopologySubWorkspace } from './schema';

export interface ConfirmationFinding {
  name: string;
  fields: Array<'path' | 'modules' | 'architecture.type' | 'pathCollision'>;
}

type RuntimeConfirmationField = 'path' | 'modules';

export interface DerivedConfigResult {
  config: SpecifyConfig;
  warnings: string[];
  requiresConfirmation: boolean;
  confirmationFindings: ConfirmationFinding[];
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function dedupeWarnings(warnings: string[]): string[] {
  return Array.from(new Set(warnings));
}

function findExistingSubWorkspace(
  existing: SubWorkspace[],
  topologySubWorkspace: WorkspaceTopologySubWorkspace,
): SubWorkspace | undefined {
  const target = topologySubWorkspace.name.toLocaleLowerCase();
  return existing.find((entry) => entry.name.toLocaleLowerCase() === target);
}

function createRuntimeSubWorkspace(
  topologySubWorkspace: WorkspaceTopologySubWorkspace,
  existing?: SubWorkspace,
): { subWorkspace: SubWorkspace; providedFields: RuntimeConfirmationField[] } {
  const providedFields: RuntimeConfirmationField[] = ['path'];
  let next: SubWorkspace = {
    ...(existing ?? {}),
    name: existing?.name ?? topologySubWorkspace.name,
    path: topologySubWorkspace.path,
  };

  if (topologySubWorkspace.modules !== undefined) {
    providedFields.push('modules');
    next = {
      ...next,
      modules: topologySubWorkspace.modules,
      hasModules: topologySubWorkspace.modules.length > 0,
    };
  }

  return { subWorkspace: SubWorkspaceSchema.parse(next), providedFields };
}

function getConfirmationFields(
  existing: SubWorkspace,
  next: SubWorkspace,
  providedFields: RuntimeConfirmationField[],
): RuntimeConfirmationField[] {
  return providedFields.filter((field) => stableStringify(existing[field]) !== stableStringify(next[field]));
}

function addConfirmationFinding(
  findings: ConfirmationFinding[],
  name: string,
  fields: ConfirmationFinding['fields'],
): void {
  const existing = findings.find((entry) => entry.name === name);
  if (!existing) {
    findings.push({ name, fields: Array.from(new Set(fields)) });
    return;
  }
  existing.fields = Array.from(new Set([...existing.fields, ...fields]));
}

function normalizeRuntimePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, '/')).replace(/\/$/, '').toLocaleLowerCase();
}

function applyArchitecture(
  config: SpecifyConfig,
  topology: WorkspaceTopology,
  warnings: string[],
  confirmationFindings: ConfirmationFinding[],
): SpecifyConfig {
  const type = topology.architecture?.type;
  if (type === undefined) {
    return config;
  }

  const parsedType = ArchitectureSchema.shape.type.safeParse(type);
  if (!parsedType.success) {
    warnings.push(`Unsupported architecture type ignored: ${type}`);
    return config;
  }

  if (config.architecture?.type !== undefined && config.architecture.type !== parsedType.data) {
    addConfirmationFinding(confirmationFindings, 'architecture', ['architecture.type']);
  }

  return {
    ...config,
    architecture: {
      ...(config.architecture ?? {}),
      type: parsedType.data,
    },
  };
}

export function deriveSpecifyConfig(
  existing: SpecifyConfig,
  topology: WorkspaceTopology,
  warnings: string[] = [],
): DerivedConfigResult {
  const before = SpecifyConfigSchema.parse(existing);
  const nextWarnings = [...warnings];
  const confirmationFindings: ConfirmationFinding[] = [];
  let next = applyArchitecture(before, topology, nextWarnings, confirmationFindings);

  const existingSubWorkspaces = before.subWorkspaces ?? [];
  const derivedSubWorkspaces: SubWorkspace[] = [];

  for (const topologySubWorkspace of topology.subWorkspaces) {
    const existingSubWorkspace = findExistingSubWorkspace(existingSubWorkspaces, topologySubWorkspace);
    const { subWorkspace, providedFields } = createRuntimeSubWorkspace(topologySubWorkspace, existingSubWorkspace);
    derivedSubWorkspaces.push(subWorkspace);

    if (existingSubWorkspace) {
      const fields = getConfirmationFields(existingSubWorkspace, subWorkspace, providedFields);
      if (fields.length > 0) {
        addConfirmationFinding(confirmationFindings, existingSubWorkspace.name, fields);
      }
    }
  }

  const mentionedNames = new Set(topology.subWorkspaces.map((entry) => entry.name.toLocaleLowerCase()));
  const preservedSubWorkspaces = existingSubWorkspaces.filter(
    (entry) => !mentionedNames.has(entry.name.toLocaleLowerCase()),
  );

  if (topology.subWorkspaces.length > 0 || before.subWorkspaces !== undefined) {
    next = {
      ...next,
      subWorkspaces: [...derivedSubWorkspaces, ...preservedSubWorkspaces],
    };
  }

  const pathOwners = new Map<string, string>();
  for (const subWorkspace of next.subWorkspaces ?? []) {
    const normalizedPath = normalizeRuntimePath(subWorkspace.path);
    const existingOwner = pathOwners.get(normalizedPath);
    if (existingOwner && existingOwner.toLocaleLowerCase() !== subWorkspace.name.toLocaleLowerCase()) {
      addConfirmationFinding(confirmationFindings, subWorkspace.name, ['pathCollision']);
      addConfirmationFinding(confirmationFindings, existingOwner, ['pathCollision']);
    } else {
      pathOwners.set(normalizedPath, subWorkspace.name);
    }
  }

  return {
    config: SpecifyConfigSchema.parse(next),
    warnings: dedupeWarnings(nextWarnings),
    requiresConfirmation: confirmationFindings.length > 0,
    confirmationFindings,
  };
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatTopologyDiff(before: SpecifyConfig, after: SpecifyConfig): string {
  const beforeJson = formatJson(before);
  const afterJson = formatJson(after);
  const lines = [
    '--- .specify/.specify.json (current)',
    '+++ .specify/.specify.json (dry-run)',
  ];

  if (beforeJson === afterJson) {
    return [...lines, '@@', ' no changes'].join('\n');
  }

  return [
    ...lines,
    '@@',
    ...beforeJson.split('\n').map((line) => `- ${line}`),
    ...afterJson.split('\n').map((line) => `+ ${line}`),
  ].join('\n');
}

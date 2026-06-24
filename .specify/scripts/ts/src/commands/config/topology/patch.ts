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
  fields: Array<'path' | 'docs' | 'testMapping' | 'modules'>;
}

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
): { subWorkspace: SubWorkspace; providedFields: ConfirmationFinding['fields'] } {
  const providedFields: ConfirmationFinding['fields'] = ['path'];
  let next: SubWorkspace = {
    ...(existing ?? {}),
    name: existing?.name ?? topologySubWorkspace.name,
    path: topologySubWorkspace.path,
  };

  if (topologySubWorkspace.docs !== undefined) {
    providedFields.push('docs');
    next = { ...next, docs: topologySubWorkspace.docs };
  }
  if (topologySubWorkspace.testMapping !== undefined) {
    providedFields.push('testMapping');
    next = { ...next, testMapping: topologySubWorkspace.testMapping };
  }
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
  providedFields: ConfirmationFinding['fields'],
): ConfirmationFinding['fields'] {
  return providedFields.filter((field) => stableStringify(existing[field]) !== stableStringify(next[field]));
}

function applyArchitecture(
  config: SpecifyConfig,
  topology: WorkspaceTopology,
  warnings: string[],
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
  let next = applyArchitecture(before, topology, nextWarnings);

  const existingSubWorkspaces = before.subWorkspaces ?? [];
  const derivedSubWorkspaces: SubWorkspace[] = [];
  const confirmationFindings: ConfirmationFinding[] = [];

  for (const topologySubWorkspace of topology.subWorkspaces) {
    const existingSubWorkspace = findExistingSubWorkspace(existingSubWorkspaces, topologySubWorkspace);
    const { subWorkspace, providedFields } = createRuntimeSubWorkspace(topologySubWorkspace, existingSubWorkspace);
    derivedSubWorkspaces.push(subWorkspace);

    if (existingSubWorkspace) {
      const fields = getConfirmationFields(existingSubWorkspace, subWorkspace, providedFields);
      if (fields.length > 0) {
        confirmationFindings.push({ name: existingSubWorkspace.name, fields });
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

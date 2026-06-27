import { createHash, randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import type { SpecifyConfig, SubWorkspace } from '../../../utils/types';
import type { ConfirmationFinding } from './patch';

export interface ApplyPlan {
  runId: string;
  planHash: string;
  rawBeforeHash: string;
  workspaceRootRealPath: string;
  configPath: string;
  configRealPath: string;
  topologyPath: string;
  topologyRealPath: string;
  topologyContentHash: string;
  applyEligible: boolean;
  rawBefore: Record<string, unknown>;
  rawBeforeText: string;
  before: SpecifyConfig;
  schemaAfter: SpecifyConfig;
  writeConfig: Record<string, unknown>;
  warnings: string[];
  requiresConfirmation: boolean;
  confirmationFindings: ConfirmationFinding[];
  targetStat: Pick<Stats, 'dev' | 'ino' | 'mode' | 'uid' | 'gid'>;
}

export interface BuildApplyPlanInput {
  runId?: string;
  rawBeforeText: string;
  rawBefore: Record<string, unknown>;
  before: SpecifyConfig;
  schemaAfter: SpecifyConfig;
  workspaceRootRealPath: string;
  configPath: string;
  configRealPath: string;
  topologyPath: string;
  topologyRealPath: string;
  topologyContentHash: string;
  applyEligible: boolean;
  warnings: string[];
  requiresConfirmation: boolean;
  confirmationFindings: ConfirmationFinding[];
  targetStat: Pick<Stats, 'dev' | 'ino' | 'mode' | 'uid' | 'gid'>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hashBytes(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortForCanonicalJson(value));
}

function sortForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortForCanonicalJson(entry));
  }
  if (!isRecord(value)) {
    return value ?? null;
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortForCanonicalJson(value[key]);
      return acc;
    }, {});
}

function findRawSubWorkspaceByName(
  rawSubWorkspaces: unknown,
  name: string,
): Record<string, unknown> | undefined {
  if (!Array.isArray(rawSubWorkspaces)) {
    return undefined;
  }
  const target = name.toLocaleLowerCase();
  return rawSubWorkspaces.find((entry): entry is Record<string, unknown> => (
    isRecord(entry)
    && typeof entry.name === 'string'
    && entry.name.toLocaleLowerCase() === target
  ));
}

function mergeSubWorkspace(rawBefore: Record<string, unknown>, schemaSubWorkspace: SubWorkspace): Record<string, unknown> {
  const rawSubWorkspace = findRawSubWorkspaceByName(rawBefore.subWorkspaces, schemaSubWorkspace.name);
  return {
    ...(rawSubWorkspace ?? {}),
    ...schemaSubWorkspace,
  };
}

function mergeArchitecture(
  rawBefore: Record<string, unknown>,
  schemaAfter: SpecifyConfig,
): Record<string, unknown> | undefined {
  if (schemaAfter.architecture === undefined) {
    return isRecord(rawBefore.architecture) ? { ...rawBefore.architecture } : undefined;
  }

  return {
    ...(isRecord(rawBefore.architecture) ? rawBefore.architecture : {}),
    ...schemaAfter.architecture,
  };
}

export function mergeDerivedConfigIntoRawConfig(
  rawBefore: Record<string, unknown>,
  schemaAfter: SpecifyConfig,
): Record<string, unknown> {
  if (!isRecord(rawBefore)) {
    throw new Error('Raw config must be a JSON object');
  }

  const writeConfig: Record<string, unknown> = { ...rawBefore };
  const architecture = mergeArchitecture(rawBefore, schemaAfter);
  if (architecture === undefined) {
    delete writeConfig.architecture;
  } else {
    writeConfig.architecture = architecture;
  }

  if (schemaAfter.subWorkspaces !== undefined) {
    writeConfig.subWorkspaces = schemaAfter.subWorkspaces.map((entry) => mergeSubWorkspace(rawBefore, entry));
  } else {
    delete writeConfig.subWorkspaces;
  }

  return writeConfig;
}

export function computePlanHash(input: {
  rawBeforeHash: string;
  writeConfig: Record<string, unknown>;
  topologyContentHash: string;
  topologyRealPath: string;
  workspaceRootRealPath: string;
  configRealPath: string;
}): string {
  return hashBytes(canonicalize({
    rawBeforeHash: input.rawBeforeHash,
    writeConfig: input.writeConfig,
    topologyContentHash: input.topologyContentHash,
    topologyRealPath: input.topologyRealPath,
    workspaceRootRealPath: input.workspaceRootRealPath,
    configRealPath: input.configRealPath,
  }));
}

export function buildApplyPlan(input: BuildApplyPlanInput): ApplyPlan {
  const rawBeforeHash = hashBytes(input.rawBeforeText);
  const writeConfig = mergeDerivedConfigIntoRawConfig(input.rawBefore, input.schemaAfter);
  const planHash = computePlanHash({
    rawBeforeHash,
    writeConfig,
    topologyContentHash: input.topologyContentHash,
    topologyRealPath: input.topologyRealPath,
    workspaceRootRealPath: input.workspaceRootRealPath,
    configRealPath: input.configRealPath,
  });

  return {
    runId: input.runId ?? randomUUID(),
    planHash,
    rawBeforeHash,
    workspaceRootRealPath: input.workspaceRootRealPath,
    configPath: input.configPath,
    configRealPath: input.configRealPath,
    topologyPath: input.topologyPath,
    topologyRealPath: input.topologyRealPath,
    topologyContentHash: input.topologyContentHash,
    applyEligible: input.applyEligible,
    rawBefore: input.rawBefore,
    rawBeforeText: input.rawBeforeText,
    before: input.before,
    schemaAfter: input.schemaAfter,
    writeConfig,
    warnings: input.warnings,
    requiresConfirmation: input.requiresConfirmation,
    confirmationFindings: input.confirmationFindings,
    targetStat: input.targetStat,
  };
}

import { isMap, parseAllDocuments } from 'yaml';
import {
  extractConfigSentinelPayload,
  mergeConfigSentinelBlock,
  stripConfigSentinelBlocks,
} from './config-sentinel-merge';
import type { ConfigSentinelMergeResult, ConfigSentinelSpec } from './config-sentinel-merge';

export const OMP_SENTINEL_START = '# --- tdk-managed-start ---';
export const OMP_SENTINEL_END = '# --- tdk-managed-end ---';

const OMP_SENTINELS: ConfigSentinelSpec = {
  start: OMP_SENTINEL_START,
  end: OMP_SENTINEL_END,
  label: 'TDK-managed OMP config',
};

function topLevelRoots(content: string, label: string): Set<string> {
  if (!content.trim()) return new Set();
  const documents = parseAllDocuments(content);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    throw new Error(`${label}: ${errors.map((error) => error.message).join('; ')}`);
  }
  if (documents.length !== 1) throw new Error(`${label}: expected exactly one YAML document`);
  const document = documents[0]!;
  if (document.contents === null) return new Set();
  if (!isMap(document.contents)) throw new Error(`${label}: top level must be a mapping`);
  return new Set(document.contents.items.map((item) => String(item.key)));
}

export type ConfigYamlMergeResult = ConfigSentinelMergeResult;

export function extractOmpManagedPayload(content: string): string | undefined {
  return extractConfigSentinelPayload(content, OMP_SENTINELS);
}

export function mergeConfigYaml(existing: string, managedBlock: string): ConfigYamlMergeResult {
  const stripped = stripConfigSentinelBlocks(existing, OMP_SENTINELS);
  if (stripped.malformed) {
    return {
      content: existing,
      unmanagedContent: existing,
      warnings: [],
      error: 'Malformed TDK-managed OMP config sentinels',
    };
  }

  let userRoots: Set<string>;
  let managedRoots: Set<string>;
  try {
    userRoots = topLevelRoots(stripped.content, 'Invalid user YAML');
    managedRoots = topLevelRoots(managedBlock, 'Invalid managed YAML');
  } catch (error) {
    return {
      content: existing,
      unmanagedContent: stripped.content,
      warnings: [],
      error: (error as Error).message,
    };
  }

  const duplicateRoots = [...managedRoots].filter((root) => userRoots.has(root)).sort();
  if (duplicateRoots.length > 0) {
    return {
      content: existing,
      unmanagedContent: stripped.content,
      warnings: [],
      error: `OMP config ownership conflict for top-level root(s): ${duplicateRoots.join(', ')}`,
    };
  }

  const merged = mergeConfigSentinelBlock(existing, managedBlock, OMP_SENTINELS);
  if (merged.error || !managedBlock.trim()) return merged;
  try {
    topLevelRoots(merged.content, 'Invalid merged YAML');
  } catch (error) {
    return {
      content: existing,
      unmanagedContent: stripped.content,
      warnings: merged.warnings,
      error: (error as Error).message,
    };
  }
  return merged;
}

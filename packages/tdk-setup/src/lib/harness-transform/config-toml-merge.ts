import { mergeConfigSentinelBlock } from './config-sentinel-merge';
import type { ConfigSentinelMergeResult, ConfigSentinelSpec } from './config-sentinel-merge';

const SENTINEL_START = '# --- tdk-managed-agents-start ---';
const SENTINEL_END = '# --- tdk-managed-agents-end ---';

const CODEX_AGENT_SENTINELS: ConfigSentinelSpec = {
  start: SENTINEL_START,
  end: SENTINEL_END,
  label: 'TDK-managed agent config',
};

export type MergeConfigTomlResult = ConfigSentinelMergeResult;

export function mergeConfigToml(existing: string, managedBlock: string): string {
  return mergeConfigTomlWithDiagnostics(existing, managedBlock).content;
}

export function mergeConfigTomlWithDiagnostics(
  existing: string,
  managedBlock: string,
): MergeConfigTomlResult {
  return mergeConfigSentinelBlock(existing, managedBlock, CODEX_AGENT_SENTINELS);
}

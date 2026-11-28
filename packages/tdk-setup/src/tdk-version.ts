import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HarnessInstallManifest } from './types';

export const UNKNOWN_VERSION = 'unknown';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function isVersionString(value: unknown): value is string {
  return typeof value === 'string' && SEMVER.test(value);
}

/** Lenient JSON object read: any failure yields undefined. */
function readJsonObject(filePath: string): Record<string, unknown> | undefined {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return typeof data === 'object' && data !== null && !Array.isArray(data)
      ? data as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function defaultSourceRoot(): string | undefined {
  try {
    // src/ -> package -> packages -> source checkout root, resolved through symlinks.
    return path.resolve(fs.realpathSync(import.meta.dir), '..', '..', '..');
  } catch {
    return undefined;
  }
}

const sourceVersionMemo = new Map<string, string>();

/**
 * TDK release version of the source checkout that runs this installer,
 * read from `.claude-plugin/marketplace.json`. Never throws.
 */
export function readSourceTdkVersion(sourceRoot?: string): string {
  const root = sourceRoot ?? defaultSourceRoot();
  if (root === undefined) return UNKNOWN_VERSION;
  const memoized = sourceVersionMemo.get(root);
  if (memoized !== undefined) return memoized;
  const marketplace = readJsonObject(path.join(root, '.claude-plugin', 'marketplace.json'));
  const metadata = marketplace?.metadata;
  const version = typeof metadata === 'object' && metadata !== null
    ? (metadata as Record<string, unknown>).version
    : undefined;
  const resolved = isVersionString(version) ? version : UNKNOWN_VERSION;
  sourceVersionMemo.set(root, resolved);
  return resolved;
}

/** Version of the payload recorded in the consumer's release manifest. */
export function readPayloadTdkVersion(consumerRoot: string): string | undefined {
  const version = readJsonObject(path.join(consumerRoot, '.specify', 'release-manifest.json'))?.tdkVersion;
  return isVersionString(version) ? version : undefined;
}

/** `tdkVersion` recorded by the consumer's Claude install state, if any. */
export function readClaudeStateTdkVersion(consumerRoot: string): string | undefined {
  const version = readJsonObject(path.join(consumerRoot, '.specify', 'state', 'harness-install', 'claude.json'))?.tdkVersion;
  return isVersionString(version) ? version : undefined;
}

/** Versions of the selected plugins; the convert-flat owner is never a plugin. */
export function pickPluginVersions(
  entries: Record<string, { version?: unknown } | undefined>,
  selectedPlugins: string[],
): Record<string, string> | undefined {
  const picked: Record<string, string> = {};
  for (const name of [...selectedPlugins].sort()) {
    if (name === 'convert-flat') continue;
    const version = entries[name]?.version;
    if (typeof version === 'string' && version !== '') picked[name] = version;
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
}

/** Plugin versions from a consumer plugin manifest (`plugins` or `codex-plugins`). */
export function readManifestPluginVersions(
  consumerRoot: string,
  manifestDir: 'plugins' | 'codex-plugins',
  selectedPlugins: string[],
): Record<string, string> | undefined {
  const plugins = readJsonObject(path.join(consumerRoot, '.specify', manifestDir, 'manifest.json'))?.plugins;
  if (typeof plugins !== 'object' || plugins === null) return undefined;
  return pickPluginVersions(plugins as Record<string, { version?: unknown }>, selectedPlugins);
}

/** Keys of the version stamps that other builders carry forward or set, omitting unknown ones. */
export function optionalVersionFields(fields: {
  tdkVersion?: string;
  sourceTdkVersion?: string;
  pluginVersions?: Record<string, string>;
}): Pick<HarnessInstallManifest, 'tdkVersion' | 'sourceTdkVersion' | 'pluginVersions'> {
  return {
    ...(fields.tdkVersion === undefined ? {} : { tdkVersion: fields.tdkVersion }),
    ...(fields.sourceTdkVersion === undefined ? {} : { sourceTdkVersion: fields.sourceTdkVersion }),
    ...(fields.pluginVersions === undefined ? {} : { pluginVersions: fields.pluginVersions }),
  };
}

export function claudeVersionDriftNote(previous: HarnessInstallManifest, payloadVersion: string | undefined): string | undefined {
  if (payloadVersion === undefined || payloadVersion === previous.tdkVersion) return undefined;
  return `version (informational): recorded tdkVersion ${previous.tdkVersion ?? UNKNOWN_VERSION}, payload ${payloadVersion}\n`;
}

export function ompVersionDriftNote(consumerRoot: string, omp: HarnessInstallManifest): string | undefined {
  const projection = readClaudeStateTdkVersion(consumerRoot);
  if (projection === undefined || projection === omp.sourceTdkVersion) return undefined;
  return `version (informational): recorded sourceTdkVersion ${omp.sourceTdkVersion ?? UNKNOWN_VERSION}, .claude projection ${projection}\n`;
}

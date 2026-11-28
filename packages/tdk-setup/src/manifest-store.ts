import * as fs from 'node:fs';
import * as path from 'node:path';
import { ALL_CONVERT_PARTS, isConvertPart } from './convert-parts';
import { isHookTargetPlatform } from './lib/harness-transform/hook-command';
import {
  assertSafeClaudeTargetRelativePath,
  assertSafeCodexTargetRelativePath,
  assertSafeOmpTargetRelativePath,
} from './target-relative-path';
import { isVersionString, readSourceTdkVersion } from './tdk-version';
import { legacyOwnershipManifestPath, validateHarnessTargetPath } from './target-path-safety';
import type { HarnessInstallManifest, HarnessName } from './types';

export function emptyHarnessManifest(harness: HarnessName = 'claude'): HarnessInstallManifest {
  return {
    version: 1,
    harness,
    selectedPlugins: [],
    installerVersion: readSourceTdkVersion(),
    installedAt: '',
    managedFiles: [],
    managedHooks: [],
  };
}

export function manifestPathFor(consumerRoot: string, harness: HarnessName = 'claude'): string {
  return path.join(consumerRoot, '.specify', 'state', 'harness-install', `${harness}.json`);
}

function isPluginVersions(value: unknown): value is Record<string, string> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((version) => typeof version === 'string');
}

function readManifest(manifestPath: string, expectedHarness: HarnessName): HarnessInstallManifest {
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as HarnessInstallManifest;
  if (
    data.version !== 1 ||
    data.harness !== expectedHarness ||
    !Array.isArray(data.managedFiles) ||
    !Array.isArray(data.managedHooks) ||
    (data.convertedParts !== undefined && (
      !Array.isArray(data.convertedParts) ||
      !data.convertedParts.every(isConvertPart)
    )) ||
    (data.hookTargetPlatform !== undefined && !isHookTargetPlatform(data.hookTargetPlatform))
  ) {
    throw new Error('unexpected manifest shape');
  }
  const { tdkVersion, sourceTdkVersion, pluginVersions, ...rest } = data;
  return {
    ...rest,
    ...(isVersionString(tdkVersion) ? { tdkVersion } : {}),
    ...(isVersionString(sourceTdkVersion) ? { sourceTdkVersion } : {}),
    ...(isPluginVersions(pluginVersions) ? { pluginVersions } : {}),
    convertedParts: data.convertedParts === undefined
      ? undefined
      : ALL_CONVERT_PARTS.filter((part) => data.convertedParts!.includes(part)),
    managedFiles: data.managedFiles.map((file) => {
      if (
        (file.part !== undefined && !isConvertPart(file.part)) ||
        (file.managedRegionChecksum !== undefined && !/^[a-f0-9]{64}$/.test(file.managedRegionChecksum)) ||
        (file.sourcePresent !== undefined && typeof file.sourcePresent !== 'boolean')
      ) {
        throw new Error('unexpected manifest shape');
      }
      let targetRelativePath: string;
      switch (expectedHarness) {
        case 'claude':
          targetRelativePath = assertSafeClaudeTargetRelativePath(file.targetRelativePath, 'managed target path');
          break;
        case 'codex':
          targetRelativePath = assertSafeCodexTargetRelativePath(file.targetRelativePath, 'managed target path');
          break;
        case 'omp':
          targetRelativePath = assertSafeOmpTargetRelativePath(file.targetRelativePath, 'managed target path');
          break;
      }
      return { ...file, targetRelativePath };
    }),
  };
}

export function loadHarnessManifest(consumerRoot: string, harness: HarnessName = 'claude'): HarnessInstallManifest {
  const manifestPath = manifestPathFor(consumerRoot, harness);
  const legacyManifestPath = legacyOwnershipManifestPath(consumerRoot);
  const existingPath = fs.existsSync(manifestPath)
    ? manifestPath
    : harness === 'claude' && fs.existsSync(legacyManifestPath)
      ? legacyManifestPath
      : undefined;
  if (!existingPath) return emptyHarnessManifest(harness);

  try {
    return readManifest(existingPath, harness);
  } catch (err) {
    throw new Error(`Invalid ownership manifest at ${existingPath}. Inspect or delete it manually before rerunning. ${String((err as Error).message)}`);
  }
}

export function saveHarnessManifest(consumerRoot: string, data: HarnessInstallManifest, harness: HarnessName = data.harness): void {
  const manifestPath = manifestPathFor(consumerRoot, harness);
  const stateRoot = path.join(consumerRoot, '.specify', 'state', 'harness-install');
  validateHarnessTargetPath({
    consumerRoot,
    targetPath: manifestPath,
    allowedRoots: [stateRoot],
    label: 'Ownership manifest',
  });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const tmpPath = `${manifestPath}.tmp`;
  validateHarnessTargetPath({ consumerRoot, targetPath: tmpPath, allowedRoots: [stateRoot], label: 'Ownership manifest temp file' });
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  validateHarnessTargetPath({ consumerRoot, targetPath: manifestPath, allowedRoots: [stateRoot], label: 'Ownership manifest' });
  fs.renameSync(tmpPath, manifestPath);
}

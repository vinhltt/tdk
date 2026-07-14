import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertSafeClaudeTargetRelativePath, assertSafeCodexTargetRelativePath } from './target-relative-path';
import { validateHarnessTargetPath } from './target-path-safety';
import type { HarnessInstallManifest, HarnessName } from './types';

export function emptyHarnessManifest(harness: HarnessName = 'claude'): HarnessInstallManifest {
  return {
    version: 1,
    harness,
    selectedPlugins: [],
    installerVersion: '0.1.0',
    installedAt: '',
    managedFiles: [],
    managedHooks: [],
  };
}

export function legacyManifestPathFor(consumerRoot: string): string {
  return path.join(consumerRoot, '.specify', 'state', 'harness-install.json');
}

export function manifestPathFor(consumerRoot: string, harness: HarnessName = 'claude'): string {
  return path.join(consumerRoot, '.specify', 'state', 'harness-install', `${harness}.json`);
}

function readManifest(manifestPath: string, expectedHarness: HarnessName): HarnessInstallManifest {
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as HarnessInstallManifest;
  if (data.version !== 1 || data.harness !== expectedHarness || !Array.isArray(data.managedFiles) || !Array.isArray(data.managedHooks)) {
    throw new Error('unexpected manifest shape');
  }
  return {
    ...data,
    managedFiles: data.managedFiles.map((file) => ({
      ...file,
      targetRelativePath: expectedHarness === 'claude'
        ? assertSafeClaudeTargetRelativePath(file.targetRelativePath, 'managed target path')
        : assertSafeCodexTargetRelativePath(file.targetRelativePath, 'managed target path'),
    })),
  };
}

export function loadHarnessManifest(consumerRoot: string, harness: HarnessName = 'claude'): HarnessInstallManifest {
  const manifestPath = manifestPathFor(consumerRoot, harness);
  const legacyManifestPath = legacyManifestPathFor(consumerRoot);
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

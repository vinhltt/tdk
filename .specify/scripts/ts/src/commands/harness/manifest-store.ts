import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HarnessInstallManifest, HarnessName } from './types';

export function emptyHarnessManifest(): HarnessInstallManifest {
  return {
    version: 1,
    harness: 'claude',
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

function readManifest(manifestPath: string): HarnessInstallManifest {
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as HarnessInstallManifest;
  if (data.version !== 1 || data.harness !== 'claude' || !Array.isArray(data.managedFiles) || !Array.isArray(data.managedHooks)) {
    throw new Error('unexpected manifest shape');
  }
  return data;
}

export function loadHarnessManifest(consumerRoot: string): HarnessInstallManifest {
  const manifestPath = manifestPathFor(consumerRoot);
  const legacyManifestPath = legacyManifestPathFor(consumerRoot);
  const existingPath = fs.existsSync(manifestPath)
    ? manifestPath
    : fs.existsSync(legacyManifestPath)
      ? legacyManifestPath
      : undefined;
  if (!existingPath) return emptyHarnessManifest();

  try {
    return readManifest(existingPath);
  } catch (err) {
    throw new Error(`Invalid ownership manifest at ${existingPath}. Inspect or delete it manually before rerunning. ${String((err as Error).message)}`);
  }
}

export function saveHarnessManifest(consumerRoot: string, data: HarnessInstallManifest): void {
  const manifestPath = manifestPathFor(consumerRoot);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const tmpPath = `${manifestPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmpPath, manifestPath);
}

// Resolve the TDK release version stamped into plugin manifests as `tdk_version`.
// Never throws: any unreadable, malformed, or non-semver source counts as absent.
// Precedence: TDK source tree (distribute.json + marketplace.json) → consumer release manifest → undefined.

import * as fs from 'node:fs';
import * as path from 'node:path';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function readJsonObject(file: string): Record<string, unknown> | undefined {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function asSemver(value: unknown): string | undefined {
  return typeof value === 'string' && SEMVER.test(value) ? value : undefined;
}

export function resolveTdkVersion(projectRoot: string): string | undefined {
  const marketplacePath = path.join(projectRoot, '.claude-plugin', 'marketplace.json');
  if (fs.existsSync(path.join(projectRoot, 'distribute.json')) && fs.existsSync(marketplacePath)) {
    const metadata = readJsonObject(marketplacePath)?.['metadata'];
    const fromMarketplace = typeof metadata === 'object' && metadata !== null
      ? asSemver((metadata as Record<string, unknown>)['version'])
      : undefined;
    if (fromMarketplace) return fromMarketplace;
  }
  return asSemver(readJsonObject(path.join(projectRoot, '.specify', 'release-manifest.json'))?.['tdkVersion']);
}

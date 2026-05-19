// Manifest JSON load + atomic write. Mirrors Python load_manifest / write_manifest.
// Atomic write: write to .tmp then fs.renameSync (POSIX os.replace equivalent).

import * as fs from 'node:fs';
import type { Manifest } from './types';

const EMPTY_MANIFEST: Manifest = { algorithm: 'sha256', generated_at: '', plugins: {} };

/** Read existing manifest.json. Returns empty structure if missing or invalid JSON. */
export function loadManifest(manifestPath: string): Manifest {
  if (!fs.existsSync(manifestPath)) {
    return { ...EMPTY_MANIFEST, plugins: {} };
  }
  try {
    const text = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(text) as Manifest;
  } catch {
    return { ...EMPTY_MANIFEST, plugins: {} };
  }
}

/**
 * Write manifest.json atomically (write to .tmp then rename).
 * Sets generated_at to current UTC time as YYYY-MM-DDTHH:MM:SSZ (no millis, matches Python strftime).
 */
export function writeManifest(manifestPath: string, data: Manifest): void {
  const now = new Date();
  // Format: YYYY-MM-DDTHH:MM:SSZ  (Python: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
  const pad = (n: number) => String(n).padStart(2, '0');
  data.generated_at = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`;

  const tmpPath = manifestPath.replace(/\.json$/, '.json.tmp');
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmpPath, manifestPath);
}

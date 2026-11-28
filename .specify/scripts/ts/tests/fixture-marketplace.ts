// Test helper: writes `.claude-plugin/marketplace.json` with `metadata.version` into a temp source root.
// The release manifest generator reads this file to stamp the TDK release version.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURE_TDK_VERSION = '1.2.3';

export function writeFixtureMarketplace(root: string, version: string = FIXTURE_TDK_VERSION): void {
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'fixture', metadata: { version } }, null, 2) + '\n',
  );
}

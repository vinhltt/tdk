import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDistributeConfig, resolveShippableFiles } from '../../../../.claude/skills/tdk-bump/scripts/release-manifest-resolver';

// tdk-setup's installer walks plugins/manifest.json and throws "Manifest file is missing" for any entry under an
// installable prefix that is not on disk in the consumer. The release payload is resolved from distribute.json, so the two
// lists must agree: a file the plugin manifest lists but the release does not ship breaks every install that selects it.
const TDK_ROOT = resolve(import.meta.dir, '../../../..');
const INSTALLABLE_PREFIXES = ['skills/', 'agents/', 'hooks/', 'commands/', 'lib/', 'scripts/'];

describe('plugins/manifest.json against the release payload', () => {
  test('every installable-prefix entry is shipped by distribute.json', async () => {
    const manifest = JSON.parse(readFileSync(resolve(TDK_ROOT, '.specify/plugins/manifest.json'), 'utf8')) as {
      plugins: Record<string, { files?: Record<string, string> }>;
    };
    const shipped = new Set(await resolveShippableFiles(TDK_ROOT, await readDistributeConfig(TDK_ROOT)));
    const unshipped: string[] = [];
    for (const [plugin, entry] of Object.entries(manifest.plugins)) {
      for (const file of Object.keys(entry.files ?? {})) {
        if (!INSTALLABLE_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
        if (!shipped.has(`.specify/plugins/${plugin}/${file}`)) unshipped.push(`${plugin}/${file}`);
      }
    }
    expect(unshipped).toEqual([]);
  });
});

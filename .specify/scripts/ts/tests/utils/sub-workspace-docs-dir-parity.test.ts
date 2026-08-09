// The CLI (TypeScript, bun) and the prompt-injection hook (plain CJS) cannot import
// each other, so each derives the sub-workspace docs directory on its own. This test
// is the only thing keeping the two derivations from drifting apart again: the hook
// previously keyed the directory by sw.path while the CLI keyed it by sw.name, which
// silently pointed every injected "Workspace rules" line at a directory that does not
// exist.

import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { subWorkspaceDocsDir } from '../../src/utils/config';

const require = createRequire(import.meta.url);
const READER_PATH = resolve(
  import.meta.dir,
  '../../../../plugins/tdk-core/lib/speckit-config-reader.cjs',
);
const { getSubWorkspaceRulesPath } = require(READER_PATH) as {
  getSubWorkspaceRulesPath: (
    config: unknown,
    workspace: { name: string; path: string },
    cwd: string,
  ) => string | null;
};

const WORKSPACE_ROOT = '/project';
const DOCS_PATH = '.specify/configurations';

function posix(value: string): string {
  return value.replace(/\\/g, '/');
}

describe('sub-workspace docs dir parity between the CLI and the hook runtime', () => {
  // name !== path on purpose: when they match, both derivations agree by accident
  // and the test proves nothing.
  const cases: Array<{ name: string; path: string }> = [
    { name: 'web', path: 'apps/web' },
    { name: 'api', path: 'services/api' },
    { name: 'admin', path: 'admin' },
  ];

  for (const workspace of cases) {
    it(`agrees for name=${workspace.name} path=${workspace.path}`, () => {
      const fromCli = subWorkspaceDocsDir(WORKSPACE_ROOT, DOCS_PATH, workspace.name);
      const fromHook = getSubWorkspaceRulesPath(
        { docs: { path: DOCS_PATH } },
        workspace,
        WORKSPACE_ROOT,
      );

      expect(fromHook).not.toBeNull();
      // The hook returns the rules/ directory nested inside the docs directory.
      expect(posix(fromHook!)).toBe(posix(join(fromCli, 'rules')));
    });
  }

  it('keys the directory by name, not by path', () => {
    const nested = subWorkspaceDocsDir(WORKSPACE_ROOT, DOCS_PATH, 'web');
    expect(posix(nested)).toBe('/project/.specify/configurations/sub-workspaces/web');
  });
});

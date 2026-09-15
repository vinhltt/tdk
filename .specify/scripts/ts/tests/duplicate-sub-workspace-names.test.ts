import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectConfig } from '../src/utils/config';
import { readGitMap, rowStateOf } from '../src/utils/git-map';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function detectNames(names: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'tdk-duplicate-names-'));
  roots.push(root);
  mkdirSync(join(root, '.specify'));
  writeFileSync(join(root, '.specify/.specify.json'), JSON.stringify({
    name: 'fixture',
    subWorkspaces: names.map((name, index) => ({ name, path: `apps/app-${index}` })),
  }));
  return detectConfig({ configAnchor: root });
}

describe('duplicate sub-workspace names use own-key semantics', () => {
  for (const name of ['constructor', 'toString', '__proto__']) {
    it(`accepts one schema-valid ${name} name without reading Object.prototype`, () => {
      const result = detectNames([name]);

      expect(result.configFound).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.subWorkspaces[0]?.name).toBe(name);
    });

    it(`fails closed and preserves both paths for duplicate ${name} names`, () => {
      const result = detectNames([name, name]);

      expect(result.configFound).toBe(false);
      expect(result.error).toBe('duplicate_sub_workspace_names');
      expect(result.duplicateSubWorkspaceNames?.[name]).toEqual(['apps/app-0', 'apps/app-1']);
    });
  }

  it('treats inherited object names as absent from every parsed per-repository map', () => {
    for (const name of ['constructor', 'toString', '__proto__']) {
      const featureDir = mkdtempSync(join(tmpdir(), 'tdk-own-key-git-map-'));
      roots.push(featureDir);
      writeFileSync(join(featureDir, 'git-map.md'), [
        '---',
        'task_id: sample-001',
        'feature_branch: feature/sample-001',
        'milestone_branch:',
        '  api: epic-1',
        'base_commit_by_repo:',
        `  api: ${'a'.repeat(40)}`,
        '---',
        '',
        '# Git Map',
        '',
        '| Sub-workspace | Repo path | Milestone | Branch | Base ref | Worktree path |',
        '|---|---|---|---|---|---|',
        `| ${name} | apps/example | - | - | refs/heads/main | - |`,
        '',
      ].join('\n'));

      const map = readGitMap(featureDir)!;
      expect(map.baseCommitByRepo[name]).toBeUndefined();
      expect(map.milestoneByRepo[name]).toBeUndefined();
      expect(map.cleaningByRepo[name]).toBeUndefined();
      expect(map.cleanedByRepo[name]).toBeUndefined();
      expect(rowStateOf(map, name)).toBe('pending');
    }
  });
});

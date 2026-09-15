// Two-way guard between what the status collector emits and what tdk-status/SKILL.md documents.
//
// The existing skill-contract test only asserts that headings survive; it cannot catch the failure
// this file exists for — a field added to the script and never documented, or documented under a
// name the script no longer emits. Consumers such as /tdk-implement read the documented contract,
// so drift between the two is a silent break for them.

import { afterAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { makeRepo } from './fixtures/polyrepo';

const STATUS_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-status/SKILL.md',
);
const STATUS_SOURCE = resolve(import.meta.dir, '../src/commands/feature/status.ts');

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// Repository construction lives in the shared fixture so there is exactly one definition of
// "a git repo on a branch" across the suite.

/** A polyrepo workspace on the milestone branch, with one matched and one drifted sub-workspace. */
function makeWorkspace(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-status-contract-')));
  roots.push(root);

  makeRepo(root, 'epic-1');
  makeRepo(join(root, 'apps/api'), 'feature/sample-001');
  makeRepo(join(root, 'apps/web'), 'develop');

  mkdirSync(join(root, '.specify'), { recursive: true });
  writeFileSync(join(root, '.specify/.specify.json'), JSON.stringify({
    name: 'sample-workspace',
    git: { mainBranch: 'main' },
    subWorkspaces: [
      { name: 'api', path: 'apps/api' },
      { name: 'web', path: 'apps/web' },
    ],
  }));

  const featureDir = join(root, '.specify/feature/sample-001');
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, 'spec.md'), [
    '---',
    'feature_branch: feature/sample-001',
    'milestone_branch: epic-1',
    '---',
    '',
    '# Sample feature',
    '',
  ].join('\n'));
  writeFileSync(join(featureDir, 'plan.md'), [
    '# Plan',
    '',
    '## Phases',
    '',
    '| Phase | Title | Status | Priority | Dependencies |',
    '|---|---|---|---|---|',
    '| 01 | [Sample](phase-01-sample.md) | todo | P1 | — |',
    '',
  ].join('\n'));
  writeFileSync(join(featureDir, 'git-map.md'), [
    '---',
    'task_id: sample-001',
    'feature_branch: feature/sample-001',
    'milestone_branch: epic-1',
    'created: 2026-08-24',
    '---',
    '',
    '# Git Map',
    '',
    '| Sub-workspace | Repo path | Branch | Base ref | Worktree path |',
    '|---|---|---|---|---|',
    '| api | apps/api | feature/sample-001 | origin/main | - |',
    '| web | apps/web | feature/sample-001 | origin/develop | - |',
    '',
  ].join('\n'));

  return root;
}

function runStatus(root: string, featureId: string): Record<string, any> {
  const stdout = execFileSync('bun', [STATUS_SOURCE, featureId], {
    cwd: root,
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return JSON.parse(stdout);
}

/**
 * Collect the field names documented under `Use structured JSON fields` in tdk-status/SKILL.md
 * that belong to `prefix`, e.g. `git.` or `subWorkspaces[].`.
 */
function parseContractSection(prefix: string): string[] {
  const skill = readFileSync(STATUS_SKILL, 'utf-8');
  const start = skill.indexOf('Use structured JSON fields');
  expect(start).toBeGreaterThan(-1);

  const rest = skill.slice(start);
  const end = rest.indexOf('\n## ');
  const section = end === -1 ? rest : rest.slice(0, end);

  const documented = new Set<string>();
  for (const match of section.matchAll(/`([^`]+)`/g)) {
    const token = match[1]!;
    if (token.startsWith(prefix)) documented.add(token.slice(prefix.length));
  }
  return [...documented].sort();
}

describe('status JSON contract drift', () => {
  const root = makeWorkspace();
  const status = runStatus(root, 'sample-001');

  it('emits sub-workspace branch state for a polyrepo feature', () => {
    expect(status['git']['available']).toBe(true);
    expect(status['subWorkspaces']).toHaveLength(2);
    expect(status['subWorkspaces'][0]['state']).toBe('matched');
    expect(status['subWorkspaces'][1]['state']).toBe('drifted');
  });

  it('documents every git.* field it emits, and emits every one it documents', () => {
    const emitted = Object.keys(status['git']).sort();
    const documented = parseContractSection('git.');

    expect(emitted.filter(key => !documented.includes(key))).toEqual([]);
    // `milestone` and `milestoneState` are single-repository keys: this fixture is a polyrepo,
    // where milestones live per sub-workspace instead. They must still be documented, and the
    // monolith test below proves a single-repo project really emits them.
    const MONOLITH_ONLY = ['milestone', 'milestoneState'];
    expect(documented.filter(key => !emitted.includes(key) && !MONOLITH_ONLY.includes(key))).toEqual([]);
    for (const key of MONOLITH_ONLY) expect(documented).toContain(key);
    for (const key of MONOLITH_ONLY) expect(emitted).not.toContain(key);
  });

  it('documents every subWorkspaces[].* field it emits, and emits every one it documents', () => {
    const emitted = [...new Set(
      (status['subWorkspaces'] as Record<string, unknown>[]).flatMap(entry => Object.keys(entry)),
    )].sort();
    const documented = parseContractSection('subWorkspaces[].');

    expect(emitted.filter(key => !documented.includes(key))).toEqual([]);
    // `note` is conditional: it appears only on unknown rows, so require it to be documented
    // without requiring the matched/drifted fixture above to emit it.
    expect(documented.filter(key => !emitted.includes(key) && key !== 'note')).toEqual([]);
    expect(documented).toContain('note');
  });

  it('keeps the pre-existing git fields so /tdk-implement preflight stays additive', () => {
    for (const key of ['available', 'branch', 'featureBranch', 'featureBranchExists', 'uncommitted']) {
      expect(status['git']).toHaveProperty(key);
    }
  });

  it('reports the milestone under git on a single-repo project, and omits subWorkspaces', () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-status-single-')));
    roots.push(root);
    makeRepo(root, 'epic-1');
    mkdirSync(join(root, '.specify'), { recursive: true });
    writeFileSync(join(root, '.specify/.specify.json'), JSON.stringify({ name: 'sample-single' }));

    const featureDir = join(root, '.specify/feature/sample-002');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'spec.md'), '---\nmilestone_branch: epic-1\n---\n\n# Sample single repo\n');
    writeFileSync(join(featureDir, 'plan.md'), [
      '# Plan', '', '## Phases', '',
      '| Phase | Title | Status | Priority | Dependencies |',
      '|---|---|---|---|---|',
      '| 01 | [Sample](phase-01-sample.md) | todo | P1 | — |', '',
    ].join('\n'));

    const single = runStatus(root, 'sample-002');

    // Here the artifact host IS the code repository, so it is the one place a milestone can be
    // reported — and there are no sub-workspaces to report one per repository.
    expect(single).not.toHaveProperty('subWorkspaces');
    expect(single['git']['milestone']).toBe('epic-1');
    // No feature branch has been created yet, so there is nothing to compare against.
    expect(single['git']['milestoneState']).toBe('unknown');
  });
});

describe('duplicate sub-workspace status guard', () => {
  it('returns duplicate diagnostics instead of probing per-repository status', () => {
    const root = makeWorkspace();
    const configPath = join(root, '.specify/.specify.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    config.subWorkspaces.push({ name: 'api', path: 'apps/duplicate-api' });
    writeFileSync(configPath, JSON.stringify(config));

    const status = runStatus(root, 'sample-001');

    expect(status).toEqual({
      featureId: 'sample-001',
      error: 'duplicate_sub_workspace_names',
      duplicateSubWorkspaceNames: { api: ['apps/api', 'apps/duplicate-api'] },
    });
  });
});

describe('featureBranch resolution', () => {
  function makeFeature(specFrontmatter: string | null): Record<string, any> {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-status-branch-')));
    roots.push(root);
    makeRepo(root, 'epic-1');
    mkdirSync(join(root, '.specify'), { recursive: true });
    writeFileSync(join(root, '.specify/.specify.json'), JSON.stringify({ name: 'sample-workspace' }));

    const featureDir = join(root, '.specify/feature/sample-001');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(
      join(featureDir, 'spec.md'),
      specFrontmatter === null ? '# Sample\n' : `---\n${specFrontmatter}\n---\n\n# Sample\n`,
    );
    writeFileSync(join(featureDir, 'plan.md'), [
      '# Plan', '', '## Phases', '',
      '| Phase | Title | Status | Priority | Dependencies |',
      '|---|---|---|---|---|',
      '| 01 | [Sample](phase-01-sample.md) | todo | P1 | — |', '',
    ].join('\n'));

    return runStatus(root, 'sample-001');
  }

  it('uses feature_branch from spec.md verbatim', () => {
    expect(makeFeature('feature_branch: sample/custom-name')['git']['featureBranch'])
      .toBe('sample/custom-name');
  });

  it('falls back to <defaultFolder>/<ticket> when spec.md has no feature_branch', () => {
    expect(makeFeature(null)['git']['featureBranch']).toBe('feature/sample-001');
  });

  it('falls back rather than throwing when feature_branch fails the allowlist', () => {
    const status = makeFeature('feature_branch: "../../etc/passwd"');
    expect(status['git']['featureBranch']).toBe('feature/sample-001');
  });

  it('reports the root repository branch, not the enclosing repository branch', () => {
    expect(makeFeature('milestone_branch: epic-1')['git']['rootBranch']).toBe('epic-1');
  });
});

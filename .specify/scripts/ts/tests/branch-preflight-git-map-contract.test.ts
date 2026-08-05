import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GIT_MAP_CONTRACT = resolve(
  import.meta.dir,
  '../../../plugins/tdk-utils/skills/tdk-branch-preflight/references/git-map-contract.md',
);
const PREFLIGHT_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-utils/skills/tdk-branch-preflight/SKILL.md',
);
const WORKTREE_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-utils/skills/tdk-repo-worktree/SKILL.md',
);
const PLAN_SKILL = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-plan/SKILL.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('git-map seed lifecycle contract', () => {
  it('distinguishes a plan seed from a realized run by frontmatter, not row count', () => {
    const contract = read(GIT_MAP_CONTRACT);
    const preflight = read(PREFLIGHT_SKILL);

    // Keying the branch-name lock on row count would freeze the name before the
    // user ever saw it, because a plan seed already has rows.
    expect(contract).toContain('never the row count');
    expect(contract).toContain('Row count cannot carry this signal');
    expect(preflight).toContain('Key this on the frontmatter field, never on row count');
  });

  it('seeds omit feature_branch so the branch name stays editable', () => {
    const contract = read(GIT_MAP_CONTRACT);
    expect(contract).toContain('no `feature_branch`');
    expect(contract).toMatch(/Seed, written by `\/tdk-plan`/);
  });

  it('treats seeded base refs as suggestions that are re-verified at implement time', () => {
    const preflight = read(PREFLIGHT_SKILL);
    expect(preflight).toContain('never trusted blindly');
    expect(preflight).toContain("git-map seed's `Base ref` column");
  });

  it('plans seed the git map only for polyrepo projects', () => {
    const plan = read(PLAN_SKILL);
    expect(plan).toContain('### Step 3e — Seed Git Map');
    // config always sets subWorkspaces to [], so a missing-key test never fires
    expect(plan).toContain('empty or absent');
    expect(plan).toContain('not a missing key');
    // Plan time records intent only — no branch, no fetch.
    expect(plan).toContain('creates no branch and runs no fetch');
  });

  it('keeps plan.md structure and frontmatter schema closed', () => {
    const plan = read(PLAN_SKILL);
    expect(plan).toContain('rather than adding a section to');
  });

  it('derives worktree names from the agreed branch, defined once', () => {
    const contract = read(GIT_MAP_CONTRACT);
    const worktree = read(WORKTREE_SKILL);
    expect(contract).toContain('WORKTREE_NAME');
    // Phase 2 links to the contract instead of restating the rule as a second authority.
    expect(worktree).toContain('single source of truth');
    expect(worktree).toContain('non-normative');
  });

  it('never presents check-ref-format as an injection filter', () => {
    for (const path of [PREFLIGHT_SKILL, WORKTREE_SKILL]) {
      const text = read(path);
      expect(text).toContain('^[A-Za-z0-9._/-]+$');
      expect(text).not.toMatch(/check-ref-format[^.]{0,80}(prevents|blocks|stops) (command )?injection/i);
    }
  });

  it('anchors every git command at PROJECT_DIR', () => {
    for (const path of [PREFLIGHT_SKILL, WORKTREE_SKILL]) {
      const text = read(path);
      expect(text).not.toContain('CLAUDE_PROJECT_DIR');
      expect(text).not.toContain('$PWD');
    }
  });
});

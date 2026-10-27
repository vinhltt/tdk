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

const IMPLEMENT_EXECUTION = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-implement/references/phase-execution.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** Prose wraps freely, so compare with every whitespace run collapsed to one space. */
function flat(path: string): string {
  return read(path).replace(/\s+/g, ' ');
}

const PATH_IN_REPO_STOP =
  'path <p> is inside repository <T>, which has sub-workspaces but no repo-level sub-workspace; add one for <T>';
const GROUP_MISMATCH = 'repository group <T> disagrees on';

describe('git-map seed lifecycle contract', () => {
  it('distinguishes a plan seed from a realized run by frontmatter, not row count', () => {
    const preflight = read(PREFLIGHT_SKILL);

    // Keying the branch-name lock on row count would freeze the name before the
    // user ever saw it, because a plan seed already has rows.
    //
    // The contract side of this invariant is asserted behaviourally in
    // git-map-contract-milestone.test.ts (`classifyRow` returns `seed` whenever `feature_branch`
    // is absent, whatever the rows contain). Pinning the contract's English sentences here as
    // well only made the rule expensive to restate.
    expect(preflight).toContain('Key this on the frontmatter field, never on row count');
  });

  it('seeds omit feature_branch so the branch name stays editable', () => {
    const contract = read(GIT_MAP_CONTRACT);
    expect(contract).toContain('no `feature_branch`');
    expect(contract).toMatch(/Seed, written by `\/tdk-plan`/);
  });

  it('plans seed the git map only for polyrepo projects', () => {
    const plan = read(PLAN_SKILL);
    expect(plan).toContain('### Step 3e — Seed Git Map');
    // config always sets subWorkspaces to [], so a missing-key test never fires
    expect(plan).toContain('empty or absent');
    expect(plan).toContain('not a missing key');
    // Plan time records intent only: it creates nothing, but it does fetch — read-only — so each
    // repository's base ref is seeded from its real default branch.
    expect(plan).toContain('creates nothing, and fetches read-only to seed base refs');
    // A hung remote must not hang the plan, and a remote wanting credentials must not open a
    // prompt inside a step that is documented as never blocking.
    expect(plan).toContain('TIMEOUT_BIN');
    expect(plan).toContain('GIT_TERMINAL_PROMPT=0');
    expect(plan).toContain('seeded from mainBranch');
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

describe('repositories holding several sub-workspaces', () => {
  it('defines segment-bounded deepest-match mapping once, and the skills link to it', () => {
    const contract = flat(GIT_MAP_CONTRACT);
    expect(contract).toContain('## Repositories holding several sub-workspaces');
    expect(contract).toContain('**deepest segment-bounded match**');
    expect(contract).toContain('`sub.path`, or starts with `sub.path + "/"`');
    expect(contract).toContain('`shared-data`, never `shared`');
    for (const path of [PREFLIGHT_SKILL, PLAN_SKILL]) {
      const text = flat(path);
      expect(text).toContain('deepest segment-bounded match');
      expect(text).toContain('*Repositories holding several sub-workspaces*');
      expect(text).not.toMatch(/by prefix|prefix-match/);
    }
  });

  it('seeds inner sub-workspaces and skips only plain ones', () => {
    const plan = flat(PLAN_SKILL);
    expect(plan).not.toContain('Skip a sub-workspace whose directory is not its own repository');
    expect(plan).toContain('skip only a `plain` one');
    expect(plan).toContain('one anchor path per repository group');
    expect(plan).toContain("A repository group's single result applies to **every** member");
  });

  it('creates the branch once per repository group at its anchor path and records every member', () => {
    const contract = flat(GIT_MAP_CONTRACT);
    const preflight = flat(PREFLIGHT_SKILL);
    expect(contract).toContain('runs **once per group**, at `git -C "$PROJECT_DIR/<anchor path>"`');
    expect(preflight).toContain('create once per group at the anchor path');
    expect(preflight).toContain('git -C "$PROJECT_DIR/$ANCHOR_PATH" branch -- "$BRANCH" "$BASE_COMMIT"');
    expect(preflight).toContain('one row for every member, in the same write');
    expect(preflight).toContain('Every affected repository group on one line');
  });

  it('stops on a path inside a repository without a repo-level sub-workspace, and on a group mismatch', () => {
    const contract = flat(GIT_MAP_CONTRACT);
    const preflight = flat(PREFLIGHT_SKILL);
    expect(contract).toContain(PATH_IN_REPO_STOP);
    expect(preflight).toContain(PATH_IN_REPO_STOP);
    expect(preflight).toContain('main-checkout and the worktree route alike');
    expect(contract).toContain(GROUP_MISMATCH);
    expect(preflight).toContain(GROUP_MISMATCH);
    expect(flat(PLAN_SKILL)).toContain(GROUP_MISMATCH);
  });

  it('documents the repo-level config pattern, the pathspec staging rule and the after-create notes', () => {
    const contract = flat(GIT_MAP_CONTRACT);
    expect(contract).toContain('{ "name": "be", "path": "src/be" }');
    expect(contract).toContain('stages its feature paths by pathspec only');
    const worktree = flat(WORKTREE_SKILL);
    expect(worktree).toContain('### After create');
    expect(worktree).toContain('submodule update --init');
    expect(worktree).toContain('Never copy secrets automatically');
    expect(worktree).toContain('core.longpaths true');
  });
});

describe('worktrees for a repository group', () => {
  const PRECONDITION_STOP = 'add a repo-level sub-workspace for <T> to use worktrees';

  it('stops the worktree route without a repo-level sub-workspace in all three skills', () => {
    for (const path of [GIT_MAP_CONTRACT, PREFLIGHT_SKILL, WORKTREE_SKILL, IMPLEMENT_EXECUTION]) {
      expect(flat(path)).toContain(PRECONDITION_STOP);
    }
  });

  it('defines --show-prefix translation once, in the contract, and the skills link to it', () => {
    const contract = flat(GIT_MAP_CONTRACT);
    expect(contract).toContain('### Worktrees for a repository group');
    expect(contract).toContain('PREFIX=$(git -C "$PROJECT_DIR/P" rev-parse --show-prefix)');
    expect(contract).toContain('translated path = <Worktree path>/<PREFIX><rest>');
    expect(contract).toContain('`_worktrees/be/feature-sample-001/core/X.cs`');
    expect(contract).toContain('`_worktrees/be/feature-sample-001/App.sln`');
    for (const path of [PREFLIGHT_SKILL, WORKTREE_SKILL, IMPLEMENT_EXECUTION]) {
      const text = flat(path);
      expect(text).not.toContain('rev-parse --show-prefix)');
      expect(text).toContain('*Worktrees for a repository group*');
    }
  });

  it('creates one worktree per group, records it on every member, and never adds it twice', () => {
    const contract = flat(GIT_MAP_CONTRACT);
    expect(contract).toContain('Written to the `Worktree path` of **every** member in one git-map write');
    expect(contract).toContain('It never runs a second `worktree add`');
    expect(flat(WORKTREE_SKILL)).toContain('it never runs a second `worktree add`');
  });

  it('runs the identity gate with the worktree root and never realpath-matches the main checkout', () => {
    const contract = flat(GIT_MAP_CONTRACT);
    expect(contract).toContain('never with a prefixed member path');
    expect(contract).toContain('Never realpath-match the main checkout against the list entries');
    expect(contract).toContain('"the main checkout of `<T>`"');
    expect(contract).not.toContain('On an `inner` or `plain` row the layout is not defined yet');
    expect(contract).not.toContain('Only an `own` row has a defined `Worktree path`');
  });

  it('cleans and resets a repository group as one unit', () => {
    const contract = flat(GIT_MAP_CONTRACT);
    const worktree = flat(WORKTREE_SKILL);
    expect(contract).toContain('**A repository group is cleaned as one unit**');
    expect(contract).toContain('`cleaning_by_repo` is written for every member in one write, with the same `intent` and `worktree_path`');
    // The skill links to the contract's group cleanup rule rather than restating it.
    expect(worktree).toContain('as the contract\'s *Cleanup state* defines: every map write covers all members at once');
    expect(worktree).not.toContain('write `cleaning_by_repo` for every member in one write');
    expect(contract).toContain('A rerun continues from any member\'s `cleaning_by_repo` entry');
    expect(contract).toContain('`--repo <member>` resets every member of that member\'s group together');
  });

  it('routes unrealized groups to a worktree under --worktree and never moves a realized one', () => {
    const preflight = flat(PREFLIGHT_SKILL);
    expect(preflight).toContain('WORKTREE_MODE (boolean, default false)');
    expect(preflight).toContain('every repository group that is not yet realized takes the worktree route in step 8');
    expect(preflight).toContain('`<T> is already on the main checkout for this task; --worktree does not move it`');
    expect(preflight).toContain('`--worktree needs a sub-workspace repository; root-repository worktrees are not supported`');
    expect(preflight).toContain('`rerun when the other task\'s git command finishes`');
  });
});

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const skillPath = resolve(import.meta.dir, '../../../plugins/tdk-core/skills/tdk-implement/SKILL.md');
const referencePath = resolve(dirname(skillPath), 'references/parallel-phase-orchestration.md');
const projectPath = resolve(dirname(skillPath), 'references/project-and-phase-contract.md');
const executionPath = resolve(dirname(skillPath), 'references/phase-execution.md');
const read = (path: string): string => readFileSync(path, 'utf8');

// Every operation the retired repo-wide controller CLI exposed. Word-boundary matched
// because plain substrings collide with ordinary prose ("Preserve" contains "reserve",
// "recovery" contains "recover") and with the surviving `transition-phase-status` name.
const RETIRED_CONTROLLER_OPERATIONS = [
  'acquire', 'reserve', 'recover', 'assert-owner', 'inspect-status', 'reconcile-status',
  'snapshot-plan', 'finalize-plan', 'recover-plan', 'transition-status', 'snapshot-wave',
  'audit-wave', 'release',
];

describe('tdk-implement parallel orchestration contract', () => {
  it('loads the progressive parallel reference and rejects incompatible args first', () => {
    const skill = read(skillPath); const project = read(projectPath);
    expect(skill).toContain('Load: `references/parallel-phase-orchestration.md`');
    expect(skill.indexOf('### Step 0 — Parse Args')).toBeLessThan(skill.indexOf('### Step 0.1 — Validate Task ID'));
    expect(project).toContain('/tdk-implement <TASK_ID> --parallel');
    expect(project).toContain('duplicate `--parallel`');
    expect(project).toContain('reject `--parallel` with either `--phase` form before task-id validation');
  });

  it('documents all six prompt-driven main-agent steps with the unchanged frontmatter schema', () => {
    const parallel = read(referencePath);
    for (const heading of [
      'Six steps, in order, once per wave.',
      '### 1. Read the graph', '### 2. Build the candidate set', "### 3. Infer each candidate's access set",
      '### 4. Call the checker once per wave', '### 5. Dispatch the safe set', '### 6. Read reports and persist status',
    ]) expect(parallel).toContain(heading);
    expect(parallel).toContain('A phase is a candidate when `parallel_safe: auto` **and** every `BlockedBy` entry is `done` or `skipped`.');
    expect(parallel).toContain('`parallel_safe` is exactly `auto` or `never`, with `parallel_reason` explaining the value');
    expect(parallel).toContain('Infer the access set directly from the bullets; do not shell out to a markdown parser.');
    expect(parallel).toContain('Each worker returns a prose report, not a strict JSON result');
  });

  it('calls the checker once per wave and writes every status through the one status CLI', () => {
    const parallel = read(referencePath);
    expect(parallel).toContain('Pass the complete candidate array on stdin in exactly one call, never once per phase');
    expect(parallel).toContain('printf \'%s\' "$ACCESS_SETS_JSON" | bun src/commands/util/check-phase-write-disjointness.ts --project-root "$PROJECT_DIR"');
    expect(parallel).toContain('bun src/commands/util/transition-phase-status.ts --project-root "$PROJECT_DIR"');
    expect(parallel).toContain('--phase 3 --to in_progress');
    expect(parallel).toContain('--wave-id "$WAVE_ID"');
    expect(parallel).toContain('Statuses are exactly `todo`, `in_progress`, `done`, `skipped`,\n`blocked`, and `cancelled`');
    expect(parallel).toContain('Every phase named in `conflicts` or `rejected` runs serially per `phase-execution.md`');
  });

  it('caps a wave at four workers as an explicit prompt constraint', () => {
    const parallel = read(referencePath);
    expect(parallel).toContain('**at most four workers per wave**');
    expect(parallel).toContain('This cap is a hard prompt\nconstraint, not a suggestion');
    expect(parallel).toContain('take the four lowest phase numbers and leave the rest for the');
    expect(parallel).toContain('one to four phases, every pair `in_progress` -> `done`');
  });

  it('names no retired controller operation and no repo-wide mutex anywhere', () => {
    const parallel = read(referencePath);
    for (const operation of RETIRED_CONTROLLER_OPERATIONS) {
      expect(parallel).not.toMatch(new RegExp(`\\b${operation}\\b`));
    }
    expect(parallel).not.toMatch(/lease/i);
    const contract = [read(skillPath), read(projectPath), read(executionPath), parallel].join('\n');
    expect(contract).not.toMatch(/parallel-controller|controllerId|--controller-id|resolve-parallel-phase-wave/);
  });

  it('keeps canary proof and one synchronous concurrent worker batch', () => {
    const parallel = read(referencePath);
    expect(parallel).toContain('"probe": "A|B"');
    expect(parallel).toContain('"status": "READY"');
    expect(parallel).toContain('one synchronous concurrent batch in a single message');
    expect(parallel).toContain('join every\nstarted worker before continuing');
    expect(parallel).toContain('No polling, sleeping, retry loop, background dispatch, worker timeout, or wait-state machine.');
    expect(parallel).not.toMatch(/while\s*\(/);
    expect(parallel).not.toContain('setTimeout');
  });

  it('reduces the serial path to run-phase then one status transition', () => {
    const execution = read(executionPath); const project = read(projectPath);
    expect(execution).toContain('single `transition-phase-status` call per transition');
    expect(execution).toContain('Nothing is retained\nbetween phases and no ownership is asserted');
    expect(project).toContain('## Mutation Preconditions');
    expect(project).toContain('No invocation holds a repo-wide mutex.');
    expect(project).toContain('writes every status through the single `transition-phase-status` call defined in');
  });
});

describe('tdk-implement working root', () => {
  const flat = (path: string): string => read(path).replace(/\s+/g, ' ');

  it('re-verifies HEAD at the working root in serial dispatch and in workers', () => {
    const execution = flat(executionPath); const parallel = flat(referencePath);
    expect(execution).toContain('WORKING_ROOT="$PROJECT_DIR/<Worktree path>"');
    expect(execution).toContain('WORKING_ROOT="$PROJECT_DIR/<Repo path>"');
    for (const text of [execution, parallel]) {
      expect(text).toContain('git -C "$WORKING_ROOT" rev-parse --abbrev-ref HEAD');
      expect(text).not.toContain('"$PROJECT_DIR/$SUB_PATH" rev-parse --abbrev-ref');
    }
    expect(execution).toContain('git -C "$WORKING_ROOT" diff');
    expect(execution).toContain('Never fall back to writing in the main checkout');
  });

  it('stops dispatch on a path inside a repository without a repo-level sub-workspace', () => {
    expect(flat(executionPath)).toContain(
      'path <p> is inside repository <T>, which has sub-workspaces but no repo-level sub-workspace; add one for <T>',
    );
  });

  it('parses --worktree as a per-run flag that rejects duplicates, values and --no-branch', () => {
    const project = flat(projectPath); const skill = flat(skillPath);
    expect(project).toContain('WORKTREE_MODE = true only when one --worktree token is provided');
    expect(project).toContain('/tdk-implement <TASK_ID> --parallel --worktree');
    expect(project).toContain('- duplicate `--worktree`');
    expect(project).toContain('- a value attached to `--worktree`');
    expect(project).toContain('- `--worktree` together with `--no-branch`');
    expect(project).toContain('there is no config field for it');
    expect(skill).toContain('`PROJECT_CONTEXT`, `TARGET_ROWS`, `WORKTREE_MODE`');
    // A single-repository project skips preflight, so the flag must stop here rather than be ignored.
    expect(skill).toContain('when `WORKTREE_MODE` is true and `PROJECT_CONTEXT.subWorkspaces` is empty or absent, STOP');
    expect(skill).toContain('`--worktree needs a sub-workspace repository; root-repository worktrees are not supported`');
  });

  it('separates --parallel from concurrent tasks', () => {
    const parallel = flat(referencePath);
    expect(parallel).toContain('`--parallel` runs phases concurrently inside **one** working root per repository');
    expect(parallel).toContain('isolation from worktrees — one task per worktree — never from `--parallel`');
  });
});


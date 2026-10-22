import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Behavior-defining clauses only: what the skill promises not to do and which helpers it must go through.
// Assertions target tokens and ordering invariants a consumer or another skill depends on, not prose.

const SKILL_DIR = resolve(import.meta.dir, '..');
const PLUGINS_DIR = resolve(SKILL_DIR, '../../..');
const read = (relative: string): string => readFileSync(join(SKILL_DIR, relative), 'utf-8');
const SKILL = read('SKILL.md');
const DRAFTING = read('references/close-out-drafting.md');
const INGEST = read('references/ingest-workflow.md');
const RESTORE = read('references/manual-restore.md');
const TEMPLATE = read('templates/close-out-template.md.tpl');
const MEMORY_UPDATE = readFileSync(join(PLUGINS_DIR, 'tdk-memory/skills/tdk-memory-update/SKILL.md'), 'utf-8');
const DEPENDENCIES = JSON.parse(readFileSync(join(PLUGINS_DIR, 'plugin-dependencies.json'), 'utf-8')) as {
  dependencies: Record<string, string[]>;
};

/** Text between two markers; fails loudly when a marker is missing so a renamed heading cannot hide a regression. */
function between(text: string, start: string, end?: string): string {
  const from = text.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = end === undefined ? text.length : text.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return text.slice(from, to);
}

/** Every fenced bash block of a document, joined. */
function bashBlocks(text: string): string {
  return [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]).join('\n');
}

describe('tdk-archive skill contract', () => {
  it('is a user-invocable skill with both documented command shapes', () => {
    expect(SKILL).toMatch(/^name: tdk-archive$/m);
    expect(SKILL).toMatch(/^user-invocable: true$/m);
    expect(SKILL).toMatch(/^argument-hint: ".*<task-id> \[--auto-upmem\].*--ingest \[task-id\]"/m);
  });

  it('rejects malformed flags before reading anything', () => {
    const parse = between(SKILL, '## Step 1', '## Step 2');
    for (const clause of ['unknown or repeated flag', '--auto-upmem', '--ingest', 'without a task id']) expect(parse).toContain(clause);
    expect(parse).toContain('STOP');
    // The first task read (tdk-validate-task-id) happens in Step 2, after argument parsing.
    expect(SKILL.indexOf('tdk-validate-task-id', SKILL.indexOf('## Step 1'))).toBeGreaterThan(SKILL.indexOf('## Step 2'));
  });

  it('resolves the task with check-prerequisites before loading context, and loads context without a feature dir', () => {
    const step2 = between(SKILL, '## Step 2', '## Step 3');
    const resolve = step2.indexOf('check-prerequisites.ts {TASK_ID} --paths-only --json --allow-archived');
    const load = step2.indexOf('tdk-load-project-context');
    expect(resolve).toBeGreaterThan(0);
    expect(load).toBeGreaterThan(resolve);
    // The wrapper needs a project root, so it is fixed (or asked for) before the first script runs.
    const root = step2.indexOf('Fix the project root before running any script');
    expect(root).toBeGreaterThan(0);
    expect(root).toBeLessThan(resolve);
    expect(step2.slice(root, resolve)).toContain('Ask the user');
    expect(step2.slice(root, resolve)).not.toContain('tdk-load-project-context');
    expect(step2.slice(load)).toContain('require_feature_dir=false');
    // An archived id stops here with the ladder next step (archive/<taskId>), before any context load.
    const archivedStop = step2.slice(resolve, load);
    expect(archivedStop).toContain('`archived: true`');
    expect(archivedStop).toContain('STOP');
    expect(archivedStop).toContain('[Next step](#next-step)');
    expect(archivedStop).toContain('archive/<taskId>');
    expect(archivedStop).toContain('`featureDir`');
  });

  it('exempts only close-out.md and sessions.jsonl at the feature dir root from the uncommitted-changes check', () => {
    const step3 = between(SKILL, '## Step 3', '## Step 4');
    expect(step3).toContain('`close-out.md` and `sessions.jsonl`');
    expect(step3).toContain('feature dir root');
    expect(SKILL).not.toMatch(/only `close-out\.md` (at|in) the feature dir root is exempt/);
    expect(SKILL).toContain('git add -A <from> <to>');
  });

  it('runs --check before the apply call, and drafts the close-out between them', () => {
    const check = SKILL.indexOf('archive.ts {TASK_ID} --check');
    const apply = SKILL.indexOf('archive.ts {TASK_ID})');
    expect(check).toBeGreaterThan(0);
    expect(apply).toBeGreaterThan(check);
    const [step3, step4, step5] = ['## Step 3', '## Step 4', '## Step 5'].map((heading) => SKILL.indexOf(heading));
    expect(step3).toBeLessThan(step4);
    expect(step4).toBeLessThan(step5);
    expect(check).toBeGreaterThan(step3);
    expect(check).toBeLessThan(step4);
    expect(apply).toBeGreaterThan(step5);
    expect(between(SKILL, '## Step 3', '## Step 4')).toMatch(/Non-empty `blockers`[^\n]*STOP[^\n]*each blocker with its fix/);
    expect(between(SKILL, '## Step 5', '## Step 6')).toMatch(/repeats every guard of the check/);
  });

  it('resolves the project root from an agent-provided argument, never by shell discovery', () => {
    const wrapper = between(SKILL, '```bash', '```\n\nParse the JSON');
    expect(wrapper).toContain('PROJECT_DIR="$1"');
    expect(wrapper).toContain('-- "<agent-resolved-project-root>"');
    expect(SKILL).not.toMatch(/CLAUDE_PROJECT_DIR|git rev-parse --show-toplevel|\$PWD/);
  });

  it('handles live children with one continue-or-stop question and other references as warnings', () => {
    const step3 = between(SKILL, '## Step 3', '## Step 4');
    expect(step3).toMatch(/`references\.children` non-empty: ask once[^\n]*continue or stop/);
    expect(step3).toMatch(/`references\.plans` non-empty: warn only/);
  });

  it('prints git commands for the user and never executes them', () => {
    expect(SKILL).toMatch(/Git is output, never action[^\n]*printed for the user to run[^\n]*never executed/);
    const step6 = between(SKILL, '## Step 6', '## Ingest');
    expect(step6).toMatch(/Print for the user to run, and do not run them/);
    expect(step6).toContain('git add -A <from> <to>');
    expect(step6).toMatch(/git commit -m /);
    // The git lines sit in a text block, and no bash block of the executable docs contains a git command.
    for (const doc of [SKILL, DRAFTING, INGEST]) expect(bashBlocks(doc)).not.toMatch(/\bgit\b/);
    expect(step6).toMatch(/instead of running git/);
    expect(step6).toContain('mainBranch');
  });

  it('keeps manual restore as the single documented path and links to it', () => {
    expect(SKILL).toContain('references/manual-restore.md');
    expect(SKILL).toMatch(/no un-archive command/);
    expect(RESTORE).toContain('--reconcile-root');
    expect(RESTORE).toMatch(/archived_from/);
  });

  it('skips ingested and skipped rows without querying or writing them', () => {
    expect(INGEST).toMatch(/\|\s*`ingested`\s*\|[^\n]*\|\s*Skip: never query, never write, never re-ask\s*\|/);
    expect(INGEST).toMatch(/\|\s*`skipped \(<reason>\)`\s*\|[^\n]*\|\s*Skip: never query, never write, never re-ask\s*\|/);
    expect(INGEST).toMatch(/`ingested` and `skipped` never change/);
    expect(INGEST).toMatch(/every `pending` row|Walk all `pending` rows/);
    expect(SKILL).toMatch(/Rows already `ingested` or `skipped` are skipped/);
  });

  it('runs the memory preflight before classifying anything and degrades to pending rows', () => {
    const preflight = between(INGEST, '## 2. Memory preflight', '## 3.');
    for (const required of ['memory-index.md', 'memory.yaml', '/tdk-memory-update']) expect(preflight).toContain(required);
    // The root comes from config with a stated default, never a hard-coded path in the checks.
    expect(preflight).toContain('memory.path');
    expect(preflight).toContain('<memoryRoot>/memory-index.md');
    expect(preflight).toContain('<memoryRoot>/memory.yaml');
    expect(preflight).toMatch(/default `\.specify\/memory`/);
    expect(preflight).toMatch(/The check itself writes nothing/);
    expect(preflight).toMatch(/change nothing except the reason of each `pending \(not ingested yet\)` row/);
    expect(preflight).toContain('/tdk-memory-init');
    expect(SKILL).toMatch(/Memory is optional: when it is not initialised the rows stay `pending/);
  });

  it('classifies every pending row before any write, with explicit conflict criteria', () => {
    const [scope, preflight, classify, confirm, write] = ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.'].map((heading) => INGEST.indexOf(heading));
    expect([scope, preflight, classify, confirm, write].every((index) => index >= 0)).toBe(true);
    expect(scope).toBeLessThan(preflight);
    expect(preflight).toBeLessThan(classify);
    expect(classify).toBeLessThan(confirm);
    expect(confirm).toBeLessThan(write);

    const classification = INGEST.slice(classify, confirm);
    expect(classification).toMatch(/Classify every pending row, write nothing yet/);
    expect(classification).toContain('/tdk-memory-query');
    expect(classification).not.toContain('===TDK-MEMORY-CANDIDATE===');
    for (const criterion of ['same label or anchor with different content', 'contradicts the row', 'remove or overwrite', 'unknown domain']) {
      expect(classification.toLowerCase()).toContain(criterion.toLowerCase());
    }
    for (const outcome of ['`identical`', '`conflict`', '`new`']) expect(classification).toContain(outcome);
    expect(classification).toMatch(/Skip is never a default/);
  });

  it('asks exactly one batched confirmation for conflicts and none without a conflict', () => {
    const confirmation = between(INGEST, '## 4. Confirm conflicts once', '## 5.');
    expect(confirmation).toMatch(/No `conflict` row anywhere in scope: continue with zero questions/);
    expect(confirmation).toMatch(/exactly one batched confirmation covering every conflict of every file in scope, never one question per row/);
    expect(confirmation).toMatch(/overrides such as `<spec>:<row id>=skip`/);
    expect(confirmation).toMatch(/`cancel` to discard the conflict decisions and write nothing to memory/);
    expect(confirmation).toMatch(/run to the end without further questions/);
    expect(INGEST).toMatch(/no approval question exists apart from the single conflict confirmation/);
  });

  it('compares rows that share a target and re-queries before a replace, so earlier writes cannot hide a conflict', () => {
    expect(between(INGEST, '5. **Same-target rows.**', '`identical` rows become')).toMatch(/each later one is a `conflict`/);
    expect(between(INGEST, '## 5. Write', '## 6.')).toMatch(/query again right before the write/);
  });

  it('keeps terminal row states across an overwrite of an existing close-out', () => {
    expect(DRAFTING).toMatch(/keeps that row's status \(`ingested` and `skipped` are terminal\)/);
    expect(DRAFTING).toMatch(/identical to the new draft, keep it without asking/);
  });

  it('writes memory only through /tdk-memory-update candidate blocks, one row at a time', () => {
    const write = between(INGEST, '## 5. Write', '## 6.');
    expect(write).toContain('/tdk-memory-update');
    expect(write).toContain('===TDK-MEMORY-CANDIDATE===');
    expect(write).toContain('===END-CANDIDATE===');
    for (const key of ['type:', 'domain:', 'action:', 'name:', 'sourceFiles:', 'content:']) expect(write).toContain(key);
    expect(write).toMatch(/Source: <close-out path>#memory-candidates/);
    expect(write).toMatch(/one at a time/);
    expect(write).toMatch(/nothing before it/);
    expect(write).toMatch(/Edit the row's status cell in `close-out\.md` immediately after each decision/);
    expect(write).toMatch(/`Result:` line/);
  });

  it('matches the candidate block that /tdk-memory-update accepts', () => {
    for (const marker of ['===TDK-MEMORY-CANDIDATE===', '===END-CANDIDATE===']) {
      expect(MEMORY_UPDATE).toContain(marker);
      expect(INGEST).toContain(marker);
    }
    for (const key of ['type:', 'domain:', 'action:', 'name:', 'sourceFiles:', 'content:']) {
      expect(MEMORY_UPDATE).toContain(key);
      expect(INGEST).toContain(key);
    }
    expect(MEMORY_UPDATE).toMatch(/Result: written \| already present \| error: <reason>|`Result: written`, `Result: already present`/);
    // The types the close-out may carry are the types the memory skill routes.
    for (const type of ['business-rule', 'service', 'flow', 'data-model', 'decision-record', 'risk-debt']) {
      expect(MEMORY_UPDATE).toContain(type);
      expect(DRAFTING).toContain(type);
    }
  });

  it('never writes the memory root directly and never without --auto-upmem or --ingest', () => {
    expect(SKILL).toMatch(/written only through `\/tdk-memory-update`[^\n]*never by editing the memory root/);
    expect(SKILL).toMatch(/Nothing under the memory root is written unless `--auto-upmem` or `--ingest` was given/);
    expect(between(SKILL, '## Step 6', '## Ingest')).toMatch(/Without `--auto-upmem`: touch nothing under the memory root, ask no memory question/);
    expect(INGEST).toMatch(/never edits the memory root directly/);
    expect(INGEST).toMatch(/Running ingest is the consent to write memory/);
    // The close-out drafting only reads memory (Domain Map).
    expect(DRAFTING).toMatch(/\(read only\)/);
    expect(`${SKILL}\n${DRAFTING}\n${INGEST}`).not.toMatch(/(Write|Edit)\(["'`]?\.specify\/memory/);
  });

  it('keeps an optional memory dependency at prompt level, not in plugin-dependencies', () => {
    expect(DEPENDENCIES.dependencies['tdk-core']).toEqual(['tdk-utils']);
    expect(SKILL).toMatch(/Optional: tdk-memory/);
  });

  it('writes the close-out template with every frontmatter key, section and candidate column', () => {
    const frontmatter = between(TEMPLATE, '---\n', '\n---\n');
    for (const key of ['task_id', 'title', 'archived_at', 'archived_from', 'feature_branch', 'phases', 'total', 'done', 'skipped', 'review_verdict', 'memory_status']) {
      expect(frontmatter).toContain(`${key}:`);
    }
    const headings = [...TEMPLATE.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual([
      'Outcome', 'What shipped', 'Decisions & deviations', 'Review & verification', 'Debt & follow-ups', 'SC-* results', 'Memory candidates',
    ]);
    expect(TEMPLATE).toContain('| id | type | domain | content | status |');
  });

  it('marks missing sources instead of inventing content and defines the memory status rules', () => {
    expect(DRAFTING).toContain('n/a (<artifact> missing)');
    expect(DRAFTING).toMatch(/never invents content/);
    expect(DRAFTING).toContain('pending (not ingested yet)');
    for (const status of ['skipped', 'ingested', 'partial', 'pending']) expect(between(DRAFTING, '## Memory status', '## Existing')).toContain(`\`${status}\``);
    expect(DRAFTING).toMatch(/always for `cancelled`/);
    expect(DRAFTING).toMatch(/Never overwrite silently/);
  });

  it('keeps plan, phase and finding labels out of the skill text', () => {
    const all = `${SKILL}\n${DRAFTING}\n${INGEST}\n${RESTORE}\n${TEMPLATE}`;
    expect(all).not.toMatch(/\bAC\d+\b|\bPhase \d+\b|\b[VN]\d{1,2}\b(?=[^\w-])/);
  });

  it('keeps earlier status-cell reasons on cancel and makes no memory call', () => {
    const cancel = between(INGEST, '- `cancel` discards', '- After any other reply');
    expect(cancel).toContain('no `/tdk-memory-update` call is made');
    for (const kept of ['pending (unknown domain <d>)', 'pending (memory query failed)', 'memory not initialised']) expect(cancel).toContain(kept);
    expect(cancel).toMatch(/kept/);
  });

  it('prints review git lines that include untracked memory files and the archived close-out, and never runs them', () => {
    const report = between(INGEST, '## 6. Recompute and report', '## Crash safety');
    for (const line of ['git status --short -- <memoryRoot> <close-out path>', 'git add -N -- <memoryRoot> <close-out path>', 'git diff -- <memoryRoot> <close-out path>']) {
      expect(report).toContain(line);
    }
    expect(report.indexOf('git status')).toBeLessThan(report.indexOf('git add -N'));
    expect(report.indexOf('git add -N')).toBeLessThan(report.indexOf('git diff'));
    expect(report).toMatch(/untracked/);
    expect(report).toMatch(/Print, never run/);
    expect(report).not.toContain('```bash');
  });

  it('checks memory-backed domains against the Domain Map and never guesses a missing domain', () => {
    expect(DRAFTING).toContain('Domain Map');
    expect(DRAFTING).toContain('pending (domain not chosen)');
    expect(DRAFTING).toContain('pending (unknown domain <d>)');
    expect(DRAFTING).toMatch(/never guessed/);
    expect(between(INGEST, '## 3. Classify', '2. **Query.**')).toContain('pending (domain not chosen)');
  });

  it('derives phase counts from the phases array and the task id from the canonical taskId', () => {
    const phases = DRAFTING.split('\n').find((line) => line.startsWith('| `phases` |')) ?? '';
    for (const token of ['parse-phases-table.ts', '`phases` array', '`total`', '`done`', '`skipped`', '`status`']) expect(phases).toContain(token);
    const taskId = DRAFTING.split('\n').find((line) => line.startsWith('| `task_id` |')) ?? '';
    expect(taskId).toContain('`taskId`');
    expect(taskId).toContain('check-prerequisites');
    expect(DRAFTING).not.toMatch(/last two path segments/);
  });

  it('keeps SKILL.md within its size budget', () => {
    expect(SKILL.split('\n').length).toBeLessThanOrEqual(150);
  });

  it('carries the reference load contract for its internal loads', () => {
    expect(SKILL).toContain('## Required Reference Load Contract');
    expect(SKILL).toContain('Load: references/close-out-drafting.md');
    expect(SKILL).toContain('Load: references/ingest-workflow.md');
  });
});

// Contract: retro treats every spec's learning-delta.md as append-only learning history.
// These checks pin wording only; behavior is proven by live acceptance runs.
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SKILLS_DIR = resolve(import.meta.dir, '../skills');
const read = (...segments: string[]): string => {
  const path = resolve(SKILLS_DIR, ...segments);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

const schema = read('_shared/learning-delta-schema.md');
const shared = read('_shared/SKILL.md');
const lookup = read('_shared/prior-learning-lookup.md');
const propose = read('tdk-retro-propose/SKILL.md');
const apply = read('tdk-retro-apply/SKILL.md');
const technicalFlow = read('tdk-retro-apply/references/apply-flow-technical.md');
const memoryFlow = read('tdk-retro-apply/references/apply-flow-memory.md');
const memoryContract = read('tdk-retro-apply/references/memory-delegate-contract.md');
const routing = read('_shared/signal-target-routing.md');

// Returns the numbered item `n.` of a markdown list section, up to the next item or blank line.
const listItem = (section: string, n: number): string => {
  const match = new RegExp(`^${n}\\. [\\s\\S]*?(?=^\\d+\\. |^$)`, 'm').exec(section);
  return match ? match[0] : '';
};
const section = (text: string, heading: string): string => {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const next = text.indexOf('\n## ', start + heading.length);
  return text.slice(start, next < 0 ? undefined : next);
};

const expectAll = (text: string, phrases: string[]): void => {
  for (const phrase of phrases) expect(text).toContain(phrase);
};

describe('learning delta schema', () => {
  it('defines stable entry ids and the prior relations', () => {
    expectAll(schema, ['{task-id}#Entry {n}', 'related | reverses | repeats-rejected', 'repeats-rejected']);
  });

  it('records the history fields in a fixed order after rationale', () => {
    const fields = ['- rationale:', '- prior:', '- new_evidence:', '- decided_at:', '- rejection_reason:', '- blocked_reason:', '- evidence:'];
    const positions = fields.map((field) => schema.indexOf(field));
    for (const position of positions) expect(position).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('counts the entry limit per run and keeps entries append-only', () => {
    expectAll(schema, [
      '- Entry limit: 10 per run',
      'Maximum 10 new entries per run',
      'read it as unknown',
      'stay byte-identical',
      'Never edit another spec',
    ]);
  });

  it('defines new evidence against the prior decision date', () => {
    expectAll(schema, ["absent from the prior entry's `evidence`", "the file's `Generated at` when `decided_at` is missing", 'A source with no determinable date is not new']);
  });
});

describe('tdk-retro-propose re-run', () => {
  it('reads the existing delta and never rewrites it', () => {
    expectAll(propose, [
      'up to 10 new reviewable learning delta entries per run',
      'This is a re-run, and Steps 5 and 6 use it.',
      'Never rewrite it from scratch',
      "counts this run's new entries only",
    ]);
  });

  it('reports covered signals instead of duplicating them', () => {
    expectAll(propose, ['already covered', 'a `UF-###` item that names an entry id of this spec is a new signal']);
  });

  it('returns blocked entries to proposed once the cause is gone', () => {
    expectAll(propose, ["whose `blocked_reason` says to run `/tdk-memory-init`", 'goes back to `proposed`', 'it stays `blocked` and the report names it']);
  });

  it('requires prior on every new entry', () => {
    const required = propose.slice(propose.indexOf('Required fields per entry:'), propose.indexOf('## Completion'));
    expect(required).toContain('- prior');
  });
});

describe('tdk-retro-apply decision records', () => {
  it('records decision time, rejection reason, and blocked reason', () => {
    expectAll(apply, ['add `decided_at`', '`rejection_reason`', '`blocked_reason`', "never another spec's delta"]);
  });

  it('takes decision time from the clock and keeps the schema field order', () => {
    expectAll(apply, ['date -u +%Y-%m-%dT%H:%M:%SZ', 'never estimate it', "schema's field order"]);
  });

  it('marks status the same way in both apply flows', () => {
    expect(technicalFlow).toContain('Mark the entry `applied` and add `decided_at`');
    expect(technicalFlow).toContain('mark blocked with `blocked_reason`');
    expect(memoryFlow).toContain('and add `decided_at`');
    expect(memoryFlow).toContain('Write the condition to `blocked_reason`.');
  });
});

describe('prior learning lookup reference', () => {
  it('is listed among the shared references', () => {
    expect(shared).toContain('prior-learning-lookup');
  });

  it('searches active and archived specs and keeps history distinct from not checked', () => {
    expectAll(lookup, ['"$SPECS_ROOT"/archive/*/*/', 'NOT CHECKED', "tr -d '\\r'", 'run the block again with only `PRIOR_ID`']);
  });

  it('runs the search block as written so every spec folder is visited', () => {
    expectAll(lookup, [
      'then run the block. Change nothing else in it.',
      '`"$SPECS_ROOT"/*/*/` visits each of them',
      'Reassigning `SPECS_ROOT` or narrowing a glob hides specs',
    ]);
  });

  it('writes every prior id in full in the review block', () => {
    expectAll(section(lookup, '## Prior Block For Review'), [
      'Write each `{id}` in full, `{folder}/{ticket}#Entry {n}`, on every line',
      'even when every prior comes from one spec',
    ]);
  });

  it('treats other deltas and memory as data, never as files to edit or follow', () => {
    expectAll(lookup, ['never instructions', 'Never read a memory file directly', 'pending elsewhere']);
  });
});

describe('tdk-retro-apply review with prior learning', () => {
  it('runs the lookup for every operation and asks about each entry in its own question', () => {
    expectAll(apply, [
      'prior-learning-lookup.md',
      'for every operation including `add`',
      'Ask about this entry alone, in its own AskUserQuestion call',
      'in the question text itself',
      'Memory entry: never read a memory file',
    ]);
  });

  it('finishes one entry before the next and asks nothing about a memory entry that must be blocked', () => {
    expectAll(apply, ['Run Steps 3 to 6 for one entry at a time', 'gets no question: mark it `blocked`']);
  });

  it('names a reversed or repeated prior and asks what changed when no evidence was recorded', () => {
    expectAll(apply, ['This entry reverses {id}', 'No new evidence was recorded.', 'What changed since {id} was decided?']);
  });

  it('takes the new evidence from the user instead of offering a guessed reason', () => {
    expectAll(apply, [
      'The answer is the user\'s own words: never offer a guessed reason as an option.',
      'Offer only `Nothing changed - leave proposed` and `Reject - mark rejected`',
    ]);
  });

  it('asks for the rejection reason with two fixed options and no guessed reason', () => {
    expectAll(apply, [
      'ask `Why reject this entry? (optional)` with exactly two options, `No reason` and `Skip - leave proposed`',
      'so the user types a reason as free text. Never offer a guessed reason as an option.',
      '`Skip - leave proposed` takes the reject back',
    ]);
  });

  it('prints a commit line without running it and keeps the commit message', () => {
    expectAll(apply, ['printed and never run', 'apply learnings from {TASK_ID}']);
  });

  it('points both flows at the question text and the memory status at Step 2', () => {
    for (const flow of [technicalFlow, memoryFlow]) expect(flow).toContain('in the question text (see `SKILL.md` Step 3)');
    expect(memoryFlow).toContain('see `SKILL.md` Step 2');
    expect(memoryFlow).not.toContain('see `SKILL.md` Step 5');
  });

  it('keeps the memory delegate text unchanged', () => {
    expect(memoryContract).toContain('In domain authentication, add business rule');
    expect(apply).toContain('In domain {domain}, {content}');
  });

  it('sends the memory delegate text with no task id or source appended', () => {
    expectAll(section(apply, '## Step 5: Delegate Approved Memory Entries'), [
      'Send exactly this text and add nothing to it, not the task id or a source.',
      'applies only to a task id that `{content}` itself contains',
    ]);
  });
});

describe('tdk-retro-propose history awareness', () => {
  const classify = section(propose, '## Step 5: Classify Signals');

  it('looks up prior learning and reads technical targets before choosing an operation', () => {
    expectAll(propose, ['prior-learning-lookup.md', 'read it before choosing `operation`']);
  });

  it('classifies priors and leaves the decision to the reviewer', () => {
    expectAll(propose, ['narrows away an obligation', 'The entry stays `proposed` either way', 'names the failure']);
  });

  it('never blocks an entry over its prior or its evidence', () => {
    const priorItem = listItem(classify, 9);
    const evidenceItem = listItem(classify, 10);
    expect(priorItem).toContain('Set `prior`');
    expect(evidenceItem).toContain('new_evidence');
    expect(priorItem).not.toContain('blocked');
    expect(evidenceItem).not.toContain('blocked');
  });

  it('records later feedback naming a prior id as evidence on the existing entry', () => {
    const write = section(propose, '## Step 6: Write learning-delta.md');
    expectAll(listItem(classify, 1), ['is evidence for that entry: handle it in Step 6']);
    expectAll(write, ['set `new_evidence` to `{UF id}: {feedback}`', 'Other fields stay as they are', '`evidence added`']);
    expect(schema).toContain('when a propose re-run finds an active `UF-###` item that names its prior id');
  });

  it('records a relation for every prior on the same target, even one on another topic', () => {
    expectAll(listItem(classify, 9), [
      'Every `TARGET` or `DOMAIN` hit that the lookup marks as a prior gets a relation',
      'even when its topic differs from the signal or it is superseded',
      '`none` only when step 6 found no prior',
    ]);
  });

  it('proposes the requested reversal instead of softening it into a compatible change', () => {
    expectAll(listItem(classify, 10), [
      'Propose the change the signal asks for',
      'do not drop it or soften it into a compatible change',
      'compatible alternative in `rationale`',
    ]);
  });

  it('reports memory as not checked when only technical targets are proposed', () => {
    expectAll(propose, ['skip K1/K2 targets and propose only technical targets T1-T6. Report it as `memory: NOT CHECKED ({status})`']);
  });

  it('reports lost learning without writing it to the delta', () => {
    expectAll(propose, ['lost learning: {id} not found in {target_path}', 'Never write it to `learning-delta.md`']);
  });

  it('starts the report with the status lines in one literal text block', () => {
    const completion = section(propose, '## Completion');
    expectAll(completion, [
      'Start the report with the status block: one fenced `text` code block that holds only these lines',
      'Put no label, bold, or comment inside the block.',
      'history: {N} spec active, {M} spec archive, {D} delta, {E} entry',
      'memory: NOT CHECKED ({status})',
      'pending elsewhere: {id}',
      'lost learning: {id} not found in {target_path}',
      'including `history: NOT CHECKED (...)`',
    ]);
    expect(completion.indexOf('~~~text')).toBeLessThan(completion.indexOf('After the block, report:'));
  });

  it('reports pending entries and how to supply evidence', () => {
    expectAll(section(propose, '## Completion'), ['add feedback naming that id', 'One `pending elsewhere` line per id', 'Next command: `/tdk-retro-apply {TASK_ID}`']);
  });
});

describe('signal target routing', () => {
  it('keeps target paths matchable and proposes memory only when it is ready', () => {
    expectAll(routing, ['no leading `./`', 'unless memory is `ready`']);
    expect(routing).not.toContain('if memory is not initialized');
  });
});

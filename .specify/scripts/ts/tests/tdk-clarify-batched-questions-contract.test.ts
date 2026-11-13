import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CLARIFY = resolve(import.meta.dir, '../../../plugins/tdk-core/skills/tdk-clarify/SKILL.md');

const RETIRED_SEQUENTIAL_WORDING = [
  'EXACTLY ONE',
  'Never reveal future',
  'Do NOT output them all at once',
  'Maximum of 10',
  'Sequential questioning',
  'after EACH accepted answer',
  'immediately after acceptance',
  'AFTER each integration',
  'after EACH write',
  'retries for a single question',
];

const REPLY_TOKENS = [
  '`yes`', '`ok`', '`recommended`', '`suggested`',
  '`NX`', '`N: <text>`', '`N: skip`',
  '`explain N`', '`1A explain 2`', '`stop`',
  '`done`', '`proceed`', '`good`', '`no more`',
];

// Guards the prompt wording against drifting back to one-question-per-turn. It cannot prove
// agent behavior; that needs real runs against a fixture spec.
describe('tdk-clarify batched question contract', () => {
  const clarify = readFileSync(CLARIFY, 'utf-8');

  it.each(RETIRED_SEQUENTIAL_WORDING)('no longer instructs sequential questioning: %s', (phrase) => {
    expect(clarify).not.toContain(phrase);
  });

  it.each(REPLY_TOKENS)('documents reply token %s', (token) => {
    expect(clarify).toContain(token);
  });

  // A real run drafted the batch in internal reasoning, then claimed it had asked, so the user saw nothing.
  it('shows the question batch as visible text that ends the turn', () => {
    expect(clarify).toContain('the visible reply text that ends your turn');
  });

  // Real runs split the save into one edit per section until the prompt stated this rule outright.
  it('saves all accepted answers with a single whole-file overwrite', () => {
    expect(clarify).toContain('one tool call that overwrites the whole file');
    expect(clarify).toContain('Never use one edit call per section');
  });
});

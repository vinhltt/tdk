// Contract: retro-collect maps each review finding to the phases that fix it, lists findings without a
// fix phase under a fixed label, and propose never reads a missing fix phase as a missed defect.
// These checks pin wording only; behavior is proven by live acceptance runs.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SKILLS_DIR = resolve(import.meta.dir, '../skills');
const read = (...segments: string[]): string => readFileSync(resolve(SKILLS_DIR, ...segments), 'utf8');

const schema = read('_shared/retro-feedback-schema.md');
const collect = read('tdk-retro-collect/SKILL.md');
const propose = read('tdk-retro-propose/SKILL.md');

// Slice from a heading up to the next `## ` heading, so each assert is scoped to one section.
const section = (text: string, heading: string): string => {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const next = text.indexOf('\n## ', start + heading.length);
  return text.slice(start, next < 0 ? undefined : next);
};

const expectAll = (text: string, phrases: string[]): void => {
  expect(text).not.toBe('');
  for (const phrase of phrases) expect(text).toContain(phrase);
};

const NO_PHASE_LABEL = 'no fix phase; no recorded reason';
const PREDATES_REASON = 'report predates finding links';
const GUARD = 'A finding without a fix phase is a signal for a process proposal, not evidence that a defect was missed.';

describe('retro feedback schema for review findings', () => {
  const reviews = section(schema, '## From: Reviews');

  it('keeps the severity bullet and adds the two map blocks after it', () => {
    expectAll(reviews, [
      '- [severity] {finding}',
      '### Finding → fix phase\n- {report file} {finding ID} [severity] → phase {NN} ({status})',
      `### Findings without a fix phase\n- {report file} {finding ID} [severity]: ${NO_PHASE_LABEL}`,
    ]);
    expect(reviews.indexOf('- [severity] {finding}')).toBeLessThan(reviews.indexOf('### Finding → fix phase'));
    expect(reviews.indexOf('### Finding → fix phase')).toBeLessThan(reviews.indexOf('### Findings without a fix phase'));
  });

  it('records a report that predates finding links as a skipped map entry', () => {
    expectAll(section(reviews, '### Finding → fix phase'), [
      '- {report file}\n  - Status: skipped\n  - Reason: report predates finding links',
    ]);
  });

  it('defines the placeholders, the empty block and the fixed label', () => {
    expectAll(section(schema, '## Rules'), [
      '`{report file}` is the report\'s file name under `reviews/`',
      '`{NN}` and `{status}` come from the plan\'s Phases table',
      'one skipped entry per report that predates finding links or was blocked',
      'A block with nothing to list holds `None.`',
      `\`${NO_PHASE_LABEL}\` is a fixed label`,
    ]);
  });
});

describe('tdk-retro-collect finding to fix phase map', () => {
  const step3 = section(collect, '## Step 3: Read Review Signals');

  it('reads only direct report children of reviews/, never the diff directory', () => {
    expectAll(step3, [
      '### Map findings to fix phases',
      'reports directly under `{FEATURE_DIR}/reviews/` (`reviews/*.md`)',
      'never `{FEATURE_DIR}/reviews/.diff/`',
    ]);
  });

  it('reads the report and phase labels semantically', () => {
    expectAll(step3, [
      'Extract findings semantically. Do not use regex-only parsing for markdown prose.',
      'Read the labels below semantically too',
    ]);
  });

  it('anchors on the last Proposed Fix Phases heading and separates empty from older reports', () => {
    expectAll(step3, [
      'starts at the last heading that names it',
      'The section says `None.`: the report has no finding to map.',
      'The section has no `### G<k>` block or no `- Findings:` line: the report predates finding links.',
      `Record \`Status: skipped\` for its map, with reason \`${PREDATES_REASON}\``,
      'The finding extraction above still runs for it.',
    ]);
  });

  it('leaves a blocked report out of the map, because its findings can have no fix phase', () => {
    expectAll(step3, ["frontmatter `verdict` is `blocked`", 'with reason `review was blocked`']);
    expect(step3.indexOf('`verdict` is `blocked`')).toBeLessThan(step3.indexOf('No such section: the report stays out of the map.'));
    expectAll(schema, ['- Reason: report predates finding links | review was blocked']);
  });

  it('joins severity by finding ID because a group carries none', () => {
    expectAll(step3, [
      'read the finding IDs (`F<n>`) on its `- Findings:` line',
      'Join each finding ID with the same report\'s **Findings by severity** section to get its severity.',
      'A `G<k>` block carries no severity.',
    ]);
  });

  it('pairs findings with phases through the Review line of each phase', () => {
    expectAll(step3, [
      'read the `- Review:` line in the `## Context Links` section of its phase file',
      '``- Review: `../reviews/<file>.md` (F2, F5)``',
      'A `Review:` line without parentheses links an older report and names no finding.',
      'with that phase\'s status from the Step 2 table',
      'A finding named by several phases gets one pairing per phase.',
    ]);
  });

  it('labels findings without a phase and never guesses a reason', () => {
    expectAll(step3, [`Label it \`${NO_PHASE_LABEL}\``, 'never guess a reason']);
  });

  it('writes both map blocks under Reviews', () => {
    expectAll(section(collect, '## Step 9: Write retro-feedback.md'), [
      'Under Reviews, after the finding bullets, write the Step 3 map',
      '`### Finding → fix phase` and `### Findings without a fix phase`',
    ]);
  });
});

describe('tdk-retro-propose on findings without a fix phase', () => {
  it('reads them as a process signal when loading feedback', () => {
    expectAll(section(propose, '## Step 2: Read Feedback'), [
      'the lines under `### Findings without a fix phase` carry no reason',
      GUARD,
      "The `- [severity] {finding}` bullets stay the source of each review finding's severity.",
    ]);
  });

  it('keeps the severity bullets as the ranking source', () => {
    expectAll(section(propose, '## Step 5: Classify Signals'), [
      '11. Limit output to 10 new entries, highest severity first. For review signals, the `- [severity] {finding}` bullets stay the primary severity source.',
      GUARD,
    ]);
  });
});

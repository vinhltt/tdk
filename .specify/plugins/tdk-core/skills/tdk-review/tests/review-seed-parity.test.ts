import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { writeReviewReport } from '../scripts/review-write-report';
import { collectReviewSummary } from '../../../../../scripts/ts/src/commands/feature/next-action-evidence';

// The writer fills the report's file name into the Ready line and `/tdk-status` parses it back. The two read the
// section heading and the Ready line shapes independently, so this round trip is the drift guard between them.
const PLACEHOLDER = '{{TDK_REVIEW_REPORT_FILE}}';
const READY = `/tdk-plan sample-001 "reviews/${PLACEHOLDER}"`;

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const HEADINGS = ['## Proposed Fix Phases', '### Proposed Fix Phases', '## 7. Proposed Fix Phases'];
const SHAPES: Array<[string, string]> = [
  ['bare', READY],
  ['bullet', `- ${READY}`],
  ['backtick', `\`${READY}\``],
  ['labelled', `- **Ready line**: \`${READY}\``],
];

function report(heading: string, readyLine: string, evidenceQuotesHeading: boolean): string {
  const evidence = evidenceQuotesHeading ? ['Evidence quoted from a diff:', heading, READY, ''] : [];
  return [
    '---', 'task_id: sample-001', 'scope: full', 'verdict: changes_requested', 'generated_at: 2026-10-10T09:00:00+07:00', '---', '',
    '## Findings', '', ...evidence,
    heading, '', '### G1: Retry', '- Description: fix it', '- Findings: F1', '', readyLine, '',
    '## Next actions', '', readyLine, '',
  ].join('\n');
}

describe('review report Ready line parity with the status reader', () => {
  for (const heading of HEADINGS) {
    for (const [shape, readyLine] of SHAPES) {
      for (const quoted of [false, true]) {
        it(`reads the filled pointer for "${heading}" as ${shape}${quoted ? ' with the heading quoted in evidence' : ''}`, () => {
          const dir = mkdtempSync(join(tmpdir(), 'tdk-seed-parity-'));
          roots.push(dir);
          writeFileSync(join(dir, 'plan.md'), '# Plan\n');
          mkdirSync(join(dir, 'reviews'));
          const written = writeReviewReport(dir, dir, 'full-standard', report(heading, readyLine, quoted));
          if (!written.ok) throw new Error(`writer refused: ${written.error}`);

          const pointer = `/tdk-plan sample-001 "reviews/${basename(written.path)}"`;
          const summary = collectReviewSummary(dir, 'sample-001', []).latestFull;
          expect(summary).toMatchObject({ seedCount: 1, seedReady: pointer });

          const onDisk = readFileSync(written.path, 'utf-8');
          const section = onDisk.slice(onDisk.lastIndexOf(heading));
          expect(section).not.toContain(PLACEHOLDER);
        });
      }
    }
  }
});

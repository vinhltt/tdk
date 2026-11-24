// Sole writer of review reports. Create-new through the shared util, so a same-second, same-slug rerun fails with
// `collision_exists` and leaves the first report byte-identical. Bundled (build.ts): the installed skill needs no
// consumer `.specify/scripts/ts` tree, and the bundle contains no third-party code.

import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeAgentJson } from '../../../../../scripts/ts/src/utils/agent-output';
import { createNewFile } from '../../../../../scripts/ts/src/utils/create-new-file';
import { sanitizeReviewText } from './review-redaction';
import { prepareReviewsDir } from './reviews-dir-guard';

export type WriteReportResult =
  | { ok: true; path: string; redactions: number }
  | { ok: false; error: 'collision_exists' | 'invalid_slug' | 'unsafe_output_path' | 'write_failed' };

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

// Same heading rule as the seed parser of /tdk-status (`SEEDS_HEADING` in next-action-evidence.ts): `##` or deeper,
// an optional `7.` or `7)` number, then the section name. A parity test keeps the two in step.
const FIX_PHASES_HEADING = /^#{2,}[ \t]+(?:\d+[.)][ \t]+)?Proposed Fix Phases\b[^\n]*$/;
// The whole line is the Ready command: optionally a list item, a `**Ready line**:` label and enclosing backticks.
const READY_LINE = /^([ \t]*(?:(?:[-*+]|\d+[.)])[ \t]+)?(?:\*\*Ready line\*\*:[ \t]*)?)(`?)(\/tdk-plan \S+ "reviews\/)\{\{TDK_REVIEW_REPORT_FILE\}\}"\2([ \t]*\r?)$/;

/**
 * Puts the report's own file name into its Ready line, which the body can only carry as a placeholder because the
 * name is stamped at write time. Line-anchored and limited to lines below the last Proposed Fix Phases heading:
 * a review of TDK itself can quote this exact command, or the heading, as finding evidence, and that quote must stay.
 */
export function fillReportFileName(text: string, fileName: string): string {
  const lines = text.split('\n');
  let heading = lines.length - 1;
  while (heading >= 0 && !FIX_PHASES_HEADING.test(lines[heading]!)) heading--;
  if (heading === -1) return text;
  for (let index = heading + 1; index < lines.length; index++) {
    lines[index] = lines[index]!.replace(READY_LINE, (_match, lead: string, tick: string, command: string, tail: string) =>
      `${lead}${tick}${command}${fileName}"${tick}${tail}`);
  }
  return lines.join('\n');
}

/** Local time, `yyyyMMdd-HHmmss`: the order users read in a directory listing. */
function stamp(now: Date): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function writeReviewReport(projectRoot: string, featureDirectory: string, slug: string, body: string, now = new Date()): WriteReportResult {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 50) return { ok: false, error: 'invalid_slug' };
  const featureDir = resolve(featureDirectory);
  const prepared = prepareReviewsDir(projectRoot, featureDir);
  if (!prepared.ok) return { ok: false, error: 'unsafe_output_path' };
  const { reviews } = prepared;
  const path = join(reviews, `${stamp(now)}-${slug}.md`);
  // Diff evidence can carry secrets. The report stays in the repo, so slash commands, routes and HTML are kept
  // and only secrets and machine paths are redacted.
  const { text, redactions } = sanitizeReviewText(body);
  const failure = createNewFile(path, fillReportFileName(text, basename(path)), 0o644);
  return failure ? { ok: false, error: failure } : { ok: true, path, redactions };
}

if (import.meta.main) {
  let values: { 'project-root'?: string; 'feature-dir'?: string; slug?: string } | undefined;
  try {
    values = parseArgs({
      args: process.argv.slice(2),
      options: { 'project-root': { type: 'string' }, 'feature-dir': { type: 'string' }, slug: { type: 'string' } },
      allowPositionals: false,
      strict: true,
    }).values;
  } catch { /* falls through to invalid_arguments */ }
  if (!values?.['project-root'] || !values['feature-dir'] || values.slug === undefined) {
    writeAgentJson({ ok: false, error: 'invalid_arguments' });
    process.exitCode = 1;
  } else {
    const result = writeReviewReport(values['project-root'], values['feature-dir'], values.slug, readFileSync(0, 'utf-8'));
    writeAgentJson(result);
    if (!result.ok) process.exitCode = result.error === 'write_failed' ? 2 : 1;
  }
}

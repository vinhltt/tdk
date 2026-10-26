// Sole writer of review reports. Create-new through the shared util, so a same-second, same-slug rerun fails with
// `collision_exists` and leaves the first report byte-identical. Bundled (build.ts): the installed skill needs no
// consumer `.specify/scripts/ts` tree, and the bundle contains no third-party code.

import { lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeAgentJson } from '../../../../../scripts/ts/src/utils/agent-output';
import { createNewFile } from '../../../../../scripts/ts/src/utils/create-new-file';
import { isWithin } from '../../../../../scripts/ts/src/utils/path-within';
import { sanitizeReviewText } from './review-redaction';

export type WriteReportResult =
  | { ok: true; path: string; redactions: number }
  | { ok: false; error: 'collision_exists' | 'invalid_slug' | 'unsafe_output_path' | 'write_failed' };

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** Local time, `yyyyMMdd-HHmmss`: the order users read in a directory listing. */
function stamp(now: Date): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** The `reviews/` parent: created if missing, refused if it is a symlink, a file, or resolves outside the feature dir. */
function prepareReviewsDir(featureDir: string, reviews: string): boolean {
  let canonicalFeature: string;
  try { canonicalFeature = realpathSync(featureDir); } catch { return false; }
  try {
    const info = lstatSync(reviews);
    return info.isDirectory() && !info.isSymbolicLink() && isWithin(canonicalFeature, realpathSync(reviews));
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') return false;
  }
  try { mkdirSync(reviews); } catch { return false; }
  return isWithin(canonicalFeature, realpathSync(reviews));
}

export function writeReviewReport(projectRoot: string, featureDirectory: string, slug: string, body: string, now = new Date()): WriteReportResult {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 50) return { ok: false, error: 'invalid_slug' };
  const featureDir = resolve(featureDirectory);
  const reviews = join(featureDir, 'reviews');
  let insideProject = false;
  try { insideProject = isWithin(realpathSync(projectRoot), realpathSync(featureDir)); } catch { /* unresolved paths are unsafe */ }
  if (!insideProject || !prepareReviewsDir(featureDir, reviews)) return { ok: false, error: 'unsafe_output_path' };
  const path = join(reviews, `${stamp(now)}-${slug}.md`);
  // Diff evidence can carry secrets. The report stays in the repo, so slash commands, routes and HTML are kept
  // and only secrets and machine paths are redacted.
  const { text, redactions } = sanitizeReviewText(body);
  const failure = createNewFile(path, text, 0o644);
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

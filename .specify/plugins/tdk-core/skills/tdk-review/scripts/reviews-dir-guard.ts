// Shared guard for every write under a feature's `reviews/` directory: the report writer and the review-scope diff
// directory. A directory is only used when `lstat` proves it is a real directory (never a symlink or a file) and its
// resolved path stays inside the directory that is supposed to contain it, so a planted link cannot redirect a write
// or a delete outside the feature.

import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { isWithin } from '../../../../../scripts/ts/src/utils/path-within';

export type ReviewsDirResult =
  | { ok: true; reviews: string }
  | { ok: false; reason: 'feature_outside_project' | 'reviews_unsafe' };

/** A real directory at `path` (created when missing) that resolves inside `container`; false for a symlink, a file or an escape. */
export function ensureRealDirectory(path: string, container: string): boolean {
  try {
    let info = lstatSync(path, { throwIfNoEntry: false });
    if (info === undefined) {
      mkdirSync(path);
      info = lstatSync(path);
    }
    return info.isDirectory() && !info.isSymbolicLink() && isWithin(container, realpathSync(path));
  } catch { return false; }
}

/** `<featureDir>/reviews`: the feature dir must resolve inside the project, and `reviews/` is created if missing and proven real. */
export function prepareReviewsDir(projectRoot: string, featureDir: string): ReviewsDirResult {
  let canonicalFeature: string;
  try {
    canonicalFeature = realpathSync(featureDir);
    if (!isWithin(realpathSync(projectRoot), canonicalFeature)) return { ok: false, reason: 'feature_outside_project' };
  } catch { return { ok: false, reason: 'feature_outside_project' }; }
  const reviews = join(featureDir, 'reviews');
  return ensureRealDirectory(reviews, canonicalFeature) ? { ok: true, reviews } : { ok: false, reason: 'reviews_unsafe' };
}

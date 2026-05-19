// Feature ID parsing with path traversal protection
// Replaces: parse_feature_id() from common-env.sh

import { resolve, relative } from 'node:path';

export interface FeatureIdResult {
  folder: string;
  ticket: string;
  featureDir: string;
  branchName: string;
}

/**
 * Parse feature ID into folder, ticket, directory, and branch name.
 * @example parseFeatureId('test/aa-123', '/repo', '.specify', 'feature')
 *          → { folder: 'test', ticket: 'aa-123', featureDir: '/repo/.specify/test/aa-123', branchName: 'test/aa-123' }
 */
export function parseFeatureId(
  featureId: string,
  repoRoot: string,
  specsRoot: string,
  defaultFolder: string,
): FeatureIdResult {
  if (!featureId) {
    throw new Error('Feature ID is required');
  }

  let folder: string;
  let ticket: string;

  if (featureId.includes('/')) {
    const idx = featureId.indexOf('/');
    folder = featureId.slice(0, idx);
    ticket = featureId.slice(idx + 1);
  } else {
    folder = defaultFolder;
    ticket = featureId;
  }

  // Path traversal validation
  for (const component of [folder, ticket]) {
    if (component.includes('..') || component.startsWith('/') || component.includes('\0')) {
      throw new Error(`Invalid feature ID component: '${component}' (path traversal detected)`);
    }
  }

  const featureDir = resolve(repoRoot, specsRoot, folder, ticket);

  // Verify resolved path stays within repo
  const rel = relative(resolve(repoRoot), featureDir);
  if (rel.startsWith('..')) {
    throw new Error(`Feature dir escapes repo root: '${featureDir}'`);
  }

  return { folder, ticket, featureDir, branchName: `${folder}/${ticket}` };
}

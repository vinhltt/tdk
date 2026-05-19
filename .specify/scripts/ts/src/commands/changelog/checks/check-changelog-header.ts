// Check 1: `.specify/CHANGELOG.md` contains `## [X.Y.Z]` header for expected version.

import { existsSync, readFileSync } from 'node:fs';
import type { CheckOpts, CheckResult } from './types';
import { CHANGELOG_MD } from './fs-helpers';

export function checkChangelogHeader(opts: CheckOpts): CheckResult {
  const path = CHANGELOG_MD(opts.root);
  const index = 1;
  const name = 'CHANGELOG header';

  if (!existsSync(path)) {
    return {
      ok: false, index, name,
      expected: `## [${opts.expectedVersion}] header`,
      actual: 'file missing',
      fixHint: `create ${path} or run the tdk-bump skill`,
      path,
    };
  }

  const content = readFileSync(path, 'utf-8');
  // Escape dots in semver so the regex is literal.
  const vEscaped = opts.expectedVersion.replace(/\./g, '\\.');
  const headerRe = new RegExp(`^##\\s+\\[${vEscaped}\\]`, 'm');
  if (headerRe.test(content)) {
    return { ok: true, index, name, path };
  }

  return {
    ok: false, index, name,
    expected: `## [${opts.expectedVersion}]`,
    actual: 'missing',
    fixHint: `add "## [${opts.expectedVersion}] - YYYY-MM-DD" section to ${path}`,
    path,
  };
}

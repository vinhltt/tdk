// Check 2: `.claude-plugin/marketplace.json` → metadata.version matches --expected-version.

import { existsSync } from 'node:fs';
import type { CheckOpts, CheckResult } from './types';
import { MARKETPLACE_JSON, readJson } from './fs-helpers';

interface MarketplaceJson {
  metadata?: { version?: string };
}

export function checkMarketplaceVersion(opts: CheckOpts): CheckResult {
  const path = MARKETPLACE_JSON(opts.root);
  const index = 2;
  const name = 'marketplace.json version';

  if (!existsSync(path)) {
    return {
      ok: false, index, name,
      expected: opts.expectedVersion,
      actual: 'file missing',
      fixHint: `create ${path} with metadata.version="${opts.expectedVersion}"`,
      path,
    };
  }

  let data: MarketplaceJson;
  try {
    data = readJson<MarketplaceJson>(path);
  } catch (e) {
    return {
      ok: false, index, name,
      expected: opts.expectedVersion,
      actual: `parse error: ${(e as Error).message}`,
      fixHint: `fix JSON syntax in ${path}`,
      path,
    };
  }

  const actual = data.metadata?.version ?? '(missing)';
  if (actual === opts.expectedVersion) {
    return { ok: true, index, name, path };
  }

  return {
    ok: false, index, name,
    expected: opts.expectedVersion,
    actual,
    fixHint: `set metadata.version to "${opts.expectedVersion}" in ${path}`,
    path,
  };
}

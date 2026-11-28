// Check 6: the TDK release version stamped into the payload matches --expected-version.
//   .specify/release-manifest.json  → tdkVersion
//   .specify/plugins/manifest.json  → tdk_version
// One result per stamp. Stamps are generated, so every fix hint is a regenerate command.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CheckOpts, CheckResult } from './types';
import { readJson } from './fs-helpers';

const INDEX = 6;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

interface StampSpec {
  name: string;
  relativePath: string;
  field: string;
}

const STAMPS: StampSpec[] = [
  { name: 'release-manifest tdkVersion', relativePath: join('.specify', 'release-manifest.json'), field: 'tdkVersion' },
  { name: 'plugins manifest tdk_version', relativePath: join('.specify', 'plugins', 'manifest.json'), field: 'tdk_version' },
];

function regenerateHint(root: string, path: string): string {
  const abs = resolve(root);
  return `${path} is generated; do not edit it by hand. Regenerate after bumping marketplace.json, in order: `
    + `(cd "${abs}/.specify/scripts/ts" && bun run manifest --project-root "${abs}" --write) && `
    + `bun "${abs}/.claude/skills/tdk-bump/scripts/generate-release-manifest.ts" --project-root "${abs}" --write`;
}

function checkStamp(opts: CheckOpts, stamp: StampSpec): CheckResult {
  const path = join(opts.root, stamp.relativePath);
  const name = stamp.name;
  const fail = (actual: string): CheckResult => ({
    ok: false, index: INDEX, name,
    expected: opts.expectedVersion,
    actual,
    fixHint: regenerateHint(opts.root, path),
    path,
  });

  if (!existsSync(path)) return fail('file missing');

  let data: Record<string, unknown>;
  try {
    data = readJson<Record<string, unknown>>(path);
  } catch (e) {
    return fail(`parse error: ${(e as Error).message}`);
  }

  const value = data[stamp.field];
  if (value === undefined) return fail('(missing)');
  if (typeof value !== 'string' || !SEMVER.test(value)) return fail(`invalid: ${JSON.stringify(value)}`);
  if (value !== opts.expectedVersion) return fail(value);
  return { ok: true, index: INDEX, name, path };
}

export function checkReleaseVersionStamps(opts: CheckOpts): CheckResult[] {
  return STAMPS.map(stamp => checkStamp(opts, stamp));
}

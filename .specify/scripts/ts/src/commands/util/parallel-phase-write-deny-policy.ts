/**
 * parallel-phase-write-deny-policy.ts (C-B5)
 *
 * Single source of truth for the fixed write-deny classification used by
 * parallel-mode ownership validation. Exported exactly once and consumed by
 * ownership validation, planner post-write validation, and controller audit
 * protection — do not duplicate a second filename list anywhere.
 *
 * Every relativePath argument here MUST already be a canonicalized,
 * project-relative POSIX path (no leading './', no leading '/', forward
 * slashes only) — see parallel-phase-path-policy.ts.
 *
 * Scoping: classes with an explicit "root" qualifier in the frozen contract
 * (root tsconfig*.json, the ROOT_SHARED_WRITE_DENY_NAMES set, and the
 * requirements*.txt pattern) match only at the project root. Every other
 * class matches at any depth — a nested `packages/app/CLAUDE.md` or
 * `packages/app/.github/workflows/ci.yml` is exactly the kind of harness
 * control file this policy exists to protect, and the contract does not
 * qualify those classes as root-only.
 */

/** Exact root-level shared-config file names denied for parallel writes. */
export const ROOT_SHARED_WRITE_DENY_NAMES: ReadonlySet<string> = new Set([
  'package.json',
  'pnpm-workspace.yaml',
  'bunfig.toml',
  'deno.json',
  'deno.jsonc',
  'turbo.json',
  'nx.json',
  'lerna.json',
  'Cargo.toml',
  'go.mod',
  'go.work',
  'pyproject.toml',
  'Pipfile',
  'Gemfile',
  'composer.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradle.properties',
  'Directory.Build.props',
  'Directory.Build.targets',
  'Directory.Packages.props',
  'global.json',
  'NuGet.Config',
]);

/** Root-only, case-insensitive, no-path-separator shared-config patterns. */
export const ROOT_SHARED_WRITE_DENY_PATTERNS: readonly RegExp[] = [/^requirements[^/]*\.txt$/i];

const LOCK_FILE_EXACT_NAMES_LOWER: ReadonlySet<string> = new Set([
  'bun.lockb',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'go.sum',
  'package.resolved',
]);

function isLockFileName(basename: string): boolean {
  const lower = basename.toLowerCase();
  return lower.endsWith('.lock') || LOCK_FILE_EXACT_NAMES_LOWER.has(lower);
}

function includesConsecutivePair(segments: string[], first: string, second: string): boolean {
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i] === first && segments[i + 1] === second) return true;
  }
  return false;
}

/** True when `.specify` is present and immediately followed by `child` (i.e. `.specify/<child>/**`). */
function underSpecifyChild(segments: string[], child: string): boolean {
  const idx = segments.indexOf('.specify');
  return idx !== -1 && segments[idx + 1] === child;
}

/** True when `.specify/<...suffix>` matches exactly (no extra trailing segments). */
function specifyExactSuffix(segments: string[], suffix: string[]): boolean {
  return specifyExactSuffixFrom(segments, '.specify', suffix);
}

/** Anywhere under `.specify/**`, basename matches a `.deps-cache.json*` prefix. */
function specifyDepsCacheBasename(segments: string[], basename: string): boolean {
  return segments.includes('.specify') && basename.startsWith('.deps-cache.json');
}

/**
 * Classify a canonical project-relative write path against the fixed deny
 * policy. Returns a stable reason string, or null when the path is not
 * fixed-deny (still subject to git-ignore checks by the caller).
 */
export function findFixedDenyReason(relativePath: string): string | null {
  const segments = relativePath.split('/');
  const basename = segments[segments.length - 1] ?? '';

  if (segments.includes('.git')) return 'git-segment';
  if (segments.includes('migrations')) return 'migrations-segment';
  if (includesConsecutivePair(segments, 'db', 'migrate') || includesConsecutivePair(segments, 'database', 'migrate')) {
    return 'migrate-sequence';
  }
  if (isLockFileName(basename)) return 'lock-file';
  if (segments.includes('.github') || segments.includes('.gitlab') || segments.includes('.circleci')) {
    return 'ci-control-tree';
  }
  if (segments.length === 1 && /^tsconfig.*\.json$/.test(basename)) return 'root-tsconfig';
  if (basename === '.gitignore' || basename === '.gitattributes' || basename === 'AGENTS.md' || basename === 'CLAUDE.md') {
    return 'git-control-file';
  }
  if (segments.length === 1 && ROOT_SHARED_WRITE_DENY_NAMES.has(basename)) return 'root-shared-file';
  if (segments.length === 1 && ROOT_SHARED_WRITE_DENY_PATTERNS.some((re) => re.test(basename))) return 'root-shared-pattern';
  if (segments[0] === '.claude' || segments[0] === '.codex' || segments[0] === '.agents') return 'harness-control-tree';

  if (underSpecifyChild(segments, 'codex-plugins')) return 'tdk-specify-generated';
  if (specifyExactSuffix(segments, ['release-manifest.json'])) return 'tdk-specify-generated';
  if (specifyDepsCacheBasename(segments, basename)) return 'tdk-specify-generated';
  if (underSpecifyChild(segments, 'state')) return 'tdk-specify-generated';
  if (specifyExactSuffix(segments, ['plugins', 'manifest.json'])) return 'tdk-specify-generated';
  if (specifyExactSuffix(segments, ['plugins', 'plugin-dependencies.json'])) return 'tdk-specify-generated';
  if (specifyExactSuffix(segments, ['.specify.json'])) return 'tdk-specify-generated';
  if (basename === 'distribute.json') return 'tdk-generated-file';
  if (specifyExactSuffixFrom(segments, '.claude-plugin', ['marketplace.json'])) return 'tdk-generated-file';

  return null;
}

/** Same-shape helper as specifyExactSuffix, generalized to an arbitrary anchor segment. */
function specifyExactSuffixFrom(segments: string[], anchor: string, suffix: string[]): boolean {
  const idx = segments.indexOf(anchor);
  if (idx === -1) return false;
  const tail = segments.slice(idx + 1);
  return tail.length === suffix.length && tail.every((s, i) => s === suffix[i]);
}

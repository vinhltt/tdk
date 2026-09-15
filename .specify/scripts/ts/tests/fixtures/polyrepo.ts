// Shared filesystem fixture for root-resolution and per-repository branch tests.
//
// Phase 02 created the minimal form (one artifact host, one code repo, a branch name matching
// neither the builder root nor `main`, no remotes) so AC2 had something to run against. Phase 04
// extends THIS file rather than forking a second one: on-disk bare remotes, non-`origin` remote
// names, local-only milestones and tag/branch name collisions.
//
// Everything is on disk. No fixture here may touch the network: remotes are bare repositories in
// the same temp tree, so a test can never hang on a credential prompt or a real host.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Branch for the artifact host. Not `master`, not `main` — so a wrong answer is visibly wrong. */
export const HOST_BRANCH = 'epic-authority';
/** Branch for the default `api` code repository. Distinct from the host's. */
export const API_BRANCH = 'feature/auth-9001';

const created: string[] = [];

/** Remove every directory handed out by this module. Call from `afterAll`. */
export function cleanupPolyrepoFixtures(): void {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}

/** A git repository with one commit, on `branch`. */
export function makeRepo(dir: string, branch: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', branch]);
  git(dir, ['config', 'user.email', 'fixture@example.test']);
  git(dir, ['config', 'user.name', 'Fixture']);
  writeFileSync(join(dir, 'README.md'), `# ${branch}\n`);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-qm', 'init']);
}

/** Commit a new file so the repository advances by one commit, and return the new SHA. */
function commitOnto(dir: string, marker: string): string {
  writeFileSync(join(dir, `${marker}.txt`), `${marker}\n`);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-qm', marker]);
  return git(dir, ['rev-parse', 'HEAD']);
}

export interface SubSpec {
  name: string;
  /** Workspace-relative path, e.g. `apps/api`. */
  path: string;
  /** Branch the bare remote's HEAD points at. Drives what `origin/HEAD` resolves to. */
  defaultBranch?: string;
  /** Branch the working copy ends up on. Defaults to `defaultBranch`. */
  currentBranch?: string;
  /** Remote name. Defaults to `origin`; a non-`origin` name is what AC3 needs. */
  remoteName?: string;
  /** Give this repository a bare remote at all. `false` models a local-only repository. */
  withRemote?: boolean;
  /** Create this branch in the repository (the repo's own milestone). */
  milestone?: string;
  /** Push the milestone to the remote. `false` leaves it local-only. */
  pushMilestone?: boolean;
  /** Leave the remote with no resolvable HEAD, so `origin/HEAD` cannot be mirrored. */
  unsetRemoteHead?: boolean;
  /** Create a tag with this name at a *different* commit, to collide with a branch name. */
  extraTag?: string;
}

export interface SubFixture {
  name: string;
  /** Workspace-relative path. */
  path: string;
  /** Absolute path of the working checkout. */
  root: string;
  /** Absolute path of the bare remote, or null when the repository is local-only. */
  remotePath: string | null;
  remoteName: string | null;
  defaultBranch: string;
  currentBranch: string;
  /** Commit the milestone branch points at, when one was created. */
  milestoneCommit: string | null;
  /** Commit the colliding tag points at, when one was created. */
  tagCommit: string | null;
}

export interface PolyrepoFixture {
  /** The artifact host: the directory holding `.specify/.specify.json` of type workspace. */
  host: string;
  /** Alias kept for readability in tests that talk about the host as a root. */
  hostRoot: string;
  /** Sub-workspaces by name. */
  subs: Record<string, SubFixture>;
  /** Convenience handle for the default `api` sub-workspace. */
  apiRoot: string;
  /** A nested artifact host at `<host>/inner`, present only when `nestedHost` was requested. */
  nestedHost: string | null;
  /** Temp directory containing the host. Useful as an "outside the host" location. */
  container: string;
  /** Remove just this fixture. */
  cleanup: () => void;
}

export interface PolyrepoOptions {
  /**
   * Also create a second, complete workspace host at `<host>/inner`. Host-inside-host is the only
   * shape that distinguishes "innermost host wins" from "the env host always wins".
   */
  nestedHost?: boolean;
  /**
   * Give the first sub-workspace its own `type: "sub-workspace"` config, so host resolution has a
   * child config it must climb past rather than stop at.
   */
  childConfig?: boolean;
  /** Extra keys merged into the host's `.specify.json`, applied after the generated ones. */
  configOverrides?: Record<string, unknown>;
  /** Prefix for the temp directory name, to keep failing tests identifiable. */
  prefix?: string;
  /**
   * Sub-workspaces to build. Omitted, a single remote-less `api` repository on API_BRANCH is
   * created — the phase-02 shape, which the resolution matrix depends on.
   */
  subs?: SubSpec[];
}

const DEFAULT_SUBS: SubSpec[] = [
  { name: 'api', path: 'apps/api', defaultBranch: API_BRANCH, withRemote: false },
];

/**
 * Build a workspace host with one or more sub-workspace repositories.
 *
 * The host is itself a git repository on `HOST_BRANCH`. `realpathSync.native` is applied to the
 * container because `/tmp` is a symlink on macOS and every ancestor comparison in the resolution
 * ladder works on real paths.
 */
export function createPolyrepo(options: PolyrepoOptions = {}): PolyrepoFixture {
  const container = realpathSync.native(mkdtempSync(join(tmpdir(), options.prefix ?? 'tdk-polyrepo-')));
  created.push(container);

  const host = join(container, 'workspace');
  makeRepo(host, HOST_BRANCH);

  const remotesDir = join(container, 'remotes');
  const specs = options.subs ?? DEFAULT_SUBS;
  const subs: Record<string, SubFixture> = {};
  for (const spec of specs) subs[spec.name] = buildSub(host, remotesDir, spec);

  writeWorkspaceConfig(host, {
    name: 'polyrepo-workspace',
    git: { mainBranch: 'main' },
    subWorkspaces: specs.map(s => ({ name: s.name, path: s.path })),
    ...options.configOverrides,
  });

  if (options.childConfig) {
    const first = subs[specs[0]!.name]!;
    mkdirSync(join(first.root, '.specify'), { recursive: true });
    writeFileSync(
      join(first.root, '.specify/.specify.json'),
      `${JSON.stringify({ type: 'sub-workspace', name: first.name }, null, 2)}\n`,
    );
  }

  let nestedHost: string | null = null;
  if (options.nestedHost) {
    nestedHost = join(host, 'inner');
    mkdirSync(nestedHost, { recursive: true });
    writeWorkspaceConfig(nestedHost, { name: 'inner-workspace' });
  }

  return {
    host,
    hostRoot: host,
    subs,
    apiRoot: subs['api']?.root ?? join(host, specs[0]!.path),
    nestedHost,
    container,
    cleanup: () => rmSync(container, { recursive: true, force: true }),
  };
}

function buildSub(host: string, remotesDir: string, spec: SubSpec): SubFixture {
  const defaultBranch = spec.defaultBranch ?? 'main';
  const currentBranch = spec.currentBranch ?? defaultBranch;
  const root = join(host, spec.path);
  makeRepo(root, defaultBranch);

  let milestoneCommit: string | null = null;
  if (spec.milestone !== undefined && spec.milestone !== defaultBranch) {
    git(root, ['branch', spec.milestone]);
    git(root, ['checkout', '-q', spec.milestone]);
    milestoneCommit = commitOnto(root, `milestone-${spec.milestone.replace(/\W+/g, '-')}`);
    git(root, ['checkout', '-q', defaultBranch]);
  } else if (spec.milestone === defaultBranch) {
    milestoneCommit = git(root, ['rev-parse', 'HEAD']);
  }

  // A tag sharing the milestone's name, parked on a *different* commit. `git rev-parse <name>`
  // prefers the tag, which is how a bare name silently resolves to the wrong object.
  let tagCommit: string | null = null;
  if (spec.extraTag !== undefined) {
    git(root, ['checkout', '-q', '-b', '__tagbase']);
    tagCommit = commitOnto(root, `tagbase-${spec.extraTag.replace(/\W+/g, '-')}`);
    git(root, ['tag', spec.extraTag]);
    git(root, ['checkout', '-q', defaultBranch]);
    git(root, ['branch', '-qD', '__tagbase']);
  }

  let remotePath: string | null = null;
  const remoteName = spec.withRemote === false ? null : (spec.remoteName ?? 'origin');
  if (remoteName !== null) {
    mkdirSync(remotesDir, { recursive: true });
    remotePath = join(remotesDir, `${spec.name}.git`);
    execFileSync('git', ['init', '-q', '--bare', '-b', defaultBranch, remotePath], { stdio: 'ignore' });
    git(root, ['remote', 'add', remoteName, remotePath]);
    git(root, ['push', '-q', remoteName, defaultBranch]);

    // Set the bare repository's HEAD explicitly before asking the clone to mirror it: a bare repo
    // created by `git init --bare` has a HEAD, but `remote set-head -a` is what materialises
    // `refs/remotes/<remote>/HEAD` locally, and it can only mirror what the remote actually says.
    execFileSync('git', ['--git-dir', remotePath, 'symbolic-ref', 'HEAD', `refs/heads/${defaultBranch}`], { stdio: 'ignore' });

    git(root, ['remote', 'set-head', remoteName, '-a']);

    if (spec.unsetRemoteHead === true) {
      // Point the bare repository's HEAD at a branch that does not exist and drop the local
      // mirror. Deleting only the local ref is not enough: git re-creates `origin/HEAD` from the
      // remote on the next fetch, so the remote itself has to have nothing to offer.
      execFileSync('git', ['--git-dir', remotePath, 'symbolic-ref', 'HEAD', 'refs/heads/__no-head'], { stdio: 'ignore' });
      try {
        git(root, ['symbolic-ref', '-d', `refs/remotes/${remoteName}/HEAD`]);
      } catch { /* already absent */ }
    }

    if (spec.milestone !== undefined && spec.pushMilestone !== false) {
      // Fully-qualified refspec: with a tag of the same name present, a bare `epic-1` is ambiguous
      // and git refuses the push. `-u` because a pushed milestone normally tracks its remote, which
      // is what makes tier 1 of base resolution apply.
      git(root, ['push', '-q', '-u', remoteName, `refs/heads/${spec.milestone}:refs/heads/${spec.milestone}`]);
    }
  }

  if (currentBranch !== defaultBranch) {
    const exists = git(root, ['branch', '--list', currentBranch]).length > 0;
    git(root, exists ? ['checkout', '-q', currentBranch] : ['checkout', '-q', '-b', currentBranch]);
  }

  return {
    name: spec.name,
    path: spec.path,
    root,
    remotePath,
    remoteName,
    defaultBranch,
    currentBranch,
    milestoneCommit,
    tagCommit,
  };
}

/** Write a workspace-type `.specify/.specify.json` under `dir`. */
export function writeWorkspaceConfig(dir: string, config: Record<string, unknown>): void {
  mkdirSync(join(dir, '.specify'), { recursive: true });
  writeFileSync(join(dir, '.specify/.specify.json'), `${JSON.stringify(config, null, 2)}\n`);
}

/** A directory tree with no `.specify` config anywhere above it. */
export function createConfiglessDir(prefix = 'tdk-noconfig-'): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  created.push(dir);
  mkdirSync(join(dir, 'nested/leaf'), { recursive: true });
  return dir;
}

/** Point a sub-workspace's remote at a path that does not exist, so fetch fails offline. */
export function breakRemote(sub: SubFixture): void {
  if (sub.remoteName === null) throw new Error(`sub ${sub.name} has no remote to break`);
  git(sub.root, ['remote', 'set-url', sub.remoteName, join(sub.root, '..', 'does-not-exist.git')]);
}

/** Read a ref's commit from a sub-workspace, or null when it does not resolve. */
export function revParse(sub: SubFixture, ref: string): string | null {
  try {
    return git(sub.root, ['rev-parse', '--verify', `${ref}^{commit}`]);
  } catch {
    return null;
  }
}

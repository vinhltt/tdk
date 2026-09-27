import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync, type Stats } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { Command } from 'commander';

const UPSTREAM_REPOSITORY = 'https://github.com/vinhltt/tdk-memory';
const PLUGIN_PREFIX = '.specify/plugins/tdk-memory';
const PIN_RELATIVE_PATH = `${PLUGIN_PREFIX}.upstream-pin`;
const RELEASE_MANIFEST_RELATIVE_PATH = '.specify/release-manifest.json';
const TESTS_PREFIX = `${PLUGIN_PREFIX}/tests/`;

/** The nested TDK checkout containing this command. */
export const DEFAULT_TDK_ROOT = resolve(import.meta.dir, '../../../../../..');

export type MemorySubtreeDiagnosticKind =
  | 'pin'
  | 'repository'
  | 'missing-object'
  | 'git'
  | 'prefix'
  | 'missing'
  | 'extra'
  | 'changed'
  | 'mode'
  | 'unsupported'
  | 'release-manifest';

export interface MemorySubtreeDiagnostic {
  kind: MemorySubtreeDiagnosticKind;
  message: string;
  path?: string;
}

export interface MemorySubtreeGuardResult {
  ok: boolean;
  root: string;
  commit?: string;
  diagnostics: MemorySubtreeDiagnostic[];
}

export interface CheckMemorySubtreeOptions {
  /** TDK repository root. Defaults to the nested checkout containing this command. */
  projectRoot?: string;
}

interface UpstreamPin {
  repo: typeof UPSTREAM_REPOSITORY;
  commit: string;
}

interface TreeEntry {
  mode: string;
  blob: string;
}

interface GitResult {
  status: number | null;
  stdout: Buffer;
  stderr: string;
  error?: string;
}

const ReleaseManifestPayloadSchema = z.object({
  files: z.record(z.unknown()),
}).passthrough();

const PIN_PATTERN = new RegExp(
  `^repo: ${UPSTREAM_REPOSITORY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\ncommit: ([0-9a-f]{40})\\r?\\n?$`,
);

function gitEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_NO_LAZY_FETCH: '1' };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return env;
}

function runGit(root: string, args: readonly string[]): GitResult {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'buffer',
    env: gitEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ''),
    stderr: Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8').trim() : String(result.stderr ?? '').trim(),
    error: result.error?.message,
  };
}

function gitFailure(operation: string, result: GitResult): MemorySubtreeDiagnostic {
  const detail = result.error || result.stderr || `git exited ${String(result.status)}`;
  return { kind: 'git', message: `${operation}: ${detail}` };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function fetchCommand(root: string, commit: string): string {
  return `git -C ${shellQuote(root)} fetch ${UPSTREAM_REPOSITORY} ${commit}`;
}

function parsePin(text: string): UpstreamPin | null {
  const match = PIN_PATTERN.exec(text);
  if (!match?.[1]) return null;
  return { repo: UPSTREAM_REPOSITORY, commit: match[1] };
}

function isSafeTreePath(path: string): boolean {
  if (!path || isAbsolute(path) || path.includes('\\')) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function parseExpectedTree(output: Buffer): { entries?: Map<string, TreeEntry>; diagnostic?: MemorySubtreeDiagnostic } {
  const entries = new Map<string, TreeEntry>();
  let start = 0;
  while (start < output.length) {
    const end = output.indexOf(0, start);
    if (end === -1) {
      return { diagnostic: { kind: 'git', message: 'git ls-tree returned an unterminated NUL record' } };
    }
    const record = output.subarray(start, end).toString('utf8');
    start = end + 1;
    if (!record) continue;

    const tab = record.indexOf('\t');
    const metadata = tab === -1 ? '' : record.slice(0, tab);
    const path = tab === -1 ? '' : record.slice(tab + 1);
    const [mode, type, blob] = metadata.split(' ');
    if (!mode || !type || !blob || !isSafeTreePath(path)) {
      return { diagnostic: { kind: 'git', message: `git ls-tree returned an invalid record for '${path || '<unknown>'}'` } };
    }
    if (type !== 'blob') {
      return {
        diagnostic: {
          kind: 'unsupported',
          path,
          message: `Pinned commit contains unsupported ${type} entry '${path}' (mode ${mode})`,
        },
      };
    }
    if (!/^[0-9a-f]{40}$/.test(blob) || entries.has(path)) {
      return { diagnostic: { kind: 'git', message: `git ls-tree returned an invalid blob entry for '${path}'` } };
    }
    entries.set(path, { mode, blob });
  }
  return { entries };
}

function prefixSet(paths: Iterable<string>): Set<string> {
  const prefixes = new Set<string>();
  for (const path of paths) {
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index += 1) prefixes.add(parts.slice(0, index).join('/'));
  }
  return prefixes;
}

function trackedPluginPaths(root: string): { paths?: Set<string>; diagnostic?: MemorySubtreeDiagnostic } {
  const result = runGit(root, ['ls-files', '-z', '--', PLUGIN_PREFIX]);
  if (result.status !== 0) return { diagnostic: gitFailure('Could not read tracked plugin paths', result) };

  const paths = new Set<string>();
  for (const rawPath of result.stdout.toString('utf8').split('\0')) {
    if (!rawPath) continue;
    if (!rawPath.startsWith(`${PLUGIN_PREFIX}/`)) {
      return { diagnostic: { kind: 'git', message: `git ls-files returned a path outside the plugin prefix: '${rawPath}'` } };
    }
    const path = rawPath.slice(PLUGIN_PREFIX.length + 1);
    if (!isSafeTreePath(path)) {
      return { diagnostic: { kind: 'git', message: `git ls-files returned an unsafe plugin path: '${rawPath}'` } };
    }
    paths.add(path);
  }
  return { paths };
}

function ignoredByRepository(root: string, path: string, directory: boolean): { ignored?: boolean; diagnostic?: MemorySubtreeDiagnostic } {
  const projectPath = `${PLUGIN_PREFIX}/${path}${directory ? '/' : ''}`;
  const result = runGit(root, ['check-ignore', '--no-index', '-q', '--', projectPath]);
  if (result.status === 0) return { ignored: true };
  if (result.status === 1) return { ignored: false };
  return { diagnostic: gitFailure(`Could not apply repository ignore rules to '${projectPath}'`, result) };
}

function gitBlobHash(bytes: Buffer): string {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

function workingMode(stat: Stats): string {
  if (stat.isSymbolicLink()) return '120000';
  return (stat.mode & 0o111) === 0 ? '100644' : '100755';
}

function readSymlinkBytes(path: string): Buffer {
  const target = readlinkSync(path, 'buffer');
  return Buffer.isBuffer(target) ? target : Buffer.from(target, 'utf8');
}

function scanWorkingTree(
  root: string,
  expected: ReadonlyMap<string, TreeEntry>,
  tracked: ReadonlySet<string>,
): { entries?: Map<string, TreeEntry>; diagnostics: MemorySubtreeDiagnostic[] } {
  const diagnostics: MemorySubtreeDiagnostic[] = [];
  const pluginRoot = join(root, PLUGIN_PREFIX);
  const expectedPrefixes = prefixSet(expected.keys());
  const trackedPrefixes = prefixSet(tracked);

  for (const component of ['.specify', 'plugins', 'tdk-memory']) {
    const current = component === '.specify'
      ? join(root, component)
      : component === 'plugins'
        ? join(root, '.specify', component)
        : pluginRoot;
    try {
      if (lstatSync(current).isSymbolicLink()) {
        return {
          diagnostics: [{ kind: 'prefix', path: current, message: `Plugin prefix component is a symlink: ${current}` }],
        };
      }
    } catch {
      return {
        diagnostics: [{ kind: 'prefix', path: current, message: `Plugin prefix is missing: ${current}` }],
      };
    }
  }

  try {
    if (!lstatSync(pluginRoot).isDirectory()) {
      return { diagnostics: [{ kind: 'prefix', path: pluginRoot, message: `Plugin prefix is not a directory: ${pluginRoot}` }] };
    }
  } catch {
    return { diagnostics: [{ kind: 'prefix', path: pluginRoot, message: `Plugin prefix is missing: ${pluginRoot}` }] };
  }

  const actual = new Map<string, TreeEntry>();

  const shouldSkip = (path: string, directory: boolean): boolean => {
    // Expected and tracked paths must win over ignore rules. Otherwise an ignore rule such as
    // node_modules/ could hide a tracked file whose bytes were edited after the subtree pull.
    if (expectedPrefixes.has(path) || trackedPrefixes.has(path)) return false;
    const ignore = ignoredByRepository(root, path, directory);
    if (ignore.diagnostic) {
      diagnostics.push(ignore.diagnostic);
      return false;
    }
    return ignore.ignored === true;
  };

  const visit = (directory: string, relativeDirectory: string): void => {
    let children;
    try {
      children = readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      diagnostics.push({
        kind: 'prefix',
        path: relativeDirectory || '.',
        message: `Could not read plugin directory '${relativeDirectory || '.'}': ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    for (const child of children) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
      const absolutePath = join(directory, child.name);
      let stat;
      try {
        stat = lstatSync(absolutePath);
      } catch (error) {
        diagnostics.push({
          kind: 'prefix',
          path: relativePath,
          message: `Could not stat '${relativePath}': ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }

      if (stat.isDirectory()) {
        if (!shouldSkip(relativePath, true)) visit(absolutePath, relativePath);
        continue;
      }
      if (shouldSkip(relativePath, false)) continue;

      try {
        if (stat.isFile()) {
          actual.set(relativePath, { mode: workingMode(stat), blob: gitBlobHash(readFileSync(absolutePath)) });
        } else if (stat.isSymbolicLink()) {
          actual.set(relativePath, { mode: workingMode(stat), blob: gitBlobHash(readSymlinkBytes(absolutePath)) });
        } else {
          diagnostics.push({ kind: 'unsupported', path: relativePath, message: `Unsupported working-tree entry '${relativePath}'` });
        }
      } catch (error) {
        diagnostics.push({
          kind: 'prefix',
          path: relativePath,
          message: `Could not read '${relativePath}': ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  };

  visit(pluginRoot, '');
  return { entries: actual, diagnostics };
}


function releaseManifestDiagnostics(root: string): MemorySubtreeDiagnostic[] {
  const manifestPath = join(root, RELEASE_MANIFEST_RELATIVE_PATH);
  let manifest: z.infer<typeof ReleaseManifestPayloadSchema>;
  try {
    manifest = ReleaseManifestPayloadSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  } catch (error) {
    return [{
      kind: 'release-manifest',
      path: RELEASE_MANIFEST_RELATIVE_PATH,
      message: `Could not read release manifest '${RELEASE_MANIFEST_RELATIVE_PATH}': ${error instanceof Error ? error.message : String(error)}`,
    }];
  }

  const diagnostics: MemorySubtreeDiagnostic[] = [];
  for (const path of Object.keys(manifest.files)) {
    if (/(?:^|\/)\.git(?:\/|$)/.test(path)) {
      diagnostics.push({ kind: 'release-manifest', path, message: `Release payload includes Git metadata path '${path}'` });
    }
    if (/(?:^|\/)\.logs(?:\/|$)/.test(path)) {
      diagnostics.push({ kind: 'release-manifest', path, message: `Release payload includes log path '${path}'` });
    }
    if (path === TESTS_PREFIX.slice(0, -1) || path.startsWith(TESTS_PREFIX)) {
      diagnostics.push({ kind: 'release-manifest', path, message: `Release payload includes plugin test path '${path}'` });
    }
  }
  return diagnostics;
}

function withDiagnostics(root: string, commit: string | undefined, diagnostics: MemorySubtreeDiagnostic[]): MemorySubtreeGuardResult {
  return { ok: diagnostics.length === 0, root, ...(commit ? { commit } : {}), diagnostics };
}

/**
 * Compare the physical tdk-memory subtree with the Git object inventory of its pinned upstream
 * commit. The pin is intentionally only repository + commit; no caller-written tree hash is read.
 */
export function checkMemorySubtreePin(options: CheckMemorySubtreeOptions = {}): MemorySubtreeGuardResult {
  const root = resolve(options.projectRoot ?? DEFAULT_TDK_ROOT);
  const pinPath = join(root, PIN_RELATIVE_PATH);

  let pin: UpstreamPin | null;
  try {
    pin = parsePin(readFileSync(pinPath, 'utf8'));
  } catch (error) {
    return withDiagnostics(root, undefined, [{
      kind: 'pin',
      path: PIN_RELATIVE_PATH,
      message: `Missing upstream pin '${PIN_RELATIVE_PATH}': ${error instanceof Error ? error.message : String(error)}`,
    }]);
  }
  if (!pin) {
    return withDiagnostics(root, undefined, [{
      kind: 'pin',
      path: PIN_RELATIVE_PATH,
      message: `Upstream pin must contain exactly 'repo: ${UPSTREAM_REPOSITORY}' and one lowercase 40-hex 'commit:' line`,
    }]);
  }

  const repositoryCheck = runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (repositoryCheck.status !== 0 || repositoryCheck.stdout.toString('utf8').trim() !== 'true') {
    return withDiagnostics(root, pin.commit, [{
      kind: 'repository',
      message: `TDK root is not a usable Git worktree: ${repositoryCheck.error || repositoryCheck.stderr || `git exited ${String(repositoryCheck.status)}`}`,
    }]);
  }

  const objectCheck = runGit(root, ['cat-file', '-e', `${pin.commit}^{commit}`]);
  if (objectCheck.status !== 0) {
    return withDiagnostics(root, pin.commit, [{
      kind: 'missing-object',
      path: PIN_RELATIVE_PATH,
      message: `Pinned upstream commit ${pin.commit} is unavailable locally. Fetch it before running the guard: ${fetchCommand(root, pin.commit)}`,
    }]);
  }

  const tree = runGit(root, ['ls-tree', '-r', '-z', pin.commit]);
  if (tree.status !== 0) return withDiagnostics(root, pin.commit, [gitFailure(`Could not list pinned commit ${pin.commit}`, tree)]);
  const parsedTree = parseExpectedTree(tree.stdout);
  if (parsedTree.diagnostic || !parsedTree.entries) {
    return withDiagnostics(root, pin.commit, [parsedTree.diagnostic ?? { kind: 'git', message: 'Could not parse pinned tree' }]);
  }

  const tracked = trackedPluginPaths(root);
  if (tracked.diagnostic || !tracked.paths) return withDiagnostics(root, pin.commit, [tracked.diagnostic ?? { kind: 'git', message: 'Could not read tracked plugin paths' }]);

  const workingTree = scanWorkingTree(root, parsedTree.entries, tracked.paths);
  const diagnostics = [...workingTree.diagnostics];
  if (workingTree.entries) {
    for (const [path, expected] of parsedTree.entries) {
      const actual = workingTree.entries.get(path);
      if (!actual) {
        diagnostics.push({ kind: 'missing', path, message: `Missing pinned path '${path}'` });
        continue;
      }
      if (actual.blob !== expected.blob) {
        diagnostics.push({ kind: 'changed', path, message: `Changed bytes at '${path}'` });
      }
      if (actual.mode !== expected.mode) {
        diagnostics.push({ kind: 'mode', path, message: `Mode mismatch at '${path}': expected ${expected.mode}, found ${actual.mode}` });
      }
    }
    for (const path of [...workingTree.entries.keys()].sort()) {
      if (!parsedTree.entries.has(path)) {
        diagnostics.push({ kind: 'extra', path, message: `Extra working-tree path '${path}'` });
      }
    }
  }

  diagnostics.push(...releaseManifestDiagnostics(root));
  return withDiagnostics(root, pin.commit, diagnostics);
}

export function formatMemorySubtreeGuardResult(result: MemorySubtreeGuardResult): string {
  if (result.ok) return `tdk-memory subtree matches pinned commit ${result.commit ?? '<unknown>'}`;
  const heading = `tdk-memory subtree guard failed at ${result.root}`;
  return [heading, ...result.diagnostics.map((diagnostic) => {
    const path = diagnostic.path ? ` [${diagnostic.path}]` : '';
    return `- ${diagnostic.kind.toUpperCase()}${path}: ${diagnostic.message}`;
  })].join('\n');
}

if (import.meta.main) {
  const program = new Command()
    .name('check-memory-subtree')
    .description('Compare the tdk-memory subtree with its pinned upstream commit')
    .option('--project-root <path>', 'TDK repository root', DEFAULT_TDK_ROOT)
    .action((options: CheckMemorySubtreeOptions) => {
      const result = checkMemorySubtreePin(options);
      const output = formatMemorySubtreeGuardResult(result);
      if (result.ok) process.stdout.write(`${output}\n`);
      else {
        process.stderr.write(`${output}\n`);
        process.exitCode = 1;
      }
    });
  program.parse();
}

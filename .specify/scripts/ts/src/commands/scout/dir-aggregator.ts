// Full-scope metrics/edges, with a byte-bounded representative file view.

import { posix } from 'node:path';
import { buildTree } from './tree-builder';
import { MAX_AGGREGATED_BYTES, type DirSummary, type FileBlock, type FileEntry, type Tier1Result, type TreeNode } from './types';

export const MAX_REPRESENTATIVE_FILES = 50;
const MAX_ENTRY_POINTS = 3;
const JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
const ENTRY_POINT = /^(?:(?:index|main|app|server|cli|mod)\.(?:[cm]?[jt]sx?|py|go|rs)|__(?:init|main)__\.py)$/i;

interface Directory {
  path: string;
  parts: string[];
}

interface Entry {
  file: FileEntry;
  directory: Directory;
  entryPoint: boolean;
  fileBytes: number;
  unparsedBytes: number;
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf-8');
}

function groupPath(directory: Directory, depth: number): string {
  return depth === 0 || directory.parts.length === 0
    ? '.'
    : directory.parts.slice(0, depth).join('/');
}

/**
 * Choose a measured, bounded directory-prefix depth with at least one original
 * representative per group. Import resolution is done once, not per depth candidate.
 * Depth zero is the entire scope; at positive depths '.' contains root files only.
 */
export function aggregateTier1(result: Tier1Result, blocks: FileBlock[]): Tier1Result {
  const unparsed = new Set(result.unparsed);
  const directories = new Map<string, Directory>();
  let maxDepth = 0;
  const entries = result.files.map((file): Entry => {
    const path = posix.dirname(posix.normalize(file.path));
    let directory = directories.get(path);
    if (!directory) {
      directory = { path, parts: path === '.' ? [] : path.split('/') };
      directories.set(path, directory);
      maxDepth = Math.max(maxDepth, directory.parts.length);
    }
    const fileBytes = bytes(file);
    const unparsedBytes = unparsed.has(file.path) ? bytes(file.path) : 0;
    return { file, directory, entryPoint: ENTRY_POINT.test(posix.basename(file.path)), fileBytes, unparsedBytes };
  });
  entries.sort((a, b) => Number(b.entryPoint) - Number(a.entryPoint) || comparePaths(a.file.path, b.file.path));
  const dependencies = resolveDependencies(entries, blocks);

  const atDepth = (depth: number): Tier1Result | undefined => {
    const groups = new Map<string, DirSummary>();
    const directoryGroups = new Map<string, string>();
    for (const directory of directories.values()) directoryGroups.set(directory.path, groupPath(directory, depth));
    const candidates = new Map<string, Entry[]>();
    for (const entry of entries) {
      const path = directoryGroups.get(entry.directory.path)!;
      let group = groups.get(path);
      if (!group) {
        group = { path, fileCount: 0, totalLoc: 0, totalTokens: 0, entryPoints: [], imports: [] };
        groups.set(path, group);
      }
      group.fileCount++;
      group.totalLoc += entry.file.loc;
      group.totalTokens += entry.file.tokens;
      let groupEntries = candidates.get(path);
      if (!groupEntries) candidates.set(path, groupEntries = []);
      groupEntries.push(entry);
    }
    if (groups.size > MAX_REPRESENTATIVE_FILES) return undefined;
    const edges = new Map<string, Map<string, number>>();
    for (const entry of entries) {
      const source = directoryGroups.get(entry.directory.path)!;
      const targets = new Set<string>();
      for (const target of dependencies.get(entry) ?? []) {
        const group = directoryGroups.get(target)!;
        if (group !== source) targets.add(group);
      }
      if (targets.size === 0) continue;
      let imports = edges.get(source);
      if (!imports) edges.set(source, imports = new Map());
      for (const target of targets) imports.set(target, (imports.get(target) ?? 0) + 1);
    }
    for (const [source, imports] of edges) {
      groups.get(source)!.imports = [...imports].sort(([a], [b]) => comparePaths(a, b))
        .map(([path, fileCount]) => ({ path, fileCount }));
    }
    const bounded: Tier1Result = {
      ...result,
      files: [],
      tree: {},
      unparsed: [],
      unparsedCount: result.unparsed.length,
      aggregated: [...groups.values()].sort((a, b) => comparePaths(a.path, b.path)),
      aggregationDepth: depth,
    };
    // Prefer entry-point names. If that full view is too large, retry using the
    // smallest original entry in every group before coarsening the scope.
    for (const smallest of [false, true]) {
      bounded.files = [];
      bounded.unparsed = [];
      for (const [path, groupEntries] of candidates) {
        let representative = groupEntries[0]!;
        if (smallest) {
          let representativeBytes = representative.fileBytes + representative.unparsedBytes +
            bytes(representative.file.path) + bytes(buildTree([representative.file.path]));
          for (const entry of groupEntries) {
            // The path appears in FileEntry, navigation anchors, and the tree.
            const viewBytes = entry.fileBytes + entry.unparsedBytes +
              bytes(entry.file.path) + bytes(buildTree([entry.file.path]));
            if (viewBytes < representativeBytes) {
              representative = entry;
              representativeBytes = viewBytes;
            }
          }
        }
        bounded.files.push(representative.file);
        if (representative.unparsedBytes) bounded.unparsed.push(representative.file.path);
        groups.get(path)!.entryPoints = [representative.file.path];
      }
      bounded.tree = buildTree(bounded.files.map(file => file.path));
      if (bytes(bounded) <= MAX_AGGREGATED_BYTES) break;
      if (smallest) return undefined;
    }
    let serializedBytes = bytes(bounded);
    const selected = new Set(bounded.files.map(file => file.path));
    for (const entry of entries) {
      if (bounded.files.length >= MAX_REPRESENTATIVE_FILES) break;
      if (selected.has(entry.file.path)) continue;
      const group = groups.get(groupPath(entry.directory, depth))!;
      const anchorDelta = group.entryPoints.length < MAX_ENTRY_POINTS ? bytes(entry.file.path) + 1 : 0;
      const fileDelta = entry.fileBytes + 1;
      const unparsedDelta = entry.unparsedBytes + (entry.unparsedBytes && bounded.unparsed.length ? 1 : 0);
      if (serializedBytes + fileDelta + unparsedDelta + anchorDelta > MAX_AGGREGATED_BYTES) continue;
      const addition = treeAddition(bounded.tree, buildTree([entry.file.path]));
      if (serializedBytes + fileDelta + unparsedDelta + anchorDelta + addition.bytes > MAX_AGGREGATED_BYTES) continue;
      addition.apply();
      bounded.files.push(entry.file);
      selected.add(entry.file.path);
      if (entry.unparsedBytes) bounded.unparsed.push(entry.file.path);
      if (anchorDelta) group.entryPoints.push(entry.file.path);
      serializedBytes += fileDelta + unparsedDelta + anchorDelta + addition.bytes;
    }
    if (bytes(bounded) > MAX_AGGREGATED_BYTES) return undefined;
    return bounded;
  };

  let bounded = atDepth(maxDepth);
  if (!bounded) {
    let low = 0;
    let high = maxDepth;
    bounded = atDepth(0);
    if (!bounded) {
      throw new Error(
        `directory summary cannot fit ${MAX_AGGREGATED_BYTES} UTF-8 bytes with an original representative per group. ` +
        'Re-run with --scope <subdir> or --include <patterns> to narrow the scope.',
      );
    }
    // Coarsening merges groups and their edges, retaining every file's metrics.
    while (low + 1 < high) {
      const depth = Math.floor((low + high) / 2);
      const candidate = atDepth(depth);
      if (candidate) {
        low = depth;
        bounded = candidate;
      } else {
        high = depth;
      }
    }
  }
  return bounded;
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A singleton buildTree has one branch. <=50 representatives never hit sibling truncation. */
function treeAddition(tree: TreeNode, singleton: TreeNode): { bytes: number; apply: () => void } {
  let target = tree;
  let source = singleton;
  while (true) {
    const [key, value] = Object.entries(source)[0]!;
    const existing = target[key];
    if (existing === undefined) {
      const parent = target;
      return {
        bytes: bytes(key) + 1 + bytes(value) + (Object.keys(parent).length ? 1 : 0),
        apply: () => { parent[key] = value; },
      };
    }
    if (Array.isArray(existing) && Array.isArray(value)) {
      const item = value[0]!;
      return { bytes: bytes(item) + (existing.length ? 1 : 0), apply: () => { existing.push(item); } };
    }
    if (Array.isArray(existing) || Array.isArray(value)) {
      throw new Error('conflicting file and directory paths in pack; narrow the scope or rebuild the pack.');
    }
    target = existing;
    source = value;
  }
}

/** Only evidenced internal targets: relative JS, rooted/relative Python, declared Go modules. */
function resolveDependencies(entries: Entry[], blocks: FileBlock[]): Map<Entry, string[]> {
  const byPath = new Map<string, Entry | null>();
  const goDirectories = new Set<string>();
  for (const entry of entries) {
    const path = posix.normalize(entry.file.path);
    byPath.set(path, byPath.has(path) ? null : entry);
    if (path.endsWith('.go')) goDirectories.add(entry.directory.path);
  }
  const goModules = new Map<string, string | null>();
  for (const block of blocks) {
    if (posix.basename(block.path) !== 'go.mod') continue;
    const match = /^\s*module\s+(?:"([^"]+)"|([^\s]+))/m.exec(block.body);
    const module = match?.[1] ?? match?.[2];
    if (module) goModules.set(module, goModules.has(module) ? null : posix.dirname(posix.normalize(block.path)));
  }
  const uniqueFile = (paths: string[]): Entry | undefined => {
    let found: Entry | undefined;
    for (const path of paths) {
      const entry = byPath.get(path);
      if (entry === null || (entry && found)) return undefined;
      if (entry) found = entry;
    }
    return found;
  };
  const dependencies = new Map<Entry, string[]>();
  for (const entry of entries) {
    const extension = posix.extname(entry.file.path).toLowerCase();
    const targets = new Set<string>();
    for (const specifier of entry.file.imports) {
      let directory: string | undefined;
      if (JS_EXTENSIONS.includes(extension) && /^(?:\.?\.)(?:\/|$)/.test(specifier)) {
        const path = posix.normalize(posix.join(entry.directory.path, specifier));
        if (path === '..' || path.startsWith('../') || posix.isAbsolute(path)) continue;
        const exact = byPath.get(path);
        if (exact) directory = exact.directory.path;
        else if (exact !== null) {
          const ext = posix.extname(path);
          if (!ext) {
            const directPaths = JS_EXTENSIONS.map((suffix) => path + suffix);
            const directExists = directPaths.some((candidate) => byPath.has(candidate));
            directory = uniqueFile(directExists ? directPaths : JS_EXTENSIONS.map((suffix) => `${path}/index${suffix}`))?.directory.path;
          } else if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
            const replacements = ext === '.mjs' ? ['.mts'] : ext === '.cjs' ? ['.cts'] : ['.ts', '.tsx'];
            directory = uniqueFile(replacements.map((suffix) => path.slice(0, -ext.length) + suffix))?.directory.path;
          }
        }
      } else if (extension === '.py' && /^[\w.]+$/.test(specifier)) {
        const leading = /^\.+/.exec(specifier)?.[0].length ?? 0;
        let base = '.';
        if (leading) {
          // Do not infer package roots or traverse above the evidenced package directory.
          if (entry.directory.parts.length < leading) continue;
          base = entry.directory.parts.slice(0, entry.directory.parts.length - leading + 1).join('/');
        }
        const module = specifier.slice(leading).replaceAll('.', '/');
        const path = posix.join(base, module);
        directory = uniqueFile(module ? [`${path}.py`, `${path}/__init__.py`] : [`${path}/__init__.py`])?.directory.path;
      } else if (extension === '.go') {
        let path: string | undefined;
        if (/^\.\.?\//.test(specifier)) {
          path = posix.normalize(posix.join(entry.directory.path, specifier));
        } else {
          let prefix = specifier;
          while (prefix) {
            if (goModules.has(prefix)) {
              const root = goModules.get(prefix);
              if (root !== null && root !== undefined) path = posix.join(root, specifier.slice(prefix.length));
              break;
            }
            const slash = prefix.lastIndexOf('/');
            prefix = slash < 0 ? '' : prefix.slice(0, slash);
          }
        }
        if (path && path !== '..' && !path.startsWith('../') && goDirectories.has(path)) directory = path;
      }
      if (directory !== undefined) targets.add(directory);
    }
    if (targets.size) dependencies.set(entry, [...targets]);
  }
  return dependencies;
}

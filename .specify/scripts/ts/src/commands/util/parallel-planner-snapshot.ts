import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';
import { durableAtomicWriteFileSync } from './durable-atomic-file';
import {
  assertPlannerExternalSnapshot, capturePlannerExternal, restorePlannerExternal,
} from './parallel-planner-external-snapshot';
import {
  PLANNER_SNAPSHOT_MAX_ENTRIES, PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES, PLANNER_SNAPSHOT_MAX_UNIQUE_RAW_BYTES,
  assertPlannerSnapshotSerializedBound, comparePlannerPaths, isPlannerFileEntry, normalizePlannerWireSnapshot,
  plannerEntryFingerprint, plannerSnapshotSha256, serializeCanonicalPlannerSnapshot, PlannerWireSnapshotSchema,
  type CanonicalPlannerEntry, type CanonicalPlannerSnapshot, type PlannerSnapshotV2,
} from './parallel-planner-snapshot-schema';
import {
  inspectParallelGitTree, inspectParallelPathState,
} from './parallel-wave-git-audit';

export {
  plannerEntryFingerprint, type CanonicalPlannerEntry, type CanonicalPlannerSnapshot,
} from './parallel-planner-snapshot-schema';

// Metadata-only capture: reads and hashes each file but retains no payload. Used by callers that
// only ever need fingerprints (final-state validation, restore verification) so they don't
// materialize megabytes of Buffer/base64 on every finalization.
export function capturePlannerFeature(featureDir: string): CanonicalPlannerEntry[] {
  const entries: CanonicalPlannerEntry[] = []; const seen = new Set<string>(); let uniqueBytes = 0;
  const visit = (directory: string, prefix: string): void => {
    for (const item of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = resolve(directory, item.name); const relativePath = prefix ? `${prefix}/${item.name}` : item.name;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new Error(`planner snapshot rejects non-regular path: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        entries.push({ kind: 'directory', path: relativePath, mode: stat.mode & 0o7777 }); visit(path, relativePath);
      } else {
        const digest = plannerSnapshotSha256(readFileSync(path));
        if (!seen.has(digest)) {
          seen.add(digest); uniqueBytes += stat.size;
          if (uniqueBytes > PLANNER_SNAPSHOT_MAX_UNIQUE_RAW_BYTES) {
            throw new Error(`planner snapshot unique bytes ${uniqueBytes} exceeds limit ${PLANNER_SNAPSHOT_MAX_UNIQUE_RAW_BYTES}`);
          }
        }
        entries.push({ kind: 'file', path: relativePath, mode: stat.mode & 0o7777, sha256: digest });
      }
      if (entries.length > PLANNER_SNAPSHOT_MAX_ENTRIES) throw new Error(`planner snapshot exceeds ${PLANNER_SNAPSHOT_MAX_ENTRIES} entries`);
    }
  };
  // Walk order (depth-first, readdir-sorted per level) is not the same as path-sorted order
  // (e.g. a directory 'sub' and a sibling file 'sub-x.md' compare differently by the two orders).
  // Sort by canonical path here so walk order never leaks past this module.
  visit(featureDir, ''); return entries.sort((a, b) => comparePlannerPaths(a.path, b.path));
}

// Payload-retaining capture for snapshot creation: hashes and reads each file exactly once,
// keeping one Buffer per unique SHA-256. The 32 MiB unique-byte bound is enforced on the insert
// that introduces a NEW hash, so a tree of large duplicate files cannot balloon memory before the
// bound fires.
function capturePlannerFeatureWithBlobs(featureDir: string): { entries: CanonicalPlannerEntry[]; blobs: Map<string, Buffer> } {
  const entries: CanonicalPlannerEntry[] = []; const blobs = new Map<string, Buffer>(); let uniqueBytes = 0;
  const visit = (directory: string, prefix: string): void => {
    for (const item of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = resolve(directory, item.name); const relativePath = prefix ? `${prefix}/${item.name}` : item.name;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new Error(`planner snapshot rejects non-regular path: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        entries.push({ kind: 'directory', path: relativePath, mode: stat.mode & 0o7777 }); visit(path, relativePath);
      } else {
        const bytes = readFileSync(path); const digest = plannerSnapshotSha256(bytes);
        if (!blobs.has(digest)) {
          uniqueBytes += bytes.byteLength;
          if (uniqueBytes > PLANNER_SNAPSHOT_MAX_UNIQUE_RAW_BYTES) {
            throw new Error(`planner snapshot unique bytes ${uniqueBytes} exceeds limit ${PLANNER_SNAPSHOT_MAX_UNIQUE_RAW_BYTES}`);
          }
          blobs.set(digest, bytes);
        }
        entries.push({ kind: 'file', path: relativePath, mode: stat.mode & 0o7777, sha256: digest });
      }
      if (entries.length > PLANNER_SNAPSHOT_MAX_ENTRIES) throw new Error(`planner snapshot exceeds ${PLANNER_SNAPSHOT_MAX_ENTRIES} entries`);
    }
  };
  // Same ordering discipline as capturePlannerFeature — serializeCanonicalPlannerSnapshot already
  // re-sorts before writing, but sorting here too keeps this function's output consistent with the
  // canonical model's documented order on its own, without relying on a downstream re-sort.
  visit(featureDir, ''); return { entries: entries.sort((a, b) => comparePlannerPaths(a.path, b.path)), blobs };
}

export function capturePlannerSnapshot(input: {
  projectRoot: string; featureDir: string; controllerId: string; externalPaths: string[];
}): PlannerSnapshotV2 {
  const gitEntries = inspectParallelGitTree(input.projectRoot).entries.map(({ path, raw }) => ({
    path, raw, state: inspectParallelPathState(input.projectRoot, path),
  }));
  if (gitEntries.some(({ state }) => state.type === 'symlink')) {
    throw new Error('planner snapshot rejects Git-visible symlink paths');
  }
  const { entries, blobs } = capturePlannerFeatureWithBlobs(input.featureDir);
  const canonical: CanonicalPlannerSnapshot = { controllerId: input.controllerId,
    featureMode: lstatSync(input.featureDir).mode & 0o7777, entries, blobs,
    external: capturePlannerExternal({ ...input, paths: input.externalPaths }), gitEntries,
  };
  const wire = serializeCanonicalPlannerSnapshot(canonical);
  assertPlannerSnapshotSerializedBound(Buffer.byteLength(JSON.stringify(wire)) + 1);
  return wire;
}

export function readPlannerSnapshot(input: {
  path: string; controllerId: string; projectRoot: string; featureDir: string;
}): CanonicalPlannerSnapshot | null {
  const { path, controllerId } = input;
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES) {
    throw new Error(`planner snapshot must be a bounded regular file within ${PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES} bytes`);
  }
  const wire = PlannerWireSnapshotSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (wire.controllerId !== controllerId) throw new Error('planner snapshot controller mismatch');
  const snapshot = normalizePlannerWireSnapshot(wire);
  assertPlannerExternalSnapshot({ ...input, entries: snapshot.external });
  return snapshot;
}

export function assertNoUndeclaredPlannerDelta(input: {
  projectRoot: string; featureDir: string; snapshot: CanonicalPlannerSnapshot;
}): void {
  const before = new Map(input.snapshot.gitEntries.map(({ path, raw, state }) =>
    [path, JSON.stringify({ raw, state })]));
  const current = new Map(inspectParallelGitTree(input.projectRoot).entries.map(({ path, raw }) =>
    [path, JSON.stringify({ raw, state: inspectParallelPathState(input.projectRoot, path) })]));
  const feature = relative(resolve(input.projectRoot), resolve(input.featureDir)).replaceAll('\\', '/');
  const external = new Set(input.snapshot.external.map(({ path }) => path));
  const changed = [...new Set([...before.keys(), ...current.keys()])]
    .filter((path) => before.get(path) !== current.get(path));
  const undeclared = changed.filter((path) => path !== feature && !path.startsWith(`${feature}/`) && !external.has(path));
  if (undeclared.length) throw new Error(`undeclared planner mutation outside feature: ${undeclared.sort().join(', ')}`);
}

function makeRemovable(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  chmodSync(path, 0o700);
  for (const child of readdirSync(path)) makeRemovable(resolve(path, child));
}

export function restorePlannerSnapshot(input: {
  projectRoot: string; featureDir: string; snapshot: CanonicalPlannerSnapshot; crashAt?: string;
}): void {
  assertNoUndeclaredPlannerDelta(input);
  // Restore validates completely before destroying anything. A CanonicalPlannerSnapshot is valid
  // by construction (normalizePlannerWireSnapshot already verified every blob), but we assert the
  // reference again here defensively, before the clear loop, in case a snapshot was ever
  // constructed by a path other than normalization.
  for (const entry of input.snapshot.entries) {
    if (isPlannerFileEntry(entry) && !input.snapshot.blobs.has(entry.sha256)) {
      throw new Error(`planner snapshot missing blob for restore: ${entry.path}`);
    }
  }
  makeRemovable(input.featureDir);
  for (const child of readdirSync(input.featureDir)) rmSync(resolve(input.featureDir, child), { recursive: true, force: true });
  if (input.crashAt === 'after-clear') throw new Error('injected crash at after-clear');
  for (const entry of input.snapshot.entries.filter((item) => item.kind === 'directory')) mkdirSync(resolve(input.featureDir, entry.path), { recursive: true });
  let restored = 0;
  for (const entry of input.snapshot.entries.filter(isPlannerFileEntry)) {
    const target = resolve(input.featureDir, entry.path); mkdirSync(resolve(target, '..'), { recursive: true });
    // One decoded blob lookup per entry — the Map already holds each unique payload decoded once.
    durableAtomicWriteFileSync(target, input.snapshot.blobs.get(entry.sha256)!, entry.mode); restored += 1;
    if (input.crashAt === `after-file-${restored}`) throw new Error(`injected crash at after-file-${restored}`);
  }
  for (const entry of input.snapshot.entries.filter((item) => item.kind === 'directory').reverse()) chmodSync(resolve(input.featureDir, entry.path), entry.mode);
  chmodSync(input.featureDir, input.snapshot.featureMode);
  restorePlannerExternal({ ...input, entries: input.snapshot.external });
  if ((lstatSync(input.featureDir).mode & 0o7777) !== input.snapshot.featureMode
    || capturePlannerFeature(input.featureDir).map(plannerEntryFingerprint).join('\n')
      !== input.snapshot.entries.map(plannerEntryFingerprint).join('\n')) {
    throw new Error('planner rollback verification failed');
  }
  assertNoUndeclaredPlannerDelta(input);
}

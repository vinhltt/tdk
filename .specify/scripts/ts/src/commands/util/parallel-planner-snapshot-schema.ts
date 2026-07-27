import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PlannerExternalEntrySchema, type PlannerExternalEntry } from './parallel-planner-external-snapshot';
import { ParallelPathStateSchema } from './parallel-wave-git-audit';

// A CanonicalPlannerSnapshot is valid by construction: normalizePlannerWireSnapshot() is the only
// way to produce one. It fully decodes and verifies every blob against its declared SHA-256, checks
// every file entry's sha256 resolves to a decoded blob, rejects unused blobs and duplicate blob
// hashes, requires canonical/unique paths, and enforces the entry-count and unique-byte bounds.
// Downstream code (restore, fingerprinting, finalization) may therefore trust a
// CanonicalPlannerSnapshot without re-validating its shape or content.

export const PLANNER_SNAPSHOT_MAX_ENTRIES = 4096;
export const PLANNER_SNAPSHOT_MAX_UNIQUE_RAW_BYTES = 32 * 1024 * 1024;
export const PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES = 48 * 1024 * 1024;

type ParallelPathState = z.infer<typeof ParallelPathStateSchema>;

export type CanonicalPlannerEntry =
  | { kind: 'directory'; path: string; mode: number }
  | { kind: 'file'; path: string; mode: number; sha256: string };

export interface CanonicalPlannerSnapshot {
  controllerId: string;
  featureMode: number;
  entries: CanonicalPlannerEntry[];
  blobs: Map<string, Buffer>;
  external: PlannerExternalEntry[];
  gitEntries: Array<{ path: string; raw: string; state: ParallelPathState }>;
}

const DirectoryEntrySchema = z.object({ kind: z.literal('directory'), path: z.string(), mode: z.number().int() }).strict();
const V1FileEntrySchema = z.object({
  kind: z.literal('file'), path: z.string(), mode: z.number().int(),
  sha256: z.string().length(64), contentBase64: z.string(),
}).strict();
const V2FileEntrySchema = z.object({
  kind: z.literal('file'), path: z.string(), mode: z.number().int(), sha256: z.string().length(64),
}).strict();
const BlobSchema = z.object({ sha256: z.string().length(64), contentBase64: z.string() }).strict();
const GitEntrySchema = z.object({ path: z.string(), raw: z.string(), state: ParallelPathStateSchema }).strict();

export const PlannerWireSnapshotV1Schema = z.object({
  schemaVersion: z.literal(1), controllerId: z.string().min(1), featureMode: z.number().int(),
  entries: z.array(z.discriminatedUnion('kind', [DirectoryEntrySchema, V1FileEntrySchema])),
  external: z.array(PlannerExternalEntrySchema), gitEntries: z.array(GitEntrySchema),
}).strict();
export const PlannerWireSnapshotV2Schema = z.object({
  schemaVersion: z.literal(2), controllerId: z.string().min(1), featureMode: z.number().int(),
  entries: z.array(z.discriminatedUnion('kind', [DirectoryEntrySchema, V2FileEntrySchema])),
  blobs: z.array(BlobSchema), external: z.array(PlannerExternalEntrySchema), gitEntries: z.array(GitEntrySchema),
}).strict();
export const PlannerWireSnapshotSchema = z.discriminatedUnion('schemaVersion', [
  PlannerWireSnapshotV1Schema, PlannerWireSnapshotV2Schema,
]);
export type PlannerSnapshotV2 = z.infer<typeof PlannerWireSnapshotV2Schema>;
export type PlannerWireSnapshot = z.infer<typeof PlannerWireSnapshotSchema>;

export const plannerSnapshotSha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const isCanonicalPath = (path: string): boolean => path.length > 0 && !path.startsWith('/') && !path.includes('\\')
  && path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
// Single ordering definition shared by capture (parallel-planner-snapshot.ts), normalization, and
// serialization, so canonical path order never drifts between the module that produces entries and
// the module that compares them (e.g. restore's rollback-verification fingerprint comparison).
export const comparePlannerPaths = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const isPlannerFileEntry = (entry: CanonicalPlannerEntry): entry is Extract<CanonicalPlannerEntry, { kind: 'file' }> =>
  entry.kind === 'file';
export const plannerEntryFingerprint = (entry: CanonicalPlannerEntry): string => (entry.kind === 'directory'
  ? `directory\0${entry.path}\0${entry.mode}` : `file\0${entry.path}\0${entry.mode}\0${entry.sha256}`);

export function assertPlannerSnapshotSerializedBound(byteLength: number): void {
  if (byteLength > PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES) {
    throw new Error(`planner snapshot serialized size ${byteLength} exceeds limit ${PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES}`);
  }
}

function decodeCanonicalBase64(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('planner snapshot blob is not valid Base64');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) throw new Error('planner snapshot blob is not canonical Base64');
  return decoded;
}

// Accumulates unique blob bytes incrementally as each NEW hash is inserted, so the bound fires on
// the insert that crosses it rather than after every duplicate has already been decoded and summed.
function insertUniqueBlob(blobs: Map<string, Buffer>, unique: { bytes: number }, sha256: string, decoded: Buffer): void {
  if (plannerSnapshotSha256(decoded) !== sha256) {
    throw new Error(`planner snapshot blob content does not match declared sha256: ${sha256}`);
  }
  if (blobs.has(sha256)) return;
  unique.bytes += decoded.byteLength;
  if (unique.bytes > PLANNER_SNAPSHOT_MAX_UNIQUE_RAW_BYTES) {
    throw new Error(`planner snapshot unique blob bytes ${unique.bytes} exceeds limit ${PLANNER_SNAPSHOT_MAX_UNIQUE_RAW_BYTES}`);
  }
  blobs.set(sha256, decoded);
}

export function normalizePlannerWireSnapshot(wire: PlannerWireSnapshot): CanonicalPlannerSnapshot {
  if (wire.entries.length > PLANNER_SNAPSHOT_MAX_ENTRIES) {
    throw new Error(`planner snapshot entries ${wire.entries.length} exceeds limit ${PLANNER_SNAPSHOT_MAX_ENTRIES}`);
  }
  const paths = wire.entries.map((entry) => entry.path);
  if (paths.some((path) => !isCanonicalPath(path)) || new Set(paths).size !== paths.length) {
    throw new Error('planner snapshot paths are not canonical and unique');
  }
  const blobs = new Map<string, Buffer>(); const unique = { bytes: 0 };
  let entries: CanonicalPlannerEntry[];
  if (wire.schemaVersion === 2) {
    const hashes = wire.blobs.map((blob) => blob.sha256);
    if (new Set(hashes).size !== hashes.length) throw new Error('planner snapshot has a duplicate blob hash');
    for (const blob of wire.blobs) insertUniqueBlob(blobs, unique, blob.sha256, decodeCanonicalBase64(blob.contentBase64));
    entries = wire.entries.map((entry) => {
      if (entry.kind === 'directory') return entry;
      if (!blobs.has(entry.sha256)) throw new Error(`planner snapshot is missing a blob reference: ${entry.sha256}`);
      return entry;
    });
    const referenced = new Set(entries.filter(isPlannerFileEntry).map((entry) => entry.sha256));
    if (referenced.size !== blobs.size) throw new Error('planner snapshot has an unused blob');
  } else {
    entries = wire.entries.map((entry) => {
      if (entry.kind === 'directory') return entry;
      insertUniqueBlob(blobs, unique, entry.sha256, decodeCanonicalBase64(entry.contentBase64));
      return { kind: 'file' as const, path: entry.path, mode: entry.mode, sha256: entry.sha256 };
    });
  }
  return {
    controllerId: wire.controllerId, featureMode: wire.featureMode,
    entries: [...entries].sort((a, b) => comparePlannerPaths(a.path, b.path)), blobs,
    external: wire.external, gitEntries: wire.gitEntries,
  };
}

export function serializeCanonicalPlannerSnapshot(snapshot: CanonicalPlannerSnapshot): PlannerSnapshotV2 {
  return {
    schemaVersion: 2, controllerId: snapshot.controllerId, featureMode: snapshot.featureMode,
    entries: [...snapshot.entries].sort((a, b) => comparePlannerPaths(a.path, b.path)),
    blobs: [...snapshot.blobs.entries()].sort(([a], [b]) => comparePlannerPaths(a, b))
      .map(([sha256, bytes]) => ({ sha256, contentBase64: bytes.toString('base64') })),
    external: snapshot.external, gitEntries: snapshot.gitEntries,
  };
}

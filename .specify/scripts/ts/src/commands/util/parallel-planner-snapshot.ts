import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';
import { z } from 'zod';
import { durableAtomicWriteFileSync } from './durable-atomic-file';
import {
  assertPlannerExternalSnapshot, capturePlannerExternal, PlannerExternalEntrySchema,
  restorePlannerExternal,
} from './parallel-planner-external-snapshot';
import {
  inspectParallelGitTree, inspectParallelPathState, ParallelPathStateSchema,
} from './parallel-wave-git-audit';

const FileSchema = z.object({
  exists: z.literal(true), path: z.string(), mode: z.number().int(),
  sha256: z.string().length(64), contentBase64: z.string(),
}).strict();
const EntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('directory'), path: z.string(), mode: z.number().int() }).strict(),
  FileSchema.extend({ kind: z.literal('file') }).omit({ exists: true }).strict(),
]);
export const PlannerSnapshotSchema = z.object({
  schemaVersion: z.literal(1), controllerId: z.string().min(1), featureMode: z.number().int(),
  entries: z.array(EntrySchema), external: z.array(PlannerExternalEntrySchema),
  gitEntries: z.array(z.object({
    path: z.string(), raw: z.string(), state: ParallelPathStateSchema,
  }).strict()),
}).strict();
export type PlannerSnapshot = z.infer<typeof PlannerSnapshotSchema>;
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const canonical = (path: string): boolean => path.length > 0 && !path.startsWith('/') && !path.includes('\\')
  && path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
export const plannerEntryFingerprint = (entry: PlannerSnapshot['entries'][number]): string =>
  entry.kind === 'directory' ? `directory\0${entry.path}\0${entry.mode}`
    : `file\0${entry.path}\0${entry.mode}\0${entry.sha256}`;

export function capturePlannerFeature(featureDir: string): PlannerSnapshot['entries'] {
  const entries: PlannerSnapshot['entries'] = []; let totalBytes = 0;
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
        const bytes = readFileSync(path); totalBytes += bytes.byteLength;
        if (totalBytes > 32 * 1024 * 1024) throw new Error('planner snapshot exceeds 32 MiB');
        entries.push({ kind: 'file', path: relativePath, mode: stat.mode & 0o7777,
          sha256: sha(bytes), contentBase64: bytes.toString('base64') });
      }
      if (entries.length > 4096) throw new Error('planner snapshot exceeds 4096 entries');
    }
  };
  visit(featureDir, ''); return entries;
}

export function capturePlannerSnapshot(input: {
  projectRoot: string; featureDir: string; controllerId: string; externalPaths: string[];
}): PlannerSnapshot {
  const gitEntries = inspectParallelGitTree(input.projectRoot).entries.map(({ path, raw }) => ({
    path, raw, state: inspectParallelPathState(input.projectRoot, path),
  }));
  if (gitEntries.some(({ state }) => state.type === 'symlink')) {
    throw new Error('planner snapshot rejects Git-visible symlink paths');
  }
  const snapshot: PlannerSnapshot = { schemaVersion: 1, controllerId: input.controllerId,
    featureMode: lstatSync(input.featureDir).mode & 0o7777,
    entries: capturePlannerFeature(input.featureDir),
    external: capturePlannerExternal({ ...input, paths: input.externalPaths }), gitEntries,
  };
  if (Buffer.byteLength(JSON.stringify(snapshot)) + 1 > 48 * 1024 * 1024) {
    throw new Error('planner snapshot exceeds 48 MiB serialized limit');
  }
  return snapshot;
}

export function readPlannerSnapshot(input: {
  path: string; controllerId: string; projectRoot: string; featureDir: string;
}): PlannerSnapshot | null {
  const { path, controllerId } = input;
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 48 * 1024 * 1024) throw new Error('planner snapshot must be a bounded regular file');
  const snapshot = PlannerSnapshotSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (snapshot.controllerId !== controllerId) throw new Error('planner snapshot controller mismatch');
  const paths = snapshot.entries.map(({ path: value }) => value);
  if (paths.some((value) => !canonical(value)) || new Set(paths).size !== paths.length) {
    throw new Error('planner snapshot paths are not canonical and unique');
  }
  assertPlannerExternalSnapshot({ ...input, entries: snapshot.external });
  return snapshot;
}

export function assertNoUndeclaredPlannerDelta(input: {
  projectRoot: string; featureDir: string; snapshot: PlannerSnapshot;
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
  projectRoot: string; featureDir: string; snapshot: PlannerSnapshot; crashAt?: string;
}): void {
  assertNoUndeclaredPlannerDelta(input); makeRemovable(input.featureDir);
  for (const child of readdirSync(input.featureDir)) rmSync(resolve(input.featureDir, child), { recursive: true, force: true });
  if (input.crashAt === 'after-clear') throw new Error('injected crash at after-clear');
  for (const entry of input.snapshot.entries.filter((item) => item.kind === 'directory')) mkdirSync(resolve(input.featureDir, entry.path), { recursive: true });
  let restored = 0;
  for (const entry of input.snapshot.entries.filter((item) => item.kind === 'file')) {
    const target = resolve(input.featureDir, entry.path); mkdirSync(resolve(target, '..'), { recursive: true });
    durableAtomicWriteFileSync(target, Buffer.from(entry.contentBase64, 'base64'), entry.mode); restored += 1;
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

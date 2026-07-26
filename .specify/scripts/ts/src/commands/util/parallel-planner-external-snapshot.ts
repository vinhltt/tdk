import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { z } from 'zod';
import {
  durableAtomicWriteFileSync, durableRmdirSync, durableUnlinkSync,
} from './durable-atomic-file';
import { walkProjectPath } from './parallel-phase-path-policy';

const ParentSchema = z.discriminatedUnion('exists', [
  z.object({ exists: z.literal(false), path: z.string() }).strict(),
  z.object({ exists: z.literal(true), path: z.string(), mode: z.number().int() }).strict(),
]);
const ExistingExternalSchema = z.object({
  exists: z.literal(true), path: z.string(), mode: z.number().int(),
  sha256: z.string().length(64), contentBase64: z.string(), parents: z.array(ParentSchema),
}).strict();
export const PlannerExternalEntrySchema = z.discriminatedUnion('exists', [
  z.object({ exists: z.literal(false), path: z.string(), parents: z.array(ParentSchema) }).strict(),
  ExistingExternalSchema,
]);
export type PlannerExternalEntry = z.infer<typeof PlannerExternalEntrySchema>;
type Parent = z.infer<typeof ParentSchema>;
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const canonical = (path: string): boolean => path.length > 0 && !path.startsWith('/') && !path.includes('\\')
  && path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
const supported = (path: string): boolean => path.endsWith('/plan.md')
  || path.endsWith('/custom-workflow/plan-skill-routing.md');
const parentPaths = (path: string): string[] => {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
};

function assertExternalPaths(projectRoot: string, featureDir: string, paths: string[]): void {
  const feature = relative(resolve(projectRoot), resolve(featureDir)).replaceAll('\\', '/');
  if (paths.length > 256 || paths.some((path, index) => !canonical(path) || !supported(path)
    || path === feature || path.startsWith(`${feature}/`) || (index > 0 && paths[index - 1]! >= path))) {
    throw new Error('external planner paths must be supported, outside the feature, canonical, unique, sorted, and bounded');
  }
}

function captureParents(projectRoot: string, path: string): Parent[] {
  return parentPaths(path).map((parent) => {
    const walked = walkProjectPath(projectRoot, parent);
    if (walked.symlinkComponent) throw new Error(`external planner path crosses symlink: ${path}`);
    if (!walked.exists) return { exists: false as const, path: parent };
    const stat = lstatSync(resolve(projectRoot, parent));
    if (!stat.isDirectory()) throw new Error(`external planner parent must be a directory: ${parent}`);
    return { exists: true as const, path: parent, mode: stat.mode & 0o7777 };
  });
}

export function assertPlannerExternalSnapshot(input: {
  projectRoot: string; featureDir: string; entries: PlannerExternalEntry[];
}): void {
  const paths = input.entries.map(({ path }) => path);
  assertExternalPaths(input.projectRoot, input.featureDir, paths);
  const states = new Map<string, string>();
  for (const entry of input.entries) {
    if (entry.parents.map(({ path }) => path).join('\0') !== parentPaths(entry.path).join('\0')) {
      throw new Error(`external planner parent snapshot mismatch: ${entry.path}`);
    }
    for (const parent of entry.parents) {
      const state = JSON.stringify(parent); const prior = states.get(parent.path);
      if (prior && prior !== state) throw new Error(`external planner parent state conflict: ${parent.path}`);
      states.set(parent.path, state);
    }
  }
}

export function capturePlannerExternal(input: {
  projectRoot: string; featureDir: string; paths: string[];
}): PlannerExternalEntry[] {
  assertExternalPaths(input.projectRoot, input.featureDir, input.paths); let totalBytes = 0;
  const entries = input.paths.map((path) => {
    const parents = captureParents(input.projectRoot, path);
    const walked = walkProjectPath(input.projectRoot, path);
    if (walked.symlinkComponent) throw new Error(`external planner path crosses symlink: ${path}`);
    const absolute = resolve(input.projectRoot, path);
    if (!existsSync(absolute)) return { exists: false as const, path, parents };
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`external planner path must be a file: ${path}`);
    const bytes = readFileSync(absolute); totalBytes += bytes.byteLength;
    if (bytes.byteLength > 8 * 1024 * 1024 || totalBytes > 8 * 1024 * 1024) {
      throw new Error('external planner snapshot exceeds 8 MiB');
    }
    return { exists: true as const, path, parents, mode: stat.mode & 0o7777,
      sha256: sha(bytes), contentBase64: bytes.toString('base64') };
  });
  assertPlannerExternalSnapshot({ ...input, entries }); return entries;
}

function currentParent(projectRoot: string, parent: Parent): 'missing' | 'directory' {
  const walked = walkProjectPath(projectRoot, parent.path);
  if (walked.symlinkComponent) throw new Error(`external planner parent crosses symlink: ${parent.path}`);
  if (!walked.exists) return 'missing';
  if (!lstatSync(resolve(projectRoot, parent.path)).isDirectory()) {
    throw new Error(`external planner parent changed type: ${parent.path}`);
  }
  return 'directory';
}

export function assertPlannerExternalFinalState(input: {
  projectRoot: string; featureDir: string; entries: PlannerExternalEntry[];
}): void {
  assertPlannerExternalSnapshot(input); let totalBytes = 0;
  for (const entry of input.entries) {
    for (const parent of entry.parents) {
      if (currentParent(input.projectRoot, parent) !== 'directory') {
        throw new Error(`external planner parent is missing: ${parent.path}`);
      }
      if (parent.exists
        && (lstatSync(resolve(input.projectRoot, parent.path)).mode & 0o7777) !== parent.mode) {
        throw new Error(`external planner parent mode changed: ${parent.path}`);
      }
    }
    const target = resolve(input.projectRoot, entry.path);
    if (!existsSync(target)) throw new Error(`external planner target is missing: ${entry.path}`);
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) {
      throw new Error(`external planner target must be a bounded regular file: ${entry.path}`);
    }
    totalBytes += stat.size;
    if (totalBytes > 8 * 1024 * 1024) throw new Error('external planner final state exceeds 8 MiB');
    if (entry.exists && (stat.mode & 0o7777) !== entry.mode) {
      throw new Error(`external planner target mode changed: ${entry.path}`);
    }
  }
}

export function restorePlannerExternal(input: {
  projectRoot: string; featureDir: string; entries: PlannerExternalEntry[];
}): void {
  assertPlannerExternalSnapshot(input);
  const parents = new Map<string, Parent>();
  input.entries.forEach((entry) => entry.parents.forEach((parent) => parents.set(parent.path, parent)));
  for (const parent of parents.values()) {
    const current = currentParent(input.projectRoot, parent);
    if (parent.exists && current === 'missing') throw new Error(`external planner parent is missing: ${parent.path}`);
  }
  const deepestFirst = [...parents.values()].sort((a, b) => b.path.length - a.path.length);
  try {
    for (const parent of parents.values()) {
      if (currentParent(input.projectRoot, parent) === 'directory') chmodSync(resolve(input.projectRoot, parent.path), 0o700);
    }
    for (const entry of input.entries) {
      const target = resolve(input.projectRoot, entry.path);
      let stat;
      try { stat = lstatSync(target); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (!entry.exists) {
        if (!stat) continue;
        if (stat.isFile() || stat.isSymbolicLink()) durableUnlinkSync(target);
        else if (stat.isDirectory()) durableRmdirSync(target);
        else throw new Error(`external planner target changed to unsupported type: ${entry.path}`);
        continue;
      }
      if (stat?.isDirectory()) durableRmdirSync(target);
      else if (stat && !stat.isFile() && !stat.isSymbolicLink()) {
        throw new Error(`external planner target changed to unsupported type: ${entry.path}`);
      }
      durableAtomicWriteFileSync(target, Buffer.from(entry.contentBase64, 'base64'), entry.mode);
    }
    for (const parent of deepestFirst) {
      const target = resolve(input.projectRoot, parent.path);
      if (!parent.exists && existsSync(target)) durableRmdirSync(target);
    }
  } finally {
    for (const parent of deepestFirst) {
      if (parent.exists && currentParent(input.projectRoot, parent) === 'directory') {
        chmodSync(resolve(input.projectRoot, parent.path), parent.mode);
      }
    }
  }
  for (const entry of input.entries) {
    const target = resolve(input.projectRoot, entry.path);
    if (!entry.exists) {
      if (existsSync(target)) throw new Error(`planner rollback left external path: ${entry.path}`);
    } else {
      const stat = lstatSync(target);
      if (!stat.isFile() || (stat.mode & 0o7777) !== entry.mode || sha(readFileSync(target)) !== entry.sha256) {
        throw new Error(`planner rollback verification failed for external path: ${entry.path}`);
      }
    }
  }
  for (const parent of parents.values()) {
    const current = currentParent(input.projectRoot, parent);
    if (parent.exists ? current !== 'directory'
      || (lstatSync(resolve(input.projectRoot, parent.path)).mode & 0o7777) !== parent.mode : current !== 'missing') {
      throw new Error(`planner rollback verification failed for external parent: ${parent.path}`);
    }
  }
}

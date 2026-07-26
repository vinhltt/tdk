import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { ParallelWorkerResult } from './parallel-worker-result';
import { walkProjectPath } from './parallel-phase-path-policy';

const OperationSchema = z.enum(['modify', 'create', 'delete']);
type Operation = z.infer<typeof OperationSchema>;
const CanonicalPathSchema = z.string().min(1).refine((path) => {
  if (path === '.' || path.startsWith('/') || path.includes('\\')) return false;
  return path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}, 'path must be canonical project-relative');
const GitEntrySchema = z.object({ path: z.string(), raw: z.string(), operation: OperationSchema.optional() }).strict();
type GitEntry = z.infer<typeof GitEntrySchema>;
export const ParallelPathStateSchema = z.object({
  exists: z.boolean(), type: z.string(), mode: z.number().nullable(), sha256: z.string().nullable(),
}).strict();
type PathState = z.infer<typeof ParallelPathStateSchema>;
export const AuditPhaseSchema = z.object({
  phase: z.number().int().positive(), reads: z.array(CanonicalPathSchema),
  writes: z.array(z.object({ operation: OperationSchema, path: CanonicalPathSchema }).strict()),
}).strict();
export type AuditPhase = z.infer<typeof AuditPhaseSchema>;
export const ParallelWaveBaselineSchema = z.object({
  schemaVersion: z.literal(1), head: z.string(), ref: z.string(), statusEntries: z.array(GitEntrySchema),
  paths: z.record(ParallelPathStateSchema), protectedPaths: z.array(CanonicalPathSchema), phases: z.array(AuditPhaseSchema),
  waveId: z.string().min(1).optional(), attested: z.boolean().optional(), finalized: z.boolean().optional(),
}).strict();
export type ParallelWaveBaseline = z.infer<typeof ParallelWaveBaselineSchema>;
export type ParallelWaveAudit =
  | { ok: true; baseline: ParallelWaveBaseline; attribution: Array<{ phase: number; changes: Array<{ operation: Operation; path: string }> }> }
  | { ok: false; errors: string[] };

function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
  return result.stdout;
}
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const overlap = (a: string, b: string): boolean => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const key = ({ path, operation }: { path: string; operation: Operation }): string => `${path}\0${operation}`;

export function inspectParallelPathState(root: string, path: string): PathState {
  try {
    const absolute = resolve(root, path);
    const contained = relative(resolve(root), absolute);
    if (!contained || contained.startsWith('..') || isAbsolute(contained)) throw new Error(`audit path escapes project root: ${path}`);
    const walked = walkProjectPath(root, path);
    if (walked.symlinkComponent) return { exists: true, type: 'symlink', mode: null, sha256: null };
    const stat = lstatSync(absolute);
    if (stat.isFile()) return { exists: true, type: 'file', mode: stat.mode & 0o7777, sha256: hash(readFileSync(absolute)) };
    if (stat.isSymbolicLink()) return { exists: true, type: 'symlink', mode: stat.mode & 0o7777, sha256: hash(readlinkSync(absolute)) };
    return { exists: true, type: stat.isDirectory() ? 'directory' : 'other', mode: stat.mode & 0o7777, sha256: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false, type: 'missing', mode: null, sha256: null };
    throw error;
  }
}

export function inspectParallelGitTree(projectRoot: string): { entries: GitEntry[]; errors: string[] } {
  const raw = git(projectRoot, ['status', '--no-renames', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none']);
  const entries: GitEntry[] = []; const errors: string[] = [];
  for (const record of raw.split('\0').filter(Boolean)) {
    if (record.startsWith('? ')) { entries.push({ path: record.slice(2), raw: record, operation: 'create' }); continue; }
    if (record.startsWith('1 ')) {
      const match = /^1 (\S{2}) (\S+) \S+ \S+ \S+ \S+ \S+ (.*)$/.exec(record);
      if (!match) { errors.push(`unknown porcelain entry: ${record}`); continue; }
      const xy = match[1]!; const sub = match[2]!; const path = match[3]!;
      if (xy[0] !== '.') errors.push(`staged change: ${path}`);
      if (sub !== 'N...') errors.push(`submodule change: ${path}`);
      const worktree = xy[1];
      if (worktree === 'T') errors.push(`type change: ${path}`);
      const operation = worktree === 'D' ? 'delete' : worktree === 'M' ? 'modify' : undefined;
      entries.push({ path, raw: record, ...(operation ? { operation } : {}) }); continue;
    }
    if (record.startsWith('2 ')) errors.push(`rename entry despite --no-renames: ${record}`);
    else if (record.startsWith('u ')) errors.push(`unmerged entry: ${record}`);
    else errors.push(`unknown porcelain entry: ${record}`);
  }
  return { entries, errors };
}

function headAndRef(root: string): { head: string; ref: string } {
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const symbolic = spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return { head, ref: symbolic.status === 0 ? symbolic.stdout.trim() : `DETACHED:${head}` };
}

export function captureParallelWaveBaseline(input: {
  projectRoot: string; waveId?: string; protectedPaths: string[]; phases: AuditPhase[];
}): ParallelWaveBaseline {
  const parsed = z.object({ protectedPaths: z.array(CanonicalPathSchema), phases: z.array(AuditPhaseSchema) }).parse(input);
  const phaseNumbers = parsed.phases.map(({ phase }) => phase);
  if (new Set(phaseNumbers).size !== phaseNumbers.length) throw new Error('audit phases must be unique');
  const identity = headAndRef(input.projectRoot); const status = inspectParallelGitTree(input.projectRoot);
  const paths = new Set(parsed.protectedPaths);
  parsed.phases.forEach((phase) => { phase.reads.forEach((path) => paths.add(path)); phase.writes.forEach(({ path }) => paths.add(path)); });
  status.entries.forEach(({ path }) => paths.add(path));
  return { schemaVersion: 1, ...identity, ...(input.waveId ? { waveId: input.waveId } : {}), statusEntries: status.entries,
    paths: Object.fromEntries([...paths].sort().map((path) => [path, inspectParallelPathState(input.projectRoot, path)])),
    protectedPaths: [...parsed.protectedPaths].sort(), phases: [...parsed.phases].sort((a, b) => a.phase - b.phase) };
}

function changedOperations(root: string, before: ParallelWaveBaseline, current: ParallelWaveBaseline): Array<{ operation: Operation; path: string }> {
  const beforeStatus = new Map(before.statusEntries.map((entry) => [entry.path, entry]));
  const currentStatus = new Map(current.statusEntries.map((entry) => [entry.path, entry]));
  const paths = new Set([...Object.keys(before.paths), ...Object.keys(current.paths), ...beforeStatus.keys(), ...currentStatus.keys()]);
  const changes: Array<{ operation: Operation; path: string }> = [];
  for (const path of [...paths].sort()) {
    const oldState = before.paths[path] ?? inspectParallelPathState(root, path);
    const newState = current.paths[path] ?? inspectParallelPathState(root, path);
    if (JSON.stringify(oldState) === JSON.stringify(newState) && beforeStatus.get(path)?.raw === currentStatus.get(path)?.raw) continue;
    const reported = currentStatus.get(path)?.operation;
    const operation = reported ?? (!oldState.exists && newState.exists ? 'create' : oldState.exists && !newState.exists ? 'delete' : 'modify');
    changes.push({ operation, path });
  }
  return changes.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}

export function auditParallelWavePostWorker(input: {
  projectRoot: string; baseline: ParallelWaveBaseline; results: ParallelWorkerResult[];
}): ParallelWaveAudit {
  const current = captureParallelWaveBaseline({ projectRoot: input.projectRoot,
    waveId: input.baseline.waveId, protectedPaths: input.baseline.protectedPaths, phases: input.baseline.phases });
  const inspected = inspectParallelGitTree(input.projectRoot); const errors = [...inspected.errors];
  if (current.head !== input.baseline.head || current.ref !== input.baseline.ref) errors.push('HEAD or ref changed');
  const changes = changedOperations(input.projectRoot, input.baseline, current);
  const expectedPhases = input.baseline.phases.map(({ phase }) => phase);
  const resultPhases = input.results.map(({ phase }) => phase);
  for (const result of input.results) {
    if (result.status !== 'DONE' && result.status !== 'DONE_WITH_CONCERNS') {
      errors.push(`phase ${result.phase} worker status is ${result.status}`);
    }
  }
  if (input.results.length !== expectedPhases.length) errors.push('worker result cardinality does not match admitted phases');
  for (const phase of new Set([...expectedPhases, ...resultPhases])) {
    const count = resultPhases.filter((candidate) => candidate === phase).length;
    if (count !== 1 || !expectedPhases.includes(phase)) errors.push(`phase ${phase} has ${count} worker results`);
  }
  for (const [path, state] of Object.entries(current.paths)) {
    if (state.type === 'symlink') errors.push(`symlink path is not auditable: ${path}`);
  }
  const attributed = new Map<number, Array<{ operation: Operation; path: string }>>();
  input.baseline.phases.forEach(({ phase }) => attributed.set(phase, []));
  for (const change of changes) {
    if (input.baseline.protectedPaths.some((path) => overlap(path, change.path))) errors.push(`protected path changed: ${change.path}`);
    const owners = input.baseline.phases.filter((phase) => phase.writes.some((write) => write.path === change.path && write.operation === change.operation));
    if (owners.length !== 1) errors.push(`change has ${owners.length} owners: ${change.operation} ${change.path}`);
    else attributed.get(owners[0]!.phase)!.push(change);
    for (const phase of input.baseline.phases) {
      const ownWrite = phase.writes.some((write) => write.path === change.path);
      if (!ownWrite && phase.reads.some((read) => overlap(read, change.path))) errors.push(`declared read changed for phase ${phase.phase}: ${change.path}`);
    }
  }
  for (const phase of input.baseline.phases) {
    const result = input.results.find((item) => item.phase === phase.phase);
    if (!result) errors.push(`missing worker result for phase ${phase.phase}`);
    else if (JSON.stringify(result.changes) !== JSON.stringify(attributed.get(phase.phase))) errors.push(`worker manifest mismatch for phase ${phase.phase}`);
  }
  if (errors.length) return { ok: false, errors: [...new Set(errors)].sort() };
  return { ok: true, baseline: { ...current, attested: true }, attribution: [...attributed].map(([phase, phaseChanges]) => ({ phase, changes: phaseChanges })) };
}

export function auditParallelWaveFinal(input: { projectRoot: string; baseline: ParallelWaveBaseline }): ParallelWaveAudit {
  if (!input.baseline.attested) return { ok: false, errors: ['post-worker attestation missing'] };
  return auditParallelWaveRecoveryTree(input);
}

export function auditParallelWaveRecoveryTree(input: {
  projectRoot: string; baseline: ParallelWaveBaseline;
}): ParallelWaveAudit {
  const current = captureParallelWaveBaseline({ projectRoot: input.projectRoot,
    waveId: input.baseline.waveId, protectedPaths: input.baseline.protectedPaths, phases: input.baseline.phases });
  const errors = inspectParallelGitTree(input.projectRoot).errors;
  if (current.head !== input.baseline.head || current.ref !== input.baseline.ref) errors.push('HEAD or ref changed');
  if (JSON.stringify(current.statusEntries) !== JSON.stringify(input.baseline.statusEntries)
    || JSON.stringify(current.paths) !== JSON.stringify(input.baseline.paths)) errors.push('post-gate tree differs from worker attestation');
  return errors.length ? { ok: false, errors: [...new Set(errors)].sort() }
    : { ok: true, baseline: { ...input.baseline, finalized: true }, attribution: [] };
}

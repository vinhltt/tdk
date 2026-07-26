import { z } from 'zod';

const MAX_RESULT_BYTES = 64 * 1024;
const trimmed = z.string().trim().min(1).refine((value) => value === value.trim(), 'must be trimmed');
const canonicalPath = trimmed.refine((value) => {
  if (value === '.' || value.startsWith('/') || value.includes('\\')) return false;
  const parts = value.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}, 'path must be canonical project-relative');
const sortedUnique = (values: string[]): boolean =>
  values.every((value, index) => index === 0 || values[index - 1]! < value);

const ChangeSchema = z.object({
  operation: z.enum(['modify', 'create', 'delete']),
  path: canonicalPath,
}).strict();
const DelegateSchema = z.object({
  name: trimmed,
  status: z.enum(['passed', 'failed']),
  summary: trimmed,
}).strict();
const CriterionSchema = z.object({
  criterion: trimmed,
  met: z.boolean(),
  evidence: z.array(trimmed),
}).strict();
const TestSchema = z.object({
  command: trimmed,
  cwd: z.union([z.literal('.'), canonicalPath]),
  exitCode: z.number().int(),
  summary: trimmed,
}).strict();
const RequestSchema = z.object({
  reason: trimmed,
  paths: z.array(canonicalPath).refine(sortedUnique, 'request paths must be sorted and unique'),
  delegates: z.array(trimmed).refine(sortedUnique, 'requested delegates must be sorted and unique'),
}).strict();

export const ParallelWorkerResultSchema = z.object({
  schemaVersion: z.literal(1),
  controllerId: trimmed,
  waveId: trimmed,
  workerId: trimmed,
  phase: z.number().int().positive(),
  status: z.enum(['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT']),
  changes: z.array(ChangeSchema),
  delegates: z.array(DelegateSchema),
  criteria: z.array(CriterionSchema),
  tests: z.array(TestSchema),
  concerns: z.array(trimmed),
  request: RequestSchema.nullable(),
  error: trimmed.nullable(),
}).strict();
export type ParallelWorkerResult = z.infer<typeof ParallelWorkerResultSchema>;

export interface ExpectedWorkerResult {
  controllerId: string;
  waveId: string;
  workerId: string;
  phase: number;
  criteria: string[];
  delegates?: string[];
}

function assertNoDuplicateKeys(raw: string): void {
  const stack: Array<Set<string> | null> = [];
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (char === '{') stack.push(new Set());
    else if (char === '[') stack.push(null);
    else if (char === '}' || char === ']') stack.pop();
    else if (char === '"') {
      let end = index + 1;
      for (; end < raw.length; end += 1) {
        if (raw[end] === '\\') end += 1;
        else if (raw[end] === '"') break;
      }
      const token = raw.slice(index, end + 1);
      let next = end + 1;
      while (/\s/.test(raw[next] ?? '')) next += 1;
      const scope = stack.at(-1);
      if (raw[next] === ':' && scope) {
        const key = JSON.parse(token) as string;
        if (scope.has(key)) throw new Error(`duplicate JSON key '${key}'`);
        scope.add(key);
      }
      index = end;
    }
  }
}

function assertSortedChanges(result: ParallelWorkerResult): void {
  const keys = result.changes.map(({ path, operation }) => `${path}\0${operation}`);
  if (!sortedUnique(keys)) throw new Error('changes must be sorted and unique by path then operation');
}

function assertResultInvariants(result: ParallelWorkerResult, expected: ExpectedWorkerResult): void {
  if (result.controllerId !== expected.controllerId || result.waveId !== expected.waveId
    || result.workerId !== expected.workerId || result.phase !== expected.phase) {
    throw new Error('worker result identity mismatch');
  }
  if (result.criteria.map(({ criterion }) => criterion).join('\0') !== expected.criteria.join('\0')) {
    throw new Error('worker criteria do not match the snapshot');
  }
  if (expected.delegates
    && result.delegates.map(({ name }) => name).join('\0') !== expected.delegates.join('\0')) {
    throw new Error('worker delegates do not match the snapshot');
  }
  assertSortedChanges(result);
  const successful = result.status === 'DONE' || result.status === 'DONE_WITH_CONCERNS';
  if (successful && (result.criteria.some((item) => !item.met || item.evidence.length === 0)
    || result.delegates.some((item) => item.status !== 'passed')
    || result.tests.some((item) => item.exitCode !== 0))) {
    throw new Error('successful worker result contains failed evidence');
  }
  if (result.status === 'DONE' && (result.concerns.length > 0 || result.request || result.error))
    throw new Error('DONE result has concerns, request, or error');
  if (result.status === 'DONE_WITH_CONCERNS'
    && (result.concerns.length === 0 || result.request || result.error))
    throw new Error('DONE_WITH_CONCERNS result has invalid terminal fields');
  if (result.status === 'BLOCKED' && (!result.error || result.request))
    throw new Error('BLOCKED result requires error and null request');
  if (result.status === 'NEEDS_CONTEXT' && (!result.request || result.error))
    throw new Error('NEEDS_CONTEXT result requires request and null error');
  if (result.status === 'NEEDS_CONTEXT' && result.request
    && result.request.paths.length === 0 && result.request.delegates.length === 0)
    throw new Error('NEEDS_CONTEXT request requires at least one path or delegate');
}

export function parseParallelWorkerResult(rawOutput: string, expected: ExpectedWorkerResult): ParallelWorkerResult {
  if (Buffer.byteLength(rawOutput, 'utf8') > MAX_RESULT_BYTES) throw new Error('worker result exceeds 64 KiB');
  const raw = rawOutput.trim();
  assertNoDuplicateKeys(raw);
  let json: unknown;
  try { json = JSON.parse(raw); } catch { throw new Error('worker result must be exactly one JSON object'); }
  const result = ParallelWorkerResultSchema.parse(json);
  assertResultInvariants(result, expected);
  return result;
}

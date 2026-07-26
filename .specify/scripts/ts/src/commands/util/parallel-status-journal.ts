import { z } from 'zod';

const StatusSchema = z.enum(['todo', 'in_progress', 'done', 'skipped', 'blocked', 'cancelled']);
const SingleSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('single'), controllerId: z.string(), phase: z.number(),
  from: StatusSchema, to: StatusSchema, planBeforeSha256: z.string(), planAfterSha256: z.string(),
  phaseBeforeSha256: z.string(), phaseAfterSha256: z.string(),
  stage: z.enum(['prepared', 'frontmatter-written', 'plan-written']),
}).strict();
const WavePhaseSchema = z.object({
  phase: z.number(), phaseBeforeSha256: z.string(), phaseAfterSha256: z.string(),
}).strict();
const WaveSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('wave-completion'), controllerId: z.string(), waveId: z.string(),
  planBeforeSha256: z.string(), planAfterSha256: z.string(), phases: z.array(WavePhaseSchema),
  completedFrontmatterCount: z.number().int().nonnegative(), stage: z.enum(['frontmatters', 'plan-written']),
}).strict();
const JournalSchema = z.discriminatedUnion('kind', [SingleSchema, WaveSchema]);

export type ParallelStatusJournal = z.infer<typeof JournalSchema>;
export type ParallelSingleStatusJournal = z.infer<typeof SingleSchema>;
export type ParallelWaveStatusJournal = z.infer<typeof WaveSchema>;

export function parseParallelStatusJournal(raw: string): ParallelStatusJournal {
  return JournalSchema.parse(JSON.parse(raw));
}

export function validateParallelStatusJournalState(
  journal: ParallelStatusJournal,
  planHash: string,
  phaseHashes: string[],
): void {
  if (journal.kind === 'single') {
    const pair = `${planHash}:${phaseHashes[0]}`;
    const before = `${journal.planBeforeSha256}:${journal.phaseBeforeSha256}`;
    const split = `${journal.planBeforeSha256}:${journal.phaseAfterSha256}`;
    const after = `${journal.planAfterSha256}:${journal.phaseAfterSha256}`;
    const allowed = [before, split, after];
    if (!allowed.includes(pair)) throw new Error('journal hash pair is not permitted');
    return;
  }

  const beforePlan = planHash === journal.planBeforeSha256;
  const afterPlan = planHash === journal.planAfterSha256;
  const afterCount = phaseHashes.findIndex((hash, index) => hash !== journal.phases[index]!.phaseAfterSha256);
  const prefix = afterCount === -1 ? phaseHashes.length : afterCount;
  const suffixBefore = phaseHashes.slice(prefix)
    .every((hash, index) => hash === journal.phases[prefix + index]!.phaseBeforeSha256);
  const cursorOk = prefix <= journal.completedFrontmatterCount + 1;
  const frontmatterState = (beforePlan && cursorOk)
    || (afterPlan && journal.completedFrontmatterCount === phaseHashes.length && prefix === phaseHashes.length);
  if (!suffixBefore || (journal.stage === 'plan-written'
    ? !(afterPlan && prefix === phaseHashes.length) : !frontmatterState)) {
    throw new Error('wave journal vector is not permitted');
  }
}

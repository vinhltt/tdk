import { parsePhasesTable } from './phases-table-parser';

export interface SpikeDecisionTransition {
  valid: boolean;
  decision: 'approve' | 'replan';
  spikeStatus: 'done' | 'blocked';
  unblock: number[];
  alreadyUnblocked: number[];
  remainBlocked: number[];
  errors: string[];
}

export function resolveSpikeDecisionTransitions(
  planMarkdown: string,
  spikeNumber: number,
  decision: 'approve' | 'replan',
): SpikeDecisionTransition {
  const parsed = parsePhasesTable(planMarkdown);
  const errors = parsed.errors.map((error) => `plan.md:${error.line}: ${error.message}`);
  const spike = parsed.phases.find((phase) => phase.number === spikeNumber);
  if (!spike) errors.push(`Spike phase ${spikeNumber} is missing from plan.md`);
  const dependents = parsed.phases.filter((phase) => phase.blockedBy.includes(spikeNumber));
  if (dependents.length === 0) errors.push(`Spike phase ${spikeNumber} has no direct dependents`);

  const unblock: number[] = [];
  const alreadyUnblocked: number[] = [];
  const remainBlocked: number[] = [];
  for (const dependent of dependents) {
    if (decision === 'replan') {
      if (dependent.status !== 'blocked') {
        errors.push(`Dependent phase ${dependent.number} must be blocked before a replan decision`);
        continue;
      }
      remainBlocked.push(dependent.number);
      continue;
    }
    const unresolved = dependent.blockedBy
      .filter((number) => number !== spikeNumber)
      .filter((number) => {
        const blocker = parsed.phases.find((phase) => phase.number === number);
        return !blocker || (blocker.status !== 'done' && blocker.status !== 'skipped');
      });
    if (dependent.status === 'blocked') {
      if (unresolved.length > 0) remainBlocked.push(dependent.number);
      else unblock.push(dependent.number);
    } else if (dependent.status === 'todo' && unresolved.length === 0) {
      alreadyUnblocked.push(dependent.number);
    } else {
      errors.push(`Dependent phase ${dependent.number} has unsafe approval-resume status ${dependent.status}`);
    }
  }

  return {
    valid: errors.length === 0,
    decision,
    spikeStatus: decision === 'approve' ? 'done' : 'blocked',
    unblock,
    alreadyUnblocked,
    remainBlocked,
    errors,
  };
}

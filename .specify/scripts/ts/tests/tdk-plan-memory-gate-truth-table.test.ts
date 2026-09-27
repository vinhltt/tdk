import { describe, expect, it } from 'bun:test';
import { memoryPrecondition, type Preconditions } from '../src/commands/util/memory-gate';

const selected: Preconditions = {
  initialized: true, coverage: 1, fast: false, specPresent: true,
  decision: 'enabled', impactCount: 2, interactive: true,
};

describe('memory gate ordered preconditions', () => {
  it('does not require a guardian for genuinely uninitialized memory', () => {
    expect(memoryPrecondition({ ...selected, initialized: false, coverage: null }).action).toBe('skip');
  });
  it('skips zero coverage before fast mode and task decisions', () => {
    expect(memoryPrecondition({ ...selected, coverage: 0, fast: true }).reason).toBe('no binding evidence');
  });
  it('honors explicit fast mode even when coverage cannot be read', () => {
    expect(memoryPrecondition({ ...selected, coverage: null, fast: true }).action).toBe('skip');
  });
  it('honors the task disabled decision without another question', () => {
    expect(memoryPrecondition({ ...selected, decision: 'disabled', coverage: null }).action).toBe('skip');
  });
  it('does not invent a task decision when no spec exists', () => {
    expect(memoryPrecondition({ ...selected, specPresent: false, decision: undefined }).action).toBe('skip');
  });
  it('asks for missing or malformed decisions instead of treating them as disabled', () => {
    expect(memoryPrecondition({ ...selected, decision: undefined }).action).toBe('ask');
    expect(memoryPrecondition({ ...selected, decision: '[enabled/disabled]' }).action).toBe('ask');
  });
  it('uses the single-impact noninteractive skip only for an absent decision', () => {
    expect(memoryPrecondition({ ...selected, decision: undefined, interactive: false, impactCount: 1 }).action).toBe('skip');
    expect(memoryPrecondition({ ...selected, interactive: false, impactCount: 1 }).action).toBe('validate');
  });
  it('validates multiple or unknown impacts by default rather than skipping', () => {
    expect(memoryPrecondition({ ...selected, decision: undefined, interactive: false }).action).toBe('validate');
    expect(memoryPrecondition({ ...selected, decision: undefined, interactive: false, impactCount: null }).action).toBe('validate');
  });
  it('honors a live fallback decline without manufacturing CLEAR', () => {
    expect(memoryPrecondition({ ...selected, decision: undefined, answer: 'skip', coverage: null }).action).toBe('skip');
  });
  it('blocks unknown coverage when validation is selected', () => {
    expect(memoryPrecondition({ ...selected, coverage: null }).action).toBe('not-checked');
    expect(memoryPrecondition({ ...selected, decision: undefined, answer: 'validate', coverage: null }).action).toBe('not-checked');
  });
  it('does not accept malformed CLI input as an uninitialized-memory skip', () => {
    expect(memoryPrecondition({} as Preconditions).action).toBe('not-checked');
    expect(memoryPrecondition({ ...selected, coverage: -1 }).action).toBe('not-checked');
  });
});

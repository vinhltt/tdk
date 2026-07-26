import { describe, expect, it } from 'bun:test';
import { parseParallelWorkerResult } from '../src/commands/util/parallel-worker-result';

const expected = {
  controllerId: 'controller-1', waveId: 'wave-1', workerId: 'worker-1', phase: 2,
  criteria: ['build succeeds'],
};

function validResult(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1, controllerId: 'controller-1', waveId: 'wave-1', workerId: 'worker-1',
    phase: 2, status: 'DONE', changes: [{ operation: 'modify', path: 'src/a.ts' }],
    delegates: [{ name: '/test', status: 'passed', summary: 'ok' }],
    criteria: [{ criterion: 'build succeeds', met: true, evidence: ['bun test'] }],
    tests: [{ command: 'bun test', cwd: '.', exitCode: 0, summary: 'ok' }],
    concerns: [], request: null, error: null, ...overrides,
  });
}

describe('parseParallelWorkerResult', () => {
  it('accepts one strict identity-bound DONE object', () => {
    expect(parseParallelWorkerResult(validResult(), expected).status).toBe('DONE');
  });

  it('rejects prose, unknown fields, duplicate keys, and wrong identity', () => {
    expect(() => parseParallelWorkerResult(`${validResult()}\nextra`, expected)).toThrow();
    expect(() => parseParallelWorkerResult(validResult({ extra: true }), expected)).toThrow();
    expect(() => parseParallelWorkerResult('{"schemaVersion":1,"schemaVersion":1}', expected)).toThrow('duplicate');
    expect(() => parseParallelWorkerResult(validResult({ waveId: 'other' }), expected)).toThrow('identity');
  });

  it('enforces sorted changes and terminal status invariants', () => {
    const unsorted = validResult({ changes: [
      { operation: 'modify', path: 'src/z.ts' },
      { operation: 'create', path: 'src/a.ts' },
    ] });
    expect(() => parseParallelWorkerResult(unsorted, expected)).toThrow('sorted');
    expect(() => parseParallelWorkerResult(validResult({ concerns: ['unexpected'] }), expected)).toThrow();
    expect(() => parseParallelWorkerResult(validResult({ status: 'BLOCKED', error: null }), expected)).toThrow();
  });

  it('accepts a canonical NEEDS_CONTEXT request', () => {
    const raw = validResult({
      status: 'NEEDS_CONTEXT', changes: [], delegates: [], criteria: [], tests: [],
      request: { reason: 'need config', paths: ['config/a.json'], delegates: [] }, error: null,
    });
    expect(parseParallelWorkerResult(raw, { ...expected, criteria: [] }).status).toBe('NEEDS_CONTEXT');
  });

  it('rejects an empty NEEDS_CONTEXT expansion request', () => {
    const raw = validResult({
      status: 'NEEDS_CONTEXT', changes: [], delegates: [], criteria: [], tests: [],
      request: { reason: 'need something', paths: [], delegates: [] }, error: null,
    });
    expect(() => parseParallelWorkerResult(raw, { ...expected, criteria: [] })).toThrow('at least one');
  });
});

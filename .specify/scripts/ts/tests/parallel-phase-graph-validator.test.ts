import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validatePhaseGraph, type Diagnostic } from '../src/commands/util/parallel-phase-graph-validator';

const FIXTURES = join(import.meta.dir, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

function codes(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

describe('validatePhaseGraph', () => {
  it('partial-numeric token: keeps the tokenized value but flags the malformed token', () => {
    const result = validatePhaseGraph(fixture('parallel-phase-graph-partial-numeric-token.md'), 'parallel');
    expect(result.phases[0]!.blocks).toEqual([2]); // byte-compatible with legacy silent-parse behavior
    expect(codes(result.errors)).toContain('MALFORMED_DEPENDENCY_TOKEN');
  });

  it('nonnumeric token: drops the value like the legacy parser but still flags the malformed token', () => {
    const result = validatePhaseGraph(fixture('parallel-phase-graph-nonnumeric-token.md'), 'parallel');
    expect(result.phases[0]!.blocks).toEqual([]);
    expect(codes(result.errors)).toContain('MALFORMED_DEPENDENCY_TOKEN');
  });

  it('dangling-ref: BlockedBy target does not exist as a row in the table', () => {
    const result = validatePhaseGraph(fixture('parallel-phase-graph-dangling-ref.md'), 'parallel');
    expect(codes(result.errors)).toContain('DANGLING_REFERENCE');
  });

  it('dup-number: two rows share the same phase number', () => {
    const result = validatePhaseGraph(fixture('parallel-phase-graph-dup-number.md'), 'parallel');
    expect(codes(result.errors)).toContain('DUPLICATE_PHASE_NUMBER');
  });

  it('dup-edge: the same target repeats within one cell', () => {
    const result = validatePhaseGraph(fixture('parallel-phase-graph-dup-edge.md'), 'parallel');
    expect(codes(result.errors)).toContain('DUPLICATE_EDGE');
  });

  it('self-ref: a row references its own phase number', () => {
    const result = validatePhaseGraph(fixture('parallel-phase-graph-self-ref.md'), 'parallel');
    expect(codes(result.errors)).toContain('SELF_REFERENCE');
  });

  it('one-way relation: BlockedBy without a reciprocal Blocks entry', () => {
    const result = validatePhaseGraph(fixture('parallel-phase-graph-one-way-blockedby-without-blocks.md'), 'parallel');
    expect(codes(result.errors)).toContain('MISSING_RECIPROCAL_BLOCKS');
  });

  it('one-way relation: Blocks without a reciprocal BlockedBy entry', () => {
    const result = validatePhaseGraph(fixture('parallel-phase-graph-one-way-blocks-without-blockedby.md'), 'parallel');
    expect(codes(result.errors)).toContain('MISSING_RECIPROCAL_BLOCKED_BY');
  });

  it('preserves the existing earlier-phase BlockedBy rule', () => {
    const result = validatePhaseGraph(fixture('plan-forward-ref-blockedby.md'), 'parallel');
    expect(codes(result.errors)).toContain('FORWARD_REFERENCE');
  });

  it('clean-diamond: fully reciprocal DAG has zero diagnostics in parallel mode', () => {
    const result = validatePhaseGraph(fixture('parallel-phase-graph-clean-diamond.md'), 'parallel');
    expect(result.phases).toHaveLength(4);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('clean-diamond: zero diagnostics in serial mode too', () => {
    const result = validatePhaseGraph(fixture('parallel-phase-graph-clean-diamond.md'), 'serial');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('mode gating: the same defect is an error in parallel mode and a warning in serial mode', () => {
    const md = fixture('parallel-phase-graph-self-ref.md');
    const parallelResult = validatePhaseGraph(md, 'parallel');
    const serialResult = validatePhaseGraph(md, 'serial');
    expect(codes(parallelResult.errors)).toContain('SELF_REFERENCE');
    expect(parallelResult.warnings).toHaveLength(0);
    expect(codes(serialResult.warnings)).toContain('SELF_REFERENCE');
    expect(serialResult.errors).toHaveLength(0);
  });
});

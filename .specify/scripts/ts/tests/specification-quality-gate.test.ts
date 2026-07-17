import { describe, expect, it } from 'bun:test';
import { validateSpecificationQualityGate } from '../src/commands/util/specification-quality-gate';

function spec(status: string, blockingIssues = 'None.', iterations = '1'): string {
  return `# Spec

## Specification Quality Gate

| Field | Value |
|---|---|
| Status | ${status} |
| Iterations | ${iterations} |
| Source | tdk-specify |
| Last Checked | 2026-07-17 10:00 |

### Blocking Issues

${blockingIssues}

## Clarifications
`;
}

describe('validateSpecificationQualityGate', () => {
  it('accepts pass and warn gates without blockers', () => {
    expect(validateSpecificationQualityGate(spec('pass')).allowed).toBe(true);
    const warning = validateSpecificationQualityGate(spec('warn'));
    expect(warning.allowed).toBe(true);
    expect(warning.warnings).toHaveLength(1);
  });

  it('blocks fail or warn gates with blocking issues', () => {
    expect(validateSpecificationQualityGate(spec('fail')).allowed).toBe(false);
    expect(validateSpecificationQualityGate(spec('warn', '- Missing retention rule')).allowed).toBe(false);
  });

  it('accepts a missing embedded gate only with legacy checklist fallback', () => {
    expect(validateSpecificationQualityGate('# Legacy', { legacyChecklistExists: true })).toMatchObject({
      allowed: true,
      mode: 'legacy',
    });
    expect(validateSpecificationQualityGate('# Legacy')).toMatchObject({
      allowed: false,
      mode: 'blocked',
    });
  });

  it('blocks malformed values and iteration overflow', () => {
    const result = validateSpecificationQualityGate(spec('unknown', 'None.', '4'));
    expect(result.allowed).toBe(false);
    expect(result.errors).toContain('Quality gate Status must be pass, warn, or fail');
    expect(result.errors).toContain('Quality gate Iterations must be an integer from 0 to 3');
    expect(validateSpecificationQualityGate(spec('pass', 'None.', '1x')).allowed).toBe(false);
  });
});

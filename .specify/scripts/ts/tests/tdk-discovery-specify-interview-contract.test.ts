import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DISCOVERY_SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-discovery/SKILL.md',
);
const SPECIFY_SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-specify/SKILL.md',
);
const DISCOVERY_CONTRACT_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-discovery/references/discovery-output-contract.md',
);
const SHARED_PROTOCOL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/_shared/interview-alignment-protocol.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('tdk discovery/specify interview contract', () => {
  const discoverySkill = read(DISCOVERY_SKILL_PATH);
  const specifySkill = read(SPECIFY_SKILL_PATH);
  const discoveryContract = read(DISCOVERY_CONTRACT_PATH);
  const combined = `${discoverySkill}\n${specifySkill}\n${discoveryContract}`;

  it('defines one shared artifact-alignment protocol', () => {
    expect(existsSync(SHARED_PROTOCOL_PATH)).toBe(true);

    const protocol = read(SHARED_PROTOCOL_PATH);
    expect(protocol).toContain('artifact alignment');
    expect(protocol).toContain('3-6 questions');
    expect(protocol).toContain('teach-back');
    expect(protocol).toContain('forced boundary');
    expect(protocol).toContain('contradiction probe');
    expect(protocol).toContain('aligned');
    expect(protocol).toContain('mismatch');
    expect(protocol).toContain('unclear');
    expect(protocol).toContain('Critical mismatch');
    expect(protocol).toContain('Do not persist a full raw transcript');
  });

  it('documents optional interview mode for discovery without changing output ownership', () => {
    expect(discoverySkill).toContain('[--force] [--interview]');
    expect(discoverySkill).toContain('../_shared/interview-alignment-protocol.md');
    expect(discoverySkill).toContain('set `INTERVIEW_DISCOVERY=true`');
    expect(discoverySkill).toContain('Unknown flags STOP');
    expect(discoverySkill).toContain('3-5 artifact-grounded questions');
    expect(discoverySkill).toContain('problem, personas, MVP cutline, out-of-scope, and risk/open question');
    expect(discoverySkill).toContain('classification: `aligned`, `mismatch`, or `unclear`');
    expect(discoverySkill).toContain('critical mismatch');
    expect(discoverySkill).toContain('No `interview.md`');
  });

  it('documents optional interview mode for specify while allowing fast composition', () => {
    expect(specifySkill).toContain('[--fast] [--interview]');
    expect(specifySkill).toContain('../_shared/interview-alignment-protocol.md');
    expect(specifySkill).toContain('set `SPEC_INTERVIEW=true`');
    expect(specifySkill).toContain('Unknown flags STOP');
    expect(specifySkill).toContain('`--fast --interview` is valid');
    expect(specifySkill).toContain('does not force full mode');
    expect(specifySkill).toContain('4-6 artifact-grounded questions');
    expect(specifySkill).toContain('problem, scope, impact surface, top UR/FR/entity, success criteria, risk, and unresolved questions');
    expect(specifySkill).toContain('classification: `aligned`, `mismatch`, or `unclear`');
  });

  it('keeps discovery four-file and tracker-neutral contracts intact', () => {
    expect(discoveryContract).toContain('No other discovery output is allowed.');
    expect(discoveryContract).toContain('Interview alignment notes');
    expect(combined).not.toMatch(/\b(create|write|emit|produce)\b[^.\n]*discovery\/interview\.md/i);
    expect(combined).not.toMatch(/\bgh\s+issue\s+create\b/);
    expect(combined).not.toMatch(/\bglab\s+issue\s+create\b/i);
    expect(combined).not.toMatch(/\bbacklog\s+(issue|ticket)\s+create\b/i);
  });
});

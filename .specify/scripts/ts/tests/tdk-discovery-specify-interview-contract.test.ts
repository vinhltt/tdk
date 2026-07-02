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
const SPECIFY_INPUT_ROUTING_REF_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-specify/references/input-routing-and-mode-workflow.md',
);
const SPECIFY_GENERATION_REF_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-specify/references/spec-generation-and-validation-workflow.md',
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
  const specifyInputRoutingRef = read(SPECIFY_INPUT_ROUTING_REF_PATH);
  const specifyGenerationRef = read(SPECIFY_GENERATION_REF_PATH);
  const specifyContract = `${specifySkill}\n${specifyInputRoutingRef}\n${specifyGenerationRef}`;
  const discoveryContract = read(DISCOVERY_CONTRACT_PATH);
  const combined = `${discoverySkill}\n${specifyContract}\n${discoveryContract}`;

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

  it('documents discovery replay interview against existing artifacts', () => {
    expect(discoverySkill).toContain('/tdk-discovery <epic-id> --interview');
    expect(discoverySkill).toContain('set `DISCOVERY_REPLAY_INTERVIEW=true`');
    expect(discoverySkill).toContain('discovery.md`, `discovery/problem.md`, `discovery/personas.md`, and `discovery/mvp-scope.md`');
    expect(discoverySkill).toContain('Discovery replay interview requires existing discovery artifacts');
    expect(discoverySkill).toContain('If the cleaned brief is exactly `interview`, STOP before creation or replay routing');
    expect(discoverySkill).toContain('contains exactly the three allowed detail files and no extras');
    expect(discoverySkill).toContain('skip Step 3 directory initialization and Step 4 artifact generation');
    expect(discoverySkill).toContain('`--force --interview` requires a replacement brief or file');
    expect(discoverySkill).toContain('Did you mean `--interview`?');
  });

  it('documents optional interview mode for specify while allowing fast composition', () => {
    expect(specifySkill).toContain('[--fast] [--interview]');
    expect(specifySkill).toContain('../_shared/interview-alignment-protocol.md');
    expect(specifyContract).toContain('set `SPEC_INTERVIEW=true`');
    expect(specifyContract).toContain('Unknown flags STOP');
    expect(specifyContract).toContain('`--fast --interview` is valid');
    expect(specifyContract).toContain('does not force full mode');
    expect(specifyContract).toContain('4-6 artifact-grounded questions');
    expect(specifyContract).toContain('problem, scope, impact surface, top UR/FR/entity, success criteria, risk, and unresolved questions');
    expect(specifyContract).toContain('classification: `aligned`, `mismatch`, or `unclear`');
  });

  it('documents specify replay interview against the existing spec', () => {
    expect(specifySkill).toContain('/tdk-specify <id> --interview');
    expect(specifyContract).toContain('set `SPEC_REPLAY_INTERVIEW=true`');
    expect(specifyContract).toContain('Spec replay interview requires existing `spec.md`');
    expect(specifyContract).toContain('`--fast --interview` requires a feature description');
    expect(specifyContract).toContain('If cleaned description is exactly `interview`, STOP before creation or replay routing');
    expect(specifyContract).toContain('skip spec generation');
    expect(specifyContract).toContain('skip duplicate-spec STOP');
    expect(specifyContract).toContain('Did you mean `--interview`?');
  });

  it('does not treat positional interview as a supported mode', () => {
    expect(combined).toContain('positional `interview`');
    expect(combined).not.toContain('/tdk-discovery <epic-id> interview');
    expect(combined).not.toContain('/tdk-specify <id> interview');
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

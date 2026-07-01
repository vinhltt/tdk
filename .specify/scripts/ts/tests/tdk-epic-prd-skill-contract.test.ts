import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-epic-prd/SKILL.md',
);
const SKILL_DIR = dirname(SKILL_PATH);
const OUTPUT_CONTRACT_PATH = join(SKILL_DIR, 'references/epic-prd-output-contract.md');
const QUALITY_GUIDE_PATH = join(SKILL_DIR, 'references/epic-prd-quality-guidelines.md');
const TEMPLATE_DIR = resolve(import.meta.dir, '../../../templates/epic-prd');
const COMMAND_REFERENCE_PATH = resolve(import.meta.dir, '../../../docs/en/guides/command-reference.md');
const DOCUMENT_FLOW_PATH = resolve(import.meta.dir, '../../../docs/en/guides/document-flow.md');
const EPIC_GUIDE_PATH = resolve(import.meta.dir, '../../../docs/en/guides/epic-start-guide.md');
const VI_EPIC_GUIDE_PATH = resolve(import.meta.dir, '../../../docs/vi/guides/epic-start-guide.md');
const OUTPUT_FILES = ['index.md', 'prd.md', 'slice-map.md', 'open-questions.md'];
const REQUIRED_DISCOVERY_FILES = [
  'discovery/index.md',
  'discovery/problem.md',
  'discovery/personas.md',
  'discovery/mvp-scope.md',
];

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

describe('tdk-epic-prd skill contract', () => {
  const skill = readIfExists(SKILL_PATH);
  const outputContract = readIfExists(OUTPUT_CONTRACT_PATH);
  const qualityGuide = readIfExists(QUALITY_GUIDE_PATH);
  const combined = `${skill}\n${outputContract}\n${qualityGuide}`;

  it('exists as an epic-only PRD command after discovery', () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
    expect(skill).toContain('name: tdk-epic-prd');
    expect(skill).toContain('/tdk-epic-prd <epic-id> [--force] [--interview]');
    expect(skill).toContain('EPIC-ONLY');
    expect(skill).toContain('tracker-neutral');
    expect(skill).toContain('not requirement authority');
  });

  it('requires existing discovery artifacts before writing PRD artifacts', () => {
    expect(skill).toContain('tdk-validate-task-id');
    expect(skill).toContain('tdk-load-project-context');
    expect(skill).toContain('FEATURE_DIR');
    for (const file of REQUIRED_DISCOVERY_FILES) {
      expect(skill).toContain(file);
    }
    expect(skill).toContain('STOP before writing');
    expect(skill).toContain('/tdk-discovery <epic-id>');
  });

  it('restricts output to exactly four epic PRD artifacts', () => {
    expect(outputContract).toContain('{FEATURE_DIR}/epic-prd/');
    expect(outputContract).toContain('No other epic PRD output is allowed');

    for (const file of OUTPUT_FILES) {
      expect(skill).toContain(`epic-prd/${file}`);
      expect(outputContract).toContain(file);
      expect(existsSync(join(TEMPLATE_DIR, `${file}.tpl`))).toBe(true);
    }

    expect(outputContract).toContain('Forbidden outputs');
    expect(outputContract).not.toContain('interview.md as an output');
    expect(outputContract).not.toContain('roadmap.md');
    expect(outputContract).not.toContain('issues.md');
  });

  it('stays below spec authority and tracker integration boundaries', () => {
    expect(combined).toContain('Only child `spec.md` artifacts mint `UR-*`, `FR-*`, and `SC-*`');
    expect(combined).toContain('must not mint `FS-*`');
    expect(combined).toContain('does not create tracker issues');
    expect(combined).toContain('does not create `spec.md`');
    expect(combined).not.toMatch(/\bgh\s+issue\s+create\b/);
    expect(combined).not.toMatch(/\bglab\s+issue\s+create\b/i);
    expect(combined).not.toMatch(/\bbacklog\s+(issue|ticket)\s+create\b/i);
  });

  it('guards slice map quality and blocking-question readiness', () => {
    expect(qualityGuide).toContain('slug slice keys');
    expect(qualityGuide).toContain('No catch-all slices');
    expect(qualityGuide).toContain('all features');
    expect(qualityGuide).toContain('entire MVP');
    expect(qualityGuide).toContain('Blocking Questions');
    expect(qualityGuide).toContain('Non-Blocking Questions');
    expect(qualityGuide).toContain('blocks downstream epic design or breakdown readiness');

    const sliceTemplate = readIfExists(join(TEMPLATE_DIR, 'slice-map.md.tpl'));
    expect(sliceTemplate).toContain(
      'Slice key | Capability | Primary actor | Outcome | Depends on | Suggested child spec title | Priority',
    );
    expect(sliceTemplate).toContain('slug');
    expect(sliceTemplate).not.toContain('FS-001');
  });

  it('keeps interview replay constrained to existing PRD artifacts', () => {
    expect(skill).toContain('../_shared/interview-alignment-protocol.md');
    expect(skill).toContain('when `--interview` is set');
    expect(skill).toContain('PRD_REPLAY_INTERVIEW');
    expect(skill).toContain('No `interview.md`');
    expect(skill).toContain('update only the four epic PRD files');
  });

  it('documents the current epic flow through parent HLD without advertising future commands', () => {
    const commandReference = readIfExists(COMMAND_REFERENCE_PATH);
    const documentFlow = readIfExists(DOCUMENT_FLOW_PATH);
    const epicGuide = readIfExists(EPIC_GUIDE_PATH);
    const viEpicGuide = readIfExists(VI_EPIC_GUIDE_PATH);
    const docsCombined = `${commandReference}\n${documentFlow}\n${epicGuide}\n${viEpicGuide}`;

    expect(commandReference).toContain('/tdk-epic-prd <epic-id> [--force] [--interview]');
    expect(docsCombined).toContain('epic-prd/');
    expect(docsCombined).toContain('discovery');
    expect(docsCombined).toContain('/tdk-epic-hld');
    expect(docsCombined).toContain('/tdk-task-breakdown');
    expect(docsCombined).toContain('child /tdk-specify');
    expect(docsCombined).not.toContain('/tdk-high-level-design');
    expect(docsCombined).not.toContain('/tdk-epic-slice-breakdown');
  });
});

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCAFFOLD_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-scaffold/skills');
const SKILL_PATH = join(SCAFFOLD_SKILLS_DIR, 'tdk-scaffold-from-recommendation/SKILL.md');
const ROUTING_SKILL_PATH = join(SCAFFOLD_SKILLS_DIR, 'tdk-delegate-routing/SKILL.md');
const ROUTING_REFERENCE_DIR = join(SCAFFOLD_SKILLS_DIR, 'tdk-delegate-routing/references');
const PROPOSAL_FORMAT_PATH = join(
  SCAFFOLD_SKILLS_DIR,
  'tdk-scaffold-from-recommendation/references/delegate-routing-proposal-format.md',
);
const REVIEW_REGISTER_PATH = join(ROUTING_REFERENCE_DIR, 'workflow-review-register.md');
const RECOMMEND_SKILL_PATH = join(SCAFFOLD_SKILLS_DIR, 'tdk-sub-workspace-automation-recommend/SKILL.md');
const SKILLS_GUIDE_PATH = resolve(import.meta.dir, '../../../../.specify/docs/en/guides/skills-guide.md');
const NEW_RECOMMENDATION_PATH =
  '.specify/configurations/automation-recommendations/sub-workspaces/*/automation-recommendation.md';

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('TDK scaffold-from-recommendation contracts', () => {
  const skill = existsSync(SKILL_PATH) ? read(SKILL_PATH) : '';

  it('prefers new per-sub-workspace recommendation output while keeping old fallback paths', () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
    expect(skill).toContain(NEW_RECOMMENDATION_PATH);
    expect(skill).toContain('.specify/reports/recommendation-*.md');
    expect(skill).toContain('.specify/configurations/automation-recommendations/recommendation-*.md');
  });

  it('parses sub-workspace recommendation frontmatter when present', () => {
    for (const field of [
      'sub_workspace',
      'sub_workspace_path',
      'source_docs_path',
      'dependency_policy',
      'official_docs_read',
      'skill_search_queries',
    ]) {
      expect(skill).toContain(field);
    }
  });

  it('keeps recommendation approval as a human gate before scaffold writes', () => {
    expect(skill).toContain('status: approved');
    expect(skill).toContain('reviewed recommendations');
    expect(skill).toContain('Scaffold skills');
    expect(skill).toContain('Scaffold agents');
  });

  it('emits routing proposals beside approved recommendations without direct route mutation', () => {
    expect(skill).toContain('## Routing Suggestions');
    expect(skill).toContain('delegate-routing-proposal.json');
    expect(skill).toContain('beside the approved recommendation');
    expect(skill).toContain('Never mutate `delegate-routing.md` directly');
    expect(skill).toContain('/tdk-delegate-routing register --yes');
  });

  it('registers the tdk-delegate-routing facade and reference contracts', () => {
    expect(existsSync(ROUTING_SKILL_PATH)).toBe(true);
    const routingSkill = read(ROUTING_SKILL_PATH);
    const skillsGuide = read(SKILLS_GUIDE_PATH);
    for (const action of ['diff', 'register', 'verify']) {
      expect(routingSkill).toContain(`routing delegate ${action}`);
    }
    for (const removed of ['init', 'inspect', 'check', 'optimize']) {
      expect(routingSkill).not.toContain(`routing delegate ${removed}`);
    }
    for (const reference of [
      'delegate-routing-file-contract.md',
      'delegate-routing-proposal-format.md',
      'workflow-review-register.md',
      'update-and-conflict-policy.md',
    ]) {
      expect(existsSync(join(ROUTING_REFERENCE_DIR, reference))).toBe(true);
    }
    expect(existsSync(join(ROUTING_REFERENCE_DIR, 'workflow-init.md'))).toBe(false);
    expect(skillsGuide).toContain('/tdk-delegate-routing');
    expect(skillsGuide).toContain('delegate-routing-proposal.json');
  });
});

describe('TDK scaffold routing handoff contracts', () => {
  const skill = existsSync(SKILL_PATH) ? read(SKILL_PATH) : '';
  const proposalFormat = existsSync(PROPOSAL_FORMAT_PATH) ? read(PROPOSAL_FORMAT_PATH) : '';
  const reviewRegister = existsSync(REVIEW_REGISTER_PATH) ? read(REVIEW_REGISTER_PATH) : '';
  const recommendSkill = existsSync(RECOMMEND_SKILL_PATH) ? read(RECOMMEND_SKILL_PATH) : '';

  it('reads every reference the routing handoff depends on', () => {
    for (const path of [SKILL_PATH, PROPOSAL_FORMAT_PATH, REVIEW_REGISTER_PATH, RECOMMEND_SKILL_PATH]) {
      expect(existsSync(path)).toBe(true);
    }
  });

  it('derives routing entries for delegates no suggestion covers', () => {
    expect(skill).toContain('that no suggestion covers');
    expect(skill).toContain('no `## Routing Suggestions` section');
    expect(skill).toContain('Derived by scaffold from purpose; domain inferred from');
  });

  it('unions existing route delegates so register does not drop them', () => {
    expect(skill).toContain('Union `delegates` per');
    expect(skill).toContain('replaces the whole line');
  });

  it('pins every proposal entry to the register operation', () => {
    expect(skill).toContain('operation: "register"');
    expect(proposalFormat).toContain('`add` is rejected once the route already exists');
  });

  it('states all four route-file parse rules across skill and proposal format', () => {
    const routingPrompt = skill + proposalFormat;
    for (const rule of [
      '<!--',
      'no delegate',
      'no special skill',
      'Prefix a skill token with',
      'keep an `@`-prefixed agent token verbatim',
      'case-insensitive',
    ]) {
      expect(routingPrompt).toContain(rule);
    }
  });

  it('states the goal for a missing route file and translates the CLI error', () => {
    expect(skill).toContain('must exist at');
    expect(skill).toContain('delegate-routing-template.tpl');
    expect(skill).toContain('status: "missing"');
  });

  it('prints the diff, register, verify sequence when the route file is present', () => {
    expect(skill).toContain('routing delegate diff');
    expect(skill).toContain('register --yes');
    expect(skill).toContain('routing delegate verify');
  });

  it('keeps the next step visible in dry-run without writing files', () => {
    expect(skill).toContain('exactly the same next step');
    expect(skill).toContain('Dry run complete. No files written.');
  });

  it('warns instead of aborting when .specify.json is missing', () => {
    expect(skill).toContain('both the present and missing branches');
    expect(skill).toContain('Missing config: <path>');
    expect(skill).toContain('Do not abort the scaffold.');
  });

  it('guards the next step on at least one scaffolded delegate', () => {
    expect(skill).toContain('same condition as step 2');
    expect(skill).toContain('at least one skill or agent was scaffolded');
  });

  it('routes scaffolded agents through the proposal instead of warning they have no destination', () => {
    expect(skill).not.toContain('has no routing destination yet');
    expect(skill).toContain('@<agent-name>');
    expect(skill).toContain('travel the same proposal');
    expect(proposalFormat).toContain('kept verbatim and is never rewritten to `/`');
  });

  it('surfaces reason and derived provenance at the register review gate', () => {
    expect(reviewRegister).toContain('operations, `reason`, and warnings');
    expect(reviewRegister).toContain('`reason` contains `derived` (case-insensitive)');
    expect(reviewRegister).toContain('`from` → `to`');
  });

  it('carries the domain inference table in the scaffold proposal format reference', () => {
    for (const mapping of [
      '-> test',
      '-> database',
      'design, then implement',
      '-> implement',
      '-> research',
    ]) {
      expect(proposalFormat).toContain(mapping);
    }
    expect(proposalFormat).toContain('research|implement|test|database|design');
    expect(proposalFormat).toContain('one entry per domain in that order');
  });

  it('declares the empty routing-suggestions consequence upstream', () => {
    expect(recommendSkill).toContain('Leaving `## Routing Suggestions` empty is supported');
  });
});

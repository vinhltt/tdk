import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCAFFOLD_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-scaffold/skills');
const SKILL_PATH = join(SCAFFOLD_SKILLS_DIR, 'tdk-scaffold-from-recommendation/SKILL.md');
const ROUTING_SKILL_PATH = join(SCAFFOLD_SKILLS_DIR, 'tdk-plan-skill-routing/SKILL.md');
const ROUTING_REFERENCE_DIR = join(SCAFFOLD_SKILLS_DIR, 'tdk-plan-skill-routing/references');
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
    expect(skill).toContain('plan-skill-routing-proposal.json');
    expect(skill).toContain('beside the approved recommendation');
    expect(skill).toContain('Never mutate `plan-skill-routing.md` directly');
    expect(skill).toContain('/tdk-plan-skill-routing register --yes');
  });

  it('registers the tdk-plan-skill-routing facade and reference contracts', () => {
    expect(existsSync(ROUTING_SKILL_PATH)).toBe(true);
    const routingSkill = read(ROUTING_SKILL_PATH);
    const skillsGuide = read(SKILLS_GUIDE_PATH);
    for (const action of ['init', 'inspect', 'check', 'diff', 'register', 'verify', 'optimize']) {
      expect(routingSkill).toContain(`plan-skill ${action}`);
    }
    for (const reference of [
      'plan-skill-routing-file-contract.md',
      'plan-skill-routing-proposal-format.md',
      'workflow-init.md',
      'workflow-review-register.md',
      'update-and-conflict-policy.md',
    ]) {
      expect(existsSync(join(ROUTING_REFERENCE_DIR, reference))).toBe(true);
    }
    expect(skillsGuide).toContain('/tdk-plan-skill-routing');
    expect(skillsGuide).toContain('plan-skill-routing-proposal.json');
  });
});

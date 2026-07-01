import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCAFFOLD_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-scaffold/skills');
const MANIFEST_PATH = resolve(import.meta.dir, '../../../plugins/manifest.json');
const README_PATH = resolve(import.meta.dir, '../../../../README.md');

const CANONICAL_NAME = 'tdk-sub-workspace-automation-recommend';
const OUTPUT_PATH =
  '.specify/configurations/automation-recommendations/sub-workspaces/<name>/automation-recommendation.md';

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('TDK sub-workspace automation recommendation contracts', () => {
  const canonicalPath = join(SCAFFOLD_SKILLS_DIR, CANONICAL_NAME, 'SKILL.md');
  const removedLegacyPath = join(SCAFFOLD_SKILLS_DIR, 'tdk-recommend-automations', 'SKILL.md');
  const canonical = existsSync(canonicalPath) ? read(canonicalPath) : '';

  it('registers the canonical one-sub-workspace recommendation skill', () => {
    expect(existsSync(canonicalPath)).toBe(true);
    expect(canonical).toContain('name: tdk-sub-workspace-automation-recommend');
    expect(canonical).toContain('--sub-workspace <name>');
    expect(canonical).toContain('--no-community-search');
    expect(canonical).toContain(OUTPUT_PATH);
    expect(canonical).toContain('Do not support `--all`');
  });

  it('does not keep the old project-level recommendation route', () => {
    expect(existsSync(removedLegacyPath)).toBe(false);
    expect(canonical).not.toContain('tdk-recommend-automations');
    expect(canonical).not.toContain('compatibility route');
  });

  it('uses scoped evidence and explicit research sources', () => {
    for (const required of [
      'architecture.md',
      'interfaces.md',
      'engineering.md',
      'workspace-dependency-policy.md',
      'selected sub-workspace',
      'official docs',
      'primary sources',
      'local installed skill catalog',
      'npx skills find',
      'skills.sh',
    ]) {
      expect(canonical).toContain(required);
    }
  });

  it('forbids ck:find-skills while allowing direct skills CLI lookup', () => {
    expect(canonical).toContain('Do not use `ck:find-skills`');
    expect(canonical).not.toContain('Use `ck:find-skills`');
    expect(canonical).toContain('npx skills find');
    expect(canonical).toContain('skills.sh');
  });

  it('requires reviewable output sections for scaffold readiness', () => {
    for (const section of [
      '## Sub-Workspace Context',
      '## Evidence Inputs',
      '## Official Docs And Primary Source Log',
      '## Local Installed Skills Considered',
      '## Community Skills Discovered',
      '## Recommended Skills',
      '## Recommended Agents',
      '## Rejected Recommendations',
      '## Scaffold Readiness',
      '## Confidence',
      '## Risks',
      '## Unresolved Questions',
    ]) {
      expect(canonical).toContain(section);
    }
  });

  it('registers recommendation command in manifests and README', () => {
    const manifest = read(MANIFEST_PATH);
    const readme = read(README_PATH);

    expect(manifest).toContain('"tdk-sub-workspace-automation-recommend"');
    expect(manifest).not.toContain('"tdk-recommend-automations"');
    expect(readme).toContain('/tdk-sub-workspace-automation-recommend');
    expect(readme).not.toContain('/tdk-recommend-automations');
    expect(readme).toContain('tdk-scaffold/        # Skill/agent and golden-path scaffolding (3 skills)');
  });
});

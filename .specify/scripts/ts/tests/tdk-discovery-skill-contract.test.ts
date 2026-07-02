import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-discovery/SKILL.md',
);
const SKILL_DIR = dirname(SKILL_PATH);
const REFERENCE_PATH = join(SKILL_DIR, 'references/discovery-output-contract.md');
const TEMPLATE_DIR = join(SKILL_DIR, 'templates');
const DETAIL_FILES = ['problem.md', 'personas.md', 'mvp-scope.md'];

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

describe('tdk-discovery skill contract', () => {
  const skill = readIfExists(SKILL_PATH);
  const reference = readIfExists(REFERENCE_PATH);

  it('exists as an epic-only context command', () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
    expect(skill).toContain('tdk-discovery');
    expect(skill).toContain('EPIC-ONLY v1');
    expect(skill).toContain('context-only');
    expect(skill).toContain('does NOT create specs, plans, work items, code, or tracker issues');
  });

  it('loads project context before feature directory creation', () => {
    expect(skill).toContain('tdk-validate-task-id');
    expect(skill).toContain('tdk-load-project-context');
    expect(skill).toContain('require_feature_dir:false');
    expect(skill).toContain('require_prefix_validation:false');
    expect(skill).toContain('Because `require_feature_dir:false` skips `FEATURE_DIR` resolution');
    expect(skill).toContain('`FEATURE_DIR` = `$SPECS_ROOT/$FOLDER/$TICKET_ID`');
    expect(skill).toContain('Do not require `FEATURE_DIR` to exist before discovery');
    expect(skill).toContain('mkdir -p "$FEATURE_DIR/discovery"');
  });

  it('strips known flags before resolving the brief', () => {
    expect(skill).toContain('### Step 2 - Parse Flags And Resolve Brief');
    expect(skill).toContain('set `FORCE_DISCOVERY=true`');
    expect(skill).toContain('set `INTERVIEW_DISCOVERY=true`');
    expect(skill).toContain('Strip `--force` and `--interview` from the second argument onward');
    expect(skill).toContain('If `discovery.md` already exists and `FORCE_DISCOVERY` is not true');
  });

  it('restricts output to the sibling discovery manifest and detail artifacts', () => {
    expect(reference).toContain('{FEATURE_DIR}/discovery.md');
    expect(skill).toContain('discovery.md');
    expect(reference).toContain('discovery.md');
    expect(existsSync(join(TEMPLATE_DIR, 'discovery.md.tpl'))).toBe(true);

    for (const file of DETAIL_FILES) {
      expect(skill).toContain(`discovery/${file}`);
      expect(reference).toContain(file);
      expect(existsSync(join(TEMPLATE_DIR, `${file}.tpl`))).toBe(true);
    }

    expect(reference).toContain('Forbidden outputs');
    expect(reference).toContain('Product-level signals');
    expect(reference).not.toContain('competitor.md as an output');
    expect(reference).not.toContain('market.md');
    expect(reference).not.toContain('business-model.md');
  });

  it('updates the epic dashboard and detects legacy nested manifests', () => {
    const combined = `${skill}\n${reference}`;

    expect(combined).toContain('{FEATURE_DIR}/index.md');
    expect(combined).toContain('stage manifest');
    expect(combined).toContain('next command');
    expect(combined).toContain('legacy layout detected');
    expect(combined).toContain('discovery/index.md');
    expect(combined).toContain('--force');
    expect(combined).toContain('do not auto-migrate');
  });

  it('keeps discovery context-only and tracker-neutral', () => {
    const combined = `${skill}\n${reference}`;
    expect(combined).toContain('Only `tdk-specify` mints `UR-*`, `FR-*`, and `SC-*`');
    expect(combined).toContain('discovery_ref');
    expect(combined).toContain('tracker-neutral');
    expect(combined).not.toMatch(/\bgh\s+issue\s+create\b/);
    expect(combined).not.toMatch(/\bglab\s+issue\s+create\b/i);
    expect(combined).not.toMatch(/\bbacklog\s+(issue|ticket)\s+create\b/i);
  });
});

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-epic/skills/tdk-discovery/SKILL.md',
);
const SKILL_DIR = dirname(SKILL_PATH);
const REFERENCE_PATH = join(SKILL_DIR, 'references/discovery-output-contract.md');
const TEMPLATE_DIR = join(SKILL_DIR, 'templates');
const LIFECYCLE_SOURCE_PATH = resolve(
  import.meta.dir,
  '../../../docs/assets/lifecycle-share-graph-v4.excalidraw',
);
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
    expect(reference).toContain('## Ready For Epic PRD');
    expect(reference).not.toContain('## Ready For Specify');
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

  it('offers recommended next-step handoff after completion', () => {
    expect(skill).toContain('### Step 7 - Recommend Next Step');
    expect(skill).toContain('Use `AskUserQuestion` with header "Next Step"');
    expect(skill).toContain('/tdk-epic-prd {TASK_ID}` (Recommended for broad epics)');
    expect(skill).toContain('/tdk-discovery {TASK_ID} --interview');
    expect(skill).toContain('Feature-sized work should skip discovery and start at `/tdk-specify` instead');
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

  const PRODUCT_AUTHORITY_SURFACES = [
    ['SKILL.md', SKILL_PATH, false],
    ['discovery-output-contract.md', REFERENCE_PATH, false],
    ['discovery.md.tpl', join(TEMPLATE_DIR, 'discovery.md.tpl'), true],
    ['problem.md.tpl', join(TEMPLATE_DIR, 'problem.md.tpl'), true],
    ['personas.md.tpl', join(TEMPLATE_DIR, 'personas.md.tpl'), true],
    ['mvp-scope.md.tpl', join(TEMPLATE_DIR, 'mvp-scope.md.tpl'), true],
  ] as const;

  it.each(PRODUCT_AUTHORITY_SURFACES)(
    'routes durable product facts to constitution plus typed memory instead of a product-context.md canonical authority in %s',
    (_label, filePath, requiresTypedMemoryToken) => {
      const content = readIfExists(filePath);

      expect(content).not.toContain('product-context.md');
      expect(content).toContain('constitution');
      if (requiresTypedMemoryToken) {
        expect(content).toContain('typed memory');
      }
    },
  );

  it('shows constitution and typed Memory v3 control-plane authority in the lifecycle source', () => {
    const lifecycleSource = readIfExists(LIFECYCLE_SOURCE_PATH);

    expect(lifecycleSource).not.toContain('product-context.md');
    expect(lifecycleSource).toContain('constitution.md = governance');
    expect(lifecycleSource).toContain('memory-index.md + memory.yaml');
    expect(lifecycleSource).toContain('Memory v3 control plane');
    expect(lifecycleSource).toContain('typed routes: binding facts');
  });
});

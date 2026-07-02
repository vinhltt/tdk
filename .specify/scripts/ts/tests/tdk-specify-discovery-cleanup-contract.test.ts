import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
const SPEC_TEMPLATE_PATH = resolve(
  import.meta.dir,
  '../../../templates/spec-template.md.tpl',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('tdk-specify discovery cleanup contract', () => {
  const skill = read(SPECIFY_SKILL_PATH);
  const inputRoutingRef = read(SPECIFY_INPUT_ROUTING_REF_PATH);
  const generationRef = read(SPECIFY_GENERATION_REF_PATH);
  const template = read(SPEC_TEMPLATE_PATH);
  const contract = `${skill}\n${inputRoutingRef}\n${generationRef}`;
  const combined = `${contract}\n${template}`;

  it('keeps specify skill and references within progressive-disclosure limits', () => {
    expect(skill.split('\n').length).toBeLessThanOrEqual(300);
    expect(inputRoutingRef.split('\n').length).toBeLessThanOrEqual(300);
    expect(generationRef.split('\n').length).toBeLessThanOrEqual(300);
    expect(skill).toContain('references/input-routing-and-mode-workflow.md');
    expect(skill).toContain('references/spec-generation-and-validation-workflow.md');
  });

  it('preserves optional discovery context from Plan 1', () => {
    expect(contract).toContain('DISCOVERY_MANIFEST="$FEATURE_DIR/discovery.md"');
    expect(contract).toContain('test -f "$DISCOVERY_MANIFEST"');
    expect(contract).toContain('read it as optional context before spec generation');
    expect(contract).toContain('Do not require discovery for normal specify flow');
  });

  it('keeps the nine-section spec schema and current headings', () => {
    const headings = [
      '## 1. Problem Statement',
      '## 2. Scope Boundary',
      '## 3. Impact Surface',
      '## 4. Evaluated Approaches',
      '## 5. User Requirements & Testing',
      '## 6. Functional Requirements',
      '## 7. Success Criteria',
      '## 8. Risks & Mitigations',
      '## 9. Unresolved Questions',
    ];

    for (const heading of headings) {
      expect(template).toContain(heading);
    }
  });

  it('uses discovery as concise reference context for spec sections 1 and 4', () => {
    expect(contract).toContain(
      'Use discovery for concise source references in `## 1. Problem Statement` and `## 4. Evaluated Approaches`; do not copy discovery prose wholesale into `spec.md`.',
    );
    expect(contract).toContain(
      'Do not copy discovery content into `UR-*`, `FR-*`, or `SC-*`; derive explicit spec requirements from it.',
    );
    expect(template).toContain(
      'When discovery exists, summarize the problem and point to `discovery/problem.md` or `discovery.md`.',
    );
    expect(template).toContain(
      'When discovery exists, summarize the selected MVP boundary and point to `discovery/mvp-scope.md` or `discovery.md`.',
    );
  });

  it('documents altitude boundaries between product context, discovery, and spec', () => {
    expect(template).toContain(
      'Product-wide durable facts belong in constitution and memory v3 typed routes.',
    );
    expect(template).toContain(
      'Use arc42 summaries only as read-model context; binding facts live in typed memory.',
    );
    expect(template).toContain('Discovery is epic context.');
    expect(template).toContain(
      'Spec is the PRD and requirement-ID source of truth.',
    );
  });

  it('does not introduce deferred discovery fields or tracker/business-discovery ownership', () => {
    expect(combined).not.toContain('discovery_ref');
    expect(combined).not.toMatch(/\bgh\s+issue\s+create\b/);
    expect(combined).not.toMatch(/\bglab\s+issue\s+create\b/i);
    expect(combined).not.toMatch(/\bbacklog\s+(issue|ticket)\s+create\b/i);
    expect(combined).not.toContain('competitor.md');
    expect(combined).not.toContain('market.md');
    expect(combined).not.toContain('business-model');
  });
});

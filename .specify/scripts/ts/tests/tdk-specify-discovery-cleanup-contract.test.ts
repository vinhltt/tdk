import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SPECIFY_SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-specify/SKILL.md',
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
  const template = read(SPEC_TEMPLATE_PATH);
  const combined = `${skill}\n${template}`;

  it('preserves optional discovery context from Plan 1', () => {
    expect(skill).toContain('DISCOVERY_INDEX="$FEATURE_DIR/discovery/index.md"');
    expect(skill).toContain('test -f "$DISCOVERY_INDEX"');
    expect(skill).toContain('read it as optional context before spec generation');
    expect(skill).toContain('Do not require discovery for normal specify flow');
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
    expect(skill).toContain(
      'Use discovery for concise source references in `## 1. Problem Statement` and `## 4. Evaluated Approaches`; do not copy discovery prose wholesale into `spec.md`.',
    );
    expect(skill).toContain(
      'Do not copy discovery content into `UR-*`, `FR-*`, or `SC-*`; derive explicit spec requirements from it.',
    );
    expect(template).toContain(
      'When discovery exists, summarize the problem and point to `discovery/problem.md` or `discovery/index.md`.',
    );
    expect(template).toContain(
      'When discovery exists, summarize the selected MVP boundary and point to `discovery/mvp-scope.md` or `discovery/index.md`.',
    );
  });

  it('documents altitude boundaries between product context, discovery, and spec', () => {
    expect(template).toContain(
      'Product-wide durable facts belong in constitution/product-context.md.',
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

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');
const SPECIFY_DIR = resolve(PROJECT_ROOT, '.specify');
const PLUGINS_DIR = resolve(import.meta.dir, '../../../plugins');

const GATES = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-plan/references/gates.md');
const TDK_PLAN_SKILL = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-plan/SKILL.md');
const TDK_SPECIFY_SKILL = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-specify/SKILL.md');
const TDK_SPECIFY_INPUT_ROUTING = resolve(
  PLUGINS_DIR,
  'tdk-core/skills/tdk-specify/references/input-routing-and-mode-workflow.md',
);
const TDK_CLARIFY = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-clarify/SKILL.md');
const TDK_CONSISTENCY_CHECK = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-consistency-check/SKILL.md');
const MEMORY_INDEX_TEMPLATE = resolve(
  PLUGINS_DIR,
  'tdk-memory/skills/tdk-memory-init/references/memory-index-template.md',
);
const REGENERATE_MEMORY_INDEX_FLOW = resolve(
  PLUGINS_DIR,
  'tdk-memory/skills/tdk-memory-update/references/regenerate-memory-index-flow.md',
);
const SPEC_TEMPLATE = resolve(SPECIFY_DIR, 'templates/spec-template.md.tpl');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function markdownSection(content: string, heading: string): string {
  const start = content.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = start + heading.length;
  const headingLevel = heading.match(/^#+/)?.[0].length ?? 1;
  const nextSectionPattern = new RegExp(`\\n#{1,${headingLevel}} `);
  const nextSection = content.slice(bodyStart).search(nextSectionPattern);
  return nextSection === -1 ? content.slice(start) : content.slice(start, bodyStart + nextSection);
}

describe('memory-validation-gate contract', () => {
  describe('Mechanism A: binding-coverage precondition', () => {
    it('memory-index-template.md declares the Binding coverage summary line', () => {
      const content = read(MEMORY_INDEX_TEMPLATE);
      expect(content).toContain('Binding coverage: {binding-true-count} of {typed-file-count} typed files');
    });

    it('memory-index-template.md uses the 4-column typed header, not the bare 3-column form', () => {
      const content = read(MEMORY_INDEX_TEMPLATE);
      expect(content).toContain('| File | Title | Updated | Binding |');
      expect(content).not.toMatch(/^\| File \| Title \| Updated \|$/m);
    });

    it('memory-index-template.md keeps the Deprecated table on its own 2-column shape', () => {
      const content = read(MEMORY_INDEX_TEMPLATE);
      expect(content).toContain('| File | Deprecated At |');
    });

    it('regenerate-memory-index-flow.md recomputes Binding coverage without inferring a default', () => {
      const content = read(REGENERATE_MEMORY_INDEX_FLOW);
      expect(content).toContain('Recompute the');
      expect(content).toContain('Binding coverage:');
      expect(content).toContain('do not infer a default');
    });

    it('gates.md Phase 0.guardian resolves BINDING_COVERAGE to unknown, none, or a reported count', () => {
      const content = read(GATES);
      const guardianSection = markdownSection(content, '## Phase 0.guardian');
      expect(guardianSection).toContain('unknown');
      expect(guardianSection).toContain('none');
      expect(guardianSection).toContain('Binding coverage:');
    });

    it('gates.md Phase 0.guardian resolves an unset BINDING_COVERAGE to unknown as a fail-safe', () => {
      const content = read(GATES);
      const guardianSection = markdownSection(content, '## Phase 0.guardian');
      expect(guardianSection).toContain('never set');
    });

    it('tdk-plan SKILL.md Phase 0.guardian gates on the binding-coverage precondition', () => {
      const content = read(TDK_PLAN_SKILL);
      const guardianSection = markdownSection(content, '### Phase 0.guardian');
      expect(guardianSection).toContain('binding-coverage precondition');
    });
  });

  describe('Mechanism B: memory_validation task-lifecycle gate', () => {
    it('spec-template.md.tpl declares the memory_validation frontmatter field', () => {
      const content = read(SPEC_TEMPLATE);
      expect(content).toContain('memory_validation:');
    });

    it('Step 1.6 Memory Validation Scope Gate exists in tdk-specify SKILL.md and the input-routing reference', () => {
      const skillContent = read(TDK_SPECIFY_SKILL);
      expect(skillContent).toContain('Step 1.6');

      const routingContent = read(TDK_SPECIFY_INPUT_ROUTING);
      const scopeGateSection = markdownSection(routingContent, '## Step 1.6: Memory Validation Scope Gate');
      expect(scopeGateSection).toContain('AskUserQuestion');
      expect(scopeGateSection).toContain('MEMORY_VALIDATION');
    });

    const MALFORMED_VALUE_CONSUMERS: Array<[path: string, label: string]> = [
      [TDK_CLARIFY, 'tdk-clarify/SKILL.md'],
      [TDK_CONSISTENCY_CHECK, 'tdk-consistency-check/SKILL.md'],
      [GATES, 'tdk-plan/references/gates.md'],
    ];

    it.each(MALFORMED_VALUE_CONSUMERS)(
      '%s reads memory_validation and treats an unreplaced placeholder as absent',
      (path) => {
        const content = read(path);
        expect(content).toContain('memory_validation');
        expect(content).toContain('placeholder');
      },
    );

    it('tdk-clarify and tdk-consistency-check never ask the user for the memory_validation decision', () => {
      expect(read(TDK_CLARIFY)).toContain('Never ask the user here');
      expect(read(TDK_CONSISTENCY_CHECK)).toContain('Never ask the user here');
    });

    it('gates.md defines the no-spec terminal default for memory_validation', () => {
      const content = read(GATES);
      expect(content).toContain('no spec.md for this feature');
    });
  });
});

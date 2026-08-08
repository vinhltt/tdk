import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('lean plan artifact templates', () => {
  it('makes research and reports conditional', () => {
    const research = read('plugins/tdk-core/skills/tdk-plan/references/research-phase.md');
    expect(research).toContain('When skipped, do not');
    expect(research).toContain('create `research/`.');
    expect(research).toContain('do not\ncreate `reports/`.');
    expect(research).toContain('`plan.md ## Supporting Artifacts`');
  });

  it('routes human-readable supporting content into owner phases', () => {
    const requirementChange = read('templates/requirement-change-template.md.tpl');
    const stateTransitions = read('templates/state-transitions-template.md.tpl');
    const dataModel = read('templates/data-model-template.md.tpl');

    expect(requirementChange).toContain('`## Data Model`, `## Interfaces & Contracts`, or `## Verification / Runbook`');
    expect(requirementChange).not.toContain('`{FEATURE_DIR}/data-model.md`');
    expect(requirementChange).not.toContain('`{FEATURE_DIR}/contracts/*.md`');
    expect(stateTransitions).toContain("owning phase's `## Data Model` section");
    expect(stateTransitions).toContain('New plans MUST NOT generate standalone');
    expect(stateTransitions).not.toContain('When generating a new `state-transitions.md`');
    expect(dataModel).toContain('Legacy migration reference only');
    expect(dataModel).toContain('MUST NOT generate standalone');
    expect(dataModel).not.toContain('separate `state-transitions.md`');
  });

  it('retires standalone checklist routing and capability metadata', () => {
    const routing = read('claude-rules/primary-workflow-routing.md');
    const coreInterface = read('plugins/tdk-core/.claude-plugin/interface.json');

    expect(routing).not.toContain('tdk-checklist');
    expect(coreInterface).not.toContain('checklist');
  });

  it('keeps legacy paths readable without advertising them as new outputs', () => {
    const common = read('scripts/ts/src/utils/common.ts');
    expect(common).toContain('@deprecated Legacy standalone artifact. New research uses conditional research/*.md.');
    expect(common).toContain('@deprecated Legacy standalone artifact. New data models live in owner phases.');
    expect(common).toContain('Conditional directory for declared machine-consumable contracts only.');
  });

  const CONFIG_AUTHORITY_CONSUMERS = [
    ['research phase', 'plugins/tdk-core/skills/tdk-plan/references/research-phase.md'],
    ['design phase', 'plugins/tdk-core/skills/tdk-plan/references/design-phase.md'],
    ['skill routing', 'plugins/tdk-core/skills/tdk-plan/references/delegate-routing-injection.md'],
  ] as const;

  it.each(CONFIG_AUTHORITY_CONSUMERS)(
    'resolves docs.path from the runtime configuration authority `.specify/.specify.json` instead of root `.specify.json` in %s',
    (_label, relativePath) => {
      const content = read(relativePath);
      const bareRootSpecifyJson = /(^|[^/])\.specify\.json/;

      expect(content).toContain('.specify/.specify.json');
      expect(bareRootSpecifyJson.test(content)).toBe(false);
    },
  );
});

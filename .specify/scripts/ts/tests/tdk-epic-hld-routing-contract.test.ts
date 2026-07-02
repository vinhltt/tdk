import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HLD_SKILL_DIR = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-epic-hld',
);
const HLD_SKILL_PATH = resolve(HLD_SKILL_DIR, 'SKILL.md');
const HLD_CONTRACT_PATH = resolve(
  HLD_SKILL_DIR,
  'references/high-level-design-output-contract.md',
);
const HLD_LENSES_PATH = resolve(
  HLD_SKILL_DIR,
  'references/high-level-design-lenses.md',
);
const HLD_ROUTING_PATH = resolve(
  HLD_SKILL_DIR,
  'references/high-level-design-skill-routing.md',
);
const HLD_ROUTING_TEMPLATE_PATH = resolve(
  import.meta.dir,
  '../../../templates/high-level-design/high-level-design-skill-routing-template.tpl',
);
const PLAN_ROUTING_TEMPLATE_PATH = resolve(
  import.meta.dir,
  '../../../templates/plan/plan-skill-routing-template.tpl',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('tdk-epic-hld routing contract', () => {
  const skill = read(HLD_SKILL_PATH);
  const contract = read(HLD_CONTRACT_PATH);
  const planRoutingTemplate = read(PLAN_ROUTING_TEMPLATE_PATH);

  it('loads built-in HLD lenses and the HLD-specific routing reference', () => {
    expect(skill).toContain('references/high-level-design-lenses.md');
    expect(skill).toContain('references/high-level-design-skill-routing.md');
    expect(existsSync(HLD_LENSES_PATH)).toBe(true);
    expect(existsSync(HLD_ROUTING_PATH)).toBe(true);
    expect(existsSync(HLD_ROUTING_TEMPLATE_PATH)).toBe(true);

    const lenses = read(HLD_LENSES_PATH);
    expect(lenses).toContain('C4 / arc42 altitude');
    expect(lenses).toContain('Quality attribute scenarios');
    expect(lenses).toContain('Security posture');
    expect(lenses).toContain('Data lifecycle / API contract');
    expect(lenses).toContain('UX journey / screen-flow');
    expect(lenses).toContain('Operability');
  });

  it('keeps HLD routing separate from plan skill routing', () => {
    expect(skill).toContain('high-level-design-skill-routing.md');
    expect(skill).not.toContain('plan-skill-routing.md');
    expect(contract).not.toContain('plan-skill-routing.md');
    expect(planRoutingTemplate).toContain(
      'Per-project skill mappings for `/tdk-plan` phase generation.',
    );
  });

  it('treats missing HLD routing as non-blocking', () => {
    const routing = read(HLD_ROUTING_PATH);
    expect(routing).toContain(
      '{docs.path}/custom-workflow/high-level-design-skill-routing.md',
    );
    expect(routing).toContain('Missing file behavior: continue with built-in lenses');
    expect(read(HLD_ROUTING_TEMPLATE_PATH)).toContain(
      '{docs.path}/custom-workflow/high-level-design-skill-routing.md',
    );
    expect(skill).toContain('missing HLD routing file is non-blocking');
  });

  it('documents consumer HLD skills as advisory and file-read only', () => {
    const routing = read(HLD_ROUTING_PATH);
    expect(routing).toContain('advisory output only');
    expect(routing).toContain('must not write files');
    expect(routing).toContain('must not create new requirement IDs');
    expect(skill).toContain('Consumer HLD skills are advisory only');
    expect(skill).toContain('Do not create `## Delegate Skills`');
  });

  it('offers task-breakdown handoff after HLD completion', () => {
    expect(skill).toContain('### Step 8 - Recommend Next Step');
    expect(skill).toContain('Use `AskUserQuestion` with header "Next Step"');
    expect(skill).toContain('/tdk-task-breakdown {TASK_ID}` (Recommended)');
    expect(skill).toContain('/tdk-epic-hld {TASK_ID} --force');
  });
});

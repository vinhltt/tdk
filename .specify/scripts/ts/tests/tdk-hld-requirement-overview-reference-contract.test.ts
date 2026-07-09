import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HLD_SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-epic/skills/tdk-epic-hld/SKILL.md',
);
const HLD_CONTRACT_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-epic/skills/tdk-epic-hld/references/high-level-design-output-contract.md',
);
const REQUIREMENT_OVERVIEW_TEMPLATE_PATH = resolve(
  import.meta.dir,
  '../../../templates/high-level-design/requirement-overview.md.tpl',
);
const HLD_MANIFEST_TEMPLATE_PATH = resolve(
  import.meta.dir,
  '../../../templates/high-level-design/high-level-design.md.tpl',
);
const TASK_BREAKDOWN_CONTRACT_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-epic/skills/tdk-task-breakdown/references/task-breakdown-output-contract.md',
);

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

describe('tdk-epic-hld parent epic reference contract', () => {
  const skill = readIfExists(HLD_SKILL_PATH);
  const contract = readIfExists(HLD_CONTRACT_PATH);
  const requirementOverview = readIfExists(REQUIREMENT_OVERVIEW_TEMPLATE_PATH);
  const manifestTemplate = readIfExists(HLD_MANIFEST_TEMPLATE_PATH);
  const taskBreakdownContract = readIfExists(TASK_BREAKDOWN_CONTRACT_PATH);

  it('makes requirement-overview.md epic-source-first instead of PRD restatement', () => {
    expect(requirementOverview).toContain('source-first parent epic design context');
    expect(requirementOverview).toContain('Do NOT restate PRD prose.');
    expect(requirementOverview).toContain(
      'Each note must point back to an epic PRD section, artifact path, or slice key.',
    );
    expect(requirementOverview).toContain('Slice Source Map');
    expect(requirementOverview).not.toContain(
      '{Concise restatement of the problem and the target outcome}',
    );

    expect(contract).toContain(
      'Epic HLD is the parent design stage between `/tdk-epic-prd` and',
    );
  });

  it('keeps the six-file HLD artifact set', () => {
    const allowedFiles = [
      'high-level-design.md',
      'high-level-design/requirement-overview.md',
      'high-level-design/project-and-technical-overview.md',
      'high-level-design/data-flow.md',
      'high-level-design/screen-flow.md',
      'high-level-design/decisions-and-risks.md',
    ];

    for (const file of allowedFiles) {
      expect(contract).toContain(file);
    }

    expect(contract).toContain('Allowed files (exactly these six, no others)');
    expect(contract).toContain('`tasks.md`, `tasks-breakdown/`');
    expect(contract).toContain('legacy layout detected');
    expect(contract).toContain('high-level-design/index.md');
    expect(contract).toContain('do not auto-migrate');
  });

  it('keeps parent HLD tied to epic PRD sources and out of child requirement authority', () => {
    expect(contract).toContain('Valid traceability sources are');
    expect(contract).toContain('slice keys from `epic-prd/slice-map.md`');
    expect(contract).toContain('Do not cite or mint `UR-*`, `FR-*`, `SC-*`, or `FS-*`.');
    expect(skill).toMatch(
      /Child specs are the\s+requirement authority and do not run HLD by default\./,
    );
    expect(skill).toContain(
      'Use epic PRD slice keys and source artifact references for traceability.',
    );
  });

  it('clarifies source-reference mapping in HLD index and contract', () => {
    expect(manifestTemplate).toContain('Breakdown Readiness Map');
    expect(manifestTemplate).toContain('source_epic_prd: "epic-prd.md"');
    expect(contract).toContain(
      'Mapping means source reference and decomposition implication, not copied PRD',
    );
  });

  it('preserves downstream task-breakdown child spec seed authority', () => {
    expect(taskBreakdownContract).toContain(
      'Only child',
    );
    expect(taskBreakdownContract).toContain('`spec.md` artifacts mint formal requirement IDs');
  });
});

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HLD_SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-high-level-design/SKILL.md',
);
const HLD_CONTRACT_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-high-level-design/references/high-level-design-output-contract.md',
);
const REQUIREMENT_OVERVIEW_TEMPLATE_PATH = resolve(
  import.meta.dir,
  '../../../templates/high-level-design/requirement-overview.md.tpl',
);
const HLD_INDEX_TEMPLATE_PATH = resolve(
  import.meta.dir,
  '../../../templates/high-level-design/index.md.tpl',
);
const TASK_BREAKDOWN_CONTRACT_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-task-breakdown/references/task-breakdown-output-contract.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('tdk-high-level-design requirement overview reference contract', () => {
  const skill = read(HLD_SKILL_PATH);
  const contract = read(HLD_CONTRACT_PATH);
  const requirementOverview = read(REQUIREMENT_OVERVIEW_TEMPLATE_PATH);
  const indexTemplate = read(HLD_INDEX_TEMPLATE_PATH);
  const taskBreakdownContract = read(TASK_BREAKDOWN_CONTRACT_PATH);

  it('makes requirement-overview.md reference-first instead of PRD restatement', () => {
    expect(requirementOverview).toContain('reference-first design context');
    expect(requirementOverview).toContain('Do NOT restate PRD prose.');
    expect(requirementOverview).toContain(
      'Each note must point back to a spec section or an existing UR-*/FR-*/SC-* ID.',
    );
    expect(requirementOverview).not.toContain(
      '{Concise restatement of the problem and the target outcome}',
    );

    expect(contract).toContain(
      'reference-first design context, not a PRD restatement',
    );
  });

  it('keeps the six-file HLD artifact set', () => {
    const allowedFiles = [
      'high-level-design/index.md',
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
    expect(contract).toContain('Do not create `tasks.md`');
  });

  it('keeps requirement-derived statements tied to existing spec IDs only', () => {
    expect(contract).toContain('Valid citations are spec requirement identifiers only');
    expect(contract).toContain('UR-*');
    expect(contract).toContain('FR-*');
    expect(contract).toContain('SC-*');
    expect(skill).toContain(
      'HLD enriches existing spec requirements; it does not become a second PRD or requirement source.',
    );
    expect(skill).toContain(
      'If HLD surfaces a genuinely new requirement, record it only as a non-blocking follow-up in `decisions-and-risks.md`.',
    );
  });

  it('clarifies source-reference mapping in HLD index and contract', () => {
    expect(indexTemplate).toContain('Source references, covered IDs, design implications');
    expect(contract).toContain(
      'Mapping means source reference and design implication, not copied PRD prose.',
    );
  });

  it('preserves downstream task-breakdown citation authority', () => {
    expect(taskBreakdownContract).toContain(
      'HLD never becomes a citation source: citations remain `UR-*/FR-*/SC-*` from `spec.md`.',
    );
  });
});

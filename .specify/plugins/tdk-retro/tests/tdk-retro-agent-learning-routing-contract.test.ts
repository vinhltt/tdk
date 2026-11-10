// Contract: retro routes agent learnings through toolset skills and recommendations, never agent files.
// These checks pin wording only; behavior is proven by live acceptance runs.
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SKILLS_DIR = resolve(import.meta.dir, '../skills');
const read = (...segments: string[]): string => {
  const path = resolve(SKILLS_DIR, ...segments);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

const routing = read('_shared/signal-target-routing.md');
const schema = read('_shared/learning-delta-schema.md');
const propose = read('tdk-retro-propose/SKILL.md');
const apply = read('tdk-retro-apply/SKILL.md');
const technicalFlow = read('tdk-retro-apply/references/apply-flow-technical.md');

const section = (text: string, heading: string): string => {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const next = text.indexOf('\n## ', start + heading.length);
  return text.slice(start, next < 0 ? undefined : next);
};

const expectAll = (text: string, phrases: string[]): void => {
  for (const phrase of phrases) expect(text).toContain(phrase);
};

const OMP_HINT = 'OMP projection may be stale; re-run convert-flat from your TDK source checkout';

describe('agent routing rules', () => {
  it('routes behavior lessons to toolset skills and contract changes to the owning recommendation', () => {
    expectAll(section(routing, '## Routing Rules'), [
      '| Routed agent followed the wrong practice | Toolset guidance missing | T4 when the agent\'s toolset skill is a routed test skill, else T6 on that toolset skill |',
      '| Routed agent\'s contract is wrong (tools, skills, model, write set, `Status:` or output contract) | Agent contract stale | T3 on the recommendation that owns the agent |',
      '| Agent-only route (`skills: []`) needs behavior guidance | No toolset skill to carry it | T3 on the recommendation that owns the agent, to add a toolset skill |',
    ]);
  });

  it('never targets agent files, OMP projections, or TDK plugin sources', () => {
    expectAll(section(routing, '## Selection Rules'), [
      'Never target `.claude/agents/*.md`, `.omp/**`, or `.specify/plugins/**`',
      'because scaffold owns the agent contract',
    ]);
  });

  it('defines the owning recommendation and blocks agents nobody owns', () => {
    expectAll(section(routing, '## Selection Rules'), [
      '.specify/configurations/automation-recommendations/sub-workspaces/*/automation-recommendation.md',
      'a legacy recommendation that `/tdk-scaffold-from-recommendation` still accepts',
      'an `agent` row for that name in an `## Executor Decisions` Artifacts table, or list the agent under `## Recommended Agents`',
      '`target_path: .claude/agents/<name>.md`',
      '`blocked_reason: manual: no recommendation owns @<name>; edit .claude/agents/<name>.md by hand or add it to a recommendation`',
      '`blocked_reason: manual: several recommendations own @<name> ({paths}); pick one`',
      '`blocked_reason: manual: /tdk-scaffold-from-recommendation is not installed; edit .claude/agents/<name>.md by hand`',
    ]);
  });

  it('keeps the technical target table at T1 through T6', () => {
    const technical = section(routing, '## Technical Targets');
    const ids = technical.split('\n').filter((line) => /^\| T\d+ \|/.test(line)).map((line) => line.split('|')[1]?.trim());
    expect(ids).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
    expect(routing).not.toContain('T7');
    expect(schema).toContain('- target_id: T1 | T2 | T3 | T4 | T5 | T6 | K1 | K2');
  });
});

describe('manual blocked entries', () => {
  it('defines manual: as a reason only a person can resolve', () => {
    expectAll(schema, [
      'A `blocked_reason` that starts with `manual:` means only a person can resolve it',
      'never moves that entry back to `proposed`',
      'apply never edits its `target_path`',
    ]);
  });

  it('keeps manual: entries blocked on a propose re-run', () => {
    expectAll(section(propose, '## Step 6: Write learning-delta.md'), [
      'A `blocked_reason` that starts with `manual:` always stays `blocked`',
    ]);
  });
});

describe('tdk-retro-propose agent signals', () => {
  it('resolves the agent and its toolset skills before classifying', () => {
    expectAll(section(propose, '## Step 5: Classify Signals'), [
      '`## Delegate Agents`',
      '`agents[]` that Step 3 resolved',
      'Read the `skills:` frontmatter of `.claude/agents/<name>.md`',
    ]);
  });

  it('documents the indirect path from retro to an agent patch', () => {
    expectAll(section(propose, '## Step 5: Classify Signals'), [
      'Retro never edits an agent file',
      'A behavior lesson lands in the agent\'s toolset skill (T4 or T6)',
      'lands in the recommendation that owns the agent (T3)',
      '`/tdk-scaffold-from-recommendation` on the same recommendation proposes the agent patch in its drift review',
    ]);
  });
});

describe('OMP projection hint', () => {
  it('flags an applied target whose OMP twin exists, without a path or a command run', () => {
    expectAll(technicalFlow, [
      'the twin is the directory `.omp/skills/<name>/`',
      '`.omp/agents/<name>.md`',
      `\`${OMP_HINT}\``,
      'Print no path with it and never run convert-flat',
    ]);
    expect(technicalFlow).not.toContain('omp.json');
  });

  it('reports the hint once per run', () => {
    expectAll(section(apply, '## Step 7: Report'), [`\`${OMP_HINT}\``, 'printed once per run', 'never repeated']);
  });
});

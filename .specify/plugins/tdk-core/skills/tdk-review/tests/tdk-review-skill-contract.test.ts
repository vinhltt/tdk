import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Behavior-defining clauses only: what the skill promises not to do and which helpers it must go through.
// No wording pins. Each assertion names a contract a consumer or another skill depends on.

const SKILL_DIR = resolve(import.meta.dir, '..');
const read = (relative: string): string => readFileSync(join(SKILL_DIR, relative), 'utf-8');
const SKILL = read('SKILL.md');
const ORCHESTRATION = read('references/review-orchestration.md');
const REPORT = read('references/report-contract.md');
const ALL = `${SKILL}\n${ORCHESTRATION}\n${REPORT}`;
const AGENT = readFileSync(resolve(SKILL_DIR, '../../../tdk-utils/agents/tdk-code-reviewer.md'), 'utf-8');

describe('tdk-review skill contract', () => {
  it('is a user-invocable skill with the documented argument shape', () => {
    expect(SKILL).toMatch(/^user-invocable: true$/m);
    expect(SKILL).toMatch(/^argument-hint: ".*<task-id>.*\[--phase NN\].*\[--quick\|--deep\]/m);
  });

  it('rejects conflicting or malformed flags before reading anything', () => {
    const parse = SKILL.slice(SKILL.indexOf('## Step 1'), SKILL.indexOf('## Step 2'));
    for (const clause of ['unknown flag', 'repeated flag', '--quick', '--deep', '--phase']) expect(parse).toContain(clause);
    expect(parse).toContain('STOP');
    // Step 1 must come before the task and project reads.
    expect(SKILL.indexOf('## Step 1')).toBeLessThan(SKILL.indexOf('tdk-validate-task-id'));
  });

  it('writes the report only through the bundled helper, never directly', () => {
    expect(ALL).toContain('scripts/review-write-report.js');
    expect(REPORT).toMatch(/never writes the report any other way|never write the report any other way/i);
    // No instruction to create the report with a general file tool or shell redirection.
    expect(ALL).not.toMatch(/\bcat\s*>|\btee\b|Write tool|echo\s+.*>\s*\S+\.md/);
  });

  it('gets scope from the bundled scope helper, not from restated git rules', () => {
    expect(ORCHESTRATION).toContain('scripts/review-scope.js');
    expect(ORCHESTRATION).toMatch(/Never restate or re-derive/);
    expect(ORCHESTRATION).not.toMatch(/git diff HEAD|git merge-base|git ls-files/);
  });

  it('spawns no subagents in quick mode and the documented counts otherwise', () => {
    const table = ORCHESTRATION.slice(ORCHESTRATION.indexOf('## 5. Dispatch by mode'), ORCHESTRATION.indexOf('### Budget'));
    expect(table).toMatch(/`--quick`[^\n]*\|\s*0\s*\|/);
    expect(table).toMatch(/standard[^\n]*\|\s*2 \+ routed\s*\|/);
    expect(table).toMatch(/`--deep`[^\n]*\|\s*4 \+ routed\s*\|/);
  });

  it('keeps the review domain read-only and never mutates routing, plans, or status', () => {
    expect(SKILL).toMatch(/never edits code, plan files, phase status, git refs, or tests/);
    expect(ORCHESTRATION).toMatch(/never registers, edits, or injects routes/);
  });

  it('skips a reviewer that fails readiness with a reason code instead of running it in the main session', () => {
    expect(ORCHESTRATION).toMatch(/Never fall back to running it in the main session/);
    for (const code of ['agent-not-found', 'skill-not-found', 'no-loader', 'unverified']) expect(ORCHESTRATION).toContain(code);
  });

  it('turns an empty scope into a blocked report and never into a pass', () => {
    expect(ORCHESTRATION).toContain('empty_scope');
    expect(REPORT).toContain('empty_scope');
    expect(ORCHESTRATION).toMatch(/\|\s*`blocked`\s*\|[^\n]*empty scope/);
  });

  it('stops on a same-second collision and never retries', () => {
    expect(SKILL).toMatch(/collision_exists/);
    expect(REPORT).toMatch(/\|\s*`collision_exists`[^\n]*Never retry/);
  });

  it('requires fix-phase seeds that /tdk-plan can take as USER_CONTENT', () => {
    expect(REPORT).toContain('Proposed Fix Phases');
    expect(REPORT).toMatch(/\/tdk-plan <task-id> "<description>"/);
    expect(REPORT).toMatch(/MUST NOT contain any `--` token/);
  });

  it('keeps a seed description free of `--`, which /tdk-plan would parse as a flag, and states the helper redacts', () => {
    expect(REPORT).toMatch(/MUST NOT contain any `--` token/);
    expect(REPORT).toMatch(/runs the report through the shared sanitizer/);
    expect(REPORT).not.toMatch(/do not build a second sanitizer[^\n]*Replace any secret/);
  });

  it('caps subagents per run and tells the user to narrow with --phase', () => {
    expect(ORCHESTRATION).toMatch(/8 subagents per run/);
    expect(ORCHESTRATION).toMatch(/suggest `--phase NN`/);
  });
});

describe('tdk-review wiring', () => {
  it('ships every file the skill references', () => {
    for (const path of ['references/review-orchestration.md', 'references/report-contract.md', 'scripts/review-scope.js', 'scripts/review-write-report.js']) {
      expect({ path, exists: existsSync(join(SKILL_DIR, path)) }).toEqual({ path, exists: true });
    }
  });

  it('uses only the lens and finding fields the reviewer agent actually defines', () => {
    for (const lens of ['spec', 'quality', 'security', 'reliability']) {
      expect(AGENT).toContain(`### \`${lens}\``);
      expect(ORCHESTRATION).toContain(`LENS=${lens}`);
    }
    for (const status of ['implemented', 'partial', 'missing', 'extra']) {
      expect(AGENT).toContain(status);
      expect(REPORT).toContain(status);
    }
  });

  it('is registered as a caller of the shared task-id and project-context skills', () => {
    const utils = resolve(SKILL_DIR, '../../../tdk-utils/skills');
    for (const skill of ['tdk-validate-task-id', 'tdk-load-project-context']) {
      expect(readFileSync(join(utils, skill, 'SKILL.md'), 'utf-8')).toMatch(/Called by:[^"]*tdk-review/);
    }
  });

  it('has no stray files in the skill dir besides the documented layout', () => {
    expect(readdirSync(SKILL_DIR).filter((entry) => entry !== 'node_modules').sort()).toEqual(['SKILL.md', 'references', 'scripts', 'tests']);
  });
});

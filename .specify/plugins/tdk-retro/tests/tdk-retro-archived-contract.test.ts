// Contract: the three retro skills resolve archived specs and name them by canonical task id.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SKILLS_DIR = resolve(import.meta.dir, '../skills');
const read = (...segments: string[]): string => readFileSync(resolve(SKILLS_DIR, ...segments), 'utf8');

const SKILLS = {
  'tdk-retro-collect': {
    text: read('tdk-retro-collect/SKILL.md'),
    command: 'src/commands/util/check-prerequisites.ts {task_id} --json --allow-archived',
  },
  'tdk-retro-propose': {
    text: read('tdk-retro-propose/SKILL.md'),
    command: 'src/commands/util/check-prerequisites.ts {task_id} --paths-only --json --allow-archived',
  },
  'tdk-retro-apply': {
    text: read('tdk-retro-apply/SKILL.md'),
    command: 'src/commands/util/check-prerequisites.ts {task_id} --paths-only --json --allow-archived',
  },
} as const;

const shared = read('_shared/archived-spec-handling.md');

describe('retro skills on archived specs', () => {
  for (const [name, { text, command }] of Object.entries(SKILLS)) {
    describe(name, () => {
      it('resolves through check-prerequisites with --allow-archived', () => {
        expect(text).toContain(`(cd "$PROJECT_DIR/.specify/scripts/ts" && bun ${command})`);
      });

      it('never calls check-prerequisites without --allow-archived', () => {
        const calls = text.split('\n').filter((line) => line.includes('check-prerequisites.ts'));
        expect(calls.length).toBeGreaterThan(0);
        for (const line of calls) expect(line).toContain('--allow-archived');
      });

      it('takes the task id from the JSON taskId, not the raw argument', () => {
        expect(text).toContain('`TASK_ID` (the JSON `taskId`)');
        expect(text).toContain('never the raw argument');
        expect(text).toContain('../_shared/archived-spec-handling.md');
      });

      it('keeps the prompt-level example fixture fallback', () => {
        expect(text).toContain('Fixture fallback:');
        expect(text).toContain('.specify/examples/specs/{raw argument}/');
        expect(text).toContain('the raw argument as `TASK_ID`');
      });
    });
  }

  it('limits archived writes to the retro outputs', () => {
    expect(SKILLS['tdk-retro-collect'].text).toContain('When `ARCHIVED` is `true`, write only `retro-feedback.md`');
    expect(SKILLS['tdk-retro-propose'].text).toContain('When `ARCHIVED` is `true`, write only `learning-delta.md`');
    expect(SKILLS['tdk-retro-apply'].text).toContain('the only file written inside the feature directory is `learning-delta.md`');
    expect(shared).toContain('`{FEATURE_DIR}/retro-feedback.md` (collect)');
    expect(shared).toContain('`{FEATURE_DIR}/learning-delta.md` (propose, apply status updates)');
  });

  it('names headings, delegated memory text, next command and commit message by canonical id', () => {
    expect(shared).toContain('`# Retro Feedback - {task-id}` and `# Learning Delta - {task-id}`');
    expect(shared).toContain('the natural-language text delegated to `/tdk-memory-update`');
    expect(shared).toContain('`Next command` line');
    expect(shared).toContain('the suggested commit message');
    expect(shared).toContain('never contains an `archive/` segment');
    expect(SKILLS['tdk-retro-collect'].text).toContain('Next command: `/tdk-retro-propose {TASK_ID}`');
    expect(SKILLS['tdk-retro-propose'].text).toContain('Next command: `/tdk-retro-apply {TASK_ID}`');
    expect(SKILLS['tdk-retro-apply'].text).toContain('apply learnings from {TASK_ID}');
    for (const schema of ['retro-feedback-schema.md', 'learning-delta-schema.md']) {
      expect(read('_shared', schema)).toContain('canonical `taskId`');
    }
  });

  it('asks before re-collecting a completed retro, using the status script', () => {
    const collect = SKILLS['tdk-retro-collect'].text;
    expect(collect).toContain('### Re-collect guard');
    expect(collect).toContain('When `retro_status` is `done`');
    expect(collect).toContain('Collect again');
    expect(shared).toContain('src/commands/feature/status.ts "$STATUS_ID"');
    expect(shared).toContain('STATUS_ID="archive/{TASK_ID}"');
    expect(shared).toContain('`retro_status`');
  });
});

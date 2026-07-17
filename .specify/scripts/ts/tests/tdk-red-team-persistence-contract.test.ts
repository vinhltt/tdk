import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('red-team persistence contract', () => {
  it('keeps recovery state in temp until final evidence commits', () => {
    const workflow = read('plugins/tdk-core/skills/tdk-plan/references/red-team-workflow.md');
    expect(workflow).toContain('`.tdk-tmp/red-team/{timestamp}/apply-log.json`');
    expect(workflow).toContain('`.tdk-tmp/red-team/*/` session directory');
    expect(workflow).toContain('`status != "committed"`');
    expect(workflow).toContain('`status` → `finalizing`');
    expect(workflow).toContain('reply-only session');
    expect(workflow).toContain('`finalizing`: do not reapply markers');
    expect(workflow).toContain('exact evidence payload stored');
    expect(workflow).toContain('exists with different bytes, STOP');
    expect(workflow.indexOf('`status` → `finalizing`')).toBeLessThan(
      workflow.indexOf('`status` → `committed`'),
    );
    expect(workflow).toContain('Only after both final writes succeed, flip top-level');
    expect(workflow).toContain('`.tdk-tmp/red-team/{timestamp}/reply.txt`');
  });

  it('keeps one timestamped final report and deferred evidence only when unresolved', () => {
    const workflow = read('plugins/tdk-core/skills/tdk-plan/references/red-team-workflow.md');
    expect(workflow).toContain('`reports/red-team-{yyMMdd-HHmmss}-{mode}.md`');
    expect(workflow).toContain('Only unresolved deferred findings');
    expect(workflow).toContain('Do not keep separate raw persona transcripts');
  });

  it('keeps validation inline and routes retro to final evidence only', () => {
    const validation = read('plugins/tdk-core/skills/tdk-plan/references/validate-workflow.md');
    const retro = read('plugins/tdk-retro/skills/tdk-retro-collect/SKILL.md');
    expect(validation).toContain('Do not create `reports/validate-*.md`');
    expect(retro).toContain('{FEATURE_DIR}/reports/red-team-yyMMdd-HHmmss-*.md');
    expect(retro).toContain('Never read `{FEATURE_DIR}/.tdk-tmp/red-team/**`');
  });
});

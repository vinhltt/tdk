import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('tdk-plan artifact migration contract', () => {
  it('exposes an action-only migration flag', () => {
    const skill = read('plugins/tdk-core/skills/tdk-plan/SKILL.md');
    const modes = read('plugins/tdk-core/skills/tdk-plan/references/modes.md');
    expect(skill).toContain('`--migrate-artifacts` is combined with any speed, test, targeting');
    expect(skill).toContain('Step 0.migrate — Opt-in Legacy Artifact Migration');
    expect(modes).toContain('`--migrate-artifacts` is action-only');
    expect(modes).toContain('defaults to a mutation-free dry run');
  });

  it('requires dry-run review, explicit confirmation, and recoverable transactions', () => {
    const workflow = read('plugins/tdk-core/skills/tdk-plan/references/migrate-artifacts-workflow.md');
    expect(workflow).toContain('migrate-plan-artifacts.ts "$FEATURE_DIR" --json');
    expect(workflow).toContain('--apply --yes --json');
    expect(workflow).toContain('--resume <manifest> --yes --json');
    expect(workflow).toContain('--rollback <manifest> --json');
    expect(workflow).toContain('Rollback refuses to overwrite any file edited after');
    expect(workflow).toContain('Migration never fabricates that gate');
  });

  it('persists recovery hashes before mutation and validates before deletion', () => {
    const transaction = read('scripts/ts/src/commands/util/artifact-migration-transaction.ts');
    const preparedHash = transaction.indexOf('appliedHash = hashContent(markdown)');
    const firstWrite = transaction.indexOf("atomicReplaceTextFile(path, markdown, stagedPath");
    const statusValidation = transaction.indexOf("throw new Error('Plan phase statuses changed during artifact migration')");
    const deletion = transaction.indexOf('rmSync(operation.sourcePath)');

    expect(preparedHash).toBeGreaterThan(-1);
    expect(preparedHash).toBeLessThan(firstWrite);
    expect(transaction).not.toContain('writeFileSync(path, markdown)');
    expect(transaction).toContain('atomicReplaceTextFile(path, `${JSON.stringify(manifest, null, 2)}\\n`');
    expect(transaction).toContain('atomicReplaceTextFile(record.path, readFileSync(record.backupPath');
    expect(statusValidation).toBeGreaterThan(-1);
    expect(statusValidation).toBeLessThan(deletion);
  });
});

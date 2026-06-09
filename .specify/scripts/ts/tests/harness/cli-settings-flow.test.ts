import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeConsumer, writePrefixedSkillPlugin } from './fixtures';

const cliPath = path.resolve('src/index.ts');

function runInstall(consumer: ReturnType<typeof makeConsumer>, args: string[]) {
  return Bun.spawnSync({
    cmd: ['bun', cliPath, 'harness', 'install', ...args],
    cwd: consumer.scriptsDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

describe('harness install CLI settings flow', () => {
  test('first non-TTY install persists custom prefix and transformed target', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);

    const result = runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core', '--prefix', 'pav', '--yes']);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(consumer.root, '.claude', 'skills', 'pav-demo', 'SKILL.md'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(consumer.root, '.specify', 'install-settings.json'), 'utf-8')).defaults.targetPrefix).toBe('pav-');
  });

  test('existing settings allow non-TTY reuse without plugin selector', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);
    expect(runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core', '--yes']).exitCode).toBe(0);

    const result = runInstall(consumer, ['--harness', 'claude', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Harness install plan: tdk-core');
  });

  test('rejects non-Claude harness values while preserving comma-list parsing', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);

    const result = runInstall(consumer, ['--harness', 'claude,codex', '--plugins', 'tdk-core', '--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('not implemented yet');
  });

  test('blocks existing prefix changes unless explicit migration flag is used', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);
    expect(runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core', '--prefix', 'pav', '--yes']).exitCode).toBe(0);

    const blocked = runInstall(consumer, ['--harness', 'claude', '--prefix', 'ck', '--dry-run']);
    const migration = runInstall(consumer, ['--harness', 'claude', '--migrate-prefix', 'ck', '--dry-run']);

    expect(blocked.exitCode).toBe(1);
    expect(blocked.stderr.toString()).toContain('--migrate-prefix');
    expect(migration.exitCode).toBe(0);
    expect(migration.stdout.toString()).toContain('Prefix migration: pav- -> ck-');
    expect(migration.stdout.toString()).toContain('create: .claude/skills/ck-demo/SKILL.md');
    expect(migration.stdout.toString()).toContain('remove: .claude/skills/pav-demo/SKILL.md');
  });
});

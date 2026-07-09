import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeConsumer, sha256, writeMultiPluginManifest, writePluginFile, writePrefixedSkillPlugin } from './fixtures';

const cliPath = path.resolve('src/index.ts');

function runInstall(consumer: ReturnType<typeof makeConsumer>, args: string[]) {
  return Bun.spawnSync({
    cmd: ['bun', cliPath, 'install', ...args],
    cwd: consumer.scriptsDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function addUtilsPlugin(consumer: ReturnType<typeof makeConsumer>): void {
  const coreSkill = '# tdk-demo\nUse tdk-demo from command text.\n';
  const utilsSkill = '# tdk-validate-task-id\n';

  writePluginFile(consumer, 'skills/tdk-validate-task-id/SKILL.md', utilsSkill, 'tdk-utils');
  writeMultiPluginManifest(consumer, {
    'tdk-core': {
      version: '1.0.0',
      files: { 'skills/tdk-demo/SKILL.md': sha256(coreSkill) },
    },
    'tdk-utils': {
      version: '1.0.0',
      files: { 'skills/tdk-validate-task-id/SKILL.md': sha256(utilsSkill) },
    },
  });
}

describe('harness install CLI settings flow', () => {
  test('first non-TTY install persists custom prefix and transformed target', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);
    addUtilsPlugin(consumer);

    const result = runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core,tdk-utils', '--prefix', 'sample', '--yes']);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(consumer.root, '.claude', 'skills', 'sample-demo', 'SKILL.md'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(consumer.root, '.specify', 'install-settings.json'), 'utf-8')).defaults.targetPrefix).toBe('sample-');
  });

  test('existing settings allow non-TTY reuse without plugin selector', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);
    addUtilsPlugin(consumer);
    expect(runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core,tdk-utils', '--yes']).exitCode).toBe(0);

    const result = runInstall(consumer, ['--harness', 'claude', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Harness install plan: tdk-core');
  });

  test('claude,codex rejects combined harness installs for v1', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);

    const result = runInstall(consumer, ['--harness', 'claude,codex', '--plugins', 'tdk-core', '--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('Combined Claude+Codex installs are not supported');
    expect(result.stdout.toString()).not.toContain('Harness install plan');
  });

  test('blocks existing prefix changes unless explicit migration flag is used', () => {
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);
    addUtilsPlugin(consumer);
    expect(runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core,tdk-utils', '--prefix', 'sample', '--yes']).exitCode).toBe(0);

    const blocked = runInstall(consumer, ['--harness', 'claude', '--prefix', 'ck', '--dry-run']);
    const migration = runInstall(consumer, ['--harness', 'claude', '--migrate-prefix', 'ck', '--dry-run']);

    expect(blocked.exitCode).toBe(1);
    expect(blocked.stderr.toString()).toContain('--migrate-prefix');
    expect(migration.exitCode).toBe(0);
    expect(migration.stdout.toString()).toContain('Prefix migration: sample- -> ck-');
    expect(migration.stdout.toString()).toContain('create: .claude/skills/ck-demo/SKILL.md');
    expect(migration.stdout.toString()).toContain('remove: .claude/skills/sample-demo/SKILL.md');
  });
});

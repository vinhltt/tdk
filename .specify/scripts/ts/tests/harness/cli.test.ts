import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeConsumer, writeBasicPlugin } from './fixtures';

const cliPath = path.resolve('src/index.ts');

describe('harness install CLI', () => {
  test('dry-run lists planned writes without mutation', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--harness', 'claude', '--plugins', 'tdk-core', '--dry-run'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Harness install plan');
    expect(result.stdout.toString()).toContain('.claude/skills/demo/SKILL.md');
  });

  test('non-TTY without selector fails with guidance', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--harness', 'claude', '--dry-run'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('No plugin selector provided');
  });

  test('dry-run reports overwrite prompts without blocker exit', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const target = path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'user content', 'utf-8');

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--harness', 'claude', '--plugins', 'tdk-core', '--dry-run'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('Prompts:');
    expect(result.stdout.toString()).toContain('overwrite: .claude/skills/demo/SKILL.md');
    expect(result.stdout.toString()).not.toContain('Blockers:');
  });
});

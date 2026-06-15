import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { makeConsumer, writeBasicPlugin } from './fixtures';

const cliPath = path.resolve('src/index.ts');

describe('harness install --harness interactive/optional behaviour', () => {
  test('omitted --harness in non-TTY exits 1 with guidance message', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--dry-run'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('No harness provided. Use --harness claude.');
  });

  test('--harness codex only: enters install pipeline and requires plugin selector', () => {
    const consumer = makeConsumer();

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--harness', 'codex'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('No plugin selector provided');
    expect(result.stdout.toString()).not.toContain('Harness install plan');
  });

  test('--harness claude,codex with consumer: rejects combined harness installs for v1', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const result = Bun.spawnSync({
      cmd: ['bun', cliPath, 'harness', 'install', '--harness', 'claude,codex', '--plugins', 'tdk-core', '--dry-run'],
      cwd: consumer.scriptsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('Combined Claude+Codex installs are not supported');
    expect(result.stdout.toString()).not.toContain('Harness install plan');
  });
});

/**
 * Picker seam tests for the omitted --harness path in `harness install`.
 *
 * `resolveHarnessOption` (private to install.ts) calls `canUseCheckboxPrompt` then either
 * invokes `selectHarnessInteractively` or throws. These tests use `mock.module` to stub both
 * functions at their import boundary so we can drive the interactive branch deterministically
 * from a non-TTY process without raw-mode or keystroke simulation.
 *
 * The discriminating observable for each picker scenario is whether `resolveConsumerRoot` was
 * reached after interactive harness selection.
 */

import { mock, spyOn, expect, test, describe } from 'bun:test';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import type { Command } from 'commander';

// Absolute path to the harness source directory — mock.module requires absolute keys.
const harnessPath = path.resolve('src/commands/harness');

// Mutable scenario state shared across all tests in this file.
// mock.module registrations are file-scoped and cannot be reset between tests, so we use
// mutable captures that the stubs delegate to instead of re-registering.
let pickerResult: string[] = ['codex'];
let pickerCalled = false;
let resolveConsumerRootCalled = false;
let consumerRoot = os.tmpdir();

// Register all stubs before any import so that when install.ts is loaded its bindings
// point at these mocked modules.
await mock.module(`${harnessPath}/checkbox-prompt`, () => ({
  canUseCheckboxPrompt: () => true, // simulate a checkbox-capable terminal
}));

await mock.module(`${harnessPath}/prompt`, () => ({
  selectHarnessInteractively: async () => { pickerCalled = true; return pickerResult; },
  // Remaining prompt exports left as no-op stubs; they are not reached in these scenarios.
  selectPluginsInteractively: async () => [],
  confirmOverwrite: async () => false,
  askPrefixInteractively: async (d: string) => d,
  confirmInstallTarget: async () => false,
}));

await mock.module(`${harnessPath}/root-resolution`, () => ({
  resolveConsumerRoot: (_cwd: string) => {
    resolveConsumerRootCalled = true;
    return { consumerRoot, warnings: [] };
  },
}));

// Import install.ts after stubs are in place so bindings resolve to mocked modules.
const { createHarnessInstallCommand } = await import(`${harnessPath}/install`);

// Helper: suppress process.stderr / process.stdout and optionally stub process.exit
function suppressOutput() {
  const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
  const stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
  return () => { stderrSpy.mockRestore(); stdoutSpy.mockRestore(); };
}

function forceStdinTTY(value: boolean): () => void {
  const previous = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value });
  return () => {
    if (previous) {
      Object.defineProperty(process.stdin, 'isTTY', previous);
    } else {
      delete (process.stdin as NodeJS.ReadStream & { isTTY?: boolean }).isTTY;
    }
  };
}

describe('harness install picker seam (mocked checkbox-capable terminal)', () => {
  test('omitted --harness + capable checkbox → picker IS called; codex proceeds into install pipeline', async () => {
    pickerResult = ['codex'];
    pickerCalled = false;
    resolveConsumerRootCalled = false;

    const restore = suppressOutput();
    const exitSpy = spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit-stub'); }) as never);
    const cmd = createHarnessInstallCommand() as Command;
    try {
      await cmd.parseAsync([], { from: 'user' });
    } catch (_) {
      // Expected: no plugin selector was provided in this seam test.
    } finally {
      restore();
      exitSpy.mockRestore();
    }

    // Picker was exercised (the checkbox-capable branch of resolveHarnessOption ran).
    expect(pickerCalled).toBe(true);
    expect(resolveConsumerRootCalled).toBe(true);
  });

  test('omitted --harness + capable checkbox + picker returns codex → no coming-soon shortcut remains', async () => {
    pickerResult = ['codex'];

    const stderrChunks: string[] = [];
    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
    const stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exitSpy = spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit-stub'); }) as never);
    const restoreStdinTTY = forceStdinTTY(false);

    const cmd = createHarnessInstallCommand() as Command;
    try {
      await cmd.parseAsync([], { from: 'user' });
    } catch (_) {
      // Expected: no plugin selector was provided in this seam test.
    } finally {
      restoreStdinTTY();
      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
      exitSpy.mockRestore();
    }

    expect(stderrChunks.join('')).not.toContain('Codex harness: coming soon');
    expect(stderrChunks.join('')).toContain('No plugin selector provided');
  });

  test('omitted --harness + capable checkbox + picker returns claude → resolveConsumerRoot IS called', async () => {
    // Set up a minimal consumer fixture so the pipeline can proceed past resolveConsumerRoot
    consumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-picker-claude-'));
    fs.mkdirSync(path.join(consumerRoot, '.specify', 'plugins', 'tdk-core'), { recursive: true });
    fs.mkdirSync(path.join(consumerRoot, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(consumerRoot, '.specify', 'scripts', 'ts'), { recursive: true });

    pickerResult = ['claude'];
    resolveConsumerRootCalled = false;

    const restore = suppressOutput();
    // Stub process.exit so an install error (e.g. missing manifest) doesn't kill the runner
    const exitSpy = spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit-stub'); }) as never);

    try {
      const cmd = createHarnessInstallCommand() as Command;
      await cmd.parseAsync(['--dry-run', '--plugins', 'tdk-core'], { from: 'user' });
    } catch (_) {
      // Expected: process.exit stub throws, or install fails due to missing manifest in fixture
    } finally {
      restore();
      exitSpy.mockRestore();
    }

    // The discriminator: resolveConsumerRoot was reached, meaning the claude branch of the
    // install pipeline was entered (not the codex-only short-circuit).
    expect(resolveConsumerRootCalled).toBe(true);
  });
});

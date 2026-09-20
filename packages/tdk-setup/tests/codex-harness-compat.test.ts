import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  checkCodexHarnessCompat,
  probeCodexHarnessSupport,
  readInstalledHarnessPayload,
} from '../src/codex-harness-compat';

const COMPATIBLE_LIB = `
function loadPayloadHarness(rawPayload, harness = process.env.TDK_HARNESS || 'claude', context) {
  switch (harness) {
    case 'claude':
      return loadPayloadClaudeCodeHarness(rawPayload);
    case 'omp':
      return loadPayloadOmpHarness(rawPayload, context);
    case 'codex':
      return loadPayloadCodexHarness(rawPayload);
    default:
      throw new Error('Unsupported harness');
  }
}
`;

const OLD_LIB = `
function loadPayloadHarness(rawPayload, harness = process.env.TDK_HARNESS || 'claude', context) {
  switch (harness) {
    case 'claude':
      return loadPayloadClaudeCodeHarness(rawPayload);
    case 'omp':
      return loadPayloadOmpHarness(rawPayload, context);
    default:
      throw new Error('Unsupported harness');
  }
}
`;

const LOADER_HOOK = { path: 'hooks/dev-context-injector.cjs', content: "require('../lib/harness-payload.cjs');" };
const PLAIN_HOOK = { path: 'hooks/echo.cjs', content: 'process.stdin.pipe(process.stdout);' };

describe('codex harness compatibility preflight', () => {
  test('T35 a lib with a codex dispatch is compatible', () => {
    expect(probeCodexHarnessSupport(COMPATIBLE_LIB)).toEqual({ compatible: true });
    expect(probeCodexHarnessSupport(Buffer.from(COMPATIBLE_LIB))).toEqual({ compatible: true });
    expect(checkCodexHarnessCompat({
      hookSources: [LOADER_HOOK],
      harnessPayload: COMPATIBLE_LIB,
      harnessPayloadPath: 'lib/harness-payload.cjs',
    })).toEqual({ compatible: true });
  });

  test('T36 a lib without a codex dispatch is rejected with its own reason', () => {
    const result = probeCodexHarnessSupport(OLD_LIB, '.claude/hooks/lib/harness-payload.cjs');
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('no-codex-dispatch');
    expect(result.message).toContain('.claude/hooks/lib/harness-payload.cjs');
    expect(result.message).toContain('destructive-command block');
  });

  test('T37 an absent lib is rejected with a distinct reason', () => {
    const result = probeCodexHarnessSupport(null, '.claude/hooks/lib/harness-payload.cjs');
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('missing-harness-payload');
    expect(result.message).toContain('not found');
    expect(result.reason).not.toBe(probeCodexHarnessSupport(OLD_LIB).reason);
  });

  test('hooks that never load the payload contract are unaffected by the codex label', () => {
    expect(checkCodexHarnessCompat({
      hookSources: [PLAIN_HOOK],
      harnessPayload: null,
      harnessPayloadPath: 'lib/harness-payload.cjs',
    })).toEqual({ compatible: true });

    expect(checkCodexHarnessCompat({
      hookSources: [PLAIN_HOOK, LOADER_HOOK],
      harnessPayload: OLD_LIB,
      harnessPayloadPath: 'lib/harness-payload.cjs',
    }).compatible).toBe(false);
  });

  test('a repackaged old lib does not pass on version metadata alone', () => {
    const repackaged = `${OLD_LIB}\nmodule.exports.version = '99.0.0';\nmodule.exports.harnesses = ['claude','omp','codex'];\n`;
    expect(probeCodexHarnessSupport(repackaged).compatible).toBe(false);
  });

  test('readInstalledHarnessPayload returns null for an absent file and bytes otherwise', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-compat-'));
    expect(readInstalledHarnessPayload(dir)).toBeNull();

    fs.writeFileSync(path.join(dir, 'harness-payload.cjs'), COMPATIBLE_LIB, 'utf-8');
    expect(probeCodexHarnessSupport(readInstalledHarnessPayload(dir))).toEqual({ compatible: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

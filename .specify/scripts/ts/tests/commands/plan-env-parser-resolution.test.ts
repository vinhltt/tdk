// Tests for layout-safe parser-script resolution in plan-env.ts.
// Uses subprocess spawn so getRepoRoot() returns CLAUDE_PROJECT_DIR (the temp dir fixture).

import { describe, it, expect, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CLI = join(import.meta.dir, '../../src/commands/test-api/plan-env.ts');

let tmpDir: string;

function makeRoot(): string {
  tmpDir = mkdtempSync(join(tmpdir(), 'plan-env-test-'));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

async function runCli(
  root: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', CLI, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: root, // prevents findConfigFile() from walking up into the real monorepo
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

function writeParserAt(root: string, relPath: string): void {
  const full = join(root, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, '#!/usr/bin/env python3\nprint("ok")\n', 'utf-8');
}

function endsWithHostPath(actual: string, relativePath: string): boolean {
  return actual.endsWith(join(...relativePath.split('/')));
}

describe('plan-env parser-script layout resolution', () => {
  it('candidate 1 (monorepo source) is picked when only that exists', async () => {
    const root = makeRoot();
    const candidate1 = '.specify/plugins/tdk-test-api/skills/tdk-test-api-plan/scripts/parse_openapi_spec.py';
    writeParserAt(root, candidate1);

    const { exitCode, stdout } = await runCli(root, ['feat/aa-001']);

    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout) as Record<string, unknown>;
    expect(json.HAS_PARSER).toBe(true);
    expect(endsWithHostPath(json.PARSER_SCRIPT as string, candidate1)).toBe(true);
  });

  it('candidate 2 (installed consumer) is picked when only that exists', async () => {
    const root = makeRoot();
    const candidate2 = '.claude/skills/tdk-test-api-plan/scripts/parse_openapi_spec.py';
    writeParserAt(root, candidate2);

    const { exitCode, stdout } = await runCli(root, ['feat/aa-001']);

    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout) as Record<string, unknown>;
    expect(json.HAS_PARSER).toBe(true);
    expect(endsWithHostPath(json.PARSER_SCRIPT as string, candidate2)).toBe(true);
  });

  it('installed custom-prefix parser is picked when only that exists', async () => {
    const root = makeRoot();
    const customCandidate = '.claude/skills/sample-test-api-plan/scripts/parse_openapi_spec.py';
    writeParserAt(root, customCandidate);

    const { exitCode, stdout } = await runCli(root, ['feat/aa-001']);

    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout) as Record<string, unknown>;
    expect(json.HAS_PARSER).toBe(true);
    expect(endsWithHostPath(json.PARSER_SCRIPT as string, customCandidate)).toBe(true);
  });

  it('multiple installed custom-prefix parsers are picked deterministically', async () => {
    const root = makeRoot();
    const candidateA = '.claude/skills/alpha-test-api-plan/scripts/parse_openapi_spec.py';
    const candidateB = '.claude/skills/zeta-test-api-plan/scripts/parse_openapi_spec.py';
    writeParserAt(root, candidateB);
    writeParserAt(root, candidateA);

    const { exitCode, stdout } = await runCli(root, ['feat/aa-001']);

    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout) as Record<string, unknown>;
    expect(json.HAS_PARSER).toBe(true);
    expect(endsWithHostPath(json.PARSER_SCRIPT as string, candidateA)).toBe(true);
  });

  it('candidate 1 wins when both exist', async () => {
    const root = makeRoot();
    const candidate1 = '.specify/plugins/tdk-test-api/skills/tdk-test-api-plan/scripts/parse_openapi_spec.py';
    const candidate2 = '.claude/skills/tdk-test-api-plan/scripts/parse_openapi_spec.py';
    writeParserAt(root, candidate1);
    writeParserAt(root, candidate2);

    const { exitCode, stdout } = await runCli(root, ['feat/aa-001']);

    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout) as Record<string, unknown>;
    expect(json.HAS_PARSER).toBe(true);
    expect(endsWithHostPath(json.PARSER_SCRIPT as string, candidate1)).toBe(true);
  });

  it('falls back to candidate 1 path and HAS_PARSER=false when neither exists', async () => {
    const root = makeRoot();
    const candidate1 = '.specify/plugins/tdk-test-api/skills/tdk-test-api-plan/scripts/parse_openapi_spec.py';

    const { exitCode, stdout } = await runCli(root, ['feat/aa-001']);

    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout) as Record<string, unknown>;
    expect(json.HAS_PARSER).toBe(false);
    expect(endsWithHostPath(json.PARSER_SCRIPT as string, candidate1)).toBe(true);
  });

  it('writeAgentJson envelope fields are preserved', async () => {
    const root = makeRoot();

    const { exitCode, stdout } = await runCli(root, ['feat/aa-001']);

    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout) as Record<string, unknown>;
    // Assert the full envelope shape is unchanged
    const requiredFields = [
      'WORKSPACE_ROOT', 'OUTPUT_ROOT', 'FEATURE_ID', 'FEATURE_DIR',
      'API_TEST_DIR', 'PLAN_FILE', 'HAS_TEST_API_CONFIG',
      'TEST_API_OUTPUT_DIR', 'TEST_API_AUTH_STRATEGY', 'TEST_API_BASE_URL_ENV',
      'TEST_API_TOKEN_ENV', 'OPENAPI_PATH', 'OPENAPI_VALID',
      'HAS_PARSER', 'PARSER_SCRIPT', 'BASE_URL', 'HAS_EXISTING_PLAN',
      'FORCE_MODE', 'CONFIG_FOUND',
    ];
    for (const field of requiredFields) {
      expect(json).toHaveProperty(field);
    }
  });
});

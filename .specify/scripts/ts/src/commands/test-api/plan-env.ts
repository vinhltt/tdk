// CLI: Environment validation for /tdk-test-api-plan skill
// Replaces: tdk-test-api-plan/scripts/run.sh

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot, writeAgentJson } from '../../utils/index';
import { parseTestApiArgs, setupTestApiEnv } from './test-api-shared-setup';

function getParserCandidates(repoRoot: string): string[] {
  const sourceCandidate = '.specify/plugins/tdk-test-api/skills/tdk-test-api-plan/scripts/parse_openapi_spec.py';
  const installedDefaultCandidate = '.claude/skills/tdk-test-api-plan/scripts/parse_openapi_spec.py';
  const installedSkillsDir = join(repoRoot, '.claude/skills');
  const installedCustomCandidates = existsSync(installedSkillsDir)
    ? readdirSync(installedSkillsDir)
        .filter((entry) => entry !== 'tdk-test-api-plan' && entry.endsWith('-test-api-plan'))
        .sort()
        .map((entry) => `.claude/skills/${entry}/scripts/parse_openapi_spec.py`)
    : [];

  return [sourceCandidate, installedDefaultCandidate, ...installedCustomCandidates];
}

try {
  const args = parseTestApiArgs(process.argv.slice(2));
  const env = setupTestApiEnv(args);

  const planFile = join(env.apiTestDir, 'api-test-plan.md');

  const openapiValid = Boolean(args.openapi && existsSync(args.openapi));
  if (args.openapi && !openapiValid) {
    process.stderr.write(`Warning: OpenAPI spec not found: ${args.openapi}\n`);
  }

  const repoRoot = getRepoRoot();
  const parserCandidates = getParserCandidates(repoRoot);
  const parserScript =
    parserCandidates.map((c) => join(repoRoot, c)).find(existsSync) ??
    join(repoRoot, parserCandidates[0]!);

  mkdirSync(env.apiTestDir, { recursive: true });

  writeAgentJson({
    WORKSPACE_ROOT: env.workspaceRoot,
    OUTPUT_ROOT: env.outputRoot,
    FEATURE_ID: env.featureId,
    FEATURE_DIR: env.featureDir,
    API_TEST_DIR: env.apiTestDir,
    PLAN_FILE: planFile,
    HAS_TEST_API_CONFIG: env.testApi.found,
    TEST_API_OUTPUT_DIR: env.testApi.outputDir,
    TEST_API_AUTH_STRATEGY: env.testApi.authStrategy,
    TEST_API_BASE_URL_ENV: env.testApi.baseUrlEnv,
    TEST_API_TOKEN_ENV: env.testApi.tokenEnv,
    OPENAPI_PATH: args.openapi ?? '',
    OPENAPI_VALID: openapiValid,
    HAS_PARSER: existsSync(parserScript),
    PARSER_SCRIPT: parserScript,
    BASE_URL: args.url ?? '',
    HAS_EXISTING_PLAN: existsSync(planFile),
    FORCE_MODE: env.forceMode,
    CONFIG_FOUND: true,
  });
} catch (e) {
  process.stderr.write(`Error: ${(e as Error).message}\n`);
  process.exit(1);
}

// CLI: Environment validation for /tdk-test-api-plan skill
// Replaces: tdk-test-api-plan/scripts/run.sh

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot, writeAgentJson } from '../../utils/index';
import { parseTestApiArgs, setupTestApiEnv } from './test-api-shared-setup';

try {
  const args = parseTestApiArgs(process.argv.slice(2));
  const env = setupTestApiEnv(args);

  const planFile = join(env.apiTestDir, 'api-test-plan.md');

  const openapiValid = Boolean(args.openapi && existsSync(args.openapi));
  if (args.openapi && !openapiValid) {
    process.stderr.write(`Warning: OpenAPI spec not found: ${args.openapi}\n`);
  }

  const repoRoot = getRepoRoot();
  const parserScript = join(
    repoRoot,
    '.specify/plugins/tdk-test-api/skills/tdk-test-api-plan/scripts/parse_openapi_spec.py',
  );

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

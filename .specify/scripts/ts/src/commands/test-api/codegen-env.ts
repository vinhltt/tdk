// CLI: Environment validation for /tdk-test-api-gen-code-playwright-ts skill
// Replaces: tdk-test-api-gen-code-playwright-ts/scripts/run.sh

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseTestApiArgs, setupTestApiEnv, findFilesRecursive } from './test-api-shared-setup';

try {
  const args = parseTestApiArgs(process.argv.slice(2));
  const env = setupTestApiEnv(args);

  const executionPlan = join(env.apiTestDir, 'test-execution-plan.yaml');

  const testcaseFiles = findFilesRecursive(env.apiTestDir, /\.testcases\.md$/);
  const specFiles = findFilesRecursive(env.apiTestDir, /\.api\.spec\.ts$/);

  let hasPlaywright = false;
  let playwrightVersion = '';
  try {
    playwrightVersion = execFileSync('npx', ['playwright', '--version'], {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 15_000,
    }).trim();
    hasPlaywright = true;
  } catch { /* Playwright not available */ }

  console.log(JSON.stringify({
    WORKSPACE_ROOT: env.workspaceRoot,
    OUTPUT_ROOT: env.outputRoot,
    FEATURE_ID: env.featureId,
    FEATURE_DIR: env.featureDir,
    API_TEST_DIR: env.apiTestDir,
    EXECUTION_PLAN: executionPlan,
    HAS_TEST_API_CONFIG: env.testApi.found,
    TEST_API_OUTPUT_DIR: env.testApi.outputDir,
    TEST_API_AUTH_STRATEGY: env.testApi.authStrategy,
    TEST_API_BASE_URL_ENV: env.testApi.baseUrlEnv,
    TEST_API_TOKEN_ENV: env.testApi.tokenEnv,
    HAS_TESTCASES: testcaseFiles.length > 0,
    TESTCASE_COUNT: testcaseFiles.length,
    TESTCASE_FILES: testcaseFiles.join(','),
    HAS_EXECUTION_PLAN: existsSync(executionPlan),
    HAS_EXISTING_SPECS: specFiles.length > 0,
    EXISTING_SPEC_COUNT: specFiles.length,
    HAS_PLAYWRIGHT: hasPlaywright,
    PLAYWRIGHT_VERSION: playwrightVersion,
    FORCE_MODE: env.forceMode,
    CONFIG_FOUND: true,
  }, null, 2));
} catch (e) {
  process.stderr.write(`Error: ${(e as Error).message}\n`);
  process.exit(1);
}

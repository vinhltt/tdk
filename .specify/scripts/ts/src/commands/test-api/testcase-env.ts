// CLI: Environment validation for /tdk-test-api-generate-testcase skill
// Replaces: tdk-test-api-generate-testcase/scripts/run.sh

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseTestApiArgs, setupTestApiEnv, findFilesRecursive } from './test-api-shared-setup';

try {
  const args = parseTestApiArgs(process.argv.slice(2));
  const env = setupTestApiEnv(args);

  const planFile = join(env.apiTestDir, 'api-test-plan.md');
  const executionPlan = join(env.apiTestDir, 'test-execution-plan.yaml');
  const templateFile = join(
    env.workspaceRoot,
    '.specify/templates/test/api-test/api-testcases-template.md.tpl',
  );

  const testcaseFiles = findFilesRecursive(env.apiTestDir, /\.testcases\.md$/).slice(0, 20);

  console.log(JSON.stringify({
    WORKSPACE_ROOT: env.workspaceRoot,
    OUTPUT_ROOT: env.outputRoot,
    FEATURE_ID: env.featureId,
    FEATURE_DIR: env.featureDir,
    API_TEST_DIR: env.apiTestDir,
    PLAN_FILE: planFile,
    EXECUTION_PLAN: executionPlan,
    TEMPLATE_FILE: templateFile,
    HAS_PLAN: existsSync(planFile),
    HAS_TEMPLATE: existsSync(templateFile),
    HAS_EXISTING_TESTCASES: testcaseFiles.length > 0,
    HAS_EXECUTION_PLAN: existsSync(executionPlan),
    EXISTING_TESTCASES: testcaseFiles.join(','),
    FORCE_MODE: env.forceMode,
    CONFIG_FOUND: true,
  }, null, 2));
} catch (e) {
  process.stderr.write(`Error: ${(e as Error).message}\n`);
  process.exit(1);
}

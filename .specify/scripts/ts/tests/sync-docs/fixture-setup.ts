// fixture-setup.ts
// Idempotent fixture setup/teardown for sync-docs snapshot tests
// Fixture structure:
//   workspace/
//   ├── .specify/.specify.json (parent config: docsPath=".specify/configurations", docsSyncBackup=false)
//   ├── .specify/configurations/ (parent docs)
//   │   └── shared.md
//   ├── .specify/configurations/sub-workspaces/alpha/
//   │   └── from-parent.md (exists in parent, used for --to-sub-workspace)
//   └── sub-alpha/
//       └── .specify/configurations/
//           ├── doc-a.md
//           └── doc-b.md (sub-workspace docs)

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export interface FixtureConfig {
  root: string;
}

export function createFixture(config: FixtureConfig): void {
  const { root } = config;

  // Clean if exists
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Ignore if not exists
  }

  mkdirSync(root, { recursive: true });

  // Parent workspace: .specify/
  const parentSpecDir = join(root, '.specify');
  mkdirSync(parentSpecDir);

  // Parent config (YAML for bash compatibility, also create JSON for TS)
  // Note: bash requires .specify.yaml (detected by detect-config.sh)
  // YAML uses 'sub-workspaces' (with hyphen), JSON uses 'subWorkspaces'
  const parentYamlConfig = `version: '1.0'
name: parent-workspace
docs:
  path: .specify/configurations
docsSyncBackup: false
sub-workspaces:
  - name: alpha
    path: sub-alpha
`;
  writeFileSync(
    join(parentSpecDir, '.specify.yaml'),
    parentYamlConfig
  );

  // Also create JSON version for TS detectConfig compatibility
  const parentConfig = {
    version: '1.0',
    name: 'parent-workspace',
    docs: {
      path: '.specify/configurations',
    },
    docsSyncBackup: false,
    subWorkspaces: [
      {
        name: 'alpha',
        path: 'sub-alpha',
      },
    ],
  };
  writeFileSync(
    join(parentSpecDir, '.specify.json'),
    JSON.stringify(parentConfig, null, 2)
  );

  // Parent docs root
  const parentDocsDir = join(root, '.specify/configurations');
  mkdirSync(parentDocsDir);
  writeFileSync(join(parentDocsDir, 'shared.md'), '# Shared Documentation\n\nParent-level doc.\n');

  // Parent's sub-workspaces/alpha/ (shared docs for alpha)
  const parentSubDir = join(root, '.specify/configurations/sub-workspaces/alpha');
  mkdirSync(parentSubDir, { recursive: true });
  writeFileSync(
    join(parentSubDir, 'from-parent.md'),
    '# From Parent\n\nShared doc pushed from parent to alpha.\n'
  );

  // Sub-workspace: sub-alpha/
  const subAlphaRoot = join(root, 'sub-alpha');
  mkdirSync(subAlphaRoot);

  // Sub-workspace docs: .specify/configurations/
  const subAlphaDocsDir = join(subAlphaRoot, '.specify/configurations');
  mkdirSync(subAlphaDocsDir, { recursive: true });
  writeFileSync(join(subAlphaDocsDir, 'doc-a.md'), '# Doc A\n\nAlpha sub-workspace doc A.\n');
  writeFileSync(join(subAlphaDocsDir, 'doc-b.md'), '# Doc B\n\nAlpha sub-workspace doc B.\n');
}

export function teardownFixture(config: FixtureConfig): void {
  try {
    rmSync(config.root, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

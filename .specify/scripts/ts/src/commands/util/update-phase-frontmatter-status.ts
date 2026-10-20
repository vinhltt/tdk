// CLI: update-phase-frontmatter-status — surgically edit status: in phase file YAML frontmatter
// Usage: bun src/commands/util/update-phase-frontmatter-status.ts <phase-file-path> <status>

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { updatePhaseFrontmatterStatus } from './phase-frontmatter';
import { type PhaseStatus, VALID_STATUSES } from './phases-table-parser';
import { normalizeLifecycleStatus, readFrontmatterStatus } from './plan-root-status';

const [filePath, status] = process.argv.slice(2);

if (!filePath || !status) {
  console.error('Usage: bun update-phase-frontmatter-status.ts <phase-file-path> <status>');
  console.error(`Valid statuses: ${[...VALID_STATUSES].join(', ')}`);
  process.exit(1);
}

// Phase files live next to plan.md or under its phases/ dir; an archived plan accepts no status writes.
const planPath = [join(dirname(filePath), 'plan.md'), join(dirname(dirname(filePath)), 'plan.md')].find((p) => existsSync(p));
const planRoot = planPath ? readFrontmatterStatus(readFileSync(planPath, 'utf-8')) : null;
if (planRoot !== null && normalizeLifecycleStatus(planRoot, 'plan').status === 'archived') {
  console.error(`✗ plan is archived: ${planPath}`);
  process.exit(1);
}

try {
  updatePhaseFrontmatterStatus(filePath, status as PhaseStatus);
  console.log(`✓ ${filePath} → status: ${status}`);
} catch (err) {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
}

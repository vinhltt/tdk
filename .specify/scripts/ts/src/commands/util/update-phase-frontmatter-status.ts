// CLI: update-phase-frontmatter-status — surgically edit status: in phase file YAML frontmatter
// Usage: bun src/commands/util/update-phase-frontmatter-status.ts <phase-file-path> <status>

import { updatePhaseFrontmatterStatus } from './phase-frontmatter';
import { type PhaseStatus, VALID_STATUSES } from './phases-table-parser';

const [filePath, status] = process.argv.slice(2);

if (!filePath || !status) {
  console.error('Usage: bun update-phase-frontmatter-status.ts <phase-file-path> <status>');
  console.error(`Valid statuses: ${[...VALID_STATUSES].join(', ')}`);
  process.exit(1);
}

try {
  updatePhaseFrontmatterStatus(filePath, status as PhaseStatus);
  console.log(`✓ ${filePath} → status: ${status}`);
} catch (err) {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
}

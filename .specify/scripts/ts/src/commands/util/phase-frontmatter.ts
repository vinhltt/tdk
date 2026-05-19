import { readFileSync, writeFileSync } from 'node:fs';
import { type PhaseStatus, VALID_STATUSES } from './phases-table-parser';

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
const STATUS_LINE_RE = /^(status:\s*)\S+\s*$/m;
const PHASE_KEY_RE = /^phase:\s*\S+\s*$/m;

/**
 * Surgically update the `status:` value in a phase file's YAML frontmatter.
 * Line-based regex — no YAML round-trip (preserves comments, key order, quoting).
 * Idempotent: skips write when content unchanged.
 */
export function updatePhaseFrontmatterStatus(
  filePath: string,
  status: PhaseStatus,
): void {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`invalid status '${status}' — expected one of: ${[...VALID_STATUSES].join(', ')}`);
  }

  const content = readFileSync(filePath, 'utf-8');

  const fmMatch = FRONTMATTER_RE.exec(content);
  if (!fmMatch) {
    throw new Error(`no YAML frontmatter block found in ${filePath}`);
  }

  const fmBlock = fmMatch[1]!;
  let newBlock: string;

  if (STATUS_LINE_RE.test(fmBlock)) {
    newBlock = fmBlock.replace(STATUS_LINE_RE, `$1${status}`);
  } else if (PHASE_KEY_RE.test(fmBlock)) {
    newBlock = fmBlock.replace(PHASE_KEY_RE, `$&\nstatus: ${status}`);
  } else {
    newBlock = fmBlock + `\nstatus: ${status}`;
  }

  const newContent = content.replace(fmMatch[1]!, newBlock);
  if (newContent === content) return;

  writeFileSync(filePath, newContent, 'utf-8');
}

import { readFileSync, writeFileSync } from 'node:fs';
import { type PhaseStatus, VALID_STATUSES } from './phases-table-parser';

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
const STATUS_LINE_RE = /^(status:\s*)\S+\s*$/m;
const STATUS_VALUE_RE = /^status:\s*(\S+)\s*$/m;
const PHASE_KEY_RE = /^phase:\s*\S+\s*$/m;

/**
 * Surgically update the `status:` value in a phase file's YAML frontmatter.
 * Line-based regex — no YAML round-trip (preserves comments, key order, quoting).
 * Idempotent: skips write when content unchanged.
 */
export function renderPhaseFrontmatterStatus(
  content: string,
  status: PhaseStatus,
  source = 'phase content',
): string {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`invalid status '${status}' — expected one of: ${[...VALID_STATUSES].join(', ')}`);
  }

  const fmMatch = FRONTMATTER_RE.exec(content);
  if (!fmMatch) {
    throw new Error(`no YAML frontmatter block found in ${source}`);
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

  return content.replace(fmMatch[1]!, newBlock);
}

export function readPhaseFrontmatterStatus(content: string, source = 'phase content'): PhaseStatus | null {
  const fmMatch = FRONTMATTER_RE.exec(content);
  if (!fmMatch) throw new Error(`no YAML frontmatter block found in ${source}`);
  const match = STATUS_VALUE_RE.exec(fmMatch[1]!);
  if (!match) return null;
  const status = match[1]!;
  if (!VALID_STATUSES.has(status)) throw new Error(`invalid status '${status}' in ${source}`);
  return status as PhaseStatus;
}

export function updatePhaseFrontmatterStatus(
  filePath: string,
  status: PhaseStatus,
): void {
  const content = readFileSync(filePath, 'utf-8');
  const newContent = renderPhaseFrontmatterStatus(content, status, filePath);
  if (newContent === content) return;

  writeFileSync(filePath, newContent, 'utf-8');
}

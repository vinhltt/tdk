import { readFileSync, writeFileSync } from 'node:fs';
import { type PhaseStatus, VALID_STATUSES } from './phases-table-parser';

const BOM = '﻿';
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
// `[^\S\r\n]` keeps a CRLF line's `\r` outside the match; an inline YAML comment is preserved.
const STATUS_LINE_RE = /^(status:[^\S\r\n]*)\S+((?:[^\S\r\n]+#[^\r\n]*)?)[^\S\r\n]*$/m;
const STATUS_VALUE_RE = /^status:[^\S\r\n]*(\S+)(?:[^\S\r\n]+#[^\r\n]*)?\s*$/m;
const PHASE_KEY_RE = /^phase:\s*\S+\s*$/m;

function splitBom(content: string): { bom: string; body: string } {
  return content.startsWith(BOM) ? { bom: BOM, body: content.slice(1) } : { bom: '', body: content };
}

/** Raw YAML frontmatter block (without `---` fences), BOM-tolerant; null when absent. */
export function readFrontmatterBlock(content: string): string | null {
  return FRONTMATTER_RE.exec(splitBom(content).body)?.[1] ?? null;
}

/**
 * Replace the value of an existing frontmatter `status:` line. No-op when the
 * frontmatter block or the `status:` key is absent. BOM and CRLF line endings
 * are preserved. Vocabulary validation is the caller's job.
 */
export function replaceFrontmatterStatusLine(content: string, status: string): string {
  const { bom, body } = splitBom(content);
  const fmMatch = FRONTMATTER_RE.exec(body);
  if (!fmMatch || !STATUS_LINE_RE.test(fmMatch[1]!)) return content;
  const newBlock = fmMatch[1]!.replace(STATUS_LINE_RE, (_line, key: string, comment: string) => `${key}${status}${comment}`);
  // Function replacers keep `$&`, `$'`, `$$` in user frontmatter literal.
  return bom + body.replace(fmMatch[1]!, () => newBlock);
}

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

  const { bom, body } = splitBom(content);
  const fmMatch = FRONTMATTER_RE.exec(body);
  if (!fmMatch) {
    throw new Error(`no YAML frontmatter block found in ${source}`);
  }

  const fmBlock = fmMatch[1]!;
  if (STATUS_LINE_RE.test(fmBlock)) return replaceFrontmatterStatusLine(content, status);

  const newBlock = PHASE_KEY_RE.test(fmBlock)
    ? fmBlock.replace(PHASE_KEY_RE, (line) => `${line}\nstatus: ${status}`)
    : fmBlock + `\nstatus: ${status}`;
  return bom + body.replace(fmBlock, () => newBlock);
}

export function readPhaseFrontmatterStatus(content: string, source = 'phase content'): PhaseStatus | null {
  const fmBlock = readFrontmatterBlock(content);
  if (fmBlock === null) throw new Error(`no YAML frontmatter block found in ${source}`);
  const match = STATUS_VALUE_RE.exec(fmBlock);
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

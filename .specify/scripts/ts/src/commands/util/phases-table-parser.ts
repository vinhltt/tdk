/**
 * phases-table-parser.ts
 *
 * SCOPE: tdk spec documents ONLY.
 * Parses and mutates the `## Phases` markdown table inside plan.md files.
 * Single source of truth for all downstream readers/writers — zero local regex duplication.
 *
 * Architecture:
 *   parsePhasesTable      — section detection → row parsing → vocab validation
 *   updatePhaseStatus     — parse → mutate row → serializeTable → splice back
 *   validateDependencies  — forward-ref check per PhaseRow.number (not array index)
 *   serializeTable        — internal, canonical emit (em-dash U+2014, preserves fileLabel)
 *   getPlanPath           — F12 typed helper wrapper for getFeaturePaths().implPlan
 */

import { join } from 'node:path';
import { getFeaturePaths } from '../../utils/common';

// ---------------------------------------------------------------------------
// Types (locked contract — DO NOT change without updating consumers)
// ---------------------------------------------------------------------------

export type PhaseStatus = 'todo' | 'in_progress' | 'done' | 'skipped' | 'blocked' | 'cancelled';

export interface PhaseRow {
  number: number;         // "01" → 1
  file: string;           // relative path (lowercase kebab-case enforced)
  fileLabel: string;      // link text — preserved verbatim (F2)
  status: PhaseStatus;
  blocks: number[];       // [] if "—"
  blockedBy: number[];    // [] if "—"
  rowLineNumber: number;  // 1-indexed line number in original markdown
}

export interface ParseResult {
  phases: PhaseRow[];
  errors: Array<{ line: number; message: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canonical empty-cell sentinel per spec (U+2014 em-dash) */
const EM_DASH = '—';

/** Known-good status values */
export const VALID_STATUSES: ReadonlySet<string> = new Set<PhaseStatus>([
  'todo', 'in_progress', 'done', 'skipped', 'blocked', 'cancelled',
]);

/** Legacy vocab → canonical mapping (backward compat for pre-schema_version-3 plans) */
const LEGACY_STATUS_ALIASES: Record<string, PhaseStatus> = {
  'pending': 'todo',
  'in-progress': 'in_progress',
  'completed': 'done',
};

/**
 * F17: Lenient read — accept any single em-dash, en-dash, or hyphen as "empty".
 * U+2014 — em dash, U+2013 – en dash, U+002D - hyphen-minus
 */
function isEmptyCell(cell: string): boolean {
  return /^[—–-]$/.test(cell);
}

/** A single Blocks/BlockedBy token that failed strict `^\d+$` validation (C-B2). */
export interface DependencyCellIssue {
  token: string;
  reason: 'non-numeric-token' | 'partial-numeric-token';
}

/**
 * Tokenize a deps cell (Blocks or BlockedBy column).
 * `values` is byte-compatible with the legacy `parseDepsCell` behavior: a fully
 * non-numeric token (e.g. "abc") is dropped, a partial-numeric token (e.g.
 * "2abc") keeps its parsed leading integer. `issues` additively records any
 * token that isn't a clean `^\d+$` integer — callers that don't care (the
 * default parser) simply discard `.issues`.
 */
export function tokenizeDependencyCell(cell: string): { values: number[]; issues: DependencyCellIssue[] } {
  if (!cell || isEmptyCell(cell)) return { values: [], issues: [] };
  const tokens = cell.split(',').map(s => s.trim()).filter(s => s.length > 0);
  const values: number[] = [];
  const issues: DependencyCellIssue[] = [];
  for (const token of tokens) {
    const parsed = parseInt(token, 10);
    if (!isNaN(parsed)) values.push(parsed);
    if (!/^\d+$/.test(token)) {
      issues.push({ token, reason: isNaN(parsed) ? 'non-numeric-token' : 'partial-numeric-token' });
    }
  }
  return { values, issues };
}

/**
 * Lowercase kebab-case path validation (F19).
 * Valid: `^[a-z0-9-]+\.md$`
 */
function isValidPath(path: string): boolean {
  return /^(phases\/)?[a-z0-9-]+\.md$/.test(path);
}

// ---------------------------------------------------------------------------
// parsePhasesTable
// ---------------------------------------------------------------------------

/**
 * Parse the `## Phases` table from a plan.md markdown string.
 *
 * Rules:
 * - Exactly one `## Phases` section required (ambiguous → error)
 * - Header row: `| # | File | Status | Blocks | BlockedBy |`
 * - 5 data columns required per row
 * - Non-short-circuit: all errors collected before returning
 * - Line numbers are 1-indexed
 */
export function parsePhasesTable(md: string): ParseResult {
  const lines = md.split('\n');
  const errors: Array<{ line: number; message: string }> = [];
  const phases: PhaseRow[] = [];

  // --- Find ## Phases section(s) ---
  const sectionLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '## Phases') {
      sectionLines.push(i + 1); // 1-indexed
    }
  }

  if (sectionLines.length === 0) {
    errors.push({ line: 0, message: '## Phases section not found' });
    return { phases, errors };
  }

  if (sectionLines.length > 1) {
    errors.push({
      line: 0,
      message: `ambiguous: multiple ## Phases sections found (lines ${sectionLines.join(', ')})`,
    });
    return { phases, errors };
  }

  const sectionLine = sectionLines[0]!; // 1-indexed line of `## Phases`

  // --- Find table header row (first | line after ## Phases) ---
  let headerLineIdx = -1; // 0-indexed into lines array
  for (let i = sectionLine; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (trimmed.startsWith('|')) {
      headerLineIdx = i;
      break;
    }
    // Skip blank lines between heading and table
  }

  if (headerLineIdx === -1) {
    // No table found — empty table is valid (0 rows)
    return { phases, errors };
  }

  // --- Parse and validate header ---
  const headerCells = splitRow(lines[headerLineIdx] ?? '');
  const expectedHeader = ['#', 'File', 'Status', 'Blocks', 'BlockedBy'];
  if (headerCells.length !== expectedHeader.length) {
    errors.push({
      line: headerLineIdx + 1,
      message: `expected 5 columns (# | File | Status | Blocks | BlockedBy), got ${headerCells.length}`,
    });
    // Still try to parse data rows — non-short-circuit
  } else {
    for (let col = 0; col < expectedHeader.length; col++) {
      if ((headerCells[col] ?? '').trim() !== expectedHeader[col]) {
        errors.push({
          line: headerLineIdx + 1,
          message: `expected 5 columns (# | File | Status | Blocks | BlockedBy), got column ${col + 1} = '${(headerCells[col] ?? '').trim()}'`,
        });
      }
    }
  }

  // --- Skip separator row ---
  const separatorLineIdx = headerLineIdx + 1;
  // Separator must start with | and contain only pipes, dashes, spaces
  if (separatorLineIdx >= lines.length) {
    return { phases, errors };
  }
  const sepLine = (lines[separatorLineIdx] ?? '').trim();
  if (!sepLine.startsWith('|') || !/^[\s|:-]+$/.test(sepLine)) {
    errors.push({
      line: separatorLineIdx + 1,
      message: `expected table separator row at line ${separatorLineIdx + 1}`,
    });
    return { phases, errors };
  }

  // --- Parse data rows ---
  let dataStart = separatorLineIdx + 1;
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    // Stop at blank line or new section heading
    if (trimmed === '' || trimmed.startsWith('#')) break;

    // Must start with |
    if (!trimmed.startsWith('|')) break;

    const lineNum = i + 1; // 1-indexed
    const cells = splitRow(line);

    if (cells.length !== 5) {
      errors.push({
        line: lineNum,
        message: `expected 5 columns (# | File | Status | Blocks | BlockedBy), got ${cells.length}`,
      });
      continue;
    }

    // Parse # column
    const numStr = (cells[0] ?? '').trim();
    const num = parseInt(numStr, 10);
    if (isNaN(num)) {
      errors.push({ line: lineNum, message: `invalid phase number '${numStr}'` });
      continue;
    }

    // Parse File column — must be markdown link [label](path)
    const fileCell = (cells[1] ?? '').trim();
    const linkMatch = fileCell.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!linkMatch) {
      errors.push({ line: lineNum, message: `File column must be a markdown link [label](path), got '${fileCell}'` });
      continue;
    }
    const fileLabel = linkMatch[1]!;
    const filePath = linkMatch[2]!;

    // F19: validate lowercase kebab-case path.
    // NOTE: Row is still added to phases[] even with a path error (non-short-circuit).
    // Callers MUST check errors.length === 0 before trusting phases[] for write operations.
    if (!isValidPath(filePath)) {
      errors.push({
        line: lineNum,
        message: `path '${filePath}' must be lowercase kebab-case (e.g., 'phases/phase-02-x.md')`,
      });
      // Continue parsing — non-short-circuit
    }

    // Parse Status column (normalize legacy vocab before validation)
    const statusRaw = (cells[2] ?? '').trim();
    const statusNormalized = LEGACY_STATUS_ALIASES[statusRaw] ?? statusRaw;
    let status: PhaseStatus;
    if (VALID_STATUSES.has(statusNormalized)) {
      status = statusNormalized as PhaseStatus;
    } else {
      errors.push({
        line: lineNum,
        message: `unknown status '${statusRaw}' (did you mean 'done'? legacy vocab — re-run /tdk-plan option (a) để migrate)`,
      });
      status = 'todo'; // default fallback for non-short-circuit parsing
    }

    // Parse Blocks column (F17: lenient)
    const blocksRaw = (cells[3] ?? '').trim();
    const blocks = tokenizeDependencyCell(blocksRaw).values;

    // Parse BlockedBy column (F17: lenient)
    const blockedByRaw = (cells[4] ?? '').trim();
    const blockedBy = tokenizeDependencyCell(blockedByRaw).values;

    phases.push({
      number: num,
      file: filePath,
      fileLabel,
      status,
      blocks,
      blockedBy,
      rowLineNumber: lineNum,
    });
  }

  return { phases, errors };
}

// ---------------------------------------------------------------------------
// Internal: splitRow
// ---------------------------------------------------------------------------

/**
 * Split a markdown table row on `|` and return trimmed inner cells.
 * Input: `| 01 | [x](y.md) | todo | — | — |`
 * Output: ['01', '[x](y.md)', 'todo', '—', '—']
 * Drops leading/trailing empty segments from outer pipes.
 */
export function splitRow(line: string): string[] {
  const parts = line.split('|');
  // Drop first and last (empty from outer pipes)
  const inner = parts.slice(1, parts.length - 1);
  return inner.map(s => s.trim());
}

// ---------------------------------------------------------------------------
// Internal: serializeTable
// ---------------------------------------------------------------------------

/**
 * Serialize PhaseRow[] back to canonical markdown table string.
 * F17 strict-write: empty arrays → em-dash U+2014.
 * F2: fileLabel preserved verbatim (not re-generated from path).
 * Returns the full table string WITHOUT trailing newline.
 */
function serializeTable(phases: PhaseRow[]): string {
  const header = `| # | File | Status | Blocks | BlockedBy |`;
  const separator = `|---|------|--------|--------|-----------|`;

  const rows = phases.map(row => {
    const numStr = String(row.number).padStart(2, '0');
    const fileCell = `[${row.fileLabel}](${row.file})`;
    const blocksCell = row.blocks.length > 0
      ? row.blocks.map(n => String(n).padStart(2, '0')).join(', ')
      : EM_DASH;
    const blockedByCell = row.blockedBy.length > 0
      ? row.blockedBy.map(n => String(n).padStart(2, '0')).join(', ')
      : EM_DASH;
    return `| ${numStr} | ${fileCell} | ${row.status} | ${blocksCell} | ${blockedByCell} |`;
  });

  return [header, separator, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// updatePhaseStatus
// ---------------------------------------------------------------------------

/**
 * Idempotently update the status of phase `phaseNumber` in a plan.md string.
 * Strategy: parse → mutate in-memory → serializeTable → splice back into markdown.
 * Preserves all content before and after the table (pre/post content, trailing newlines).
 */
export function renderPhaseStatuses(
  md: string,
  statusByPhase: ReadonlyMap<number, PhaseStatus>,
): string {
  const { phases, errors } = parsePhasesTable(md);

  // Propagate parse errors as thrown Error (caller must ensure valid plan.md)
  const fatal = errors.filter(e =>
    e.message.includes('## Phases section not found') ||
    e.message.includes('ambiguous: multiple ## Phases')
  );
  if (fatal.length > 0) {
    throw new Error(fatal.map(e => e.message).join('; '));
  }

  for (const phaseNumber of statusByPhase.keys()) {
    if (!phases.some((phase) => phase.number === phaseNumber)) {
      throw new Error(`phase ${phaseNumber} not found in ## Phases table`);
    }
  }

  const mutated: PhaseRow[] = phases.map((row) =>
    statusByPhase.has(row.number)
      ? { ...row, status: statusByPhase.get(row.number)! }
      : row
  );

  // Locate the table boundaries in original markdown
  const lines = md.split('\n');
  let headerLineIdx = -1;

  // Find ## Phases section
  let sectionLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '## Phases') {
      sectionLineIdx = i;
      break;
    }
  }
  if (sectionLineIdx === -1) {
    throw new Error('## Phases section not found');
  }

  // Find header row
  for (let i = sectionLineIdx + 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim().startsWith('|')) {
      headerLineIdx = i;
      break;
    }
  }
  if (headerLineIdx === -1) {
    throw new Error('## Phases table header not found');
  }

  // Find separator + data rows end
  const separatorLineIdx = headerLineIdx + 1;
  let lastDataLineIdx = separatorLineIdx;
  for (let i = separatorLineIdx + 1; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (trimmed === '' || trimmed.startsWith('#') || !trimmed.startsWith('|')) break;
    lastDataLineIdx = i;
  }

  // Build new content
  const before = lines.slice(0, headerLineIdx);
  const after = lines.slice(lastDataLineIdx + 1);
  const newTable = serializeTable(mutated);

  return [...before, newTable, ...after].join('\n');
}

export function updatePhaseStatus(md: string, phaseNumber: number, status: PhaseStatus): string {
  return renderPhaseStatuses(md, new Map([[phaseNumber, status]]));
}

// ---------------------------------------------------------------------------
// validateDependencies
// ---------------------------------------------------------------------------

/**
 * Validate that every BlockedBy reference points to an earlier phase number.
 * F20: Uses PhaseRow.number for comparison, NOT array index.
 * This means gaps in numbering (e.g., [01, 03, 05]) are handled correctly.
 */
export function validateDependencies(
  phases: PhaseRow[]
): Array<{ line: number; message: string }> {
  const errors: Array<{ line: number; message: string }> = [];

  for (const row of phases) {
    for (const dep of row.blockedBy) {
      if (dep >= row.number) {
        const rowNum = String(row.number).padStart(2, '0');
        const depNum = String(dep).padStart(2, '0');
        errors.push({
          line: row.rowLineNumber,
          message: `row ${rowNum} BlockedBy references row ${depNum} (must reference earlier row)`,
        });
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// getPlanPath (F12)
// ---------------------------------------------------------------------------

/**
 * F12 typed helper wrapper for getFeaturePaths().implPlan.
 * Converts loose Record<string, string|boolean> → strict string.
 * Throws if implPlan is missing or wrong type.
 * Eliminates `as string` casts in Phase 04-07 consumer code.
 *
 * Note: getFeaturePaths requires (featureDir, repoRoot, taskId).
 * We pass empty strings for repoRoot/taskId — those fields are only used
 * for metadata fields (repoRoot, taskId, hasGit), NOT for path computation.
 * implPlan = join(featureDir, 'plan.md') regardless of repoRoot/taskId.
 */
export function getPlanPath(featureDir: string): string {
  // Validate input before calling getFeaturePaths — enables the throw path to be reachable in tests.
  // getFeaturePaths always returns a string for implPlan when featureDir is valid; the second guard
  // is a defensive type-check for callers that bypass TypeScript (e.g., JS consumers, runtime casts).
  if (!featureDir || typeof featureDir !== 'string') {
    throw new Error('implPlan path missing');
  }
  const paths = getFeaturePaths(featureDir, '', '');
  const implPlan = paths['implPlan'];
  if (typeof implPlan !== 'string' || implPlan.length === 0) {
    throw new Error('implPlan path missing');
  }
  return implPlan;
}

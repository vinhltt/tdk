import {
  parsePhasesTable,
  validateDependencies,
  splitRow,
  tokenizeDependencyCell,
  type PhaseRow,
} from './phases-table-parser';

/**
 * Shared diagnostic shape (C-B6: `{ code, message, phase?, path? }`).
 * Defined here so the Batch C wave resolver can import it instead of
 * redefining an equivalent type.
 */
export interface Diagnostic {
  code: string;
  message: string;
  phase?: number;
  path?: string;
}

export type GraphValidationMode = 'serial' | 'parallel';

export interface PhaseGraphValidationResult {
  phases: PhaseRow[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function duplicatesWithin(values: number[]): number[] {
  const seen = new Set<number>();
  const dups = new Set<number>();
  for (const v of values) {
    if (seen.has(v)) dups.add(v);
    seen.add(v);
  }
  return [...dups];
}

/**
 * Fail-closed parallel DAG validation over raw plan.md Markdown (C-B2).
 * `parsePhasesTable` structural errors (missing section, bad columns, etc.)
 * always land in `errors` regardless of mode. New strictness — malformed
 * dependency tokens, duplicate phase numbers/edges, self references, dangling
 * references, non-reciprocal Blocks/BlockedBy relations, and the existing
 * earlier-phase BlockedBy rule — is mode-gated: `parallel` reports it as an
 * error, `serial` reports it as a warning.
 */
export function validatePhaseGraph(planMarkdown: string, mode: GraphValidationMode): PhaseGraphValidationResult {
  const { phases, errors: parseErrors } = parsePhasesTable(planMarkdown);
  const errors: Diagnostic[] = parseErrors.map((e) => ({ code: 'PARSE_ERROR', message: `plan.md:${e.line}: ${e.message}` }));
  const warnings: Diagnostic[] = [];
  const findings: Diagnostic[] = [];

  const lines = planMarkdown.split('\n');
  const byNumber = new Map<number, PhaseRow>();
  const seenNumbers = new Set<number>();
  for (const row of phases) {
    if (seenNumbers.has(row.number)) {
      findings.push({
        code: 'DUPLICATE_PHASE_NUMBER',
        message: `phase number ${pad(row.number)} appears more than once in the # column`,
        phase: row.number,
      });
    }
    seenNumbers.add(row.number);
    byNumber.set(row.number, row);
  }

  for (const row of phases) {
    const cells = splitRow(lines[row.rowLineNumber - 1] ?? '');
    const blocksRaw = (cells[3] ?? '').trim();
    const blockedByRaw = (cells[4] ?? '').trim();

    for (const issue of tokenizeDependencyCell(blocksRaw).issues) {
      findings.push({
        code: 'MALFORMED_DEPENDENCY_TOKEN',
        message: `row ${pad(row.number)} Blocks has a malformed token '${issue.token}' (${issue.reason})`,
        phase: row.number,
      });
    }
    for (const issue of tokenizeDependencyCell(blockedByRaw).issues) {
      findings.push({
        code: 'MALFORMED_DEPENDENCY_TOKEN',
        message: `row ${pad(row.number)} BlockedBy has a malformed token '${issue.token}' (${issue.reason})`,
        phase: row.number,
      });
    }

    if (row.blocks.includes(row.number)) {
      findings.push({ code: 'SELF_REFERENCE', message: `row ${pad(row.number)} Blocks references itself`, phase: row.number });
    }
    if (row.blockedBy.includes(row.number)) {
      findings.push({ code: 'SELF_REFERENCE', message: `row ${pad(row.number)} BlockedBy references itself`, phase: row.number });
    }

    for (const dup of duplicatesWithin(row.blocks)) {
      findings.push({ code: 'DUPLICATE_EDGE', message: `row ${pad(row.number)} Blocks references ${pad(dup)} more than once`, phase: row.number });
    }
    for (const dup of duplicatesWithin(row.blockedBy)) {
      findings.push({ code: 'DUPLICATE_EDGE', message: `row ${pad(row.number)} BlockedBy references ${pad(dup)} more than once`, phase: row.number });
    }

    for (const target of row.blocks) {
      if (!byNumber.has(target)) {
        findings.push({ code: 'DANGLING_REFERENCE', message: `row ${pad(row.number)} Blocks references missing phase ${pad(target)}`, phase: row.number });
      }
    }
    for (const target of row.blockedBy) {
      if (!byNumber.has(target)) {
        findings.push({ code: 'DANGLING_REFERENCE', message: `row ${pad(row.number)} BlockedBy references missing phase ${pad(target)}`, phase: row.number });
      }
    }
  }

  // Scheduling authority = BlockedBy: a ∈ BlockedBy(b) iff b ∈ Blocks(a).
  for (const row of phases) {
    for (const target of row.blockedBy) {
      const other = byNumber.get(target);
      if (other && !other.blocks.includes(row.number)) {
        findings.push({
          code: 'MISSING_RECIPROCAL_BLOCKS',
          message: `row ${pad(row.number)} BlockedBy ${pad(target)} but row ${pad(target)} Blocks does not include ${pad(row.number)}`,
          phase: row.number,
        });
      }
    }
    for (const target of row.blocks) {
      const other = byNumber.get(target);
      if (other && !other.blockedBy.includes(row.number)) {
        findings.push({
          code: 'MISSING_RECIPROCAL_BLOCKED_BY',
          message: `row ${pad(row.number)} Blocks ${pad(target)} but row ${pad(target)} BlockedBy does not include ${pad(row.number)}`,
          phase: row.number,
        });
      }
    }
  }

  // Preserve the existing earlier-phase BlockedBy rule.
  for (const dep of validateDependencies(phases)) {
    const row = phases.find((p) => p.rowLineNumber === dep.line);
    findings.push({ code: 'FORWARD_REFERENCE', message: dep.message, phase: row?.number });
  }

  if (mode === 'parallel') errors.push(...findings);
  else warnings.push(...findings);

  return { phases, errors, warnings };
}

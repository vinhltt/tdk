import { parse as parseYaml } from 'yaml';

/**
 * Parse a phase file's YAML frontmatter block into a metadata record.
 * Lifted verbatim from phase-file-validator.ts's former private `frontmatter()` —
 * no behavior change, only relocated so other modules can share it (C-B1).
 */
export function readPhaseFrontmatter(markdown: string): { metadata: Record<string, unknown>; error?: string } {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!match) return { metadata: {} };
  try {
    const value = parseYaml(match[1] ?? '');
    if (value === null || value === undefined) return { metadata: {} };
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { metadata: {}, error: 'Phase frontmatter must be a YAML mapping' };
    }
    return { metadata: value as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { metadata: {}, error: `Malformed phase frontmatter: ${message}` };
  }
}

export interface ParallelSafetyResult {
  parallelSafe: 'auto' | 'never' | null;
  parallelReason: string | null;
  errors: string[];
}

/**
 * Typed accessor for `parallel_safe` / `parallel_reason` frontmatter fields.
 * `parallelSafe: null` means legacy serial-only (field absent or unrecognized).
 * Each branch below is mutually exclusive so a single defect never produces
 * more than one finding (e.g. `never` + a non-string reason reports only the
 * reason-shape error, not also "never requires a reason").
 */
export function readParallelSafety(metadata: Record<string, unknown>): ParallelSafetyResult {
  const rawSafe = metadata['parallel_safe'];
  const rawReason = metadata['parallel_reason'];
  const errors: string[] = [];

  let parallelSafe: 'auto' | 'never' | null = null;
  if (rawSafe === 'auto' || rawSafe === 'never') {
    parallelSafe = rawSafe;
  } else if (rawSafe !== undefined) {
    errors.push(`Unknown parallel_safe: ${String(rawSafe)}; expected auto or never`);
  }

  const reasonPresent = rawReason !== undefined;
  const parallelReason = typeof rawReason === 'string' && rawReason.trim().length > 0 ? rawReason : null;
  const reasonValid = parallelReason !== null;

  if (reasonPresent && !reasonValid) {
    errors.push('parallel_reason must be a non-empty string');
  } else if (parallelSafe === 'never' && !reasonPresent) {
    errors.push('parallel_safe: never requires a parallel_reason');
  } else if (parallelSafe === 'auto' && reasonPresent) {
    errors.push('parallel_safe: auto must not carry a parallel_reason');
  } else if (parallelSafe === null && rawSafe === undefined && reasonPresent) {
    errors.push('parallel_reason present without parallel_safe');
  }

  return { parallelSafe, parallelReason, errors };
}

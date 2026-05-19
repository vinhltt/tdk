/**
 * plan-prose-validator.ts
 *
 * SCOPE: tdk plan.md files ONLY.
 * Detects freeform prose inside 3 guarded sections — prevents `/tdk-plan`
 * Option (b) "Append Phase" from accumulating multi-paragraph narrative
 * in plan.md (root cause of MRR-2067).
 *
 * Pure function (`validatePlanProse`) + CLI wrapper (`main`) — matches the
 * style of phases-table-parser.ts (parser) + scan-cross-plan-deps.ts (CLI).
 */

import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProseViolation {
  section: string;   // e.g. '## Phases'
  line: number;      // 1-based line number in original markdown
  snippet: string;   // first 80 chars of offending line
}

export interface ProseValidationResult {
  ok: boolean;
  violations: ProseViolation[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GUARDED_SECTIONS: readonly string[] = [
  '## Phases',
  '## Decisions Made',
  '## Success Metrics',
];

const SNIPPET_MAX = 80;

/**
 * A line is "allowed" (not prose) if it matches any of:
 *   - blank / whitespace-only
 *   - markdown table row              (`|`)
 *   - bullet list                     (`-`, `*`, `+`)  — covers checkboxes
 *   - numbered list                   (`1.`, `2.`, …)
 *   - heading at any depth            (`###`, `####`, …)
 *
 * Anything else is treated as prose injection.
 * HTML comments / blockquotes deliberately not allowed (YAGNI per plan).
 */
const ALLOWED_PATTERNS: readonly RegExp[] = [
  /^\s*$/,                  // blank
  /^\s*\|/,                 // table row
  /^\s*[-*+]\s/,            // bullet (incl. `- [ ]` / `- [x]`)
  /^\s*\d+\.\s/,            // numbered
  /^#{3,}\s/,               // sub-heading (### or deeper)
];

// ---------------------------------------------------------------------------
// Pure function
// ---------------------------------------------------------------------------

/**
 * Validate that 3 guarded sections of a plan.md contain table/list/heading
 * content only — no prose paragraphs.
 *
 * Missing guarded sections are silently skipped (treated as ok).
 * Sections outside GUARDED_SECTIONS are ignored entirely.
 */
export function validatePlanProse(planMd: string): ProseValidationResult {
  const normalized = planMd.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const violations: ProseViolation[] = [];

  for (const section of GUARDED_SECTIONS) {
    const range = findSectionRange(lines, section);
    if (!range) continue; // section absent → skip (test 12)

    // Skip the heading line itself; iterate body only
    for (let i = range.start + 1; i < range.end; i++) {
      const line = lines[i] ?? '';
      if (isAllowedLine(line)) continue;
      violations.push({
        section,
        line: i + 1, // 1-based
        snippet: line.slice(0, SNIPPET_MAX),
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface SectionRange {
  start: number; // 0-based line index of `## <name>`
  end: number;   // 0-based line index AFTER last body line (exclusive)
}

/**
 * Locate `## <name>` body bounds.
 * Body ends at the next line starting with `## ` (level-2 heading), or EOF.
 * `### ` and deeper subheadings stay inside the body.
 */
function findSectionRange(lines: string[], heading: string): SectionRange | null {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === heading) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trimStart();
    // Stop only on level-1 or level-2 headings (## or #)
    if (/^#{1,2}\s/.test(trimmed)) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function isAllowedLine(line: string): boolean {
  return ALLOWED_PATTERNS.some(re => re.test(line));
}

// ---------------------------------------------------------------------------
// CLI wrapper
// ---------------------------------------------------------------------------

function main(): void {
  const argv = process.argv.slice(2);
  const path = argv.find(a => !a.startsWith('--'));
  const wantJson = argv.includes('--json');

  if (!path) {
    process.stderr.write('usage: plan-prose-validator.ts <plan-md-path> [--json]\n');
    process.exit(2);
  }

  let content: string;
  try {
    content = readFileSync(path, 'utf-8');
  } catch (e) {
    process.stderr.write(`error reading ${path}: ${(e as Error).message}\n`);
    process.exit(2);
  }

  const result = validatePlanProse(content);

  if (wantJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    if (result.ok) {
      process.stdout.write('ok: no prose violations in guarded sections\n');
    } else {
      process.stdout.write(`violations: ${result.violations.length}\n`);
      for (const v of result.violations) {
        process.stdout.write(`  ${v.section} (line ${v.line}): ${v.snippet}\n`);
      }
    }
  }

  process.exit(result.ok ? 0 : 1);
}

// CLI entrypoint — guarded because this module is also imported by tests
// (unlike scan-cross-plan-deps.ts which is CLI-only).
if (import.meta.main) main();

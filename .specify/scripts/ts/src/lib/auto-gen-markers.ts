/**
 * AUTO-GEN marker parser + splicer.
 *
 * Marker format:
 *   <!-- AUTO-GEN-START: <id>
 *   SOURCES: file1, file2
 *   INSTRUCTION: single-line directive
 *   -->
 *   {body — replaced on splice}
 *   <!-- AUTO-GEN-END -->
 *
 * Pure functions, no I/O. EOL preserved (detect once, restore on splice).
 */

const RE_START = /^<!-- AUTO-GEN-START:\s+([\w-]+)\s*$/;
const RE_HEADER_END = /^-->\s*$/;
const RE_END = /^<!-- AUTO-GEN-END -->\s*$/;
const RE_SOURCES = /^SOURCES:\s*(.*)$/;
const RE_INSTRUCTION = /^INSTRUCTION:\s*(.*)$/;

export type AutoGenSection = {
  id: string;
  sources: string[];
  instruction: string;
  /** Current body content (lines joined with `\n`; excludes header `-->` and END marker). */
  body: string;
  /** 1-indexed line number of `<!-- AUTO-GEN-START:` line. */
  startLine: number;
  /** 1-indexed line number of `<!-- AUTO-GEN-END -->` line. */
  endLine: number;
  /** 0-indexed first line of body (line right after header `-->`). */
  bodyStartLineIdx: number;
  /** 0-indexed last line of body inclusive. If empty body, equals bodyStartLineIdx - 1. */
  bodyEndLineIdx: number;
};

export type SpliceResult = {
  content: string;
  warnings: string[];
};

/** Parse all AUTO-GEN sections. Throws on malformed (unclosed, nested, duplicate id). */
export function parseAutoGenSections(content: string): AutoGenSection[] {
  const lines = content.split(/\r?\n/);
  const sections: AutoGenSection[] = [];
  const seenIds = new Set<string>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const startMatch = line.match(RE_START);
    if (!startMatch) {
      i++;
      continue;
    }
    const id = startMatch[1]!;
    const startLine = i + 1;
    if (seenIds.has(id)) {
      throw new Error(`Duplicate AUTO-GEN section id "${id}" at line ${startLine}`);
    }
    seenIds.add(id);

    // Collect header lines until `-->`.
    let j = i + 1;
    const headerLines: string[] = [];
    while (j < lines.length && !RE_HEADER_END.test(lines[j] ?? '')) {
      const hl = lines[j] ?? '';
      if (RE_START.test(hl)) {
        throw new Error(`Nested AUTO-GEN-START inside header at line ${j + 1}`);
      }
      if (RE_END.test(hl)) {
        throw new Error(`AUTO-GEN-END before header `+`closed for "${id}" at line ${j + 1}`);
      }
      headerLines.push(hl);
      j++;
    }
    if (j >= lines.length) {
      throw new Error(`Unclosed AUTO-GEN-START header for "${id}" at line ${startLine}`);
    }
    // j is at `-->` line.

    // Collect body lines until END marker.
    let k = j + 1;
    while (k < lines.length && !RE_END.test(lines[k] ?? '')) {
      const bl = lines[k] ?? '';
      if (RE_START.test(bl)) {
        throw new Error(`Nested AUTO-GEN-START inside body of "${id}" at line ${k + 1}`);
      }
      k++;
    }
    if (k >= lines.length) {
      throw new Error(`Missing AUTO-GEN-END for "${id}" started at line ${startLine}`);
    }

    const sourcesLine = headerLines.find(l => RE_SOURCES.test(l));
    const instructionLine = headerLines.find(l => RE_INSTRUCTION.test(l));
    const sources = sourcesLine
      ? (sourcesLine.match(RE_SOURCES)?.[1] ?? '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    const instruction = instructionLine
      ? (instructionLine.match(RE_INSTRUCTION)?.[1] ?? '').trim()
      : '';

    const bodyStartLineIdx = j + 1;
    const bodyEndLineIdx = k - 1;
    const bodyLines = lines.slice(bodyStartLineIdx, k);
    sections.push({
      id,
      sources,
      instruction,
      body: bodyLines.join('\n'),
      startLine,
      endLine: k + 1,
      bodyStartLineIdx,
      bodyEndLineIdx,
    });
    i = k + 1;
  }
  return sections;
}

/**
 * Replace body of each section whose id is in `replacements`.
 * Preserves outside-marker bytes verbatim. Re-uses original EOL style.
 *
 * Warnings:
 *  - Missing replacement for an existing section id.
 *  - Replacement supplied for an id not present in original.
 *  - Non-empty body being replaced (informational — caller decides if loss is OK).
 */
export function spliceAutoGenSections(
  original: string,
  replacements: Map<string, string>,
): SpliceResult {
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  const sections = parseAutoGenSections(original);
  const warnings: string[] = [];
  const sectionIds = new Set(sections.map(s => s.id));

  for (const id of replacements.keys()) {
    if (!sectionIds.has(id)) {
      warnings.push(`Replacement for unknown section id "${id}" (no marker in original)`);
    }
  }
  for (const sec of sections) {
    if (!replacements.has(sec.id)) {
      warnings.push(`No replacement for section "${sec.id}" — body kept as-is`);
    }
  }

  // Splice from last to first so earlier line indices remain valid.
  for (let s = sections.length - 1; s >= 0; s--) {
    const sec = sections[s]!;
    if (!replacements.has(sec.id)) continue;
    const newBody = replacements.get(sec.id)!;
    if (sec.body.length > 0 && sec.body !== newBody) {
      warnings.push(`Replacing non-empty body for "${sec.id}" (potential user content loss)`);
    }
    const newBodyLines = newBody.length === 0 ? [] : newBody.split(/\r?\n/);
    const oldCount = Math.max(0, sec.bodyEndLineIdx - sec.bodyStartLineIdx + 1);
    lines.splice(sec.bodyStartLineIdx, oldCount, ...newBodyLines);
  }

  return { content: lines.join(eol), warnings };
}

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parsePhasesTable } from './phases-table-parser';
import type { PhaseArtifact } from './spec-plan-drift-model';

export interface Requirement {
  id: string;
  text: string;
  tags: string[];
  line: number;
}

export interface ParsedSpec {
  requirements: Requirement[];
  outOfScopeItems: Array<{ text: string; line: number }>;
  impactTags: Set<string>;
  successText: string;
  normalizedText: string;
}

export interface ParsedPhase {
  path: string;
  content: string;
  line: number;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'must', 'shall', 'will',
  'should', 'phase', 'implement', 'support', 'create', 'update', 'add', 'new', 'file',
  'files', 'plan', 'spec', 'requirement', 'requirements', 'success', 'criteria',
]);

export function parseSpec(md: string): ParsedSpec {
  const scope = extractNumberedSection(md, 2);
  const impact = extractNumberedSection(md, 3);
  const functional = extractNumberedSection(md, 6);
  const success = extractNumberedSection(md, 7);
  return {
    requirements: extractRequirements(functional.text, functional.startLine),
    outOfScopeItems: extractOutOfScope(scope.text, scope.startLine),
    impactTags: new Set(extractTags(impact.text)),
    successText: success.text,
    normalizedText: normalizeText(md),
  };
}

export function alignPlanPhases(planMd: string, phases: PhaseArtifact[]): ParsedPhase[] {
  const parsed = parsePhasesTable(planMd);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) => `line ${error.line}: ${error.message}`).join('; '));
  }
  const byPath = new Map(phases.map((phase) => [phase.path, phase.content]));
  const canonicalRows = parsed.phases.filter((row) => /^phases\/phase-\d{2}-[a-z0-9-]+\.md$/.test(row.file));
  const missing = canonicalRows.find((row) => !byPath.has(row.file));
  if (missing) {
    throw new Error(`missing phase artifact '${missing.file}'`);
  }
  return canonicalRows
    .map((row) => ({
      path: row.file,
      content: byPath.get(row.file)!,
      line: row.rowLineNumber,
    }));
}

export function loadPhases(root: string): PhaseArtifact[] {
  const phaseDir = readdirSync(root, { withFileTypes: true }).some((entry) => /^phase-\d{2}-.*\.md$/.test(entry.name))
    ? root
    : join(root, 'phases');
  return readdirSync(phaseDir)
    .filter((file) => /^phase-\d{2}-[a-z0-9-]+\.md$/.test(file))
    .sort()
    .map((file) => ({
      path: `phases/${file}`,
      content: readFileSync(join(phaseDir, file), 'utf-8'),
    }));
}

export function matchesRequirement(req: Requirement, content: string): boolean {
  const lower = content.toLowerCase();
  if (lower.includes(req.id.toLowerCase())) return true;
  if (req.tags.some((tag) => lower.includes(`[${tag}]`) || lower.includes(tag))) return true;
  return tokenOverlap(req.text, content) >= 2 || phraseContainment(req.text, content);
}

export function matchesSpecSuccess(successText: string, content: string): boolean {
  return tokenOverlap(successText, content) >= 3;
}

export function strongTextMatch(needle: string, haystack: string): boolean {
  return phraseContainment(needle, haystack) || tokenOverlap(needle, haystack) >= 3;
}

export function extractEntityTerms(text: string): string[] {
  return Array.from(text.matchAll(/\b([A-Z][A-Za-z0-9]+(?:Entity|Contract|DTO|Schema|Table|Model))\b/g), (match) => match[1] ?? '')
    .filter((term) => term.length > 0);
}

function extractNumberedSection(md: string, number: number): { text: string; startLine: number } {
  const lines = md.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${number}\\.\\s+`).test(line));
  if (start === -1) return { text: '', startLine: 1 };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  return { text: lines.slice(start + 1, end).join('\n'), startLine: start + 2 };
}

function extractRequirements(text: string, startLine: number): Requirement[] {
  return text.split('\n').flatMap((line, index) => {
    const match = line.match(/\b(FR-\d+)\b[:\]\s-]*(.+)$/i);
    if (!match || !match[1] || !match[2]) return [];
    return [{ id: match[1].toUpperCase(), text: match[2], tags: extractTags(line), line: startLine + index }];
  });
}

function extractOutOfScope(text: string, startLine: number): Array<{ text: string; line: number }> {
  return text.split('\n').flatMap((line, index) => {
    if (!/out[- ]of[- ]scope|excluded|do not|not include/i.test(line)) return [];
    const cleaned = line
      .replace(/^[-*]\s*/, '')
      .replace(/.*?(out[- ]of[- ]scope|excluded|do not|not include)[:\s-]*/i, '')
      .trim();
    return cleaned.length > 0 ? [{ text: cleaned, line: startLine + index }] : [];
  });
}

function phraseContainment(a: string, b: string): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  return left.length >= 8 && right.includes(left);
}

function tokenOverlap(a: string, b: string): number {
  const right = new Set(tokens(b));
  return tokens(a).filter((token) => right.has(token)).length;
}

function tokens(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function normalizeText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, ' $1 ')
    .replace(/[^a-zA-Z0-9_/-]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTags(text: string): string[] {
  return Array.from(text.matchAll(/\[([a-z0-9_/-]+)\]/gi), (match) => (match[1] ?? '').toLowerCase())
    .filter((tag) => tag.length > 0);
}

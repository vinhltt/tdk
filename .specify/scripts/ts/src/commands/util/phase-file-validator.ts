import { parse as parseYaml } from 'yaml';
import { parsePhasesTable } from './phases-table-parser';

export type PhaseType = 'normal' | 'spike';

export interface PhaseValidationResult {
  valid: boolean;
  phaseType: PhaseType;
  errors: string[];
  warnings: string[];
  dependentPhases: number[];
}

const SPIKE_SECTIONS = [
  '## Spike Objective',
  '## Experiment',
  '## Deliverables',
  '## Decision Gate',
  '## Spike Result',
] as const;

function frontmatter(markdown: string): { metadata: Record<string, unknown>; error?: string } {
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

function sectionBody(markdown: string, heading: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return null;
  const next = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line.trim()));
  return lines.slice(start + 1, next < 0 ? lines.length : start + 1 + next).join('\n').trim();
}

function isPlaceholder(body: string): boolean {
  const compact = body.replace(/<!--([\s\S]*?)-->/g, '').trim();
  return compact.length < 8 || /^(pending|todo|tbd|n\/a|none)[.!]?$/i.test(compact) || /\[(?:describe|add|todo|tbd)[^\]]*\]/i.test(compact);
}

function validateSpikeSections(markdown: string, requireResult: boolean, errors: string[]): void {
  for (const heading of SPIKE_SECTIONS) {
    const body = sectionBody(markdown, heading);
    if (body === null) {
      errors.push(`Spike phase missing required section: ${heading}`);
      continue;
    }
    if (heading === '## Spike Result' && !requireResult && /\bStatus\s*[:|]\s*pending\b/i.test(body)) continue;
    if (isPlaceholder(body)) errors.push(`Spike phase has placeholder content: ${heading}`);
  }

  const experiment = sectionBody(markdown, '## Experiment') ?? '';
  if (!/\b(command|steps?|procedure|prototype|input|expected|reproduce)\b/i.test(experiment)) {
    errors.push('Spike Experiment must define a reproducible command, steps, procedure, prototype, input, or expected result');
  }
  const decision = sectionBody(markdown, '## Decision Gate') ?? '';
  if (!/\bapprove\b/i.test(decision) || !/\breplan\b/i.test(decision)) {
    errors.push('Spike Decision Gate must define both approve and replan paths');
  }
  if (requireResult) {
    const result = sectionBody(markdown, '## Spike Result') ?? '';
    if (!/\bStatus\s*[:|]\s*(proposed|approved|replan-required)\b/i.test(result)
        || !/\b(evidence|result|observation)\b/i.test(result)) {
      errors.push('Spike Result must record non-pending evidence before the decision gate');
    }
  }
}

export function validatePhaseFile(
  markdown: string,
  options: { planMarkdown?: string; phaseNumber?: number; requireResult?: boolean } = {},
): PhaseValidationResult {
  const parsedFrontmatter = frontmatter(markdown);
  const metadata = parsedFrontmatter.metadata;
  const rawType = metadata['phase_type'];
  const errors: string[] = [];
  const warnings: string[] = [];
  const dependentPhases: number[] = [];

  if (parsedFrontmatter.error) errors.push(parsedFrontmatter.error);

  if (rawType !== undefined && rawType !== 'normal' && rawType !== 'spike') {
    errors.push(`Unknown phase_type: ${String(rawType)}; expected spike or omit the field for normal phases`);
  }
  const phaseType: PhaseType = rawType === 'spike' ? 'spike' : 'normal';
  const title = typeof metadata['title'] === 'string' ? metadata['title'] : '';
  if (phaseType === 'normal' && /^(research|investigate|evaluate)\b/i.test(title)
      && !markdown.includes('## Implementation Steps') && !markdown.includes('## Deliverables')) {
    errors.push('Research-only phases must use phase_type: spike and define executable deliverables');
  }

  if (phaseType === 'spike') {
    validateSpikeSections(markdown, options.requireResult ?? false, errors);
    if (!options.planMarkdown || !options.phaseNumber) {
      errors.push('Spike validation requires plan.md and the numeric phase number');
    } else {
      const parsed = parsePhasesTable(options.planMarkdown);
      if (parsed.errors.length > 0) {
        errors.push(...parsed.errors.map((error) => `plan.md:${error.line}: ${error.message}`));
      } else {
        const row = parsed.phases.find((phase) => phase.number === options.phaseNumber);
        if (!row) errors.push(`Spike phase ${options.phaseNumber} is missing from plan.md`);
        const spikeResult = sectionBody(markdown, '## Spike Result') ?? '';
        const approvalResume = row?.status === 'in_progress'
          && /\bStatus\s*[:|]\s*approved\b/i.test(spikeResult);
        for (const dependent of parsed.phases.filter((phase) => phase.blockedBy.includes(options.phaseNumber!))) {
          dependentPhases.push(dependent.number);
          const resumeTodo = approvalResume && dependent.status === 'todo';
          if (dependent.status !== 'blocked' && !resumeTodo) {
            errors.push(`Dependent phase ${dependent.number} must remain blocked until the spike decision is approved`);
          }
          if (resumeTodo) {
            const unresolved = dependent.blockedBy
              .filter((number) => number !== options.phaseNumber)
              .filter((number) => {
                const blocker = parsed.phases.find((phase) => phase.number === number);
                return !blocker || (blocker.status !== 'done' && blocker.status !== 'skipped');
              });
            if (unresolved.length > 0) {
              errors.push(`Dependent phase ${dependent.number} was unblocked while other blockers remain unresolved`);
            }
          }
          if (row && !row.blocks.includes(dependent.number)) {
            errors.push(`Spike phase ${row.number} Blocks column must include dependent phase ${dependent.number}`);
          }
        }
        if (dependentPhases.length === 0) errors.push('Spike phase must block at least one downstream phase');
      }
    }
  } else if (rawType === undefined) {
    warnings.push('phase_type absent; treated as a legacy-compatible normal phase');
  }

  return { valid: errors.length === 0, phaseType, errors, warnings, dependentPhases };
}

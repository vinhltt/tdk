export const SPECIFICATION_QUALITY_GATE_HEADING = '## Specification Quality Gate';

export type SpecificationQualityStatus = 'pass' | 'warn' | 'fail';
export type SpecificationQualitySource = 'tdk-specify' | 'tdk-clarify';

export interface SpecificationQualityGate {
  status: SpecificationQualityStatus;
  iterations: number;
  source: SpecificationQualitySource;
  lastChecked: string;
  blockingIssues: string[];
}

export interface SpecificationQualityGateResult {
  allowed: boolean;
  mode: 'embedded' | 'legacy' | 'blocked';
  gate?: SpecificationQualityGate;
  errors: string[];
  warnings: string[];
}

function extractHeadingSection(markdown: string, heading: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return null;

  const endOffset = lines
    .slice(start + 1)
    .findIndex((line) => /^##\s+/.test(line.trim()));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return lines.slice(start + 1, end).join('\n');
}

function parseGateTable(section: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 2 || cells[0] === 'Field' || /^-+$/.test(cells[0] ?? '')) continue;
    values.set((cells[0] ?? '').toLowerCase(), cells[1] ?? '');
  }
  return values;
}

function parseBlockingIssues(section: string): string[] {
  const lines = section.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === '### Blocking Issues');
  if (start < 0) return ['Missing `### Blocking Issues` section'];

  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^###\s+/.test(line.trim())) break;
    const trimmed = line.trim();
    if (!trimmed || /^none\.?$/i.test(trimmed)) continue;
    body.push(trimmed.replace(/^[-*]\s+/, ''));
  }
  return body;
}

export function validateSpecificationQualityGate(
  markdown: string,
  options: { legacyChecklistExists?: boolean } = {},
): SpecificationQualityGateResult {
  const section = extractHeadingSection(markdown, SPECIFICATION_QUALITY_GATE_HEADING);
  if (section === null) {
    if (options.legacyChecklistExists) {
      return {
        allowed: true,
        mode: 'legacy',
        errors: [],
        warnings: ['Embedded quality gate missing; accepted legacy checklists/requirements.md fallback'],
      };
    }
    return {
      allowed: false,
      mode: 'blocked',
      errors: ['Missing `## Specification Quality Gate` and no legacy checklist fallback exists'],
      warnings: [],
    };
  }

  const table = parseGateTable(section);
  const errors: string[] = [];
  const warnings: string[] = [];
  const statusValue = table.get('status');
  const iterationsValue = table.get('iterations');
  const sourceValue = table.get('source');
  const lastChecked = table.get('last checked') ?? '';

  if (!['pass', 'warn', 'fail'].includes(statusValue ?? '')) {
    errors.push('Quality gate Status must be pass, warn, or fail');
  }
  const iterations = Number(iterationsValue);
  if (!/^\d+$/.test(iterationsValue ?? '') || !Number.isInteger(iterations) || iterations < 0 || iterations > 3) {
    errors.push('Quality gate Iterations must be an integer from 0 to 3');
  }
  if (!['tdk-specify', 'tdk-clarify'].includes(sourceValue ?? '')) {
    errors.push('Quality gate Source must be tdk-specify or tdk-clarify');
  }
  if (!lastChecked) errors.push('Quality gate Last Checked must not be empty');

  const blockingIssues = parseBlockingIssues(section);
  if (blockingIssues[0] === 'Missing `### Blocking Issues` section') {
    errors.push(blockingIssues[0]);
  }

  if (statusValue === 'fail') errors.push('Quality gate status is fail');
  if ((statusValue === 'pass' || statusValue === 'warn') && blockingIssues.length > 0) {
    errors.push(`Quality gate ${statusValue} cannot have blocking issues`);
  }
  if (statusValue === 'warn') warnings.push('Quality gate status is warn with no blocking issues');

  const gate = errors.length === 0
    ? {
        status: statusValue as SpecificationQualityStatus,
        iterations,
        source: sourceValue as SpecificationQualitySource,
        lastChecked,
        blockingIssues,
      }
    : undefined;

  return {
    allowed: errors.length === 0,
    mode: errors.length === 0 ? 'embedded' : 'blocked',
    ...(gate ? { gate } : {}),
    errors,
    warnings,
  };
}

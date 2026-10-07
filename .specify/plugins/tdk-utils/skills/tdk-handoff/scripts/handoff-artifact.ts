import { stringify } from 'yaml';
import { z } from 'zod';
import { containsSensitiveHandoffText, sanitizeHandoffText } from './handoff-redaction';

const SECTION_ORDER = [
  { key: 'mission', heading: 'Mission and current status' },
  { key: 'scope', heading: 'Scope and guardrails' },
  { key: 'current_state', heading: 'Current state' },
  { key: 'decisions', heading: 'Decisions and rationale' },
  { key: 'work_performed', heading: 'Work performed' },
  { key: 'verification', heading: 'Verification' },
  { key: 'risks', heading: 'Open risks and blockers' },
  { key: 'next_actions', heading: 'Exact next actions' },
  { key: 'sources', heading: 'Source pointers' },
] as const;

const TITLE_CONTROLS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const nonemptyText = z.string().refine((value) => value.trim().length > 0);
const packetSchema = z.object({
  kind: z.enum(['continuation', 'spec', 'investigation', 'feature', 'upstream-bug']),
  title: nonemptyText.refine((value) => !TITLE_CONTROLS.test(value)),
  focus: z.string().nullable(),
  source_task: z.string().nullable(),
  source_issue: z.string().nullable(),
  intended_recipient: z.string().nullable(),
  target_project: z.string().nullable(),
  sections: z.object({
    mission: nonemptyText,
    scope: nonemptyText,
    current_state: nonemptyText,
    decisions: nonemptyText,
    work_performed: nonemptyText,
    verification: nonemptyText,
    risks: nonemptyText,
    next_actions: nonemptyText,
    sources: nonemptyText,
  }).strict(),
}).strict();

export interface RenderedHandoffArtifact {
  body: string;
  kind: string;
  redactions: number;
  date: string;
}

interface Heading {
  level: 1 | 2;
  text: string;
}

type Container = 'quote' | number;
interface Fence {
  character: string;
  length: number;
  containers: Container[];
}

function normalizeSection(value: string): string {
  return value.replace(/\r\n?|\u2028|\u2029/g, '\n')
    .replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, '');
}

function expandTabs(value: string): string {
  let added = 0;
  return value.replace(/\t/g, (_tab: string, index: number) => {
    const width = 4 - (index + added) % 4;
    added += width - 1;
    return ' '.repeat(width);
  });
}

function stripContainers(line: string, active: Container[]): { content: string; containers: Container[] } {
  let content = expandTabs(line);
  const containers: Container[] = [];
  for (const container of active) {
    if (container === 'quote') {
      const quote = /^ {0,3}> ?/.exec(content);
      if (!quote) break;
      content = content.slice(quote[0].length);
    } else {
      // Blank list continuations need not repeat their indentation.
      if (content.trim().length === 0) {
        return { content, containers: [...containers, ...active.slice(containers.length)] };
      }
      if (!content.startsWith(' '.repeat(container))) break;
      content = content.slice(container);
    }
    containers.push(container);
  }
  for (;;) {
    const quote = /^ {0,3}> ?/.exec(content);
    if (quote) {
      containers.push('quote');
      content = content.slice(quote[0].length);
      continue;
    }
    if (/^ {0,3}(?:(?:\* *){3,}|(?:- *){3,}|(?:_ *){3,})$/.test(content)) {
      return { content, containers };
    }
    const list = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?: {1,4}(?! )| *$)/.exec(content);
    if (!list) return { content, containers };
    content = content.slice(list[0].length);
    containers.push(content.length === 0 ? list[0].trimEnd().length + 1 : list[0].length);
  }
}

function fenceContent(line: string, containers: Container[]): string {
  let content = expandTabs(line);
  for (const container of containers) {
    if (container === 'quote') {
      const quote = /^ {0,3}> ?/.exec(content);
      if (!quote) throw new Error('invalid_structure');
      content = content.slice(quote[0].length);
      continue;
    }
    if (content.trim().length === 0) continue;
    if (!content.startsWith(' '.repeat(container))) throw new Error('invalid_structure');
    content = content.slice(container);
  }
  return content;
}

/**
 * Bun reports actual Markdown blocks, but implicitly closes unfinished fences.
 * Keep only the explicit fence-closure check here; heading and item boundaries
 * are determined by Bun rather than by this bounded container scan.
 */
function validateFences(value: string): void {
  let fence: Fence | null = null;
  let active: Container[] = [];
  let previousParagraph = false;
  for (const line of value.split('\n')) {
    if (fence) {
      const content = fenceContent(line, fence.containers);
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(content);
      if (closing && closing[1]![0] === fence.character && closing[1]!.length >= fence.length) {
        active = fence.containers;
        fence = null;
      }
      continue;
    }
    const { content, containers } = stripContainers(line, active);
    // CommonMark permits unindented lazy paragraph lines inside an active list/quote.
    // Keep that container until a blank line or a new block ends the paragraph.
    const lazy = previousParagraph && containers.length < active.length &&
      containers.every((container, index) => container === active[index]) &&
      content.trim().length > 0 && !/^ {0,3}(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,}|<|(?:[-*_]\s*){3,}$)/.test(content);
    if (!lazy) active = containers;
    previousParagraph = content.trim().length > 0;
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(content);
    if (opening && (opening[1]![0] !== '`' || !opening[2]!.includes('`'))) {
      fence = { character: opening[1]![0]!, length: opening[1]!.length, containers };
      previousParagraph = false;
    }
  }
  if (fence) throw new Error('invalid_structure');
}

function collectHeadings(value: string): Heading[] {
  const headings: Heading[] = [];
  let codeBlocks = 0;
  Bun.markdown.render(value, {
    text: (text) => text,
    heading: (text, { level }) => {
      if (level === 1 || level === 2) headings.push({ level, text });
      return '';
    },
    html: (html) => {
      // Check actual raw-HTML nodes, not escaped text or code examples.
      if (/<(?:\/?h[12](?:\s|[/>]|$)|!--|\?|!\[CDATA\[|![A-Z]|(?:script|pre|style|textarea|title|iframe|xmp|noembed|noframes|plaintext)(?:\s|[/>]|$))/i.test(html)) {
        throw new Error('invalid_structure');
      }
      return '';
    },
    code: () => { codeBlocks++; return ''; },
    image: () => '',
  });
  // Bun's html callback excludes inline raw HTML. Inspect rendered HTML too:
  // escaped text/code stays entity-encoded, unlike an injected real element.
  const html = Bun.markdown.html(value);
  const actualHeadings = html.match(/<h[12](?=[\s/>])/gi)?.length ?? 0;
  const actualPreBlocks = html.match(/<pre(?=[\s/>])/gi)?.length ?? 0;
  if (actualHeadings !== headings.length || actualPreBlocks !== codeBlocks ||
      /<(?:!--|\?|!\[CDATA\[|![A-Z]|(?:script|style|textarea|title|iframe|xmp|noembed|noframes|plaintext)(?:\s|[/>]|$))/i.test(html)) {
    throw new Error('invalid_structure');
  }
  validateFences(value);
  return headings;
}

function validateSection(value: string): void {
  if (value.trim().length === 0 || collectHeadings(value).length !== 0) {
    throw new Error('invalid_structure');
  }
}

function validateFirstSafeStep(value: string): void {
  const prefix = '1. **First safe step**';
  if (!value.startsWith(prefix)) throw new Error('invalid_structure');
  if (!/^(?:[ \t]*:|[ \t\n])/.test(value.slice(prefix.length))) throw new Error('invalid_structure');
  let description = '';
  Bun.markdown.render(value, {
    text: (text) => text,
    paragraph: (text) => `${text}\n`,
    html: () => '',
    image: () => '',
    listItem: (text, { index, depth, ordered, start }) => {
      if (description.length === 0 && index === 0 && depth === 0 && ordered && start === 1) {
        description = text;
      }
      return text;
    },
  });
  if (!description.startsWith('First safe step')) {
    throw new Error('invalid_structure');
  }
  const usefulText = description.slice('First safe step'.length)
    .replace(/\[?REDACTED:[a-z][a-z0-9-]*\]?/g, '')
    .replace(/Not captured in this session/gi, '');
  // The sender's agent contract owns live-state re-verification semantics.
  // This boundary proves a surviving action, not English phrasing or truth.
  if (!/[\p{L}\p{N}]/u.test(usefulText)) throw new Error('invalid_structure');
}

function localClock(now: Date): { date: string; generatedAt: string } {
  if (!Number.isFinite(now.getTime())) throw new Error('invalid_packet');
  const year = now.getFullYear();
  if (year < 0 || year > 9999) throw new Error('invalid_packet');
  const yyyy = String(year).padStart(4, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const time = `${hh}:${minutes}:${seconds}`;
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  const offset = -now.getTimezoneOffset();
  const magnitude = Math.abs(offset);
  const offsetHours = String(Math.floor(magnitude / 60)).padStart(2, '0');
  const offsetMinutes = String(magnitude % 60).padStart(2, '0');
  return {
    date: `${yyyy}${mm}${dd}`,
    generatedAt: `${yyyy}-${mm}-${dd}T${time}.${milliseconds}${offset >= 0 ? '+' : '-'}${offsetHours}:${offsetMinutes}`,
  };
}

function validateDocument(body: string, title: string): void {
  const frontmatterEnd = body.indexOf('\n---\n', 4);
  if (!body.startsWith('---\n') || frontmatterEnd < 0) throw new Error('invalid_structure');
  const headings = collectHeadings(body.slice(frontmatterEnd + 5));
  if (headings.length !== SECTION_ORDER.length + 1 ||
      headings[0]?.level !== 1 || headings[0].text !== `HANDOFF: ${title}`) {
    throw new Error('invalid_structure');
  }
  for (let index = 0; index < SECTION_ORDER.length; index++) {
    const heading = headings[index + 1];
    if (heading?.level !== 2 || heading.text !== SECTION_ORDER[index]!.heading) {
      throw new Error('invalid_structure');
    }
  }
}

export function renderHandoffArtifact(input: unknown, now: Date = new Date()): RenderedHandoffArtifact {
  try {
    const parsed = packetSchema.safeParse(input);
    if (!parsed.success) throw new Error('invalid_packet');
    const packet = parsed.data;
    if (packet.focus !== null && containsSensitiveHandoffText(packet.focus)) {
      throw new Error('sensitive_focus');
    }

    let redactions = 0;
    const sanitize = (value: string): string => {
      const result = sanitizeHandoffText(value);
      redactions += result.redactions;
      return result.text;
    };
    const sanitizeNullable = (value: string | null): string | null => value === null ? null : sanitize(value);
    const sanitizedTitle = sanitize(packet.title);
    if (sanitizedTitle.trim().length === 0 || TITLE_CONTROLS.test(sanitizedTitle)) {
      throw new Error('invalid_structure');
    }
    const title = sanitizedTitle.trim();
    const kind = sanitize(packet.kind);
    const clock = localClock(now);
    const metadata = {
      handoff_version: 1,
      generated_at: clock.generatedAt,
      kind,
      title,
      source_task: sanitizeNullable(packet.source_task),
      source_issue: sanitizeNullable(packet.source_issue),
      intended_recipient: sanitizeNullable(packet.intended_recipient),
      target_project: sanitizeNullable(packet.target_project),
    };
    const sections = { ...packet.sections };
    for (const { key } of SECTION_ORDER) {
      const original = normalizeSection(packet.sections[key]);
      validateSection(original);
      sections[key] = normalizeSection(sanitize(original));
      validateSection(sections[key]);
    }
    validateFirstSafeStep(normalizeSection(packet.sections.next_actions));
    validateFirstSafeStep(sections.next_actions);
    sections.work_performed += `\n\nRedactions applied: ${redactions}.`;

    // CommonMark permits backslash escaping for every ASCII punctuation character.
    const escapedTitle = title.replace(/[!-\/:-@\[-`{-~]/g, '\\$&');
    const markdown = [`# HANDOFF: ${escapedTitle}`, ...SECTION_ORDER.map(({ key, heading }) =>
      `## ${heading}\n\n${sections[key]}`)].join('\n\n');
    const body = `---\n${stringify(metadata, { lineWidth: 0 })}---\n\n${markdown}\n`;
    validateDocument(body, title);
    return { body, kind, redactions, date: clock.date };
  } catch (error) {
    if (error instanceof Error && ['invalid_packet', 'sensitive_focus', 'invalid_structure'].includes(error.message)) {
      throw error;
    }
    throw new Error('invalid_packet');
  }
}

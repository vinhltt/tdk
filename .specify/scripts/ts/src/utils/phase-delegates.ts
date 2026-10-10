import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { findRoute, findSection, parseDelegateRouting, type DelegateRoutingDocument } from './delegate-routing';
import type { SubWorkspace } from './types';

export type RoutingDomain = 'test' | 'database' | 'design' | 'implement' | 'research';
export type PlanTestMode = 'none' | 'tdd' | 'ut_backfill';
export type DelegateAnchor = 'key-insights' | 'test-quality-gate';
export type RouteFileState = 'missing' | 'unreadable' | 'present-empty' | 'present-populated';

/** The ordered keyword table shared by planning, implementation and scaffold proposals. */
export const ROUTING_DOMAIN_KEYWORDS = [
  { keywords: ['test', 'ut', 'spec'], domains: ['test'] },
  { keywords: ['database', 'schema', 'migration'], domains: ['database'] },
  { keywords: ['ui', 'component', 'screen', 'mockup'], domains: ['design', 'implement'] },
  { keywords: ['api', 'endpoint', 'service'], domains: ['implement'] },
  { keywords: ['research', 'exploration'], domains: ['research'] },
] as const;

export interface DelegateGroups {
  skills: string[];
  agents: string[];
}

export class PhaseDelegatesError extends Error {
  constructor(public readonly status: string, message: string, public readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'PhaseDelegatesError';
  }
}

export function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface ClassifiedRouteFile {
  state: RouteFileState;
  sha: string | null;
  bytes?: Buffer;
  markdown?: string;
  error?: string;
}

/** Read the canonical filename only; permission errors and broken links are not opt-outs. */
export function classifyRouteFile(path: string): ClassifiedRouteFile {
  try {
    const bytes = readFileSync(path);
    const markdown = bytes.toString('utf-8');
    const populated = parseDelegateRouting(markdown).routes.some((route) => route.delegates.length > 0);
    return { state: populated ? 'present-populated' : 'present-empty', sha: sha256(bytes), bytes, markdown };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        lstatSync(path);
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'missing', sha: null };
      }
    }
    return { state: 'unreadable', sha: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function detectDomains(title: string, overview = '', paths: string[] = []): RoutingDomain[] {
  const text = [title, overview, ...paths].join('\n');
  const domains: RoutingDomain[] = [];
  for (const row of ROUTING_DOMAIN_KEYWORDS) {
    if (!row.keywords.some((keyword) => new RegExp(`(?:^|[^a-z0-9])${keyword}s?(?=$|[^a-z0-9])`, 'i').test(text))) continue;
    for (const domain of row.domains) if (!domains.includes(domain)) domains.push(domain);
  }
  return domains.length > 0 ? domains : ['implement'];
}

function normalizedPath(path: string): string {
  return posix.normalize(path.replace(/\\/g, '/').replace(/^\.\//, '')).replace(/\/$/, '');
}

export function resolveExpected(
  document: DelegateRoutingDocument,
  subWorkspaces: SubWorkspace[],
  paths: string[],
  domains: RoutingDomain[],
  testMode: PlanTestMode,
): DelegateGroups {
  const matchedNames = new Set(subWorkspaces.filter((workspace) => {
    const prefix = normalizedPath(workspace.path);
    return paths.some((path) => {
      const candidate = normalizedPath(path);
      return prefix === '.' || candidate === prefix || candidate.startsWith(`${prefix}/`);
    });
  }).map((workspace) => workspace.name.toLowerCase()));
  // Section order, not the order of file declarations or config entries, is routing order.
  const matchedSectionNames = new Set<string>();
  const matchedSections = document.sections.filter((section) => {
    const name = section.name.toLowerCase();
    if (!matchedNames.has(name) || matchedSectionNames.has(name)) return false;
    matchedSectionNames.add(name);
    return true;
  });
  const global = findSection(document, 'global');
  const sections = matchedSections.length > 0 ? matchedSections : [global];
  const orderedDomains = testMode === 'ut_backfill' ? ['test'] : testMode === 'tdd' ? ['test', ...domains] : domains;
  const delegates: string[] = [];
  for (const domain of new Set(orderedDomains)) {
    for (const section of sections) {
      const localRoute = findRoute(section, domain);
      const route = localRoute?.delegates.length ? localRoute : findRoute(global, domain);
      for (const delegate of route?.delegates ?? []) if (!delegates.includes(delegate)) delegates.push(delegate);
    }
    // A matched workspace with no routing section still receives the per-domain fallback.
    if (matchedSectionNames.size > 0 && matchedSectionNames.size < matchedNames.size) {
      for (const delegate of findRoute(global, domain)?.delegates ?? []) if (!delegates.includes(delegate)) delegates.push(delegate);
    }
  }
  return {
    skills: delegates.filter((delegate) => !delegate.startsWith('@')),
    agents: delegates.filter((delegate) => delegate.startsWith('@')),
  };
}

interface SectionRange { start: number; end: number; group: keyof DelegateGroups }
interface PhaseSection { start: number; end: number; heading: string }
interface PhaseFence { character: string; length: number; indentation: number; line: number; closingIndentation?: number }

function rawLines(markdown: string): string[] {
  return markdown.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function lineText(line: string): string {
  return line.replace(/\r?\n$/, '');
}

/** Shared line-based interpretation, with conservative write admission for container ambiguity. */
function scanPhaseMarkdown(lines: string[]): { title: string; prose: boolean[]; sections: PhaseSection[]; openFence: PhaseFence | undefined; ambiguousFence: PhaseFence | undefined } {
  const prose: boolean[] = [];
  const sections: PhaseSection[] = [];
  let title: string | undefined;
  let current: PhaseSection | undefined;
  let fence: PhaseFence | undefined;
  let ambiguousFence: PhaseFence | undefined;
  for (let i = 0; i < lines.length; i++) {
    const text = lineText(lines[i]!);
    const marker = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(text);
    prose.push(false);
    if (fence) {
      if (marker && marker[2]![0] === fence.character && marker[2]!.length >= fence.length && /^[ \t]*$/.test(marker[3]!)) {
        fence.closingIndentation = marker[1]!.length;
        if (fence.indentation > 0 && fence.closingIndentation !== fence.indentation) ambiguousFence ??= fence;
        fence = undefined;
      }
      continue;
    }
    // A backtick info string cannot contain backticks; tilde info strings can.
    if (marker && (marker[2]![0] !== '`' || !marker[3]!.includes('`'))) {
      fence = { character: marker[2]![0]!, length: marker[2]!.length, indentation: marker[1]!.length, line: i + 1 };
      continue;
    }
    prose[i] = true;
    if (/^# /.test(text)) {
      title ??= text.slice(2);
      if (current) current.end = i;
      current = undefined;
    } else if (/^## /.test(text)) {
      if (current) current.end = i;
      current = { start: i, end: lines.length, heading: text };
      sections.push(current);
    }
  }
  if (fence && fence.indentation > 0) ambiguousFence ??= fence;
  return { title: title ?? '', prose, sections, openFence: fence, ambiguousFence };
}

function delegateSections(sections: PhaseSection[]): SectionRange[] {
  const ranges: SectionRange[] = [];
  for (const section of sections) {
    if (section.heading !== '## Delegate Skills' && section.heading !== '## Delegate Agents') continue;
    ranges.push({ start: section.start, end: section.end, group: section.heading === '## Delegate Skills' ? 'skills' : 'agents' });
  }
  return ranges;
}

function bulletToken(line: string, group: keyof DelegateGroups): string | undefined {
  const bullet = /^\s*-\s+(.+?)\s*$/.exec(lineText(line));
  if (!bullet?.[1] || /[{}]|your-|\(default/i.test(bullet[1])) return;
  const prefix = group === 'skills' ? '/' : '@';
  const quoted = new RegExp('`(' + prefix + '[^`\\s]+)`').exec(bullet[1]);
  const raw = new RegExp('(?:^|\\s)(' + prefix + '[^\\s`]+)').exec(bullet[1]);
  // Keep an unrecognized bullet visible in drift output rather than silently losing it.
  return quoted?.[1] ?? raw?.[1] ?? bullet[1];
}

export function parsePhaseDelegates(markdown: string): DelegateGroups {
  const lines = rawLines(markdown);
  const { prose, sections } = scanPhaseMarkdown(lines);
  const groups: DelegateGroups = { skills: [], agents: [] };
  for (const section of delegateSections(sections)) {
    for (let i = section.start + 1; i < section.end; i++) {
      if (!prose[i]) continue;
      const token = bulletToken(lines[i]!, section.group);
      if (token && !groups[section.group].includes(token)) groups[section.group].push(token);
    }
  }
  return groups;
}

export function extractPhaseRoutingInput(markdown: string): { title: string; overview: string; paths: string[] } {
  const lines = rawLines(markdown);
  const { title, prose, sections } = scanPhaseMarkdown(lines);
  const sectionBody = (heading: string): string[] => {
    const section = sections.find((section) => section.heading === `## ${heading}`);
    if (!section) return [];
    const body: string[] = [];
    for (let i = section.start + 1; i < section.end; i++) if (prose[i]) body.push(lineText(lines[i]!));
    return body;
  };
  const paths: string[] = [];
  for (const line of sectionBody('Related Code Files')) {
    const quoted = [...line.matchAll(/`([^`]+)`/g)];
    const candidates = quoted.length > 0 ? quoted.map((match) => match[1]!) :
      [/^\s*-\s+(?:(?:Create|Modify|Read|Delete)\s*:\s*)?(\S+)/i.exec(line)?.[1]].filter((value): value is string => !!value);
    for (const candidate of candidates) if (!paths.includes(candidate)) paths.push(candidate);
  }
  return { title, overview: sectionBody('Overview').join('\n'), paths };
}

/** Rewrite only clean delegate sections; preserve every other byte and unchanged section slices. */
export function rewriteDelegateSections(markdown: string, expected: DelegateGroups, anchor: DelegateAnchor): string {
  const original = rawLines(markdown);
  const purposes: Record<keyof DelegateGroups, Map<string, string>> = { skills: new Map(), agents: new Map() };
  const { sections, ambiguousFence } = scanPhaseMarkdown(original);
  const ranges = delegateSections(sections);
  const existing: Record<keyof DelegateGroups, { section: SectionRange; tokens: string[] }[]> = { skills: [], agents: [] };
  for (const section of ranges) {
    const heading = `## Delegate ${section.group === 'skills' ? 'Skills' : 'Agents'}`;
    const tokens: string[] = [];
    for (let i = section.start + 1; i < section.end; i++) {
      const text = lineText(original[i]!);
      if (text.trim() === '') continue;
      if (/^\s*(?:`{3,}|~{3,})/.test(text)) {
        throw new PhaseDelegatesError('delegate_section_in_fence', `Cannot rewrite ${heading}: fence content on line ${i + 1} is not a managed delegate bullet; clean the section manually.`);
      }
      const token = bulletToken(original[i]!, section.group);
      if (!text.startsWith('-') || !token?.startsWith(section.group === 'skills' ? '/' : '@')) {
        throw new PhaseDelegatesError('delegate_section_not_clean', `Cannot rewrite ${heading}: content on line ${i + 1} is not a managed delegate bullet; clean the section manually.`);
      }
      tokens.push(token);
      if (!purposes[section.group].has(token)) purposes[section.group].set(token, text);
    }
    existing[section.group].push({ section, tokens });
  }
  const lines = [...original];
  for (let i = ranges.length - 1; i >= 0; i--) {
    const section = ranges[i]!;
    lines.splice(section.start, section.end - section.start);
  }
  const newline = /\r\n|\n/.exec(markdown)?.[0] ?? '\n';
  const block: string[] = [];
  for (const group of ['skills', 'agents'] as const) {
    if (expected[group].length === 0) continue;
    if (block.length > 0 && !block[block.length - 1]!.endsWith('\n')) block.push(newline);
    const previous = existing[group];
    if (previous.length === 1 && previous[0]!.tokens.length === expected[group].length &&
      previous[0]!.tokens.every((token, index) => token === expected[group][index])) {
      const { start, end } = previous[0]!.section;
      block.push(...original.slice(start, end));
      continue;
    }
    block.push(`## Delegate ${group === 'skills' ? 'Skills' : 'Agents'}${newline}`);
    for (const token of expected[group]) block.push(`${purposes[group].get(token) ?? `- \`${token}\``}${newline}`);
    block.push(newline);
  }
  const heading = anchor === 'key-insights' ? '## Key Insights' : '## Test Quality Gate';
  let anchorFence: PhaseFence | undefined;
  // Only a non-empty delegate block needs the anchor; deletion and empty-routing no-ops do not.
  if (block.length > 0) {
    const remaining = scanPhaseMarkdown(lines);
    const anchorSection = remaining.sections.find((section) => section.heading === heading);
    if (!anchorSection) throw new PhaseDelegatesError('anchor_missing', `Missing ${heading} delegate anchor; add the ${heading} section and rerun check.`);
    const insertAt = anchorSection.end;
    // Preserve the pre-insertion endpoint: inserting a block changes lines.length.
    anchorFence = insertAt === lines.length ? remaining.openFence : undefined;
    if (insertAt < lines.length && !block[block.length - 1]!.endsWith('\n')) block.push(newline);
    if (insertAt > 0 && !lines[insertAt - 1]!.endsWith('\n')) block.unshift(newline);
    lines.splice(insertAt, 0, ...block);
  }
  const rewritten = lines.join('');
  if (rewritten !== markdown) {
    if (ambiguousFence) {
      const closing = ambiguousFence.closingIndentation === undefined ? 'is unclosed' :
        `closes with ${ambiguousFence.closingIndentation} leading spaces`;
      throw new PhaseDelegatesError('fence_container_ambiguous', `Cannot change delegates: the fence on line ${ambiguousFence.line} opens with ${ambiguousFence.indentation} leading spaces and ${closing}; CommonMark list-container boundaries may differ. Align opener/closer indentation or close the fence manually, then rerun check.`);
    }
    if ((expected.skills.length > 0 || expected.agents.length > 0) && anchorFence) {
      throw new PhaseDelegatesError('anchor_in_fence', `Cannot insert delegates after ${heading}: the anchor ends inside an unclosed ${anchorFence.character.repeat(anchorFence.length)} fence.`);
    }
  }
  return rewritten;
}

/** Length-framed bytes and sorted phase paths make scope and every reviewed input unambiguous. */
export function phaseSnapshotDigest(routeBytes: Buffer | undefined, planBytes: Buffer, configBytes: Buffer, phases: { path: string; bytes: Buffer }[]): string {
  const hash = createHash('sha256');
  const add = (bytes: Buffer) => { hash.update(`${bytes.length}:`).update(bytes); };
  hash.update(routeBytes === undefined ? 'missing:' : 'present:');
  if (routeBytes !== undefined) add(routeBytes);
  add(planBytes);
  add(configBytes);
  for (const phase of [...phases].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    add(Buffer.from(phase.path));
    add(phase.bytes);
  }
  return hash.digest('hex');
}

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseConfig } from './config';
import {
  normalizeSkillName,
  type RoutingProposal,
  type RoutingProposalEntry,
} from './plan-skill-routing-proposal';

const ROUTING_RELATIVE_PATH = ['custom-workflow', 'plan-skill-routing.md'] as const;
const DEFAULT_SKILL_PLACEHOLDER = '(default - no special skill)';

export interface PlanSkillRoute {
  section: string;
  domain: string;
  skills: string[];
  lineIndex: number;
  raw: string;
}

export interface PlanSkillRoutingSection {
  name: string;
  headingLine: number;
  routes: PlanSkillRoute[];
}

export interface PlanSkillRoutingDocument {
  lines: string[];
  trailingNewline: boolean;
  sections: PlanSkillRoutingSection[];
  routes: PlanSkillRoute[];
}

export interface RouteCheckResult {
  warnings: string[];
  errors: string[];
}

export type RoutingOperationType = 'add' | 'update' | 'noop' | 'remove-duplicate' | 'dedupe-skills';

export interface RoutingOperation {
  type: RoutingOperationType;
  section: string;
  domain: string;
  from?: string[];
  to?: string[];
  reason?: string;
}

export interface RoutingMutationResult {
  markdown: string;
  operations: RoutingOperation[];
  warnings: string[];
  changed: boolean;
}

export class PlanSkillRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanSkillRoutingError';
  }
}

export function resolvePlanSkillRoutingPath(projectRoot: string): string {
  const root = resolve(projectRoot);
  const configPath = join(root, '.specify', '.specify.json');
  if (!existsSync(configPath)) {
    throw new Error(`Missing config: ${configPath}`);
  }
  const { config, error } = parseConfig(configPath);
  if (error || !config) {
    throw new Error(error ?? `Unable to parse config: ${configPath}`);
  }
  const docsPath = config.docs?.path ?? '.specify/configurations';
  const docsRoot = isAbsolute(docsPath) ? resolve(docsPath) : resolve(root, docsPath);
  const rel = relative(root, docsRoot);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new PlanSkillRoutingError(`docs.path must resolve inside project root: ${docsPath}`);
  }
  return join(docsRoot, ...ROUTING_RELATIVE_PATH);
}

function splitMarkdown(markdown: string): { lines: string[]; trailingNewline: boolean } {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const trailingNewline = normalized.endsWith('\n');
  const body = trailingNewline ? normalized.slice(0, -1) : normalized;
  return {
    lines: body.length === 0 ? [] : body.split('\n'),
    trailingNewline,
  };
}

function isHtmlCommentLine(line: string): boolean {
  return line.trimStart().startsWith('<!--');
}

function isDefaultPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === 'none' ||
    normalized === 'n/a' ||
    (normalized.includes('default') && normalized.includes('no special skill'))
  );
}

function parseRouteSkills(value: string): string[] {
  if (isDefaultPlaceholder(value)) return [];
  const skills: string[] = [];
  for (const raw of value.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed || isDefaultPlaceholder(trimmed)) continue;
    try {
      const skill = normalizeSkillName(trimmed);
      if (!skills.includes(skill)) skills.push(skill);
    } catch {
      if (!skills.includes(trimmed)) skills.push(trimmed);
    }
  }
  return skills;
}

export function parsePlanSkillRouting(markdown: string): PlanSkillRoutingDocument {
  const { lines, trailingNewline } = splitMarkdown(markdown);
  const sections: PlanSkillRoutingSection[] = [];
  const routes: PlanSkillRoute[] = [];
  let current: PlanSkillRoutingSection | undefined;

  lines.forEach((line, lineIndex) => {
    if (!isHtmlCommentLine(line)) {
      const heading = /^##\s+(.+?)\s*$/.exec(line);
      if (heading?.[1]) {
        current = { name: heading[1].trim(), headingLine: lineIndex, routes: [] };
        sections.push(current);
        return;
      }
    }

    if (!current || isHtmlCommentLine(line)) return;
    const route = /^\s*-\s*([^:]+?)\s*:\s*(.*?)\s*$/.exec(line);
    if (!route?.[1]) return;
    const activeRoute: PlanSkillRoute = {
      section: current.name,
      domain: route[1].trim(),
      skills: parseRouteSkills(route[2] ?? ''),
      lineIndex,
      raw: line,
    };
    current.routes.push(activeRoute);
    routes.push(activeRoute);
  });

  return { lines, trailingNewline, sections, routes };
}

export function formatPlanSkillRouting(document: PlanSkillRoutingDocument): string {
  const body = document.lines.join('\n');
  return document.trailingNewline ? `${body}\n` : body;
}

function routeKey(section: string, domain: string): string {
  return `${section.toLowerCase()}\u0000${domain.toLowerCase()}`;
}

function skillsKey(skills: string[]): string {
  return skills.join('\u0000');
}

function renderRoute(domain: string, skills: string[]): string {
  const value = skills.length > 0 ? skills.join(', ') : DEFAULT_SKILL_PLACEHOLDER;
  return `- ${domain}: ${value}`;
}

function findSection(
  document: PlanSkillRoutingDocument,
  section: string,
): PlanSkillRoutingSection | undefined {
  const wanted = section.toLowerCase();
  return document.sections.find((candidate) => candidate.name.toLowerCase() === wanted);
}

function findRoute(
  section: PlanSkillRoutingSection | undefined,
  domain: string,
): PlanSkillRoute | undefined {
  const wanted = domain.toLowerCase();
  return section?.routes.find((route) => route.domain.toLowerCase() === wanted);
}

export function checkPlanSkillRouting(document: PlanSkillRoutingDocument): RouteCheckResult {
  const seen = new Map<string, { section: string; domain: string; skills: string[] }>();
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const route of document.routes) {
    const key = routeKey(route.section, route.domain);
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, route);
      continue;
    }
    if (skillsKey(previous.skills) === skillsKey(route.skills)) {
      warnings.push(`Duplicate route '${route.domain}' in '${route.section}' has identical skills.`);
    } else {
      errors.push(`Conflicting route '${route.domain}' in '${route.section}' has multiple skill lists.`);
    }
  }

  return { warnings, errors };
}

function assertNoRouteConflicts(document: PlanSkillRoutingDocument): void {
  const check = checkPlanSkillRouting(document);
  if (check.errors.length > 0) {
    throw new PlanSkillRoutingError(
      `Cannot use routing proposal while route file has conflicts: ${check.errors.join('; ')}`,
    );
  }
}

function enforceProposalOperation(
  entry: RoutingProposalEntry,
  operation: RoutingOperation,
): void {
  if (entry.operation === 'register' || operation.type === 'noop') return;
  if (entry.operation !== operation.type) {
    throw new PlanSkillRoutingError(
      `Proposal operation '${entry.operation}' cannot ${operation.type} route '${entry.domain}' in '${entry.subWorkspace}'.`,
    );
  }
}

function operationForEntry(
  document: PlanSkillRoutingDocument,
  entry: RoutingProposalEntry,
): RoutingOperation {
  const section = findSection(document, entry.subWorkspace);
  const route = findRoute(section, entry.domain);
  let operation: RoutingOperation;
  if (!route) {
    operation = {
      type: 'add',
      section: section?.name ?? entry.subWorkspace,
      domain: entry.domain,
      to: entry.skills,
      reason: entry.reason,
    };
  } else if (skillsKey(route.skills) === skillsKey(entry.skills)) {
    operation = {
      type: 'noop',
      section: route.section,
      domain: route.domain,
      from: route.skills,
      to: entry.skills,
      reason: entry.reason,
    };
  } else {
    operation = {
      type: 'update',
      section: route.section,
      domain: route.domain,
      from: route.skills,
      to: entry.skills,
      reason: entry.reason,
    };
  }
  enforceProposalOperation(entry, operation);
  return operation;
}

export function diffRoutingProposal(
  document: PlanSkillRoutingDocument,
  proposal: RoutingProposal,
): { operations: RoutingOperation[]; warnings: string[] } {
  assertNoRouteConflicts(document);
  const operations = proposal.entries.map((entry) => operationForEntry(document, entry));
  const warnings: string[] = [];
  for (const entry of proposal.entries) {
    if (entry.subWorkspace.toLowerCase() === 'global') continue;
    if (!findSection(document, entry.subWorkspace)) {
      warnings.push(
        `Proposal targets new routing section '${entry.subWorkspace}'. Verify the sub-workspace name before register.`,
      );
    }
  }
  return { operations, warnings };
}

function insertRoute(document: PlanSkillRoutingDocument, entry: RoutingProposalEntry): void {
  const section = findSection(document, entry.subWorkspace);
  const rendered = renderRoute(entry.domain, entry.skills);
  if (!section) {
    if (document.lines.length > 0 && document.lines[document.lines.length - 1]?.trim() !== '') {
      document.lines.push('');
    }
    document.lines.push(`## ${entry.subWorkspace}`, '', rendered);
    return;
  }

  const lastRoute = section.routes[section.routes.length - 1];
  const insertAt = lastRoute ? lastRoute.lineIndex + 1 : section.headingLine + 1;
  document.lines.splice(insertAt, 0, rendered);
}

export function registerRoutingProposal(
  markdown: string,
  proposal: RoutingProposal,
): RoutingMutationResult {
  let currentMarkdown = markdown;
  const operations: RoutingOperation[] = [];
  const warnings: string[] = [];

  for (const entry of proposal.entries) {
    const document = parsePlanSkillRouting(currentMarkdown);
    assertNoRouteConflicts(document);
    const operation = operationForEntry(document, entry);
    operations.push(operation);
    if (operation.type === 'noop') continue;

    const section = findSection(document, entry.subWorkspace);
    const route = findRoute(section, entry.domain);
    if (operation.type === 'update' && route) {
      document.lines[route.lineIndex] = renderRoute(entry.domain, entry.skills);
    } else {
      insertRoute(document, entry);
    }
    currentMarkdown = formatPlanSkillRouting(document);
  }

  const changed = currentMarkdown !== markdown;
  return { markdown: currentMarkdown, operations, warnings, changed };
}

export function verifyRoutingProposal(
  document: PlanSkillRoutingDocument,
  proposal: RoutingProposal,
): { verified: boolean; operations: RoutingOperation[]; warnings: string[] } {
  assertNoRouteConflicts(document);
  const diff = diffRoutingProposal(document, proposal);
  return {
    verified: diff.operations.every((operation) => operation.type === 'noop'),
    operations: diff.operations,
    warnings: diff.warnings,
  };
}

export function optimizePlanSkillRouting(markdown: string): RoutingMutationResult {
  const document = parsePlanSkillRouting(markdown);
  const operations: RoutingOperation[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, string>();
  const removeLineIndexes = new Set<number>();

  for (const route of document.routes) {
    const deduped = route.skills.filter((skill, index) => route.skills.indexOf(skill) === index);
    const routeLine = renderRoute(route.domain, deduped);
    if (skillsKey(deduped) !== skillsKey(route.skills) || route.raw !== routeLine) {
      document.lines[route.lineIndex] = routeLine;
      operations.push({
        type: 'dedupe-skills',
        section: route.section,
        domain: route.domain,
        from: route.skills,
        to: deduped,
      });
    }

    const key = routeKey(route.section, route.domain);
    const value = skillsKey(deduped);
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, value);
    } else if (previous === value) {
      removeLineIndexes.add(route.lineIndex);
      operations.push({
        type: 'remove-duplicate',
        section: route.section,
        domain: route.domain,
        from: deduped,
        to: deduped,
      });
    } else {
      warnings.push(`Skipped conflicting duplicate '${route.domain}' in '${route.section}'.`);
    }
  }

  [...removeLineIndexes]
    .sort((a, b) => b - a)
    .forEach((lineIndex) => document.lines.splice(lineIndex, 1));

  const optimized = formatPlanSkillRouting(document);
  return { markdown: optimized, operations, warnings, changed: optimized !== markdown };
}

export function readPlanSkillRoutingTemplate(projectRoot: string): string {
  const templatePath = resolve(projectRoot, '.specify/templates/plan/plan-skill-routing-template.tpl');
  if (existsSync(templatePath)) return readFileSync(templatePath, 'utf-8');
  return [
    '# Plan Skill Routing',
    '',
    '## global',
    '',
    '- research: (default - no special skill)',
    '- implement: (default - no special skill)',
    '- test: /your-consumer-unit-test-skill',
    '',
  ].join('\n');
}

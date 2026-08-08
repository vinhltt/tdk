import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseConfig } from './config';
import {
  normalizeDelegate,
  type RoutingProposal,
  type RoutingProposalEntry,
} from './delegate-routing-proposal';

const ROUTING_RELATIVE_PATH = ['custom-workflow', 'delegate-routing.md'] as const;
const DEFAULT_DELEGATE_PLACEHOLDER = '(default - no delegate)';

export interface DelegateRoute {
  section: string;
  domain: string;
  delegates: string[];
  lineIndex: number;
  raw: string;
}

export interface DelegateRoutingSection {
  name: string;
  headingLine: number;
  routes: DelegateRoute[];
}

export interface DelegateRoutingDocument {
  lines: string[];
  trailingNewline: boolean;
  sections: DelegateRoutingSection[];
  routes: DelegateRoute[];
}

export interface RouteCheckResult {
  warnings: string[];
  errors: string[];
}

export type RoutingOperationType = 'add' | 'update' | 'noop';

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
  changed: boolean;
}

export class DelegateRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DelegateRoutingError';
  }
}

export function resolveDelegateRoutingPath(projectRoot: string): string {
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
    throw new DelegateRoutingError(`docs.path must resolve inside project root: ${docsPath}`);
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
    // Accept the legacy '(default - no special skill)' text alongside the new
    // '(default - no delegate)' text so files written before this rename
    // still parse their placeholder correctly instead of as a real delegate.
    (normalized.includes('default') && normalized.includes('no special skill')) ||
    (normalized.includes('default') && normalized.includes('no delegate'))
  );
}

function parseRouteDelegates(value: string): string[] {
  if (isDefaultPlaceholder(value)) return [];
  const delegates: string[] = [];
  for (const raw of value.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed || isDefaultPlaceholder(trimmed)) continue;
    try {
      const delegate = normalizeDelegate(trimmed);
      if (!delegates.includes(delegate)) delegates.push(delegate);
    } catch {
      if (!delegates.includes(trimmed)) delegates.push(trimmed);
    }
  }
  return delegates;
}

export function parseDelegateRouting(markdown: string): DelegateRoutingDocument {
  const { lines, trailingNewline } = splitMarkdown(markdown);
  const sections: DelegateRoutingSection[] = [];
  const routes: DelegateRoute[] = [];
  let current: DelegateRoutingSection | undefined;

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
    const activeRoute: DelegateRoute = {
      section: current.name,
      domain: route[1].trim(),
      delegates: parseRouteDelegates(route[2] ?? ''),
      lineIndex,
      raw: line,
    };
    current.routes.push(activeRoute);
    routes.push(activeRoute);
  });

  return { lines, trailingNewline, sections, routes };
}

export function formatDelegateRouting(document: DelegateRoutingDocument): string {
  const body = document.lines.join('\n');
  return document.trailingNewline ? `${body}\n` : body;
}

function routeKey(section: string, domain: string): string {
  return `${section.toLowerCase()}\u0000${domain.toLowerCase()}`;
}

function delegatesKey(delegates: string[]): string {
  return delegates.join('\u0000');
}

function renderRoute(domain: string, delegates: string[]): string {
  const value = delegates.length > 0 ? delegates.join(', ') : DEFAULT_DELEGATE_PLACEHOLDER;
  return `- ${domain}: ${value}`;
}

function findSection(
  document: DelegateRoutingDocument,
  section: string,
): DelegateRoutingSection | undefined {
  const wanted = section.toLowerCase();
  return document.sections.find((candidate) => candidate.name.toLowerCase() === wanted);
}

function findRoute(
  section: DelegateRoutingSection | undefined,
  domain: string,
): DelegateRoute | undefined {
  const wanted = domain.toLowerCase();
  return section?.routes.find((route) => route.domain.toLowerCase() === wanted);
}

export function checkDelegateRouting(document: DelegateRoutingDocument): RouteCheckResult {
  const seen = new Map<string, { section: string; domain: string; delegates: string[] }>();
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const route of document.routes) {
    const key = routeKey(route.section, route.domain);
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, route);
      continue;
    }
    if (delegatesKey(previous.delegates) === delegatesKey(route.delegates)) {
      warnings.push(`Duplicate route '${route.domain}' in '${route.section}' has identical delegates.`);
    } else {
      errors.push(`Conflicting route '${route.domain}' in '${route.section}' has multiple delegate lists.`);
    }
  }

  return { warnings, errors };
}

function assertNoRouteConflicts(document: DelegateRoutingDocument): void {
  const check = checkDelegateRouting(document);
  if (check.errors.length > 0) {
    throw new DelegateRoutingError(
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
    throw new DelegateRoutingError(
      `Proposal operation '${entry.operation}' cannot ${operation.type} route '${entry.domain}' in '${entry.subWorkspace}'.`,
    );
  }
}

function operationForEntry(
  document: DelegateRoutingDocument,
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
      to: entry.delegates,
      reason: entry.reason,
    };
  } else if (delegatesKey(route.delegates) === delegatesKey(entry.delegates)) {
    operation = {
      type: 'noop',
      section: route.section,
      domain: route.domain,
      from: route.delegates,
      to: entry.delegates,
      reason: entry.reason,
    };
  } else {
    operation = {
      type: 'update',
      section: route.section,
      domain: route.domain,
      from: route.delegates,
      to: entry.delegates,
      reason: entry.reason,
    };
  }
  enforceProposalOperation(entry, operation);
  return operation;
}

export function diffRoutingProposal(
  document: DelegateRoutingDocument,
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

function insertRoute(document: DelegateRoutingDocument, entry: RoutingProposalEntry): void {
  const section = findSection(document, entry.subWorkspace);
  const rendered = renderRoute(entry.domain, entry.delegates);
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

  for (const entry of proposal.entries) {
    const document = parseDelegateRouting(currentMarkdown);
    assertNoRouteConflicts(document);
    const operation = operationForEntry(document, entry);
    operations.push(operation);
    if (operation.type === 'noop') continue;

    const section = findSection(document, entry.subWorkspace);
    const route = findRoute(section, entry.domain);
    if (operation.type === 'update' && route) {
      document.lines[route.lineIndex] = renderRoute(entry.domain, entry.delegates);
    } else {
      insertRoute(document, entry);
    }
    currentMarkdown = formatDelegateRouting(document);
  }

  const changed = currentMarkdown !== markdown;
  return { markdown: currentMarkdown, operations, changed };
}

export function verifyRoutingProposal(
  document: DelegateRoutingDocument,
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

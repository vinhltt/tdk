export type RoutingProposalOperation = 'add' | 'update' | 'register';

const AUTO_DETECTED_DOMAINS = ['research', 'implement', 'test', 'database', 'design'];

export interface RoutingProposalEntry {
  subWorkspace: string;
  domain: string;
  delegates: string[];
  operation: RoutingProposalOperation;
  reason?: string;
}

export interface RoutingProposal {
  version: 1;
  entries: RoutingProposalEntry[];
  sourceRecommendation?: string;
}

export interface RoutingProposalValidation {
  proposal: RoutingProposal;
  warnings: string[];
}

export class RoutingProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutingProposalError';
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RoutingProposalError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizePlainToken(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new RoutingProposalError(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) {
    throw new RoutingProposalError(`${label} must be a single non-empty line`);
  }
  return trimmed;
}

export function normalizeSkillName(value: unknown): string {
  const trimmed = normalizePlainToken(value, 'skill');
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (!/^\/[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(withSlash)) {
    throw new RoutingProposalError(`invalid skill name: ${trimmed}`);
  }
  return withSlash;
}

export function normalizeAgentName(value: unknown): string {
  const trimmed = normalizePlainToken(value, 'agent');
  if (!/^@[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(trimmed)) {
    throw new RoutingProposalError(`invalid agent name: ${trimmed}`);
  }
  return trimmed;
}

export function normalizeDelegate(value: unknown): string {
  const trimmed = normalizePlainToken(value, 'delegate');
  return trimmed.startsWith('@') ? normalizeAgentName(trimmed) : normalizeSkillName(trimmed);
}

export function normalizeRoutingDomain(value: unknown): string {
  const domain = normalizePlainToken(value, 'domain');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(domain)) {
    throw new RoutingProposalError(`invalid domain: ${domain}`);
  }
  return domain;
}

export function normalizeSubWorkspace(value: unknown): string {
  const subWorkspace = normalizePlainToken(value, 'subWorkspace');
  if (subWorkspace.startsWith('#')) {
    throw new RoutingProposalError(`invalid subWorkspace: ${subWorkspace}`);
  }
  return subWorkspace;
}

function normalizeDelegates(value: unknown): string[] {
  const rawDelegates =
    typeof value === 'string'
      ? value.split(',')
      : Array.isArray(value)
        ? value
        : null;
  if (!rawDelegates) {
    throw new RoutingProposalError('delegates must be an array or comma-separated string');
  }
  const normalized: string[] = [];
  for (const raw of rawDelegates) {
    const delegate = normalizeDelegate(raw);
    if (!normalized.includes(delegate)) normalized.push(delegate);
  }
  if (normalized.length === 0) {
    throw new RoutingProposalError('delegates must contain at least one delegate');
  }
  return normalized;
}

function normalizeOperation(value: unknown): RoutingProposalOperation {
  if (value === undefined) return 'register';
  if (value === 'add' || value === 'update' || value === 'register') return value;
  throw new RoutingProposalError('operation must be add, update, or register');
}

function normalizeEntry(
  raw: unknown,
  index: number,
  warnings: string[],
): RoutingProposalEntry {
  const entry = asRecord(raw, `entries[${index}]`);
  const domain = normalizeRoutingDomain(entry.domain);
  if (!AUTO_DETECTED_DOMAINS.includes(domain)) {
    warnings.push(
      `Domain '${domain}' is outside the auto-detected set (research, implement, test, database, design); no lookup will resolve it.`,
    );
  }
  const normalized: RoutingProposalEntry = {
    subWorkspace: normalizeSubWorkspace(entry.subWorkspace),
    domain,
    delegates: normalizeDelegates(entry.delegates),
    operation: normalizeOperation(entry.operation),
  };
  if (entry.reason !== undefined) {
    normalized.reason = normalizePlainToken(entry.reason, `entries[${index}].reason`);
  }
  return normalized;
}

export function validateRoutingProposal(raw: unknown): RoutingProposalValidation {
  const proposal = asRecord(raw, 'proposal');
  const rawEntries = proposal.entries ?? proposal.routes;
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    throw new RoutingProposalError('proposal entries must be a non-empty array');
  }
  const version = proposal.version ?? 1;
  if (version !== 1) {
    throw new RoutingProposalError('proposal version must be 1');
  }
  const warnings: string[] = [];
  const normalized: RoutingProposal = {
    version: 1,
    entries: rawEntries.map((entry, index) => normalizeEntry(entry, index, warnings)),
  };
  if (proposal.sourceRecommendation !== undefined) {
    normalized.sourceRecommendation = normalizePlainToken(
      proposal.sourceRecommendation,
      'sourceRecommendation',
    );
  }
  return { proposal: normalized, warnings };
}

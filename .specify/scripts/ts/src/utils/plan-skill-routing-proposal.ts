export type RoutingProposalOperation = 'add' | 'update' | 'register';

export interface RoutingProposalEntry {
  subWorkspace: string;
  domain: string;
  skills: string[];
  operation: RoutingProposalOperation;
  reason?: string;
}

export interface RoutingProposal {
  version: 1;
  entries: RoutingProposalEntry[];
  sourceRecommendation?: string;
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

function normalizeSkills(value: unknown): string[] {
  const rawSkills =
    typeof value === 'string'
      ? value.split(',')
      : Array.isArray(value)
        ? value
        : null;
  if (!rawSkills) {
    throw new RoutingProposalError('skills must be an array or comma-separated string');
  }
  const normalized: string[] = [];
  for (const raw of rawSkills) {
    const skill = normalizeSkillName(raw);
    if (!normalized.includes(skill)) normalized.push(skill);
  }
  if (normalized.length === 0) {
    throw new RoutingProposalError('skills must contain at least one skill');
  }
  return normalized;
}

function normalizeOperation(value: unknown): RoutingProposalOperation {
  if (value === undefined) return 'register';
  if (value === 'add' || value === 'update' || value === 'register') return value;
  throw new RoutingProposalError('operation must be add, update, or register');
}

function normalizeEntry(raw: unknown, index: number): RoutingProposalEntry {
  const entry = asRecord(raw, `entries[${index}]`);
  const normalized: RoutingProposalEntry = {
    subWorkspace: normalizeSubWorkspace(entry.subWorkspace),
    domain: normalizeRoutingDomain(entry.domain),
    skills: normalizeSkills(entry.skills),
    operation: normalizeOperation(entry.operation),
  };
  if (entry.reason !== undefined) {
    normalized.reason = normalizePlainToken(entry.reason, `entries[${index}].reason`);
  }
  return normalized;
}

export function validateRoutingProposal(raw: unknown): RoutingProposal {
  const proposal = asRecord(raw, 'proposal');
  const rawEntries = proposal.entries ?? proposal.routes;
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    throw new RoutingProposalError('proposal entries must be a non-empty array');
  }
  const version = proposal.version ?? 1;
  if (version !== 1) {
    throw new RoutingProposalError('proposal version must be 1');
  }
  const normalized: RoutingProposal = {
    version: 1,
    entries: rawEntries.map((entry, index) => normalizeEntry(entry, index)),
  };
  if (proposal.sourceRecommendation !== undefined) {
    normalized.sourceRecommendation = normalizePlainToken(
      proposal.sourceRecommendation,
      'sourceRecommendation',
    );
  }
  return normalized;
}

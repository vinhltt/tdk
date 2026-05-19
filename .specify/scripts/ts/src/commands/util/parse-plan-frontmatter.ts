// Helper for scan-cross-plan-deps: read plan.md, extract YAML frontmatter,
// project to canonical fields {task_id, status, blocks, blockedBy, mode},
// compute sha256 content hash. No filesystem mutation; pure read.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';

export interface CanonicalPlanFields {
  task_id: string | null;
  status: string | null;
  blocks: string[];
  blockedBy: string[];
  mode: string | null;
  schema_version: number | null;
}

export interface FrontmatterResult {
  filePath: string;
  raw: string;
  parsed: Record<string, unknown>;
  canonical: CanonicalPlanFields;
  contentHash: string;
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value == null || value === '') return [];
  return [String(value)];
}

function project(parsed: Record<string, unknown>, fallbackTaskId: string): CanonicalPlanFields {
  const schemaRaw = parsed['schema_version'];
  const schemaNum = typeof schemaRaw === 'number' ? schemaRaw : Number(schemaRaw);
  return {
    task_id: typeof parsed['task_id'] === 'string' ? parsed['task_id'] : fallbackTaskId,
    status: typeof parsed['status'] === 'string' ? parsed['status'] : null,
    blocks: asArray(parsed['blocks']),
    blockedBy: asArray(parsed['blockedBy']),
    mode: typeof parsed['mode'] === 'string' ? parsed['mode'] : null,
    schema_version: Number.isFinite(schemaNum) ? schemaNum : null,
  };
}

function canonicalHash(canonical: CanonicalPlanFields): string {
  // Stable JSON serialization with sorted array contents — equivalent
  // frontmatter (regardless of key order or array-element order) hashes equal.
  const sortable = {
    task_id: canonical.task_id ?? '',
    status: canonical.status ?? '',
    mode: canonical.mode ?? '',
    blocks: [...canonical.blocks].sort(),
    blockedBy: [...canonical.blockedBy].sort(),
  };
  return 'sha256:' + createHash('sha256').update(JSON.stringify(sortable)).digest('hex');
}

export function extractFrontmatter(filePath: string, fallbackTaskId: string): FrontmatterResult | null {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return null;
  const block = match[1] ?? '';

  let parsed: Record<string, unknown>;
  try {
    const yamlValue = parseYaml(block);
    parsed = (yamlValue && typeof yamlValue === 'object' ? yamlValue : {}) as Record<string, unknown>;
  } catch {
    return null;
  }
  const canonical = project(parsed, fallbackTaskId);
  return {
    filePath,
    raw: block,
    parsed,
    canonical,
    contentHash: canonicalHash(canonical),
  };
}

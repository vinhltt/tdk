import * as path from 'node:path';
import { stringify } from 'yaml';
import { sha256Buffer, sha256File } from './checksum';
import { mapClaudeTools } from './lib/harness-transform/claude-tool-to-omp';
import { ompTargetRelativePath } from './omp-target-mapper';
import type { ConvertTargetFile, FlatClaudeAgentRecord } from './flat-claude-types';
import type { OmpModelMap } from './install-settings';

const SUPPORTED_AGENT_FIELDS: Readonly<Record<string, true>> = {
  name: true,
  description: true,
  tools: true,
  model: true,
};

const DEFAULT_AGENT_OUTPUT = {
  properties: {
    result: {
      metadata: { description: 'Agent result' },
      type: 'string',
    },
  },
} as const;

export interface OmpAgentEmitResult {
  files: ConvertTargetFile[];
  warnings: string[];
}

interface ValidAgent {
  record: FlatClaudeAgentRecord;
  name: string;
  description: string;
}

function explicitString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function validateAgents(records: FlatClaudeAgentRecord[]): ValidAgent[] {
  const valid: ValidAgent[] = [];
  const invalid: string[] = [];
  const sourcesByName = new Map<string, string[]>();
  for (const record of records) {
    if (path.basename(record.sourceRelativePath).startsWith('_')) continue;
    const name = explicitString(record.frontmatter.name);
    const description = explicitString(record.frontmatter.description);
    if (name) {
      const sources = sourcesByName.get(name) ?? [];
      sources.push(record.sourceRelativePath);
      sourcesByName.set(name, sources);
    }
    const reasons: string[] = [];
    if (record.frontmatterParseError) reasons.push(record.frontmatterParseError);
    if (!name) reasons.push('missing explicit name');
    if (!description) reasons.push('missing description');
    if (reasons.length > 0 || !name || !description) {
      invalid.push(`- ${record.sourceRelativePath} (${record.name}): ${reasons.join('; ')}`);
      continue;
    }
    valid.push({ record, name, description });
  }
  for (const [name, sources] of sourcesByName) {
    if (sources.length > 1) {
      invalid.push(`- duplicate explicit name "${name}": ${sources.sort().join(', ')}`);
    }
  }
  if (invalid.length > 0) {
    throw new Error(`Invalid OMP agent sources:\n${invalid.join('\n')}`);
  }
  return valid;
}

export function emitOmpAgentFiles(records: FlatClaudeAgentRecord[], modelMap: OmpModelMap): OmpAgentEmitResult {
  const agents = validateAgents(records);
  const files: ConvertTargetFile[] = [];
  const warnings: string[] = [];

  for (const { record, name, description } of agents) {
    const label = `OMP agent ${name} (${record.sourceRelativePath})`;
    const frontmatter: Record<string, unknown> = {
      name,
      description,
      output: DEFAULT_AGENT_OUTPUT,
    };
    if (Object.hasOwn(record.frontmatter, 'tools')) {
      const mapped = mapClaudeTools(record.frontmatter.tools);
      if (mapped.tools !== undefined) frontmatter.tools = mapped.tools;
      for (const dropped of mapped.dropped) warnings.push(`${label} dropped unsupported tool: ${dropped}`);
      if (mapped.usesDefaultTools) {
        warnings.push(`${label} uses wildcard tools; OMP default-tool semantics may differ`);
      }
    }

    if (Object.hasOwn(record.frontmatter, 'model')) {
      const model = explicitString(record.frontmatter.model);
      const mappedModel = model && Object.hasOwn(modelMap, model)
        ? modelMap[model]
        : undefined;
      if (mappedModel) frontmatter.model = [mappedModel];
      else warnings.push(`${label} dropped ${model ? `unmapped model: ${model}` : 'invalid model value'}`);
    }

    for (const field of Object.keys(record.frontmatter)) {
      if (!Object.hasOwn(SUPPORTED_AGENT_FIELDS, field)) {
        warnings.push(`${label} dropped unsupported field: ${field}`);
      }
    }

    const yaml = stringify(frontmatter).trimEnd();
    const content = Buffer.from(`---\n${yaml}\n---\n${record.body}`, 'utf-8');
    files.push({
      sourcePath: record.sourcePath,
      sourceRelativePath: record.sourceRelativePath,
      targetRelativePath: ompTargetRelativePath('agents', path.basename(record.sourceRelativePath)),
      sourceChecksum: sha256File(record.sourcePath),
      installedChecksum: sha256Buffer(content),
      content,
      part: 'agents',
    });
  }

  return {
    files: files.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    warnings,
  };
}

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SPECIFY_ROOT = resolve(import.meta.dir, '../../..');

const paths = {
  freshInit: 'plugins/tdk-memory/skills/tdk-memory-init/references/fresh-init-flow.md',
  rerun: 'plugins/tdk-memory/skills/tdk-memory-init/references/re-run-flow.md',
  updateNormal: 'plugins/tdk-memory/skills/tdk-memory-update/references/flow-update-normal.md',
  updateMcp: 'plugins/tdk-memory/skills/tdk-memory-update/references/flow-update-mcp.md',
  regenerate: 'plugins/tdk-memory/skills/tdk-memory-update/references/regenerate-memory-index-flow.md',
  querySkill: 'plugins/tdk-memory/skills/tdk-memory-query/SKILL.md',
  queryNormal: 'plugins/tdk-memory/skills/tdk-memory-query/references/flow-query-normal.md',
  queryMcp: 'plugins/tdk-memory/skills/tdk-memory-query/references/flow-available-mcp.md',
  checksum: 'plugins/tdk-memory/skills/tdk-memory-checksum/SKILL.md',
};

const ROUTE_TOKENS = [
  'integrations/{integration-name}.md',
  'operations/{runbook-name}-runbook.md',
  'quality-requirements/{quality-attribute}.md',
  'decisions/{decision-id}.md',
  'risks-and-debt/{risk-or-debt-id}.md',
  'reports/{report-name}.md',
  'decision-tables/{decision-table-name}.md',
  'state-machines/{state-machine-name}.md',
];

const CANONICAL_TYPES = [
  'integration-contract',
  'operations-runbook',
  'quality-requirement',
  'decision-record',
  'risk-debt',
  'report-spec',
  'capability',
  'stakeholder-role',
  'glossary-term',
  'decision-table',
  'state-machine',
  'arc42-summary',
];

const ALIASES = ['api', 'schema', 'screen', 'runbook', 'nfr', 'policy', 'adr', 'debt', 'report'];

const CATEGORY_TOKENS = [
  'arc42/',
  'integrations/',
  'operations/',
  'quality-requirements/',
  'decisions/',
  'risks-and-debt/',
  'reports/',
  'capabilities/',
  'stakeholders-and-roles/',
  'glossary/',
  'decision-tables/',
  'state-machines/',
];

function read(relativePath: string): string {
  return readFileSync(resolve(SPECIFY_ROOT, relativePath), 'utf-8');
}

describe('tdk memory v3 flow contract', () => {
  it('keeps fresh init as root control files plus lazy typed folders', () => {
    const freshInit = read(paths.freshInit);
    const rerun = read(paths.rerun);

    for (const token of ['README.md', 'memory-index.md', 'memory.yaml', 'memory-map.canvas', 'CHANGELOG.md']) {
      expect(freshInit).toContain(token);
    }

    expect(freshInit).toContain('Do not create empty optional typed folders');
    expect(freshInit).toContain('Do not create');
    expect(freshInit).toContain('`domains/{domain}/flows/` during init.');
    expect(freshInit).toContain('memory-readme-template.md.tpl');
    expect(rerun).toContain('Never create empty `flows/`');
  });

  it('keeps normal and MCP update route tables in parity for v3 categories', () => {
    const normal = read(paths.updateNormal);
    const mcp = read(paths.updateMcp);

    for (const token of ROUTE_TOKENS) {
      expect(normal, `normal update flow missing ${token}`).toContain(token);
      expect(mcp, `MCP update flow missing ${token}`).toContain(token);
    }

    for (const alias of ['schema', 'api', 'integration', 'policy', 'nfr', 'adr', 'debt', 'report', 'runbook']) {
      expect(normal).toContain(alias);
      expect(mcp).toContain(alias);
    }
  });

  it('documents query canonical types and aliases in all query flows', () => {
    const querySkill = read(paths.querySkill);
    const normal = read(paths.queryNormal);
    const mcp = read(paths.queryMcp);

    for (const type of CANONICAL_TYPES) {
      expect(querySkill).toContain(type);
      expect(normal).toContain(type);
      expect(mcp).toContain(type);
    }

    for (const alias of ALIASES) {
      expect(querySkill).toContain(alias);
      expect(normal).toContain(`| \`${alias}\` |`);
      expect(mcp).toContain(`| \`${alias}\` |`);
    }

    expect(normal).toContain('MEMORY_QUERY_RESULT_START');
    expect(mcp).toContain('MEMORY_QUERY_RESULT_START');
  });

  it('indexes and checksums all v3 typed categories', () => {
    const regenerate = read(paths.regenerate);
    const checksum = read(paths.checksum);

    for (const token of CATEGORY_TOKENS) {
      expect(regenerate, `regenerate flow missing ${token}`).toContain(token);
      expect(checksum, `checksum skill missing ${token}`).toContain(token);
    }

    expect(regenerate).toContain('binding: false');
    expect(checksum).toContain('root control files');
  });
});

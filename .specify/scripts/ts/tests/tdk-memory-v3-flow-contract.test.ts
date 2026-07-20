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
  domainExtraction: 'plugins/tdk-memory/skills/tdk-memory-init/references/domain-extraction-and-confirmation.md',
  domainSourceExtraction: 'plugins/tdk-memory/skills/tdk-memory-update/references/domain-source-extraction-flow.md',
  updateSkill: 'plugins/tdk-memory/skills/tdk-memory-update/SKILL.md',
  changelogSkill: 'plugins/tdk-memory/skills/tdk-memory-changelog/SKILL.md',
};

const CANONICAL_QUERY_RESULT_FIELDS = [
  'status',
  'query',
  'content_type',
  'requested_domain',
  'candidate_paths',
  'resolved_path',
  'files_read',
  'binding',
  'note',
] as const;

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

function markdownSection(content: string, heading: string): string {
  const start = content.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = start + heading.length;
  const headingLevel = heading.match(/^#+/)?.[0].length ?? 1;
  const nextSectionPattern = new RegExp(`\\n#{1,${headingLevel}} `);
  const nextSection = content.slice(bodyStart).search(nextSectionPattern);
  return nextSection === -1 ? content.slice(start) : content.slice(start, bodyStart + nextSection);
}

function normalizeMarkdownWhitespace(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
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

  it('bans the flat memory/overview.md placeholder in domain extraction guidance', () => {
    const domainExtraction = read(paths.domainExtraction);
    const domainSourceExtraction = read(paths.domainSourceExtraction);

    expect(domainExtraction).not.toContain('.specify/memory/overview.md');
    expect(domainSourceExtraction).not.toContain('.specify/memory/overview.md');
  });

  it('uses a domain-scoped path for the memory-update deprecation example instead of a flat business-rules file', () => {
    const updateSkill = read(paths.updateSkill);

    expect(updateSkill).not.toContain('business-rules/payment.md');
    expect(updateSkill).toContain('domains/payment/business-rules.md');
  });

  it('uses a concrete global data-model path for the memory-changelog example instead of a flat data-model.md', () => {
    const changelogSkill = read(paths.changelogSkill);

    expect(changelogSkill).not.toContain('.specify/memory/data-model.md');
  });

  it('resolves data-model files through the global data-model directory instead of a per-domain glob in the file-transport query flow', () => {
    const normal = read(paths.queryNormal);

    expect(normal).not.toContain('.specify/memory/domains/{domain}/data-model/*.md');
    expect(normal).toContain('.specify/memory/data-model/*.md');
  });

  it('emits the canonical marker-delimited field order for data-model agent query results in both transports', () => {
    const normal = read(paths.queryNormal);
    const mcp = read(paths.queryMcp);

    for (const content of [normal, mcp]) {
      const agentModeMarker = '**Agent mode**';
      const agentModeIndex = content.indexOf(agentModeMarker);
      expect(agentModeIndex, 'Agent mode section should exist').toBeGreaterThanOrEqual(0);
      const agentModeBlock = content.slice(agentModeIndex);

      let previousIndex = -1;
      for (const field of CANONICAL_QUERY_RESULT_FIELDS) {
        const fieldIndex = agentModeBlock.indexOf(`${field}:`);
        expect(fieldIndex, `${field} should appear in canonical order in Agent mode`).toBeGreaterThan(previousIndex);
        previousIndex = fieldIndex;
      }
    }
  });

  it('uses the bounded candidate pipeline with known-path precedence in both data-model transports', () => {
    const normal = normalizeMarkdownWhitespace(markdownSection(read(paths.queryNormal), '### Data-model resolver'));
    const mcp = normalizeMarkdownWhitespace(markdownSection(read(paths.queryMcp), '### Data-model resolver'));

    for (const resolver of [normal, mcp]) {
      expect(resolver).toContain('stable-sorted canonical `data-model/*.md` inventory');
      expect(resolver).toContain('Search/index metadata only nominates candidates');
      expect(resolver).toContain('highest-precedence exact identity');
      expect(resolver).toContain('select and exact-read only that path');
      expect(resolver).toContain('without applying the text identity ranks');
      expect(resolver).toContain('At each rank, collect matching index fields plus exact');
      expect(resolver).toContain('then exact-read only those nominated files');
      expect(resolver).toContain('Do not use a blind top-K or ranked-search cutoff.');
      expect(resolver).not.toContain('Exact-read every candidate');
    }

    expect(normal).toContain('exact `Grep` nominations');
    expect(mcp).toContain('exact `vault(action="search")` nominations');
  });

  it('enforces rank verification and total data-model outcomes in both transports', () => {
    const normal = normalizeMarkdownWhitespace(markdownSection(read(paths.queryNormal), '### Data-model resolver'));
    const mcp = normalizeMarkdownWhitespace(markdownSection(read(paths.queryMcp), '### Data-model resolver'));

    for (const resolver of [normal, mcp]) {
      expect(resolver).toContain('If none verify, continue to the next rank; stop at the first rank with one or more verified exact identities.');
      expect(resolver).toContain('After a rank yields a verified exact identity, never fall through to a lower identity rank merely because that identity is ineligible or lacks requested-domain proof.');
      expect(resolver).toContain('| `0` | `0` | `not_found`; `resolved_path: null`; `binding: false` |');
      expect(resolver).toContain('| `>=1` | `0` | `warning_unverified`; use the sole exact path as `resolved_path` only when exactly one exists, otherwise `null`; `binding: false` |');
      expect(resolver).toContain('| `>=1` | `1` | `resolved`; use the qualifying path as `resolved_path`; `binding: true` |');
      expect(resolver).toContain('| `>=2` | `>=2` | `warning_ambiguous`; `resolved_path: null`; `binding: false` |');
      expect(resolver).toContain('Thus multiple exact aliases that are all ineligible return `warning_unverified`, while one qualifying identity plus any ineligible exact identities resolves to the qualifying path.');
    }
  });

  it('avoids backlink reads without a domain and bounds requested-domain proof reads in both transports', () => {
    const normal = markdownSection(read(paths.queryNormal), '### Data-model resolver');
    const mcp = markdownSection(read(paths.queryMcp), '### Data-model resolver');

    for (const resolver of [normal, mcp]) {
      expect(resolver).toContain('When `--domain` is empty, skip **Files by Domain**\n   parsing and all backlink reads.');
      expect(resolver).toContain('only the requested domain\'s relevant **Files by\n   Domain** entries');
      expect(resolver).toContain('exact-read only those nominated proof files');
      expect(resolver).toContain('stable-\n   sort, deduplicate');
    }
  });

  it('renders warning outcomes deterministically in both transports', () => {
    const normal = normalizeMarkdownWhitespace(markdownSection(read(paths.queryNormal), '## Step 5: Render output'));
    const mcp = normalizeMarkdownWhitespace(markdownSection(read(paths.queryMcp), '## Step 5: Render output'));

    for (const output of [normal, mcp]) {
      expect(output).toContain('`warning_unverified`: render `Resolved:` with the sole exact path when one exists, otherwise `Resolved: None`; then render `Candidates: {candidate paths}`');
      expect(output).toContain('`warning_ambiguous`: render `Resolved: None`, then `Candidates: {candidate paths}`');
    }
  });

  it('defines reversible marker escaping for resolved bodies in both transports', () => {
    const normal = markdownSection(read(paths.queryNormal), '### Resolved-body marker escaping');
    const mcp = markdownSection(read(paths.queryMcp), '### Resolved-body marker escaping');

    for (const escaping of [normal, mcp]) {
      expect(escaping).toContain('Before placing a resolved file body in the envelope, process it line by line.');
      expect(escaping).toContain('body line that is exactly\n`MEMORY_QUERY_RESULT_START`, exactly `MEMORY_QUERY_RESULT_END`, or already');
      expect(escaping).toContain('Do not escape the outer envelope markers.');
      expect(escaping).toContain('Consumers locate only exact unescaped outer\nmarker lines');
      expect(escaping).toContain('remove exactly one leading');
    }
  });

  it.each([
    ['file transport', paths.queryNormal, 'canonical resolved disk-relative path'],
    ['MCP transport', paths.queryMcp, 'canonical resolved vault-relative path'],
  ])('keeps normal resolved data-model formats compatible in %s', (_label, path, listPath) => {
    const flow = read(path);
    const extraction = markdownSection(flow, '## Step 4: Read and extract');
    const normalOutput = flow.slice(flow.indexOf('**Normal mode**'), flow.indexOf('**Agent mode**'));
    const agentOutput = flow.slice(flow.indexOf('**Agent mode**'));

    for (const expectedFormat of [
      'include the complete exact-read data-model Markdown.',
      'frontmatter `title` + `updated_at`, H2/H3\n  headings, and the first 3-5 lines of each section.',
      `include only the ${listPath} and\n  frontmatter \`title\`.`,
    ]) {
      expect(extraction).toContain(expectedFormat);
    }

    expect(normalOutput).toContain('For a data-model outcome, render this normal Markdown result rather than an\nagent envelope:');
    expect(normalOutput).toContain('`warning_unverified`');
    expect(normalOutput).toContain('`warning_ambiguous`');
    expect(normalOutput).toContain('`not_found`');
    expect(normalOutput).toContain('`Candidates: {candidate paths}`');
    expect(normalOutput).toContain('`Candidates: []`');
    expect(normalOutput).toContain('no binding data-model body is shown.');
    expect(agentOutput).toContain('The `--format` value never truncates a\nresolved data-model body.');
  });
});

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const SPECIFY_ROOT = resolve(import.meta.dir, '../../..');
const MEMORY_TEMPLATES_DIR = resolve(SPECIFY_ROOT, 'templates/memory');
const MEMORY_INDEX_TEMPLATE = resolve(
  SPECIFY_ROOT,
  'plugins/tdk-memory/skills/tdk-memory-init/references/memory-index-template.md',
);
const DOMAIN_OVERVIEW_TEMPLATE = resolve(
  SPECIFY_ROOT,
  'plugins/tdk-memory/skills/tdk-memory-init/references/domain-overview-template.md',
);

const REQUIRED_V3_TEMPLATES = [
  'memory-readme-template.md.tpl',
  'arc42-readme-template.md.tpl',
  'arc42-summary-template.md.tpl',
  'integration-contract-template.md.tpl',
  'operations-runbook-template.md.tpl',
  'quality-requirement-template.md.tpl',
  'decision-record-template.md.tpl',
  'risk-debt-template.md.tpl',
  'report-spec-template.md.tpl',
  'capabilities-template.md.tpl',
  'stakeholders-and-roles-template.md.tpl',
  'glossary-template.md.tpl',
  'decision-table-template.md.tpl',
  'state-machine-template.md.tpl',
];

const REQUIRED_ALIASES = ['api', 'adr', 'nfr', 'debt', 'schema', 'screen', 'report', 'runbook'];

const REQUIRED_ROUTE_TARGETS = [
  'arc42/{section-number}-{section-name}.md',
  'integrations/{integration-name}.md',
  'operations/{runbook-name}-runbook.md',
  'quality-requirements/{quality-attribute}.md',
  'decisions/{decision-id}.md',
  'risks-and-debt/{risk-or-debt-id}.md',
  'reports/{report-name}.md',
  'capabilities/{capability-name}.md',
  'stakeholders-and-roles/{role-name}.md',
  'glossary/{term}.md',
  'decision-tables/{decision-table-name}.md',
  'state-machines/{state-machine-name}.md',
];

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function templateRefs(markdown: string): string[] {
  return [...markdown.matchAll(/`([^`]+\.md\.tpl)`/g)].map(match => basename(match[1]));
}

describe('tdk memory v3 routing contract', () => {
  const memoryIndex = read(MEMORY_INDEX_TEMPLATE);

  it('keeps every routed template present on disk', () => {
    const refs = new Set(templateRefs(memoryIndex));

    for (const template of REQUIRED_V3_TEMPLATES) {
      expect(refs.has(template), `${template} should be referenced by memory-index-template.md`).toBe(true);
    }

    for (const template of refs) {
      expect(
        existsSync(resolve(MEMORY_TEMPLATES_DIR, template)),
        `${template} is referenced by memory-index-template.md but missing`,
      ).toBe(true);
    }
  });

  it('ships the full v3 template set without numbered proposal folders', () => {
    const templates = readdirSync(MEMORY_TEMPLATES_DIR).filter(file => file.endsWith('.md.tpl'));

    for (const template of REQUIRED_V3_TEMPLATES) {
      expect(templates).toContain(template);
    }

    expect(templates.some(template => /^[0-9]+-/.test(template))).toBe(false);
  });

  it('documents canonical route targets and aliases', () => {
    for (const target of REQUIRED_ROUTE_TARGETS) {
      expect(memoryIndex).toContain(target);
    }

    for (const alias of REQUIRED_ALIASES) {
      expect(memoryIndex).toContain(`| \`${alias}\` |`);
    }
  });

  it('marks arc42 summaries as non-binding read-models', () => {
    const template = read(resolve(MEMORY_TEMPLATES_DIR, 'arc42-summary-template.md.tpl'));

    expect(template).toContain('type: arc42-summary');
    expect(template).toContain('binding: false');
    expect(template).toContain('Guardian must not block implementation from this');
  });

  it('defines required v3 frontmatter fields for memory templates', () => {
    const templates = readdirSync(MEMORY_TEMPLATES_DIR).filter(file => file.endsWith('.md.tpl'));

    for (const templateName of templates) {
      const template = read(resolve(MEMORY_TEMPLATES_DIR, templateName));

      for (const field of ['id:', 'type:', 'status:', 'authority:', 'binding:', 'related:']) {
        expect(template, `${templateName} should contain ${field}`).toContain(field);
      }
    }
  });

  it('requires all v3 frontmatter fields and binding: true for the plugin-local domain overview template', () => {
    const template = read(DOMAIN_OVERVIEW_TEMPLATE);

    for (const field of ['id:', 'type:', 'status:', 'authority:', 'binding:', 'related:']) {
      expect(template, `domain-overview-template.md should contain ${field}`).toContain(field);
    }
    expect(template).toContain('binding: true');
  });
});

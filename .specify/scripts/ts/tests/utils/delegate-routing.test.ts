import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkDelegateRouting,
  diffRoutingProposal,
  parseDelegateRouting,
  registerRoutingProposal,
  resolveDelegateRoutingPath,
  verifyRoutingProposal,
} from '../../src/utils/delegate-routing';
import { normalizeDelegate, validateRoutingProposal } from '../../src/utils/delegate-routing-proposal';

const ROUTING_MARKDOWN = `# Delegate Routing

Intro prose stays intact.

## global

- research: (default - no delegate)
- implement: /tdk-implement-helper
- test: /global-test-skill, /global-test-skill
<!-- - test: /commented-test-skill -->

## backend

Keep this note.
- implement: /backend-impl, @backend-agent
- database: (default - no special skill)
`;

describe('delegate routing parser and mutator', () => {
  it('parses active sections and routes, including @agent tokens, while ignoring comments and placeholders', () => {
    const document = parseDelegateRouting(ROUTING_MARKDOWN);

    expect(document.sections.map((section) => section.name)).toEqual(['global', 'backend']);
    expect(
      document.routes.map((route) => `${route.section}:${route.domain}:${route.delegates.join(',')}`),
    ).toEqual([
      'global:research:',
      'global:implement:/tdk-implement-helper',
      'global:test:/global-test-skill',
      'backend:implement:/backend-impl,@backend-agent',
      'backend:database:',
    ]);
  });

  it('normalizes tokens by prefix and rejects malformed agent names', () => {
    expect(normalizeDelegate('@backend-agent')).toBe('@backend-agent');
    expect(normalizeDelegate('backend-skill')).toBe('/backend-skill');
    expect(() => normalizeDelegate('@')).toThrow();
    expect(() => normalizeDelegate('@-bad')).toThrow();
  });

  it('warns for identical duplicates and errors for conflicting duplicates', () => {
    const duplicateDocument = parseDelegateRouting(`## global
- test: /skill-a
- test: /skill-a
`);
    const conflictDocument = parseDelegateRouting(`## global
- test: /skill-a
- test: /skill-b
`);

    expect(checkDelegateRouting(duplicateDocument).warnings).toHaveLength(1);
    expect(checkDelegateRouting(duplicateDocument).errors).toHaveLength(0);
    expect(checkDelegateRouting(conflictDocument).errors).toHaveLength(1);
  });

  it('diffs and registers proposals mixing /skill and @agent without duplicating existing entries', () => {
    const { proposal, warnings } = validateRoutingProposal({
      version: 1,
      entries: [
        {
          subWorkspace: 'backend',
          domain: 'test',
          delegates: ['/backend-test', '@backend-agent'],
          reason: 'Route backend unit tests',
        },
        { subWorkspace: 'global', domain: 'implement', delegates: ['/global-impl'] },
      ],
    });
    expect(warnings).toHaveLength(0);
    const document = parseDelegateRouting(ROUTING_MARKDOWN);
    const diff = diffRoutingProposal(document, proposal);

    expect(diff.operations.map((operation) => operation.type)).toEqual(['add', 'update']);

    const registered = registerRoutingProposal(ROUTING_MARKDOWN, proposal);
    expect(registered.changed).toBe(true);
    expect(registered.markdown).toContain('- test: /backend-test, @backend-agent');
    expect(registered.markdown).toContain('- implement: /global-impl');
    expect(registered.markdown).toContain('Keep this note.');

    const secondRun = registerRoutingProposal(registered.markdown, proposal);
    expect(secondRun.changed).toBe(false);
    expect(secondRun.operations.every((operation) => operation.type === 'noop')).toBe(true);
    expect(
      verifyRoutingProposal(parseDelegateRouting(registered.markdown), proposal).verified,
    ).toBe(true);
  });

  it('rejects entries[].skills and warns once for domains outside the auto-detected set', () => {
    expect(() =>
      validateRoutingProposal({
        version: 1,
        entries: [{ subWorkspace: 'global', domain: 'test', skills: ['/skill-a'] }],
      }),
    ).toThrow();

    const docsEntry = { subWorkspace: 'global', domain: 'docs', delegates: ['/docs-skill'] };
    expect(validateRoutingProposal({ version: 1, entries: [docsEntry] }).warnings).toHaveLength(1);

    const implementEntry = { subWorkspace: 'global', domain: 'implement', delegates: ['/impl-skill'] };
    expect(
      validateRoutingProposal({ version: 1, entries: [implementEntry] }).warnings,
    ).toHaveLength(0);
  });

  it('rejects docs.path values that resolve outside the project root', () => {
    const root = mkdtempSync(join(tmpdir(), 'routing-path-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'routing-path-outside-'));
    try {
      mkdirSync(join(root, '.specify'), { recursive: true });
      writeFileSync(
        join(root, '.specify/.specify.json'),
        JSON.stringify({ version: '1.0', name: 'fixture', docs: { path: outside } }),
        'utf-8',
      );
      expect(() => resolveDelegateRoutingPath(root)).toThrow('inside project root');

      writeFileSync(
        join(root, '.specify/.specify.json'),
        JSON.stringify({ version: '1.0', name: 'fixture', docs: { path: '../outside-docs' } }),
        'utf-8',
      );
      expect(() => resolveDelegateRoutingPath(root)).toThrow('inside project root');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('blocks proposal use when the route file has conflicting duplicate entries', () => {
    const { proposal } = validateRoutingProposal({
      version: 1,
      entries: [{ subWorkspace: 'global', domain: 'test', delegates: ['/skill-a'] }],
    });
    const conflictedMarkdown = `## global
- test: /skill-a
- test: /skill-b
`;
    const document = parseDelegateRouting(conflictedMarkdown);

    expect(() => diffRoutingProposal(document, proposal)).toThrow('route file has conflicts');
    expect(() => registerRoutingProposal(conflictedMarkdown, proposal)).toThrow(
      'route file has conflicts',
    );
    expect(() => verifyRoutingProposal(document, proposal)).toThrow('route file has conflicts');
  });

  it('enforces add and update operation intent in proposals', () => {
    const existingDocument = parseDelegateRouting(`## global
- test: /existing-test
`);
    const { proposal: addExistingProposal } = validateRoutingProposal({
      version: 1,
      entries: [
        { subWorkspace: 'global', domain: 'test', delegates: ['/new-test'], operation: 'add' },
      ],
    });
    const { proposal: updateMissingProposal } = validateRoutingProposal({
      version: 1,
      entries: [
        {
          subWorkspace: 'global',
          domain: 'research',
          delegates: ['/research'],
          operation: 'update',
        },
      ],
    });

    expect(() => diffRoutingProposal(existingDocument, addExistingProposal)).toThrow(
      "operation 'add'",
    );
    expect(() => diffRoutingProposal(existingDocument, updateMissingProposal)).toThrow(
      "operation 'update'",
    );
  });
});

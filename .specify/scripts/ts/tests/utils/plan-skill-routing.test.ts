import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPlanSkillRouting,
  diffRoutingProposal,
  optimizePlanSkillRouting,
  parsePlanSkillRouting,
  registerRoutingProposal,
  resolvePlanSkillRoutingPath,
  verifyRoutingProposal,
} from '../../src/utils/plan-skill-routing';
import { validateRoutingProposal } from '../../src/utils/plan-skill-routing-proposal';

const ROUTING_MARKDOWN = `# Plan Skill Routing

Intro prose stays intact.

## global

- research: (default - no special skill)
- implement: /tdk-implement-helper
- test: /global-test-skill, /global-test-skill
<!-- - test: /commented-test-skill -->

## backend

Keep this note.
- implement: /backend-impl
`;

describe('plan skill routing parser and mutator', () => {
  it('parses active sections and routes while ignoring comments and placeholders', () => {
    const document = parsePlanSkillRouting(ROUTING_MARKDOWN);

    expect(document.sections.map((section) => section.name)).toEqual(['global', 'backend']);
    expect(document.routes.map((route) => `${route.section}:${route.domain}`)).toEqual([
      'global:research',
      'global:implement',
      'global:test',
      'backend:implement',
    ]);
    expect(document.routes.find((route) => route.domain === 'research')?.skills).toEqual([]);
    expect(document.routes.find((route) => route.domain === 'test')?.skills).toEqual([
      '/global-test-skill',
    ]);
  });

  it('warns for identical duplicates and errors for conflicting duplicates', () => {
    const duplicateDocument = parsePlanSkillRouting(`## global
- test: /skill-a
- test: /skill-a
`);
    const conflictDocument = parsePlanSkillRouting(`## global
- test: /skill-a
- test: /skill-b
`);

    expect(checkPlanSkillRouting(duplicateDocument).warnings).toHaveLength(1);
    expect(checkPlanSkillRouting(duplicateDocument).errors).toHaveLength(0);
    expect(checkPlanSkillRouting(conflictDocument).errors).toHaveLength(1);
  });

  it('diffs and registers proposals without duplicating existing entries', () => {
    const proposal = validateRoutingProposal({
      version: 1,
      entries: [
        {
          subWorkspace: 'backend',
          domain: 'test',
          skills: ['/backend-test'],
          reason: 'Route backend unit tests',
        },
        {
          subWorkspace: 'global',
          domain: 'implement',
          skills: ['/global-impl'],
        },
      ],
    });
    const document = parsePlanSkillRouting(ROUTING_MARKDOWN);
    const diff = diffRoutingProposal(document, proposal);

    expect(diff.operations.map((operation) => operation.type)).toEqual(['add', 'update']);

    const registered = registerRoutingProposal(ROUTING_MARKDOWN, proposal);
    expect(registered.changed).toBe(true);
    expect(registered.markdown).toContain('- test: /backend-test');
    expect(registered.markdown).toContain('- implement: /global-impl');
    expect(registered.markdown).toContain('Keep this note.');

    const secondRun = registerRoutingProposal(registered.markdown, proposal);
    expect(secondRun.changed).toBe(false);
    expect(secondRun.operations.every((operation) => operation.type === 'noop')).toBe(true);
    expect(verifyRoutingProposal(parsePlanSkillRouting(registered.markdown), proposal).verified).toBe(
      true,
    );
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
      expect(() => resolvePlanSkillRoutingPath(root)).toThrow('inside project root');

      writeFileSync(
        join(root, '.specify/.specify.json'),
        JSON.stringify({ version: '1.0', name: 'fixture', docs: { path: '../outside-docs' } }),
        'utf-8',
      );
      expect(() => resolvePlanSkillRoutingPath(root)).toThrow('inside project root');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('blocks proposal use when the route file has conflicting duplicate entries', () => {
    const proposal = validateRoutingProposal({
      version: 1,
      entries: [{ subWorkspace: 'global', domain: 'test', skills: ['/skill-a'] }],
    });
    const conflictedMarkdown = `## global
- test: /skill-a
- test: /skill-b
`;
    const document = parsePlanSkillRouting(conflictedMarkdown);

    expect(() => diffRoutingProposal(document, proposal)).toThrow('route file has conflicts');
    expect(() => registerRoutingProposal(conflictedMarkdown, proposal)).toThrow(
      'route file has conflicts',
    );
    expect(() => verifyRoutingProposal(document, proposal)).toThrow('route file has conflicts');
  });

  it('enforces add and update operation intent in proposals', () => {
    const existingDocument = parsePlanSkillRouting(`## global
- test: /existing-test
`);
    const addExistingProposal = validateRoutingProposal({
      version: 1,
      entries: [
        {
          subWorkspace: 'global',
          domain: 'test',
          skills: ['/new-test'],
          operation: 'add',
        },
      ],
    });
    const updateMissingProposal = validateRoutingProposal({
      version: 1,
      entries: [
        {
          subWorkspace: 'global',
          domain: 'research',
          skills: ['/research'],
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

  it('optimizes only safe duplicate cleanup and preserves conflicting duplicates', () => {
    const markdown = `## global
- test: /skill-a, /skill-a
- test: /skill-a
- implement: /impl-a
- implement: /impl-b
`;
    const result = optimizePlanSkillRouting(markdown);

    expect(result.changed).toBe(true);
    expect(result.markdown).toContain('- test: /skill-a');
    expect(result.markdown.match(/^- test:/gm)).toHaveLength(1);
    expect(result.markdown.match(/^- implement:/gm)).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
  });
});

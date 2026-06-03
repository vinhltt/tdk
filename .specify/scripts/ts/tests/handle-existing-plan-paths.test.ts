import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';

const SKILL_DOC = resolve(
  __dirname,
  '../../../plugins/tdk-core/skills/tdk-plan/references/handle-existing-plan.md'
);

function extractPhaseFileTemplate(content: string): string {
  const match = content.match(/## Phase File Content Template[\s\S]*?```markdown\n([\s\S]*?)\n```/);

  if (!match?.[1]) {
    throw new Error('Phase File Content Template fenced markdown block not found');
  }

  return match[1];
}

function extractFrontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match?.[1]) {
    throw new Error('YAML frontmatter block not found');
  }

  return match[1];
}

describe('handle-existing-plan.md path conventions', () => {
  const content = readFileSync(SKILL_DOC, 'utf-8');
  const phaseFileTemplate = extractPhaseFileTemplate(content);

  it('uses phases/ prefix for generated file paths', () => {
    expect(content).toMatch(/phases\/phase-\$\{NN\}/);
  });

  it('uses phases/ prefix for collision check', () => {
    expect(content).toMatch(/phases\/phase-\$\{NN\}.*already exists/);
  });

  it('phases table links point to phases/ subdir', () => {
    expect(content).toMatch(/\(phases\/phase-\$\{NN\}/);
  });

  it('phase file template starts with YAML frontmatter', () => {
    expect(phaseFileTemplate.trimStart()).toStartWith('---\n');
  });

  it('phase file template includes required frontmatter fields', () => {
    for (const field of ['phase', 'title', 'status', 'priority', 'effort', 'dependencies']) {
      expect(phaseFileTemplate).toMatch(new RegExp(`^${field}:`, 'm'));
    }
  });

  it('phase file template frontmatter parses after placeholder substitution', () => {
    const renderedTemplate = phaseFileTemplate
      .replaceAll('{N}', '3')
      .replaceAll('{NN}', '03')
      .replaceAll('{Phase Title YAML}', '"Append follow-up"')
      .replaceAll('{Phase Name}', 'Append follow-up');
    const frontmatter = parseYaml(extractFrontmatter(renderedTemplate)) as {
      phase?: number;
      title?: string;
      status?: string;
      priority?: string;
      effort?: string;
      dependencies?: unknown[];
    };

    expect(frontmatter).toEqual({
      phase: 3,
      title: 'Append follow-up',
      status: 'todo',
      priority: 'P2',
      effort: '1h',
      dependencies: [],
    });
  });

  it('phase file template renders quoted titles as valid YAML and concrete headings', () => {
    const title = 'Append "quoted" follow-up';
    const renderedTemplate = phaseFileTemplate
      .replaceAll('{N}', '3')
      .replaceAll('{NN}', '03')
      .replaceAll('{Phase Title YAML}', JSON.stringify(title))
      .replaceAll('{Phase Name}', title);
    const frontmatter = parseYaml(extractFrontmatter(renderedTemplate)) as {
      title?: string;
    };

    expect(frontmatter.title).toBe(title);
    expect(renderedTemplate).toContain('# Phase 03: Append "quoted" follow-up');
    expect(renderedTemplate).not.toContain('# Phase NN:');
  });

  it('phase file template includes required sections in order', () => {
    const requiredSections = [
      '## Context Links',
      '## Overview',
      '## Key Insights',
      '## Requirements',
      '## Architecture',
      '## Related Code Files',
      '## Implementation Steps',
      '## Todo List',
      '## Success Criteria',
      '## Risk Assessment',
      '## Security Considerations',
      '## Next Steps',
      '## Unresolved Questions',
    ];

    let previousIndex = -1;
    for (const section of requiredSections) {
      const index = phaseFileTemplate.indexOf(section);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });

  it('phase file template does not use the legacy bold status block', () => {
    expect(phaseFileTemplate).not.toContain('**Status:**');
  });
});

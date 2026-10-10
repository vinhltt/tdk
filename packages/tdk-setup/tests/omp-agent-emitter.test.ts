import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import { emitOmpAgentFiles } from '../src/omp-agent-emitter';
import { makeConsumer } from './fixtures';
import type { FlatClaudeAgentRecord } from '../src/flat-claude-types';

function agent(
  root: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  body = 'Do the work.\n',
  frontmatterParseError?: string,
): FlatClaudeAgentRecord {
  const sourceRelativePath = `.claude/agents/${filename}`;
  const sourcePath = path.join(root, sourceRelativePath);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, 'source', 'utf-8');
  return {
    kind: 'agent',
    sourcePath,
    sourceRelativePath,
    name: typeof frontmatter.name === 'string' ? frontmatter.name : path.basename(filename, '.md'),
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    frontmatter,
    frontmatterParseError,
    body,
  };
}

function emittedFrontmatter(content: Buffer): Record<string, unknown> {
  const text = content.toString('utf-8');
  const end = text.indexOf('\n---\n', 4);
  return parse(text.slice(4, end)) as Record<string, unknown>;
}

describe('OMP agent emitter', () => {
  test('aggregates every invalid agent before emitting any target', () => {
    const consumer = makeConsumer('tdk-omp-agent-invalid-');
    const records = [
      agent(consumer.root, 'missing-name.md', { description: 'Missing explicit name' }),
      agent(consumer.root, 'missing-description.md', { name: 'missing-description' }),
      agent(consumer.root, 'invalid-yaml.md', { name: 'invalid-yaml', description: 'Fallback fields' }, 'body', 'bad YAML'),
    ];

    expect(() => emitOmpAgentFiles(records, { sonnet: '@task' })).toThrow(
      /missing-name\.md.*missing explicit name[\s\S]*missing-description\.md.*missing description[\s\S]*invalid-yaml\.md.*bad YAML/,
    );
  });

  test('aggregates duplicate explicit names before emitting any target', () => {
    const consumer = makeConsumer('tdk-omp-agent-duplicate-');
    const records = [
      agent(consumer.root, 'reviewer.md', { name: 'reviewer', description: 'Review code' }),
      agent(consumer.root, 'security.md', { name: 'reviewer', description: 'Review security' }),
    ];

    expect(() => emitOmpAgentFiles(records, { sonnet: '@task' })).toThrow(
      /duplicate explicit name "reviewer".*reviewer\.md.*security\.md/,
    );
  });

  test('emits deterministic native frontmatter and preserves body bytes', () => {
    const consumer = makeConsumer('tdk-omp-agent-emit-');
    const body = 'Review exactly.\n\nKeep this spacing.\n';
    const record = agent(consumer.root, 'reviewer.md', {
      name: 'reviewer',
      description: 'Review code',
      tools: 'Read, Grep, WebFetch',
      model: 'sonnet',
      memory: 'project',
      color: 'blue',
    }, body);

    const first = emitOmpAgentFiles([record], { sonnet: '@slow' });
    const second = emitOmpAgentFiles([record], { sonnet: '@slow' });

    expect(first.files).toHaveLength(1);
    expect(first.files[0]?.content).toEqual(second.files[0]?.content);
    expect(first.files[0]?.targetRelativePath).toBe('.omp/agents/reviewer.md');
    expect(first.files[0]?.part).toBe('agents');
    expect(emittedFrontmatter(first.files[0]!.content)).toEqual({
      name: 'reviewer',
      description: 'Review code',
      tools: ['read', 'grep', 'yield'],
      model: ['@slow'],
      output: {
        properties: {
          result: {
            metadata: { description: 'Agent result' },
            type: 'string',
          },
        },
      },
    });
    expect(first.files[0]!.content.toString('utf-8').endsWith(body)).toBe(true);
    expect(first.warnings).toEqual([
      'OMP agent reviewer (.claude/agents/reviewer.md) dropped unsupported tool: WebFetch',
      'OMP agent reviewer (.claude/agents/reviewer.md) dropped unsupported field: memory',
      'OMP agent reviewer (.claude/agents/reviewer.md) dropped unsupported field: color',
    ]);
  });

  test('maps skill preload intent, drops Skill with a URI-loader hint, and preserves body bytes', () => {
    const consumer = makeConsumer('tdk-omp-agent-skills-');
    const body = '## Load Skills First\r\nUse Skill before writing.\r\n\r\nStatus: DONE\r\n';
    const record = agent(consumer.root, 'executor.md', {
      name: 'executor',
      description: 'Execute routed phases',
      tools: ['Read', 'Edit', 'Write', 'Skill'],
      skills: ['domain-guide', 'test-guide', 'domain-guide'],
    }, body);

    const result = emitOmpAgentFiles([record], {});
    const emitted = result.files[0]!.content;
    const frontmatter = emittedFrontmatter(emitted);

    expect(frontmatter.autoloadSkills).toEqual(['domain-guide', 'test-guide', 'domain-guide']);
    expect(frontmatter.tools).toEqual(['read', 'edit', 'write', 'yield']);
    expect(frontmatter.skills).toBeUndefined();
    expect(frontmatter.tools).not.toContain('Skill');
    expect(result.warnings).toEqual([
      'OMP agent executor (.claude/agents/executor.md) dropped unsupported tool: Skill; OMP loads routed skills via read skill://<name>',
    ]);
    expect(emitted.subarray(emitted.indexOf('\n---\n', 4) + 5)).toEqual(Buffer.from(body));
  });

  test('maps skills without adding an explicit tool restriction or warning', () => {
    const consumer = makeConsumer('tdk-omp-agent-skills-inherited-');
    const record = agent(consumer.root, 'executor.md', {
      name: 'executor',
      description: 'Execute with default tools',
      skills: ['domain-guide'],
    });

    const result = emitOmpAgentFiles([record], {});
    const frontmatter = emittedFrontmatter(result.files[0]!.content);

    expect(frontmatter.autoloadSkills).toEqual(['domain-guide']);
    expect(frontmatter.tools).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  test('preserves an empty skills list without warning', () => {
    const consumer = makeConsumer('tdk-omp-agent-skills-empty-');
    const record = agent(consumer.root, 'executor.md', {
      name: 'executor',
      description: 'Execute a skill-free phase',
      skills: [],
    });

    const result = emitOmpAgentFiles([record], {});

    expect(emittedFrontmatter(result.files[0]!.content).autoloadSkills).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test.each([
    { skills: 'domain-guide' },
    { skills: null },
    { skills: undefined },
    { skills: 7 },
    { skills: { name: 'domain-guide' } },
    { skills: ['domain-guide', 7] },
    { skills: ['domain-guide', ''] },
    { skills: [' \t '] },
  ])('drops malformed skills %j rather than emitting a partial preload', ({ skills }) => {
    const consumer = makeConsumer('tdk-omp-agent-skills-invalid-');
    const record = agent(consumer.root, 'executor.md', {
      name: 'executor',
      description: 'Execute routed phases',
      skills,
    });

    const result = emitOmpAgentFiles([record], {});
    const frontmatter = emittedFrontmatter(result.files[0]!.content);

    expect(frontmatter.autoloadSkills).toBeUndefined();
    expect(frontmatter.skills).toBeUndefined();
    expect(result.warnings).toEqual([
      'OMP agent executor (.claude/agents/executor.md) dropped invalid skills field: expected a list of non-empty skill names',
    ]);
  });

  test('drops Skill from comma-separated tools without changing body prose', () => {
    const consumer = makeConsumer('tdk-omp-agent-skill-tool-');
    const body = 'Call Skill for the assigned domain guide.\n';
    const record = agent(consumer.root, 'executor.md', {
      name: 'executor',
      description: 'Execute routed phases',
      tools: 'Read, Skill',
    }, body);

    const result = emitOmpAgentFiles([record], {});
    const frontmatter = emittedFrontmatter(result.files[0]!.content);

    expect(frontmatter.tools).toEqual(['read', 'yield']);
    expect(frontmatter.autoloadSkills).toBeUndefined();
    expect(result.files[0]!.content.toString('utf-8').endsWith(body)).toBe(true);
    expect(result.warnings).toEqual([
      'OMP agent executor (.claude/agents/executor.md) dropped unsupported tool: Skill; OMP loads routed skills via read skill://<name>',
    ]);
  });

  test('omits tools for wildcard and drops an unmapped model with warnings', () => {
    const consumer = makeConsumer('tdk-omp-agent-wildcard-');
    const record = agent(consumer.root, 'default-tools.md', {
      name: 'default-tools',
      description: 'Use defaults',
      tools: '*',
      model: 'future-model',
    });

    const result = emitOmpAgentFiles([record], { sonnet: '@task' });
    const frontmatter = emittedFrontmatter(result.files[0]!.content);

    expect(frontmatter.tools).toBeUndefined();
    expect(frontmatter.model).toBeUndefined();
    expect(result.warnings).toEqual([
      'OMP agent default-tools (.claude/agents/default-tools.md) uses wildcard tools; OMP default-tool semantics may differ',
      'OMP agent default-tools (.claude/agents/default-tools.md) dropped unmapped model: future-model',
    ]);
  });

  test('drops prototype-sensitive model and field names with warnings', () => {
    const consumer = makeConsumer('tdk-omp-agent-prototype-');
    const frontmatter = Object.assign(Object.create(null) as Record<string, unknown>, {
      name: 'prototype-boundary',
      description: 'Check prototype boundary',
      model: 'constructor',
      toString: 'unsupported',
    });
    const record = agent(consumer.root, 'prototype-boundary.md', frontmatter);

    const result = emitOmpAgentFiles([record], { sonnet: '@task' });
    const emitted = emittedFrontmatter(result.files[0]!.content);

    expect(emitted.model).toBeUndefined();
    expect(result.warnings).toEqual([
      'OMP agent prototype-boundary (.claude/agents/prototype-boundary.md) dropped unmapped model: constructor',
      'OMP agent prototype-boundary (.claude/agents/prototype-boundary.md) dropped unsupported field: toString',
    ]);
  });
});

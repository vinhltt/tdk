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

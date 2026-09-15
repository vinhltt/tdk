import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverFlatClaudeInventory } from '../src/flat-claude-adapter';
import { makeConsumer } from './fixtures';
import type { FlatClaudeAgentRecord } from '../src/flat-claude-types';

function writeAgent(root: string, filename: string, content: string): void {
  const target = path.join(root, '.claude/agents', filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
}

describe('flat Claude agent validity metadata', () => {
  test('retains filename fallback while exposing missing explicit name and YAML failure', () => {
    const consumer = makeConsumer('tdk-omp-agent-adapter-');
    writeAgent(consumer.root, 'missing-name.md', [
      '---',
      'description: Missing name',
      '---',
      'body',
    ].join('\n'));
    writeAgent(consumer.root, 'invalid-yaml.md', [
      '---',
      'name: invalid-yaml',
      'description: Invalid YAML',
      'tools: [Read',
      '---',
      'body',
    ].join('\n'));

    const agents = discoverFlatClaudeInventory(consumer.root).records
      .filter((record): record is FlatClaudeAgentRecord => record.kind === 'agent');
    const missingName = agents.find((record) => record.sourceRelativePath.endsWith('missing-name.md'))!;
    const invalidYaml = agents.find((record) => record.sourceRelativePath.endsWith('invalid-yaml.md'))!;

    expect(missingName.name).toBe('missing-name');
    expect(missingName.frontmatter.name).toBeUndefined();
    expect(missingName.frontmatterParseError).toBeUndefined();
    expect(invalidYaml.frontmatterParseError).toBeString();
    expect(invalidYaml.frontmatterParseError).not.toBe('');
  });
});

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverFlatClaudeInventory } from '../src/flat-claude-adapter';
import { makeConsumer } from './fixtures';

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

describe('flat claude adapter', () => {
  test('requires a source .claude directory', () => {
    const consumer = makeConsumer('tdk-flat-adapter-missing-');
    fs.rmSync(path.join(consumer.root, '.claude'), { recursive: true, force: true });

    expect(() => discoverFlatClaudeInventory(consumer.root)).toThrow('No .claude directory found');
  });

  test('discovers agents commands skills hooks settings and unknown files', () => {
    const consumer = makeConsumer('tdk-flat-adapter-known-');
    writeFile(consumer.root, '.claude/agents/reviewer.md', '---\nname: reviewer\n---\nReview.');
    writeFile(consumer.root, '.claude/commands/plan.md', '---\ndescription: Plan\n---\nPlan.');
    writeFile(consumer.root, '.claude/skills/demo/SKILL.md', '---\nname: demo\n---\nDemo.');
    writeFile(consumer.root, '.claude/hooks/privacy.cjs', 'process.exit(0);\n');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node .claude/hooks/privacy.cjs' }] }] },
    }));
    writeFile(consumer.root, '.claude/unknown.bin', 'unknown');

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const kinds = inventory.records.map((record) => record.kind).sort();

    expect(kinds).toEqual(['agent', 'command', 'hooks', 'settings', 'skill']);
    expect(inventory.unrecognized).toEqual([{ path: '.claude/unknown.bin', reason: 'No convert-flat matcher recognized this .claude entry' }]);
    expect(inventory.warnings).toEqual([]);
  });

  test('recovers unquoted scalar frontmatter descriptions with colons', () => {
    const consumer = makeConsumer('tdk-flat-adapter-loose-frontmatter-');
    writeFile(consumer.root, '.claude/agents/code-reviewer.md', [
      '---',
      'name: code-reviewer',
      'description: Use this agent when you need comprehensive code review and quality assurance. Context: before merging.',
      'tools: Read, Grep',
      '---',
      'Review code.',
    ].join('\n'));

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const agent = inventory.records.find((record) => record.kind === 'agent');

    expect(agent?.kind).toBe('agent');
    if (agent?.kind !== 'agent') throw new Error('Expected agent record');
    expect(agent.description).toBe('Use this agent when you need comprehensive code review and quality assurance. Context: before merging.');
    expect(agent.frontmatter.tools).toBe('Read, Grep');
    expect(agent.body).toBe('Review code.');
  });

  test('surfaces malformed hook shapes as warnings instead of dropping silently', () => {
    const consumer = makeConsumer('tdk-flat-adapter-hook-warnings-');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      hooks: {
        PreToolUse: { hooks: [] },
        PostToolUse: [{ hooks: [{ type: 'matcher' }, { type: 'command' }] }],
      },
    }));

    const inventory = discoverFlatClaudeInventory(consumer.root);

    expect(inventory.warnings).toContain('Skipped hook event PreToolUse: expected an array of hook groups');
    expect(inventory.warnings).toContain('Skipped hook in PostToolUse: unsupported hook type matcher');
    expect(inventory.warnings).toContain('Skipped hook in PostToolUse: missing command');
  });
});

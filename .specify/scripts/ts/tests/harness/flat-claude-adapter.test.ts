import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverFlatClaudeInventory } from '../../src/commands/harness/flat-claude-adapter';
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

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
    writeFile(consumer.root, '.claude/rules/typescript.md', '---\npaths:\n  - "src/**/*.ts"\n---\n# TypeScript');
    writeFile(consumer.root, '.claude/rules/testing.mdc', '# Testing\n');
    writeFile(consumer.root, '.claude/hooks/privacy.cjs', 'process.exit(0);\n');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node .claude/hooks/privacy.cjs' }] }] },
    }));
    writeFile(consumer.root, '.claude/unknown.bin', 'unknown');

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const kinds = inventory.records.map((record) => record.kind).sort();

    expect(kinds).toEqual(['agent', 'command', 'hooks', 'rule', 'rule', 'settings', 'skill']);
    const rules = inventory.records.filter((record) => record.kind === 'rule');
    expect(rules.map((rule) => rule.sourceRelativePath)).toEqual([
      '.claude/rules/testing.mdc',
      '.claude/rules/typescript.md',
    ]);
    expect(rules[1]?.frontmatter.paths).toEqual(['src/**/*.ts']);
    expect(rules[1]?.body).toBe('# TypeScript');
    expect(inventory.unrecognized).toEqual([{ path: '.claude/unknown.bin', reason: 'No convert-flat matcher recognized this .claude entry' }]);
    expect(inventory.warnings).toEqual([]);
  });

  test('recovers unquoted scalar frontmatter descriptions with colons', () => {
    const consumer = makeConsumer('tdk-flat-adapter-loose-frontmatter-');
    writeFile(consumer.root, '.claude/agents/code-reviewer.md', [
      '---',
      'name: code-reviewer',
      'description: Use this agent when you need comprehensive code review. Context: before merging.\\n\\n- Review all changes',
      'tools: Read, Grep',
      'metadata:',
      '  version: "0.2.0"',
      '---',
      'Review code.',
    ].join('\n'));

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const agent = inventory.records.find((record) => record.kind === 'agent');

    expect(agent?.kind).toBe('agent');
    if (agent?.kind !== 'agent') throw new Error('Expected agent record');
    expect(agent.description).toBe('Use this agent when you need comprehensive code review. Context: before merging.\\n\\n- Review all changes');
    expect(agent.frontmatter.tools).toBe('Read, Grep');
    expect(agent.frontmatter.metadata).toEqual({ version: '0.2.0' });
    expect(agent.frontmatterParseError).toBeUndefined();
    expect(agent.body).toBe('Review code.');
  });

  test('excludes Claude Code worktree snapshots from the root inventory', () => {
    const consumer = makeConsumer('tdk-flat-adapter-worktrees-');
    const agent = [
      '---',
      'name: reviewer',
      'description: Review code',
      '---',
      'Review code.',
    ].join('\n');
    writeFile(consumer.root, '.claude/agents/reviewer.md', agent);
    writeFile(consumer.root, '.claude/worktrees/agent-123/.claude/agents/reviewer.md', agent);
    writeFile(consumer.root, '.claude/worktrees/agent-123/.claude/unknown.bin', 'snapshot');

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const agents = inventory.records.filter((record) => record.kind === 'agent');

    expect(agents.map((record) => record.sourceRelativePath)).toEqual(['.claude/agents/reviewer.md']);
    expect(inventory.unrecognized).toEqual([]);
  });

  test('preserves source args and shell fields only when supplied', () => {
    const consumer = makeConsumer('tdk-flat-adapter-hook-exec-form-');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      hooks: {
        PreToolUse: [{
          hooks: [
            { type: 'command', command: 'node .claude/hooks/a.cjs', args: ['--stdio'], shell: false },
            { type: 'command', command: 'node .claude/hooks/b.cjs' },
          ],
        }],
      },
    }));

    const inventory = discoverFlatClaudeInventory(consumer.root);
    const hooks = inventory.records.find((record) => record.kind === 'hooks');
    const [execForm, shellForm] = hooks?.hooksByEvent.PreToolUse ?? [];

    expect(execForm).toMatchObject({ args: ['--stdio'], shell: false });
    expect(Object.prototype.hasOwnProperty.call(execForm, 'args')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(execForm, 'shell')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(shellForm, 'args')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(shellForm, 'shell')).toBe(false);
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

  test('retains malformed settings parse identity without classifying it as unknown', () => {
    const consumer = makeConsumer('tdk-flat-adapter-invalid-settings-');
    const settingsPath = path.join(consumer.root, '.claude/settings.json');
    writeFile(consumer.root, '.claude/settings.json', '{ invalid json\n');

    const inventory = discoverFlatClaudeInventory(consumer.root);

    expect(inventory.settingsParseError).toMatchObject({
      sourcePath: settingsPath,
      sourceRelativePath: '.claude/settings.json',
      message: expect.any(String),
    });
    expect(inventory.warnings.some((warning) => warning.startsWith('Invalid .claude/settings.json:'))).toBe(true);
    expect(inventory.unrecognized.map((entry) => entry.path)).not.toContain('.claude/settings.json');
  });
});

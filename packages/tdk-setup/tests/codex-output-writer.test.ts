import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCodexWritePlan } from '../src/codex-output-writer';
import { discoverFlatClaudeInventory } from '../src/flat-claude-adapter';
import { makeConsumer } from './fixtures';

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

describe('codex output writer', () => {
  test('preserves non-node hook commands and quoted args through shell wrappers', async () => {
    const consumer = makeConsumer('tdk-output-hook-shell-');
    writeFile(consumer.root, '.claude/hooks/foo.sh', 'printf "{}"');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'bash .claude/hooks/foo.sh "two words"' }] }],
      },
    }));

    const writePlan = await buildCodexWritePlan(discoverFlatClaudeInventory(consumer.root));
    const wrapper = writePlan.files.find((file) => file.targetRelativePath.includes('.codex/hooks/wrappers/'));

    expect(wrapper?.content.toString('utf-8')).toContain('bash .codex/hooks/foo.sh \\"two words\\"');
    expect(wrapper?.content.toString('utf-8')).toContain(process.platform === 'win32' ? '"cmd.exe"' : '"sh"');
  });

  test('removes stale convert-flat hooks while preserving user-owned hooks', async () => {
    const consumer = makeConsumer('tdk-output-stale-hooks-');
    writeFile(consumer.root, '.codex/hooks.json', JSON.stringify({
      PreToolUse: [{ command: 'node "hooks/wrappers/old.cjs"', _origin: 'convert-flat' }],
      UserPromptSubmit: [{ command: 'user-owned' }],
    }));
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({ hooks: {} }));

    const writePlan = await buildCodexWritePlan(discoverFlatClaudeInventory(consumer.root));
    const hooksJson = writePlan.files.find((file) => file.targetRelativePath === '.codex/hooks.json');
    const parsed = JSON.parse(hooksJson?.content.toString('utf-8') ?? '{}');

    expect(hooksJson).toBeDefined();
    expect(parsed.PreToolUse).toBeUndefined();
    expect(parsed.UserPromptSubmit).toEqual([{ command: 'user-owned' }]);
  });

  test('uses distinct wrappers for same command with different timeouts', async () => {
    const consumer = makeConsumer('tdk-output-timeout-wrappers-');
    writeFile(consumer.root, '.claude/hooks/foo.sh', 'printf "{}"');
    writeFile(consumer.root, '.claude/settings.json', JSON.stringify({
      hooks: {
        PreToolUse: [{
          hooks: [
            { type: 'command', command: 'bash .claude/hooks/foo.sh', timeout: 1000 },
            { type: 'command', command: 'bash .claude/hooks/foo.sh', timeout: 2000 },
          ],
        }],
      },
    }));

    const writePlan = await buildCodexWritePlan(discoverFlatClaudeInventory(consumer.root));
    const wrappers = writePlan.files.filter((file) => file.targetRelativePath.includes('.codex/hooks/wrappers/'));
    const hooksJson = writePlan.files.find((file) => file.targetRelativePath === '.codex/hooks.json');
    const parsed = JSON.parse(hooksJson?.content.toString('utf-8') ?? '{}');

    expect(wrappers).toHaveLength(2);
    expect(new Set(parsed.PreToolUse.map((hook: { command: string }) => hook.command)).size).toBe(2);
    expect(parsed.PreToolUse.map((hook: { timeout: number }) => hook.timeout).sort()).toEqual([1000, 2000]);
  });
});

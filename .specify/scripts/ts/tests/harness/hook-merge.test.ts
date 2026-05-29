import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildHookMerge, rewriteHookCommand } from '../../src/commands/harness/hook-merge';
import { makeConsumer, writeBasicPlugin } from './fixtures';

describe('hook merge', () => {
  test('rewrites CLAUDE_PLUGIN_ROOT command through CLAUDE_PROJECT_DIR cwd', () => {
    const rewritten = rewriteHookCommand('node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" dev-context-injector');
    expect(rewritten).toBe('cd "$CLAUDE_PROJECT_DIR" && node "$CLAUDE_PROJECT_DIR/.claude/hooks/hook-gateway.cjs" dev-context-injector');
  });

  test('preserves unmanaged hooks and adds selected plugin hook', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/privacy-block.cjs"' }],
          },
        ],
      },
      env: { X: '1' },
    };
    fs.writeFileSync(path.join(consumer.root, '.claude', 'settings.json'), JSON.stringify(settings));

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [],
      settings,
    });

    expect(result.collisions).toEqual([]);
    expect(result.managedHooks).toHaveLength(1);
    expect(JSON.stringify(result.nextSettings)).toContain('privacy-block.cjs');
    expect(JSON.stringify(result.nextSettings)).toContain('hook-gateway.cjs');
  });
});

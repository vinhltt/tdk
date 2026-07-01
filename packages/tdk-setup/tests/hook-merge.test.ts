import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildHookMerge, rewriteHookCommand } from '../src/hook-merge';
import { makeConsumer, pluginRoot, writeBasicPlugin, writePluginFile } from './fixtures';

// Default equal-prefix settings for call sites that don't test prefix migration.
// prefixSettings is required on buildHookMerge; equal prefixes → no-op text rewrite.
const defaultPrefixSettings = { sourcePrefix: 'tdk-', targetPrefix: 'tdk-' };

describe('hook merge', () => {
  test('rewrites CLAUDE_PLUGIN_ROOT command through CLAUDE_PROJECT_DIR cwd', () => {
    const rewritten = rewriteHookCommand('node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" dev-context-injector');
    expect(rewritten).toBe('cd "$CLAUDE_PROJECT_DIR" && node "${CLAUDE_PROJECT_DIR}/.claude/hooks/tdk-core/hook-gateway.cjs" dev-context-injector');
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
      prefixSettings: defaultPrefixSettings,
    });

    expect(result.collisions).toEqual([]);
    expect(result.managedHooks).toHaveLength(1);
    expect(JSON.stringify(result.nextSettings)).toContain('privacy-block.cjs');
    expect(JSON.stringify(result.nextSettings)).toContain('.claude/hooks/tdk-core/hook-gateway.cjs');
  });

  test('preserves hook handler fields while rewriting args paths', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const hooksPath = path.join(consumer.pluginRoot, 'hooks', 'hooks.json');
    fs.writeFileSync(hooksPath, JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: 'node',
                args: ['${CLAUDE_PLUGIN_ROOT}/scripts/demo.js'],
                timeout: 30,
                if: 'true',
              },
            ],
          },
        ],
      },
    }), 'utf-8');

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [],
      settings: {},
      prefixSettings: defaultPrefixSettings,
    });

    expect(result.collisions).toEqual([]);
    const settings = result.nextSettings as { hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> } };
    const handler = settings.hooks.PreToolUse[0]!.hooks[0]!;
    expect(handler.command).toBe('node');
    expect(handler.args).toEqual(['${CLAUDE_PROJECT_DIR}/.claude/scripts/tdk-core/demo.js']);
    expect(handler.timeout).toBe(30);
    expect(handler.if).toBe('true');
  });

  test('preserves exec-form command hook when args are set', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const hooksPath = path.join(consumer.pluginRoot, 'hooks', 'hooks.json');
    fs.writeFileSync(hooksPath, JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: '${CLAUDE_PLUGIN_ROOT}/scripts/run.js',
                args: ['--config', '${CLAUDE_PLUGIN_ROOT}/scripts/config.json'],
              },
            ],
          },
        ],
      },
    }), 'utf-8');

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [],
      settings: {},
      prefixSettings: defaultPrefixSettings,
    });

    expect(result.collisions).toEqual([]);
    const settings = result.nextSettings as { hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> } };
    const handler = settings.hooks.PreToolUse[0]!.hooks[0]!;
    expect(handler.command).toBe('${CLAUDE_PROJECT_DIR}/.claude/scripts/tdk-core/run.js');
    expect(handler.args).toEqual(['--config', '${CLAUDE_PROJECT_DIR}/.claude/scripts/tdk-core/config.json']);
  });

  test('preserves non-shell command hook when shell is false', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const hooksPath = path.join(consumer.pluginRoot, 'hooks', 'hooks.json');
    fs.writeFileSync(hooksPath, JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: '${CLAUDE_PLUGIN_ROOT}/scripts/run.js',
                shell: false,
              },
            ],
          },
        ],
      },
    }), 'utf-8');

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [],
      settings: {},
      prefixSettings: defaultPrefixSettings,
    });

    expect(result.collisions).toEqual([]);
    const settings = result.nextSettings as { hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> } };
    const handler = settings.hooks.PreToolUse[0]!.hooks[0]!;
    expect(handler.command).toBe('${CLAUDE_PROJECT_DIR}/.claude/scripts/tdk-core/run.js');
    expect(handler.shell).toBe(false);
  });

  test('blocks untranslatable plugin-only hook placeholders', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const hooksPath = path.join(consumer.pluginRoot, 'hooks', 'hooks.json');
    fs.writeFileSync(hooksPath, JSON.stringify({
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/lib/not-mapped.cjs"' }],
          },
        ],
      },
    }), 'utf-8');

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [],
      settings: {},
      prefixSettings: defaultPrefixSettings,
    });

    expect(result.collisions.some((collision) => collision.kind === 'unknown-hook-command')).toBe(true);
  });

  test('blocks unsafe plugin-root hook paths', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const hooksPath = path.join(consumer.pluginRoot, 'hooks', 'hooks.json');
    fs.writeFileSync(hooksPath, JSON.stringify({
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/../evil.cjs"' }],
          },
        ],
      },
    }), 'utf-8');

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [],
      settings: {},
      prefixSettings: defaultPrefixSettings,
    });

    expect(result.collisions.some((collision) => collision.kind === 'unknown-hook-command')).toBe(true);
  });

  test('blocks command hook handlers without command text', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const hooksPath = path.join(consumer.pluginRoot, 'hooks', 'hooks.json');
    fs.writeFileSync(hooksPath, JSON.stringify({
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '*',
            hooks: [{ type: 'command' }],
          },
        ],
      },
    }), 'utf-8');

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [],
      settings: {},
      prefixSettings: defaultPrefixSettings,
    });

    expect(result.collisions.some((collision) => collision.kind === 'unknown-hook-command')).toBe(true);
  });

  test('removes stale managed hook and recreates missing desired hook', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const previous = {
      id: 'tdk:tdk-core:UserPromptSubmit:*:old',
      plugin: 'tdk-core',
      event: 'UserPromptSubmit',
      matcher: '*',
      type: 'command',
      command: 'cd "$CLAUDE_PROJECT_DIR" && node "$CLAUDE_PROJECT_DIR/.claude/hooks/hook-gateway.cjs" old',
    };
    const settings = {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '*',
            hooks: [
              { type: 'command', command: previous.command },
              { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/custom.cjs"' },
            ],
          },
        ],
      },
    };

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [previous],
      settings,
      prefixSettings: defaultPrefixSettings,
    });

    const text = JSON.stringify(result.nextSettings);
    expect(text).not.toContain(' old');
    expect(text).toContain('custom.cjs');
    expect(text).toContain('.claude/hooks/tdk-core/hook-gateway.cjs');
    expect(result.settingsChanged).toBe(true);
  });

  test('blocks unmanaged duplicate of desired hook', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const settings = {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'cd "$CLAUDE_PROJECT_DIR" && node "${CLAUDE_PROJECT_DIR}/.claude/hooks/tdk-core/hook-gateway.cjs" dev-context-injector',
              },
            ],
          },
        ],
      },
    };

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [],
      settings,
      prefixSettings: defaultPrefixSettings,
    });

    expect(result.collisions.some((collision) => collision.kind === 'unmanaged-duplicate-hook')).toBe(true);
    expect(result.settingsChanged).toBe(false);
  });

  test('keeps shared hook handler when one owning plugin remains selected', () => {
    const consumer = makeConsumer();
    const hooksJson = JSON.stringify({
      hooks: {
        Stop: [
          {
            matcher: '',
            hooks: [{ type: 'prompt', prompt: 'Check completion: $ARGUMENTS' }],
          },
        ],
      },
    }, null, 2);
    writePluginFile(consumer, 'hooks/hooks.json', hooksJson, 'tdk-core');
    writePluginFile(consumer, 'hooks/hooks.json', hooksJson, 'tdk-memory');
    const pluginRoots = new Map([
      ['tdk-core', pluginRoot(consumer, 'tdk-core')],
      ['tdk-memory', pluginRoot(consumer, 'tdk-memory')],
    ]);
    const first = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core', 'tdk-memory'],
      pluginRoots,
      previousHooks: [],
      settings: {},
      prefixSettings: defaultPrefixSettings,
    });

    expect(first.collisions).toEqual([]);
    expect(first.managedHooks).toHaveLength(2);
    expect((first.nextSettings as { hooks: { Stop: Array<{ hooks: unknown[] }> } }).hooks.Stop[0]!.hooks).toHaveLength(1);

    const second = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-memory'],
      pluginRoots,
      previousHooks: first.managedHooks,
      settings: first.nextSettings,
      prefixSettings: defaultPrefixSettings,
    });

    expect(second.collisions).toEqual([]);
    expect(second.managedHooks).toHaveLength(1);
    expect(JSON.stringify(second.nextSettings)).toContain('Check completion');
    expect(second.settingsChanged).toBe(false);
  });

  test('rewrites hook command roots with transformed plugin ids', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [],
      settings: {},
      rewriteMap: new Map([
        ['tdk-core', 'erc-core'],
        ['tdk-demo', 'erc-demo'],
      ]),
      prefixSettings: defaultPrefixSettings,
    });

    expect(result.collisions).toEqual([]);
    const text = JSON.stringify(result.nextSettings);
    expect(text).toContain('.claude/hooks/erc-core/hook-gateway.cjs');
    expect(text).not.toContain('.claude/hooks/tdk-core/hook-gateway.cjs');
    expect(result.managedHooks[0]?.plugin).toBe('tdk-core');
  });

  test('rewrite.hooks=false suppresses both plugin-id remapping and hook-body text rewrite', () => {
    // When hooks rewrite is disabled the install layer passes new Map() as rewriteMap (no plugin-id remap)
    // and equal-prefix settings as prefixSettings (no text rewrite). Both concerns must be off together.
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const hooksPath = path.join(consumer.pluginRoot, 'hooks', 'hooks.json');
    // Use a command body that contains a tdk- token so we can assert text rewrite is suppressed
    fs.writeFileSync(hooksPath, JSON.stringify({
      hooks: {
        UserPromptSubmit: [{
          matcher: '*',
          hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" tdk-context' }],
        }],
      },
    }), 'utf-8');

    // hooks=false: empty rewriteMap (no plugin-id remap) + equal-prefix settings (no text rewrite)
    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [],
      settings: {},
      rewriteMap: new Map(),
      prefixSettings: { sourcePrefix: 'tdk-', targetPrefix: 'tdk-' },
    });

    expect(result.collisions).toEqual([]);
    const text = JSON.stringify(result.nextSettings);
    // Hook body tdk- token must NOT be rewritten (text rewrite suppressed via equal-prefix)
    expect(text).toContain('tdk-context');
    expect(text).not.toContain('erc-context');
    // Plugin-id segment in path uses original tdk-core (not remapped via rewriteMap)
    expect(text).toContain('.claude/hooks/tdk-core/hook-gateway.cjs');
    expect(text).not.toContain('.claude/hooks/erc-core/hook-gateway.cjs');
  });

  test('rewrite.hooks=true rewrites both hook-body text and plugin-id path', () => {
    // hooks=true: non-empty rewriteMap (plugin-id remap) + migration prefixSettings (text rewrite on)
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const hooksPath = path.join(consumer.pluginRoot, 'hooks', 'hooks.json');
    fs.writeFileSync(hooksPath, JSON.stringify({
      hooks: {
        UserPromptSubmit: [{
          matcher: '*',
          hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" tdk-context' }],
        }],
      },
    }), 'utf-8');

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [],
      settings: {},
      rewriteMap: new Map([['tdk-core', 'erc-core']]),
      prefixSettings: { sourcePrefix: 'tdk-', targetPrefix: 'erc-' },
    });

    expect(result.collisions).toEqual([]);
    const text = JSON.stringify(result.nextSettings);
    // Hook body tdk- token IS rewritten
    expect(text).toContain('erc-context');
    expect(text).not.toContain('tdk-context');
    // Plugin-id segment is remapped via rewriteMap
    expect(text).toContain('.claude/hooks/erc-core/hook-gateway.cjs');
    expect(text).not.toContain('.claude/hooks/tdk-core/hook-gateway.cjs');
  });

  test('migrates managed hook command roots to transformed plugin ids', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const previous = {
      id: 'tdk:tdk-core:UserPromptSubmit:*:old',
      plugin: 'tdk-core',
      event: 'UserPromptSubmit',
      matcher: '*',
      type: 'command',
      command: 'cd "$CLAUDE_PROJECT_DIR" && node "${CLAUDE_PROJECT_DIR}/.claude/hooks/tdk-core/hook-gateway.cjs" dev-context-injector',
    };
    const settings = {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: previous.command }],
          },
        ],
      },
    };

    const result = buildHookMerge({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      pluginRoots: new Map([['tdk-core', consumer.pluginRoot]]),
      previousHooks: [previous],
      settings,
      rewriteMap: new Map([['tdk-core', 'erc-core']]),
      prefixSettings: defaultPrefixSettings,
    });

    const text = JSON.stringify(result.nextSettings);
    expect(result.collisions).toEqual([]);
    expect(result.mutations.map((mutation) => mutation.action)).toEqual(['remove', 'add']);
    expect(text).toContain('.claude/hooks/erc-core/hook-gateway.cjs');
    expect(text).not.toContain('.claude/hooks/tdk-core/hook-gateway.cjs');
    expect(result.managedHooks[0]?.plugin).toBe('tdk-core');
  });
});

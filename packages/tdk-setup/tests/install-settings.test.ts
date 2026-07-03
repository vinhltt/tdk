import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import {
  loadInstallSettings,
  parseHarnessList,
  resolveClaudeSettings,
  settingsPathFor,
} from '../src/install-settings';
import { makeConsumer } from './fixtures';

describe('install settings', () => {
  test('loads global prefix and plugin defaults', () => {
    const consumer = makeConsumer();
    fs.writeFileSync(settingsPathFor(consumer.root), JSON.stringify({
      version: 1,
      defaults: {
        sourcePrefix: 'tdk',
        targetPrefix: 'sample',
        selectedPlugins: ['tdk-core'],
        rewrite: { paths: true, textFiles: true, hooks: true },
      },
      harnesses: {
        claude: { enabled: true, targetDir: '.claude', settingsPath: '.claude/settings.json' },
      },
    }));

    const settings = loadInstallSettings(consumer.root);

    expect(settings?.defaults.sourcePrefix).toBe('tdk-');
    expect(settings?.defaults.targetPrefix).toBe('sample-');
    expect(settings?.defaults.selectedPlugins).toEqual(['tdk-core']);
  });

  test('rejects per-harness prefix and plugin overrides in v1', () => {
    const consumer = makeConsumer();
    fs.writeFileSync(settingsPathFor(consumer.root), JSON.stringify({
      version: 1,
      defaults: {
        sourcePrefix: 'tdk-',
        targetPrefix: 'tdk-',
        selectedPlugins: [],
        rewrite: { paths: true, textFiles: true, hooks: true },
      },
      harnesses: {
        claude: {
          enabled: true,
          targetDir: '.claude',
          settingsPath: '.claude/settings.json',
          targetPrefix: 'sample-',
        },
      },
    }));

    expect(() => loadInstallSettings(consumer.root)).toThrow(/Per-harness targetPrefix/);
  });

  test('parses comma-separated harness names for future multi-harness CLI', () => {
    expect(parseHarnessList('claude,codex,claude')).toEqual(['claude', 'codex']);
    expect(() => parseHarnessList('claude,unknown')).toThrow(/Unsupported harness/);
  });

  test('rejects installing Claude when settings explicitly disable it', () => {
    const consumer = makeConsumer();
    fs.writeFileSync(settingsPathFor(consumer.root), JSON.stringify({
      version: 1,
      defaults: {
        sourcePrefix: 'tdk-',
        targetPrefix: 'tdk-',
        selectedPlugins: ['tdk-core'],
        rewrite: { paths: true, textFiles: true, hooks: true },
      },
      harnesses: {
        claude: { enabled: false, targetDir: '.claude', settingsPath: '.claude/settings.json' },
      },
    }));

    const settings = loadInstallSettings(consumer.root);

    expect(() => resolveClaudeSettings({ root: consumer.root, settings })).toThrow(/disabled/);
  });
});

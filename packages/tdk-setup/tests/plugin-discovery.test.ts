import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { discoverPluginInventory } from '../src/plugin-discovery';
import { makeConsumer, writeBasicPlugin } from './fixtures';

const CLAUDE_TARGET_MAPPER = resolve(import.meta.dir, '../src/claude-target-mapper.ts');

describe('discoverPluginInventory', () => {
  test('maps manifest files to Claude target paths', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const targets = inventory.plugins[0].files.map((file) => file.targetRelativePath).sort();

    expect(targets).toContain('.claude/skills/demo/SKILL.md');
    expect(targets).toContain('.claude/agents/demo.md');
    expect(targets).toContain('.claude/hooks/tdk-core/hook-gateway.cjs');
    expect(targets).not.toContain('.claude/hooks/hooks.json');
    expect(targets).toContain('.claude/scripts/tdk-core/demo.js');
  });

  test('does not build target-relative Claude paths with host path.join', () => {
    const source = readFileSync(CLAUDE_TARGET_MAPPER, 'utf-8');

    expect(source).not.toContain("path.join('.claude'");
  });
});

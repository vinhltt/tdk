import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { discoverPluginInventory } from '../../src/commands/harness/plugin-discovery';
import { makeConsumer, writeBasicPlugin } from './fixtures';

describe('discoverPluginInventory', () => {
  test('maps manifest files to Claude target paths', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const targets = inventory.plugins[0].files.map((file) => file.targetRelativePath).sort();

    expect(targets).toContain(path.join('.claude', 'skills', 'demo', 'SKILL.md'));
    expect(targets).toContain(path.join('.claude', 'agents', 'demo.md'));
    expect(targets).toContain(path.join('.claude', 'hooks', 'tdk-core', 'hook-gateway.cjs'));
    expect(targets).not.toContain(path.join('.claude', 'hooks', 'hooks.json'));
    expect(targets).toContain(path.join('.claude', 'scripts', 'tdk-core', 'demo.js'));
  });
});

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(TESTS_DIR, '..');

test('ships tdk-memory-agent and omits the retired memory-guardian agent in a flat plugin copy', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'tdk-memory-agent-'));
  const installedPlugin = join(sandbox, 'tdk-memory');

  try {
    cpSync(PLUGIN_ROOT, installedPlugin, { recursive: true });
    const agent = join(installedPlugin, 'agents', 'tdk-memory-agent.md');
    const retiredAgent = join(installedPlugin, 'agents', 'memory-guardian.md');

    assert.equal(existsSync(agent), true);
    assert.equal(existsSync(retiredAgent), false);
    assert.match(readFileSync(agent, 'utf8'), /^---\r?\nname: tdk-memory-agent\r?\n/m);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

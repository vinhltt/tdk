// Unit tests for identifyComponents in identify-components.ts.
// Verifies correct bucketing: skills (subdir), agents (flat .md), hooks (via hooks.json), commands (subdir or .md).

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { identifyComponents } from '../../src/commands/manifest/identify-components';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function mkdir(...parts: string[]): string {
  const p = path.join(tmpDir, ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function touch(...parts: string[]): void {
  const p = path.join(tmpDir, ...parts);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('identifyComponents', () => {
  test('skills: subdirectories under skills/ become skill components', () => {
    mkdir('skills', 'alpha');
    mkdir('skills', 'beta');
    touch('skills', 'not-a-skill.md'); // file — should be ignored

    const result = identifyComponents(tmpDir, 'myplugin');

    expect(Object.keys(result.skills).sort()).toEqual(['alpha', 'beta']);
    expect(Object.keys(result.agents)).toEqual([]);
    expect(Object.keys(result.hooks)).toEqual([]);
    expect(Object.keys(result.commands)).toEqual([]);
  });

  test('agents: .md files (flat) under agents/ become agent components', () => {
    touch('agents', 'alice.md');
    touch('agents', 'bob.md');
    mkdir('agents', 'not-an-agent'); // directory — should be ignored

    const result = identifyComponents(tmpDir, 'myplugin');

    expect(Object.keys(result.agents).sort()).toEqual(['alice', 'bob']);
    expect(Object.keys(result.skills)).toEqual([]);
  });

  test('agents: extension stripped (.md removed from key)', () => {
    touch('agents', 'myagent.md');

    const result = identifyComponents(tmpDir, 'myplugin');

    expect(Object.keys(result.agents)).toEqual(['myagent']);
  });

  test('hooks: keyed by plugin name when hooks/ dir contains hooks.json', () => {
    touch('hooks', 'hooks.json');
    touch('hooks', 'other-file.json');

    const result = identifyComponents(tmpDir, 'myplugin');

    expect(Object.keys(result.hooks)).toEqual(['myplugin']);
  });

  test('hooks: no hook component when hooks.json is absent', () => {
    mkdir('hooks'); // directory exists but no hooks.json

    const result = identifyComponents(tmpDir, 'myplugin');

    expect(Object.keys(result.hooks)).toEqual([]);
  });

  test('commands: subdirectory under commands/ becomes command component', () => {
    mkdir('commands', 'deploy');

    const result = identifyComponents(tmpDir, 'myplugin');

    expect(Object.keys(result.commands)).toEqual(['deploy']);
  });

  test('commands: flat .md file under commands/ becomes command component (extension stripped)', () => {
    touch('commands', 'run.md');

    const result = identifyComponents(tmpDir, 'myplugin');

    expect(Object.keys(result.commands)).toEqual(['run']);
  });

  test('empty plugin dir → all buckets empty', () => {
    const result = identifyComponents(tmpDir, 'myplugin');

    expect(Object.keys(result.skills)).toEqual([]);
    expect(Object.keys(result.agents)).toEqual([]);
    expect(Object.keys(result.hooks)).toEqual([]);
    expect(Object.keys(result.commands)).toEqual([]);
  });
});

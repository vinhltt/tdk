// Unit tests for compareComponents in compare.ts.
// Written TDD-style: RED before fix, GREEN after Phase 2 implementation.

import { test, expect, describe } from 'bun:test';
import { compareComponents } from '../../src/commands/manifest/compare';
import type { PluginComponents } from '../../src/commands/manifest/types';
import type { FileComparison } from '../../src/commands/manifest/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeComponents(overrides: Partial<PluginComponents> = {}): PluginComponents {
  return {
    skills: {},
    agents: {},
    hooks: {},
    commands: {},
    ...overrides,
  };
}

function makeFileComparison(overrides: Partial<FileComparison> = {}): FileComparison {
  return {
    newFiles: [],
    changedFiles: [],
    removedFiles: [],
    unchangedFiles: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('compareComponents', () => {
  // Case 1: References file modified → skill marked changed
  test('1: refs file modified marks skill changed', () => {
    const current = makeComponents({ skills: { x: { version: '0.1.0' } } });
    const manifest = makeComponents({ skills: { x: { version: '0.1.0' } } });
    const fc = makeFileComparison({ changedFiles: ['skills/x/refs/y.md'] });

    const result = compareComponents(current, manifest, fc, 'myplugin');

    expect(result.changed_components.skills).toEqual(['x']);
    expect(result.unchanged_components.skills).toEqual([]);
    expect(result.new_components.skills).toEqual([]);
    expect(result.removed_components.skills).toEqual([]);
  });

  // Case 2: SKILL.md modified → skill marked changed
  test('2: SKILL.md modified marks skill changed', () => {
    const current = makeComponents({ skills: { x: { version: '0.1.0' } } });
    const manifest = makeComponents({ skills: { x: { version: '0.1.0' } } });
    const fc = makeFileComparison({ changedFiles: ['skills/x/SKILL.md'] });

    const result = compareComponents(current, manifest, fc, 'myplugin');

    expect(result.changed_components.skills).toEqual(['x']);
    expect(result.unchanged_components.skills).toEqual([]);
  });

  // Case 3: File added in skill dir → skill marked changed
  test('3: new file added inside skill dir marks skill changed', () => {
    const current = makeComponents({ skills: { x: { version: '0.1.0' } } });
    const manifest = makeComponents({ skills: { x: { version: '0.1.0' } } });
    const fc = makeFileComparison({ newFiles: ['skills/x/refs/new.md'] });

    const result = compareComponents(current, manifest, fc, 'myplugin');

    expect(result.changed_components.skills).toEqual(['x']);
    expect(result.unchanged_components.skills).toEqual([]);
  });

  // Case 4: File removed from skill dir → skill marked changed
  test('4: file removed from skill dir marks skill changed', () => {
    const current = makeComponents({ skills: { x: { version: '0.1.0' } } });
    const manifest = makeComponents({ skills: { x: { version: '0.1.0' } } });
    const fc = makeFileComparison({ removedFiles: ['skills/x/refs/old.md'] });

    const result = compareComponents(current, manifest, fc, 'myplugin');

    expect(result.changed_components.skills).toEqual(['x']);
    expect(result.unchanged_components.skills).toEqual([]);
  });

  // Case 5: Skill deleted entirely → appears in removed_components
  test('5: skill in manifest but not current goes to removed_components', () => {
    const current = makeComponents({ skills: {} });
    const manifest = makeComponents({ skills: { x: { version: '0.1.0' } } });
    const fc = makeFileComparison();

    const result = compareComponents(current, manifest, fc, 'myplugin');

    expect(result.removed_components.skills).toEqual(['x']);
    expect(result.changed_components.skills).toEqual([]);
    expect(result.new_components.skills).toEqual([]);
    expect(result.unchanged_components.skills).toEqual([]);
  });

  // Case 6: No file changes → skill is unchanged
  test('6: no file changes → skill unchanged', () => {
    const current = makeComponents({ skills: { x: { version: '0.1.0' } } });
    const manifest = makeComponents({ skills: { x: { version: '0.1.0' } } });
    const fc = makeFileComparison();

    const result = compareComponents(current, manifest, fc, 'myplugin');

    expect(result.unchanged_components.skills).toEqual(['x']);
    expect(result.changed_components.skills).toEqual([]);
    expect(result.new_components.skills).toEqual([]);
    expect(result.removed_components.skills).toEqual([]);
  });

  // Case 7: Trailing-slash false-positive guard
  // Both "foo" and "foo-bar" exist in current AND manifest.
  // Only "skills/foo-bar/SKILL.md" changed — "foo" must NOT be flagged.
  test('7: trailing-slash: foo-bar change does NOT affect foo', () => {
    const current = makeComponents({ skills: { foo: { version: '0.1.0' }, 'foo-bar': { version: '0.1.0' } } });
    const manifest = makeComponents({ skills: { foo: { version: '0.1.0' }, 'foo-bar': { version: '0.1.0' } } });
    const fc = makeFileComparison({ changedFiles: ['skills/foo-bar/SKILL.md'] });

    const result = compareComponents(current, manifest, fc, 'myplugin');

    expect(result.unchanged_components.skills).toEqual(['foo']);
    expect(result.changed_components.skills).toEqual(['foo-bar']);
  });

  // Case 8: Multi-skill, only one changed
  test('8: multi-skill: only actually-changed skill in changed bucket', () => {
    const current = makeComponents({
      skills: {
        alpha: { version: '0.1.0' },
        beta: { version: '0.1.0' },
        gamma: { version: '0.1.0' },
      },
    });
    const manifest = makeComponents({
      skills: {
        alpha: { version: '0.1.0' },
        beta: { version: '0.1.0' },
        gamma: { version: '0.1.0' },
      },
    });
    const fc = makeFileComparison({ changedFiles: ['skills/beta/SKILL.md'] });

    const result = compareComponents(current, manifest, fc, 'myplugin');

    expect(result.changed_components.skills).toEqual(['beta']);
    expect(result.unchanged_components.skills).toEqual(['alpha', 'gamma']);
    expect(result.new_components.skills).toEqual([]);
    expect(result.removed_components.skills).toEqual([]);
  });

  // Case 9: Agent .md modified → agent marked changed
  test('9: agent .md modified marks agent changed', () => {
    const current = makeComponents({ agents: { myagent: { version: '0.1.0' } } });
    const manifest = makeComponents({ agents: { myagent: { version: '0.1.0' } } });
    const fc = makeFileComparison({ changedFiles: ['agents/myagent.md'] });

    const result = compareComponents(current, manifest, fc, 'myplugin');

    expect(result.changed_components.agents).toEqual(['myagent']);
    expect(result.unchanged_components.agents).toEqual([]);
  });

  // Case 10: Hook file modified → hook (keyed by plugin name) marked changed
  test('10: hook file modified marks hook (keyed by plugin name) changed', () => {
    const current = makeComponents({ hooks: { myplugin: { version: '0.1.0' } } });
    const manifest = makeComponents({ hooks: { myplugin: { version: '0.1.0' } } });
    const fc = makeFileComparison({ changedFiles: ['hooks/foo.json'] });

    const result = compareComponents(current, manifest, fc, 'myplugin');

    expect(result.changed_components.hooks).toEqual(['myplugin']);
    expect(result.unchanged_components.hooks).toEqual([]);
  });
});

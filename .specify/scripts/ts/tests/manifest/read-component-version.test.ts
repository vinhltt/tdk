// Verify readComponentVersionFromSource reads versions from source-of-truth files
// (definition files written by plugin-bump), not from a derived manifest.

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readComponentVersionFromSource } from '../../src/commands/manifest/read-component-version';

describe('readComponentVersionFromSource', () => {
  let pluginDir: string;

  beforeEach(() => {
    pluginDir = mkdtempSync(join(tmpdir(), 'comp-ver-'));
  });

  afterEach(() => {
    rmSync(pluginDir, { recursive: true, force: true });
  });

  it('reads skill version from SKILL.md metadata.version (block-style)', () => {
    const skillDir = join(pluginDir, 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: my-skill\ndescription: test\nmetadata:\n  version: "1.4.2"\n---\n# my-skill\n',
    );
    expect(readComponentVersionFromSource(pluginDir, 'skills', 'my-skill')).toBe('1.4.2');
  });

  it('falls back to top-level version on SKILL.md when metadata.version absent', () => {
    const skillDir = join(pluginDir, 'skills', 'legacy-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: legacy-skill\nversion: "0.9.0"\n---\n# legacy-skill\n',
    );
    expect(readComponentVersionFromSource(pluginDir, 'skills', 'legacy-skill')).toBe('0.9.0');
  });

  it('reads agent version from top-level frontmatter (plugin-bump convention)', () => {
    const agentsDir = join(pluginDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'my-agent.md'),
      '---\nname: my-agent\nversion: 2.0.1\ndescription: test\n---\n# agent body\n',
    );
    expect(readComponentVersionFromSource(pluginDir, 'agents', 'my-agent')).toBe('2.0.1');
  });

  it('reads command version from flat .md file', () => {
    const cmdDir = join(pluginDir, 'commands');
    mkdirSync(cmdDir, { recursive: true });
    writeFileSync(
      join(cmdDir, 'my-cmd.md'),
      '---\nversion: 0.3.0\n---\n# cmd\n',
    );
    expect(readComponentVersionFromSource(pluginDir, 'commands', 'my-cmd')).toBe('0.3.0');
  });

  it('reads command version from nested folder layout', () => {
    const cmdDir = join(pluginDir, 'commands', 'nested-cmd');
    mkdirSync(cmdDir, { recursive: true });
    writeFileSync(
      join(cmdDir, 'nested-cmd.md'),
      '---\nversion: 1.1.0\n---\n# nested\n',
    );
    expect(readComponentVersionFromSource(pluginDir, 'commands', 'nested-cmd')).toBe('1.1.0');
  });

  it('reads hook version from hooks.json top-level', () => {
    const hooksDir = join(pluginDir, 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, 'hooks.json'),
      JSON.stringify({ version: '3.2.1', hooks: {} }, null, 2),
    );
    expect(readComponentVersionFromSource(pluginDir, 'hooks', 'whatever-name')).toBe('3.2.1');
  });

  it('returns null when source file does not exist', () => {
    expect(readComponentVersionFromSource(pluginDir, 'skills', 'absent')).toBeNull();
    expect(readComponentVersionFromSource(pluginDir, 'agents', 'absent')).toBeNull();
    expect(readComponentVersionFromSource(pluginDir, 'commands', 'absent')).toBeNull();
    expect(readComponentVersionFromSource(pluginDir, 'hooks', 'absent')).toBeNull();
  });

  it('returns null on SKILL.md without frontmatter', () => {
    const skillDir = join(pluginDir, 'skills', 'no-fm');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# no frontmatter\n');
    expect(readComponentVersionFromSource(pluginDir, 'skills', 'no-fm')).toBeNull();
  });

  it('returns null on malformed JSON in hooks.json', () => {
    const hooksDir = join(pluginDir, 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'hooks.json'), '{invalid');
    expect(readComponentVersionFromSource(pluginDir, 'hooks', 'x')).toBeNull();
  });
});

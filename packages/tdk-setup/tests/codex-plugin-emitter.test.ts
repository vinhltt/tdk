import { describe, expect, test } from 'bun:test';
import { buildCodexPluginArtifacts, assertSafeCodexPluginArtifactPath } from '../src/codex-plugin-emitter';
import type { CodexConvertPlugin } from '../src/codex-convert-ir';

// Minimal plugin fixture for emitter tests — no filesystem reads needed.
function makePlugin(overrides: Partial<CodexConvertPlugin> = {}): CodexConvertPlugin {
  return {
    name: 'tdk-test',
    version: '1.0.0',
    description: 'Test plugin',
    root: '/fake/root',
    claudePlugin: { name: 'tdk-test', description: 'Test plugin' },
    interfaceSource: {
      displayName: 'Tdk Test',
      shortDescription: 'Test',
      longDescription: 'Test',
      developerName: 'Tihon',
      category: 'Development',
      capabilities: ['Skills'],
      defaultPrompt: ['Use tdk-test.'],
      brandColor: '#2563EB',
    },
    agents: [],
    commands: [],
    skills: [],
    hooks: { commands: [], files: [] },
    lib: [],
    warnings: [],
    ...overrides,
  };
}

function buf(s: string): Buffer {
  return Buffer.from(s, 'utf-8');
}

describe('assertSafeCodexPluginArtifactPath - official layout', () => {
  test('allows .codex-plugin/plugin.json', () => {
    expect(() => assertSafeCodexPluginArtifactPath('.codex-plugin/plugin.json')).not.toThrow();
  });

  test('allows skills/ paths', () => {
    expect(() => assertSafeCodexPluginArtifactPath('skills/tdk-demo/SKILL.md')).not.toThrow();
    expect(() => assertSafeCodexPluginArtifactPath('skills/tdk-demo/assets/data.bin')).not.toThrow();
  });

  test('allows hooks/codex-hooks.json', () => {
    expect(() => assertSafeCodexPluginArtifactPath('hooks/codex-hooks.json')).not.toThrow();
  });

  test('allows hooks/*.cjs files', () => {
    expect(() => assertSafeCodexPluginArtifactPath('hooks/hook-gateway.cjs')).not.toThrow();
    expect(() => assertSafeCodexPluginArtifactPath('hooks/wrappers/abc.cjs')).not.toThrow();
  });

  test('allows lib/*.cjs files', () => {
    expect(() => assertSafeCodexPluginArtifactPath('lib/demo.cjs')).not.toThrow();
  });

  test('rejects agents/ paths (install-only now)', () => {
    expect(() => assertSafeCodexPluginArtifactPath('agents/demo.toml')).toThrow();
  });

  test('rejects config.toml (install-only now)', () => {
    expect(() => assertSafeCodexPluginArtifactPath('config.toml')).toThrow();
  });

  test('rejects old .codex-plugin/skills/ prefix paths', () => {
    expect(() => assertSafeCodexPluginArtifactPath('.codex-plugin/skills/tdk-demo/SKILL.md')).toThrow();
  });

  test('rejects old .codex-plugin/hooks/ prefix paths', () => {
    expect(() => assertSafeCodexPluginArtifactPath('.codex-plugin/hooks/hook-gateway.cjs')).toThrow();
  });

  test('rejects old .codex-plugin/hooks.json (must be codex-hooks.json)', () => {
    expect(() => assertSafeCodexPluginArtifactPath('hooks/hooks.json')).toThrow();
  });

  test('rejects absolute paths', () => {
    expect(() => assertSafeCodexPluginArtifactPath('/absolute/path')).toThrow();
  });

  test('rejects path traversal', () => {
    expect(() => assertSafeCodexPluginArtifactPath('skills/../secret')).toThrow();
  });
});

describe('buildCodexPluginArtifacts - official layout', () => {
  test('plugin with no content emits only plugin.json at .codex-plugin/plugin.json', async () => {
    const plugin = makePlugin();
    const { artifacts } = await buildCodexPluginArtifacts(plugin);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.artifactRelativePath).toBe('.codex-plugin/plugin.json');
  });

  test('skill files placed at skills/... not .codex-plugin/skills/...', async () => {
    const plugin = makePlugin({
      skills: [{
        name: 'tdk-demo',
        files: [{
          sourcePath: '/fake/root/skills/tdk-demo/SKILL.md',
          sourceRelativePath: 'skills/tdk-demo/SKILL.md',
          content: buf('# tdk-demo\nUse tdk-demo.\n'),
          checksum: 'abc',
        }],
      }],
    });
    const { artifacts } = await buildCodexPluginArtifacts(plugin);
    const paths = artifacts.map((a) => a.artifactRelativePath);
    expect(paths).toContain('skills/tdk-demo/SKILL.md');
    // Must NOT have old prefix
    expect(paths.some((p) => p.startsWith('.codex-plugin/skills/'))).toBe(false);
  });

  test('internal shared skill SKILL.md is not emitted as a loadable Codex skill', async () => {
    const plugin = makePlugin({
      skills: [{
        name: '_shared',
        files: [{
          sourcePath: '/fake/root/skills/_shared/SKILL.md',
          sourceRelativePath: 'skills/_shared/SKILL.md',
          content: buf('---\nmetadata:\n  version: 0.1.0\n---\n\n# _shared\n'),
          checksum: 'abc',
        }, {
          sourcePath: '/fake/root/skills/_shared/retro-feedback-schema.md',
          sourceRelativePath: 'skills/_shared/retro-feedback-schema.md',
          content: buf('# Retro feedback schema\n'),
          checksum: 'def',
        }],
      }],
    });
    const { artifacts } = await buildCodexPluginArtifacts(plugin);
    const paths = artifacts.map((a) => a.artifactRelativePath);
    expect(paths).not.toContain('skills/_shared/SKILL.md');
    expect(paths).toContain('skills/_shared/retro-feedback-schema.md');
  });

  test('hook files placed at hooks/... not .codex-plugin/hooks/...', async () => {
    const plugin = makePlugin({
      hooks: {
        commands: [],
        files: [{
          sourcePath: '/fake/root/hooks/hook-gateway.cjs',
          sourceRelativePath: 'hooks/hook-gateway.cjs',
          content: buf('"use strict";\n'),
          checksum: 'abc',
        }],
      },
    });
    const { artifacts } = await buildCodexPluginArtifacts(plugin);
    const paths = artifacts.map((a) => a.artifactRelativePath);
    expect(paths).toContain('hooks/hook-gateway.cjs');
    expect(paths.some((p) => p.startsWith('.codex-plugin/hooks/'))).toBe(false);
  });

  test('lib files placed at lib/... not .codex-plugin/lib/...', async () => {
    const plugin = makePlugin({
      lib: [{
        sourcePath: '/fake/root/lib/demo.cjs',
        sourceRelativePath: 'lib/demo.cjs',
        content: buf('module.exports = {};\n'),
        checksum: 'abc',
      }],
    });
    const { artifacts } = await buildCodexPluginArtifacts(plugin);
    const paths = artifacts.map((a) => a.artifactRelativePath);
    expect(paths).toContain('lib/demo.cjs');
    expect(paths.some((p) => p.startsWith('.codex-plugin/lib/'))).toBe(false);
  });

  test('hook declaration emitted at hooks/codex-hooks.json (not hooks.json)', async () => {
    const plugin = makePlugin({
      hooks: {
        commands: [{
          event: 'PreToolUse',
          matcher: 'Read',
          command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" demo-hook',
        }],
        files: [{
          sourcePath: '/fake/root/hooks/hook-gateway.cjs',
          sourceRelativePath: 'hooks/hook-gateway.cjs',
          content: buf('"use strict";\n'),
          checksum: 'abc',
        }, {
          sourcePath: '/fake/root/hooks/demo-hook.cjs',
          sourceRelativePath: 'hooks/demo-hook.cjs',
          content: buf('"use strict";\n'),
          checksum: 'def',
        }],
      },
    });
    const { artifacts } = await buildCodexPluginArtifacts(plugin);
    const paths = artifacts.map((a) => a.artifactRelativePath);
    expect(paths).toContain('hooks/codex-hooks.json');
    // Must NOT emit old hooks.json name
    expect(paths).not.toContain('hooks/hooks.json');
    expect(paths).not.toContain('.codex-plugin/hooks.json');
  });

  test('plugin.json has hooks field pointing to ./hooks/codex-hooks.json when hooks present', async () => {
    const plugin = makePlugin({
      hooks: {
        commands: [{
          event: 'PreToolUse',
          matcher: 'Read',
          command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" demo-hook',
        }],
        files: [{
          sourcePath: '/fake/root/hooks/hook-gateway.cjs',
          sourceRelativePath: 'hooks/hook-gateway.cjs',
          content: buf('"use strict";\n'),
          checksum: 'abc',
        }, {
          sourcePath: '/fake/root/hooks/demo-hook.cjs',
          sourceRelativePath: 'hooks/demo-hook.cjs',
          content: buf('"use strict";\n'),
          checksum: 'def',
        }],
      },
    });
    const { artifacts } = await buildCodexPluginArtifacts(plugin);
    const pluginJsonArtifact = artifacts.find((a) => a.artifactRelativePath === '.codex-plugin/plugin.json');
    expect(pluginJsonArtifact).toBeDefined();
    const pluginJson = JSON.parse(pluginJsonArtifact!.content.toString('utf-8'));
    expect(pluginJson.hooks).toBe('./hooks/codex-hooks.json');
  });

  test('plugin.json has NO hooks field when no hooks present', async () => {
    const plugin = makePlugin();
    const { artifacts } = await buildCodexPluginArtifacts(plugin);
    const pluginJsonArtifact = artifacts.find((a) => a.artifactRelativePath === '.codex-plugin/plugin.json');
    const pluginJson = JSON.parse(pluginJsonArtifact!.content.toString('utf-8'));
    expect(pluginJson.hooks).toBeUndefined();
  });

  test('NO agents/*.toml artifacts emitted (install-only)', async () => {
    const plugin = makePlugin({
      agents: [{
        sourcePath: '/fake/root/agents/tdk-helper.md',
        sourceRelativePath: 'agents/tdk-helper.md',
        content: buf('---\nname: tdk-helper\ndescription: Helper\ntools: Read\n---\n\nHelp.\n'),
        checksum: 'abc',
        name: 'tdk-helper',
        description: 'Helper',
        frontmatter: { name: 'tdk-helper', description: 'Helper', tools: 'Read' },
        body: 'Help.',
      }],
    });
    const { artifacts } = await buildCodexPluginArtifacts(plugin);
    const paths = artifacts.map((a) => a.artifactRelativePath);
    expect(paths.some((p) => p.startsWith('agents/'))).toBe(false);
    expect(paths.some((p) => p.includes('agents/'))).toBe(false);
  });

  test('NO config.toml artifact emitted (install-only)', async () => {
    const plugin = makePlugin({
      agents: [{
        sourcePath: '/fake/root/agents/tdk-helper.md',
        sourceRelativePath: 'agents/tdk-helper.md',
        content: buf('---\nname: tdk-helper\ndescription: Helper\ntools: Read\n---\n\nHelp.\n'),
        checksum: 'abc',
        name: 'tdk-helper',
        description: 'Helper',
        frontmatter: { name: 'tdk-helper', description: 'Helper', tools: 'Read' },
        body: 'Help.',
      }],
      hooks: {
        commands: [{
          event: 'PreToolUse',
          matcher: 'Read',
          command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" demo-hook',
        }],
        files: [{
          sourcePath: '/fake/root/hooks/hook-gateway.cjs',
          sourceRelativePath: 'hooks/hook-gateway.cjs',
          content: buf('"use strict";\n'),
          checksum: 'abc',
        }, {
          sourcePath: '/fake/root/hooks/demo-hook.cjs',
          sourceRelativePath: 'hooks/demo-hook.cjs',
          content: buf('"use strict";\n'),
          checksum: 'def',
        }],
      },
    });
    const { artifacts } = await buildCodexPluginArtifacts(plugin);
    const paths = artifacts.map((a) => a.artifactRelativePath);
    expect(paths).not.toContain('config.toml');
    expect(paths).not.toContain('.codex-plugin/config.toml');
  });

  test('all artifact paths use official layout (no .codex-plugin/ prefix except plugin.json)', async () => {
    const plugin = makePlugin({
      skills: [{
        name: 'tdk-demo',
        files: [{
          sourcePath: '/fake/root/skills/tdk-demo/SKILL.md',
          sourceRelativePath: 'skills/tdk-demo/SKILL.md',
          content: buf('# tdk-demo\n'),
          checksum: 'abc',
        }],
      }],
      hooks: {
        commands: [],
        files: [{
          sourcePath: '/fake/root/hooks/hook-gateway.cjs',
          sourceRelativePath: 'hooks/hook-gateway.cjs',
          content: buf('"use strict";\n'),
          checksum: 'abc',
        }],
      },
      lib: [{
        sourcePath: '/fake/root/lib/demo.cjs',
        sourceRelativePath: 'lib/demo.cjs',
        content: buf('module.exports = {};\n'),
        checksum: 'abc',
      }],
    });
    const { artifacts } = await buildCodexPluginArtifacts(plugin);
    for (const a of artifacts) {
      if (a.artifactRelativePath === '.codex-plugin/plugin.json') continue;
      expect(a.artifactRelativePath).not.toMatch(/^\.codex-plugin\//);
    }
  });
});

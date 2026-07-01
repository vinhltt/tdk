import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverPluginInventory } from '../src/plugin-discovery';
import { emptyHarnessManifest } from '../src/manifest-store';
import { buildClaudeInstallPlan } from '../src/install-plan';
import { makeConsumer, sha256, writeBasicPlugin, writeHookOnlyPlugin, writeMultiPluginManifest, writePluginFile, writePrefixedSkillPlugin } from './fixtures';
import { discoverPrefixRewritePlugins } from '../src/plugin-discovery';

function buildPlan(root: string) {
  const inventory = discoverPluginInventory(root, ['tdk-core']);
  return buildClaudeInstallPlan({
    consumerRoot: root,
    selectedPlugins: ['tdk-core'],
    plugins: inventory.plugins,
    previousManifest: emptyHarnessManifest(),
    settings: {},
  });
}

describe('buildClaudeInstallPlan', () => {
  test('plans writes without mutating filesystem', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const plan = buildPlan(consumer.root);

    expect(plan.writes.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md'))).toBe(false);
  });

  test('excludes raw hooks json and namespaces hook scripts by plugin', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);

    const plan = buildPlan(consumer.root);

    expect(plan.writes.some((write) => write.targetRelativePath === '.claude/hooks/hooks.json')).toBe(false);
    expect(plan.writes.some((write) => write.targetRelativePath === '.claude/hooks/tdk-core/hook-gateway.cjs')).toBe(true);
  });

  test('namespaces same hook filenames from multiple plugins', () => {
    const consumer = makeConsumer();
    writeHookOnlyPlugin(consumer, 'tdk-core', 'hook-gateway.cjs');
    writeHookOnlyPlugin(consumer, 'tdk-memory', 'hook-gateway.cjs');
    const gatewayCore = '#!/usr/bin/env node\nconsole.log("tdk-core");\n';
    const gatewayMemory = '#!/usr/bin/env node\nconsole.log("tdk-memory");\n';
    const hooksCore = JSON.stringify({
      hooks: { UserPromptSubmit: [{ matcher: '*', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" core' }] }] },
    }, null, 2);
    const hooksMemory = JSON.stringify({
      hooks: { UserPromptSubmit: [{ matcher: '*', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" memory' }] }] },
    }, null, 2);
    fs.writeFileSync(path.join(consumer.root, '.specify', 'plugins', 'tdk-core', 'hooks', 'hook-gateway.cjs'), gatewayCore);
    fs.writeFileSync(path.join(consumer.root, '.specify', 'plugins', 'tdk-core', 'hooks', 'hooks.json'), hooksCore);
    fs.writeFileSync(path.join(consumer.root, '.specify', 'plugins', 'tdk-memory', 'hooks', 'hook-gateway.cjs'), gatewayMemory);
    fs.writeFileSync(path.join(consumer.root, '.specify', 'plugins', 'tdk-memory', 'hooks', 'hooks.json'), hooksMemory);
    writeMultiPluginManifest(consumer, {
      'tdk-core': {
        version: '1.0.0',
        files: {
          'hooks/hook-gateway.cjs': sha256(gatewayCore),
          'hooks/hooks.json': sha256(hooksCore),
        },
      },
      'tdk-memory': {
        version: '1.0.0',
        files: {
          'hooks/hook-gateway.cjs': sha256(gatewayMemory),
          'hooks/hooks.json': sha256(hooksMemory),
        },
      },
    });

    const inventory = discoverPluginInventory(consumer.root, ['tdk-core', 'tdk-memory']);
    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core', 'tdk-memory'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });

    expect(plan.collisions).toEqual([]);
    expect(plan.writes.map((write) => write.targetRelativePath)).toContain('.claude/hooks/tdk-core/hook-gateway.cjs');
    expect(plan.writes.map((write) => write.targetRelativePath)).toContain('.claude/hooks/tdk-memory/hook-gateway.cjs');
    expect(JSON.stringify(plan.nextSettings)).toContain('.claude/hooks/tdk-core/hook-gateway.cjs');
    expect(JSON.stringify(plan.nextSettings)).toContain('.claude/hooks/tdk-memory/hook-gateway.cjs');
  });

  test('namespaces hook filenames using transformed plugin ids for custom prefixes', () => {
    const consumer = makeConsumer();
    writeHookOnlyPlugin(consumer, 'tdk-core', 'hook-gateway.cjs');
    writeHookOnlyPlugin(consumer, 'tdk-memory', 'hook-gateway.cjs');
    const gatewayCore = '#!/usr/bin/env node\nconsole.log("tdk-core");\n';
    const gatewayMemory = '#!/usr/bin/env node\nconsole.log("tdk-memory");\n';
    const hooksCore = JSON.stringify({
      hooks: { UserPromptSubmit: [{ matcher: '*', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" core' }] }] },
    }, null, 2);
    const hooksMemory = JSON.stringify({
      hooks: { UserPromptSubmit: [{ matcher: '*', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/hook-gateway.cjs" memory' }] }] },
    }, null, 2);
    fs.writeFileSync(path.join(consumer.root, '.specify', 'plugins', 'tdk-core', 'hooks', 'hook-gateway.cjs'), gatewayCore);
    fs.writeFileSync(path.join(consumer.root, '.specify', 'plugins', 'tdk-core', 'hooks', 'hooks.json'), hooksCore);
    fs.writeFileSync(path.join(consumer.root, '.specify', 'plugins', 'tdk-memory', 'hooks', 'hook-gateway.cjs'), gatewayMemory);
    fs.writeFileSync(path.join(consumer.root, '.specify', 'plugins', 'tdk-memory', 'hooks', 'hooks.json'), hooksMemory);
    writeMultiPluginManifest(consumer, {
      'tdk-core': {
        version: '1.0.0',
        files: {
          'hooks/hook-gateway.cjs': sha256(gatewayCore),
          'hooks/hooks.json': sha256(hooksCore),
        },
      },
      'tdk-memory': {
        version: '1.0.0',
        files: {
          'hooks/hook-gateway.cjs': sha256(gatewayMemory),
          'hooks/hooks.json': sha256(hooksMemory),
        },
      },
    });

    const inventory = discoverPluginInventory(consumer.root, ['tdk-core', 'tdk-memory']);
    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core', 'tdk-memory'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
      sourcePrefix: 'tdk-',
      targetPrefix: 'erc-',
    });

    expect(plan.collisions).toEqual([]);
    expect(plan.writes.map((write) => write.targetRelativePath)).toContain('.claude/hooks/erc-core/hook-gateway.cjs');
    expect(plan.writes.map((write) => write.targetRelativePath)).toContain('.claude/hooks/erc-memory/hook-gateway.cjs');
    expect(JSON.stringify(plan.nextSettings)).toContain('.claude/hooks/erc-core/hook-gateway.cjs');
    expect(JSON.stringify(plan.nextSettings)).toContain('.claude/hooks/erc-memory/hook-gateway.cjs');
    expect(JSON.stringify(plan.nextSettings)).not.toContain('.claude/hooks/tdk-core/hook-gateway.cjs');
    expect(JSON.stringify(plan.nextSettings)).not.toContain('.claude/hooks/tdk-memory/hook-gateway.cjs');
  });

  test('requires prompt for unmanaged target collision', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const target = path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'user content', 'utf-8');

    const plan = buildPlan(consumer.root);

    expect(plan.collisions.some((collision) => collision.kind === 'unmanaged-target-exists')).toBe(true);
    expect(plan.prompts.some((prompt) => prompt.type === 'unmanaged-target-overwrite')).toBe(true);
    expect(plan.writes.some((write) => write.targetRelativePath.endsWith('skills/demo/SKILL.md'))).toBe(true);
  });

  test('prompts cleanup for unmanaged stale generated hooks json', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const sourceHooks = fs.readFileSync(path.join(consumer.pluginRoot, 'hooks', 'hooks.json'), 'utf-8');
    const target = path.join(consumer.root, '.claude', 'hooks', 'hooks.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, sourceHooks, 'utf-8');

    const plan = buildPlan(consumer.root);

    expect(plan.collisions.some((collision) => collision.kind === 'unmanaged-stale-hooks-json')).toBe(true);
    expect(plan.prompts.some((prompt) => prompt.type === 'unmanaged-stale-hooks-json-cleanup')).toBe(true);
  });

  test('blocks hook config checksum mismatch after discovery', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    fs.writeFileSync(path.join(consumer.pluginRoot, 'hooks', 'hooks.json'), '{"hooks":{}}\n', 'utf-8');

    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
    });

    expect(plan.collisions.some((collision) => collision.message.includes('Hook config checksum mismatch'))).toBe(true);
  });

  test('normalizes raw legacy backslash manifest targets before diffing removals', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
    const skillFile = inventory.plugins[0]?.files.find((file) => file.sourceRelativePath === 'skills/demo/SKILL.md');
    expect(skillFile).toBeDefined();
    const skillContent = fs.readFileSync(skillFile!.sourcePath);
    const skillChecksum = sha256(skillContent.toString('utf-8'));
    const target = path.join(consumer.root, '.claude', 'skills', 'demo', 'SKILL.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, skillContent);

    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: {
        ...emptyHarnessManifest(),
        managedFiles: [{
          plugin: 'tdk-core',
          sourceRelativePath: 'skills/demo/SKILL.md',
          targetRelativePath: ['.claude', 'skills', 'demo', 'SKILL.md'].join('\\\\'),
          sourceChecksum: skillFile!.sourceChecksum,
          installedChecksum: skillChecksum,
        }],
      },
      settings: {},
    });

    expect(plan.removals).toEqual([]);
    expect(plan.nextManifest.managedFiles.some((file) => file.targetRelativePath === '.claude/skills/demo/SKILL.md')).toBe(true);
    expect(plan.nextManifest.managedFiles.some((file) => file.targetRelativePath.includes('\\'))).toBe(false);
  });

  test('removes clean managed stale project docs skill when it is no longer desired', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const staleContent = '# old project docs skill\n';
    const staleSource = ['skills', 'tdk-docs', 'SKILL.md'].join('/');
    const staleTarget = ['.claude', 'skills', 'tdk-docs', 'SKILL.md'].join('/');
    const staleTargetPath = path.join(consumer.root, staleTarget);
    fs.mkdirSync(path.dirname(staleTargetPath), { recursive: true });
    fs.writeFileSync(staleTargetPath, staleContent);

    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: discoverPluginInventory(consumer.root, ['tdk-core']).plugins,
      previousManifest: {
        ...emptyHarnessManifest(),
        managedFiles: [{
          plugin: 'tdk-core',
          sourceRelativePath: staleSource,
          targetRelativePath: staleTarget,
          sourceChecksum: sha256(staleContent),
          installedChecksum: sha256(staleContent),
        }],
      },
      settings: {},
    });

    expect(plan.removals.map((removal) => removal.targetRelativePath)).toContain(staleTarget);
    expect(plan.collisions.some((collision) => collision.kind === 'managed-drift')).toBe(false);
  });

  test('reports drifted managed stale project docs skill instead of deleting it', () => {
    const consumer = makeConsumer();
    writeBasicPlugin(consumer);
    const staleContent = '# old project docs skill\n';
    const staleSource = ['skills', 'tdk-docs', 'SKILL.md'].join('/');
    const staleTarget = ['.claude', 'skills', 'tdk-docs', 'SKILL.md'].join('/');
    const staleTargetPath = path.join(consumer.root, staleTarget);
    fs.mkdirSync(path.dirname(staleTargetPath), { recursive: true });
    fs.writeFileSync(staleTargetPath, '# user-edited old project docs skill\n');

    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: discoverPluginInventory(consumer.root, ['tdk-core']).plugins,
      previousManifest: {
        ...emptyHarnessManifest(),
        managedFiles: [{
          plugin: 'tdk-core',
          sourceRelativePath: staleSource,
          targetRelativePath: staleTarget,
          sourceChecksum: sha256(staleContent),
          installedChecksum: sha256(staleContent),
        }],
      },
      settings: {},
    });

    expect(plan.removals.map((removal) => removal.targetRelativePath)).not.toContain(staleTarget);
    expect(plan.collisions.some((collision) => (
      collision.kind === 'managed-drift' && collision.message.includes(staleTarget)
    ))).toBe(true);
  });
});

describe('prefix migration install-level', () => {
  test('default prefix (tdk→tdk) produces byte-identical installed content (no-op)', () => {
    // When sourcePrefix === targetPrefix the transform is gated off; installed bytes must equal source bytes.
    const consumer = makeConsumer();
    writePrefixedSkillPlugin(consumer);
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);

    // Explicit equal prefixes (same result as omitting both — defaults are tdk-/tdk-)
    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      previousManifest: emptyHarnessManifest(),
      settings: {},
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
    });

    const write = plan.writes.find((item) => item.sourceRelativePath === 'skills/tdk-demo/SKILL.md');
    expect(write).toBeDefined();
    // Installed content must equal source content byte-for-byte
    expect(write!.content.toString('utf-8')).toBe('# tdk-demo\nUse tdk-demo from command text.\n');
    expect(write!.sourceChecksum).toBe(write!.installedChecksum);
  });

  test('no residual tdk- in transformable regions after pav- migration; mapper-undefined source refs preserved', () => {
    // After migration to pav-: all tdk- tokens in prose/converted paths must be replaced.
    // Intentional exception: mapper-undefined source refs (.specify/plugins/tdk-utils/manifest.json,
    // hooks/hooks.json) stay verbatim and are excluded from the no-residual assertion.
    const consumer = makeConsumer();
    const skill = [
      '# tdk-sub-workspace',
      'Run /tdk-* to bootstrap.',
      'Status: `tdk-status` is ready.',
      'Job ID: tdk-001 for tdk-specific tasks.',
      'Source: .specify/plugins/tdk-utils/skills/tdk-scout/SKILL.md',
      'Manifest ref: .specify/plugins/tdk-utils/manifest.json',
      '',
    ].join('\n');
    writePluginFile(consumer, 'skills/tdk-sub-workspace/SKILL.md', skill, 'tdk-core');
    writeMultiPluginManifest(consumer, {
      'tdk-core': {
        version: '1.0.0',
        files: { 'skills/tdk-sub-workspace/SKILL.md': sha256(skill) },
      },
      'tdk-utils': {
        version: '1.0.0',
        files: { 'skills/tdk-scout/SKILL.md': sha256('# tdk-scout\n') },
      },
    });
    const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);

    const plan = buildClaudeInstallPlan({
      consumerRoot: consumer.root,
      selectedPlugins: ['tdk-core'],
      plugins: inventory.plugins,
      rewritePlugins: discoverPrefixRewritePlugins(consumer.root),
      previousManifest: emptyHarnessManifest(),
      settings: {},
      sourcePrefix: 'tdk-',
      targetPrefix: 'pav-',
    });

    const content = plan.writes
      .find((item) => item.sourceRelativePath === 'skills/tdk-sub-workspace/SKILL.md')
      ?.content.toString('utf-8');
    expect(content).toBeDefined();

    // Mapper-undefined manifest ref stays verbatim — pull it out before the no-residual check
    const lines = content!.split('\n');
    const manifestLine = lines.find((line) => line.includes('manifest.json'));
    expect(manifestLine).toContain('.specify/plugins/tdk-utils/manifest.json');

    // Transformable regions (all lines except the verbatim manifest line) must have no residual tdk-
    const transformableLines = lines.filter((line) => !line.includes('.specify/plugins/'));
    const transformableText = transformableLines.join('\n');
    expect(transformableText).not.toContain('tdk-');

    // Positive spot-checks: blanket rewrites fired
    expect(content).toContain('/pav-*');
    expect(content).toContain('`pav-status`');
    expect(content).toContain('pav-001');
    expect(content).toContain('pav-specific');
    // Mapper-defined skills ref converted correctly
    expect(content).toContain('.claude/skills/pav-scout/SKILL.md');
  });
});

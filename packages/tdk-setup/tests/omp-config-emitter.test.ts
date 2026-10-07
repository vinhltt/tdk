import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import { sha256Buffer } from '../src/checksum';
import { emptyHarnessManifest } from '../src/manifest-store';
import { emitOmpConfigFile } from '../src/omp-config-emitter';
import { extractOmpManagedPayload, mergeConfigYaml } from '../src/lib/harness-transform/config-yaml-merge';
import { makeConsumer } from './fixtures';
import type { FlatClaudeInventory, FlatClaudeSettingsRecord } from '../src/flat-claude-types';

function writeFile(root: string, relativePath: string, content: string): string {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function matchesBashPattern(pattern: string, command: string): boolean {
  const expression = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('\\*', '.*');
  return new RegExp(`^${expression}$`).test(command);
}

function inventory(root: string, value: Record<string, unknown>): FlatClaudeInventory {
  const sourcePath = writeFile(root, '.claude/settings.json', `${JSON.stringify(value, null, 2)}\n`);
  const settings: FlatClaudeSettingsRecord = {
    kind: 'settings',
    sourcePath,
    sourceRelativePath: '.claude/settings.json',
    value,
  };
  return { consumerRoot: root, records: [settings], unrecognized: [], warnings: [] };
}

describe('OMP config emitter', () => {
  test('maps only supported settings without broadening scoped permissions or leaking local values', () => {
    const consumer = makeConsumer('tdk-omp-config-map-');
    const secret = 'DO_NOT_LEAK_LOCAL_SECRET';
    writeFile(consumer.root, '.omp/config.yml', 'retry:\n  enabled: true\n');
    writeFile(consumer.root, '.claude/settings.local.json', JSON.stringify({
      hooks: { secret },
      permissions: { secret },
      env: { TOKEN: secret },
    }));
    const source = inventory(consumer.root, {
      model: 'opus',
      effortLevel: 'high',
      alwaysThinkingEnabled: false,
      showThinkingSummaries: true,
      permissions: {
        allow: ['Read', 'Read(src/**)', 'Bash(git status)', 'Write', 'Bash(git:*)', 'Bash(git push:*)'],
        deny: ['Write', 'Bash(git push:*)', 'Bash(dd if=/dev/zero of=/dev/sd*:*)'],
        ask: ['Edit', 'Bash(git commit:*)', 'WebFetch', 'Bash'],
      },
      env: { TOKEN: 'SOURCE_ENV_SECRET' },
      hooks: { PreToolUse: [] },
      statusLine: { type: 'command', command: secret },
      enabledPlugins: { demo: true },
    });

    const result = emitOmpConfigFile({
      inventory: source,
      activeParts: ['settings'],
      modelMap: { opus: 'anthropic/claude-opus-4-1' },
      previousManifest: emptyHarnessManifest('omp'),
    });
    const file = result.file!;
    const payload = extractOmpManagedPayload(file.content.toString('utf-8'))!;
    const config = parse(payload) as Record<string, any>;
    const serialized = JSON.stringify(result);

    expect(file.targetRelativePath).toBe('.omp/config.yml');
    expect(file.part).toBeUndefined();
    expect(file.content.toString('utf-8').startsWith('retry:\n  enabled: true\n')).toBe(true);
    expect(config).toEqual({
      tools: { approval: { read: 'allow', write: 'deny', edit: 'prompt', bash: 'prompt' } },
      bash: { patterns: [
        { match: 'git push', approval: 'deny' },
        { match: 'git push *', approval: 'deny' },
        { match: 'dd if=/dev/zero of=/dev/sd*', approval: 'deny' },
        { match: 'dd if=/dev/zero of=/dev/sd* *', approval: 'deny' },
        { match: 'git commit', approval: 'prompt' },
        { match: 'git commit *', approval: 'prompt' },
        { match: 'git status', approval: 'allow' },
        { match: 'git', approval: 'allow' },
        { match: 'git *', approval: 'allow' },
      ] },
      defaultThinkingLevel: 'high',
      modelRoles: { default: 'anthropic/claude-opus-4-1' },
    });
    expect(file.managedRegionChecksum).toBe(sha256Buffer(Buffer.from(payload, 'utf-8')));
    expect(result.facts).toContainEqual(expect.objectContaining({ layer: 1, status: 'dropped', key: 'permissions.allow[1]' }));
    expect(result.facts).toContainEqual(expect.objectContaining({ layer: 1, status: 'dropped', key: 'alwaysThinkingEnabled' }));
    expect(result.facts).toContainEqual(expect.objectContaining({
      layer: 1,
      status: 'dropped',
      key: 'permissions.allow[3]',
      message: expect.stringMatching(/superseded/i),
    }));
    expect(result.facts).toContainEqual(expect.objectContaining({
      layer: 1,
      status: 'dropped',
      key: 'permissions.allow[5]',
      message: expect.stringMatching(/superseded/i),
    }));
    expect(result.facts).toContainEqual(expect.objectContaining({ layer: 1, status: 'local-not-converted', key: 'hooks' }));
    expect(result.facts).toContainEqual(expect.objectContaining({ layer: 1, status: 'local-not-converted', key: 'permissions' }));
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('SOURCE_ENV_SECRET');
  });

  test('keeps a Bash executable prefix within its token boundary', () => {
    const consumer = makeConsumer('tdk-omp-config-bash-executable-prefix-');
    const source = inventory(consumer.root, {
      permissions: {
        allow: ['Bash(git:*)'],
      },
    });

    const result = emitOmpConfigFile({
      inventory: source,
      activeParts: ['settings'],
      modelMap: {},
      previousManifest: emptyHarnessManifest('omp'),
    });
    const config = parse(extractOmpManagedPayload(result.file!.content.toString('utf-8'))!) as {
      bash: { patterns: Array<{ match: string }> };
    };
    const allowed = (command: string) => config.bash.patterns.some((pattern) => matchesBashPattern(pattern.match, command));

    expect(allowed('git --version')).toBe(true);
    expect(allowed('git statusx')).toBe(true);
    expect(allowed('git-evil')).toBe(false);
  });

  test('keeps a Bash subcommand prefix within its token boundary', () => {
    const consumer = makeConsumer('tdk-omp-config-bash-subcommand-prefix-');
    const source = inventory(consumer.root, {
      permissions: {
        allow: ['Bash(git status:*)'],
      },
    });

    const result = emitOmpConfigFile({
      inventory: source,
      activeParts: ['settings'],
      modelMap: {},
      previousManifest: emptyHarnessManifest('omp'),
    });
    const config = parse(extractOmpManagedPayload(result.file!.content.toString('utf-8'))!) as {
      bash: { patterns: Array<{ match: string }> };
    };
    const allowed = (command: string) => config.bash.patterns.some((pattern) => matchesBashPattern(pattern.match, command));

    expect(allowed('git status --short')).toBe(true);
    expect(allowed('git-evil')).toBe(false);
    expect(allowed('git statusx')).toBe(false);
  });

  test('drops scoped non-Bash permissions without creating global approvals', () => {
    const consumer = makeConsumer('tdk-omp-config-scoped-permissions-');
    const source = inventory(consumer.root, {
      permissions: {
        allow: ['Read(src/**)'],
        deny: ['Edit(src/generated/**)'],
        ask: ['WebFetch(domain:example.com)', 'mcp__demo__read(resource)'],
      },
    });

    const result = emitOmpConfigFile({
      inventory: source,
      activeParts: ['settings'],
      modelMap: {},
      previousManifest: emptyHarnessManifest('omp'),
    });

    expect(result.file!.content.toString('utf-8')).not.toContain('tools:');
    expect(result.facts.filter((item) => item.key?.startsWith('permissions.'))).toHaveLength(4);
    expect(result.facts.filter((item) => item.key?.startsWith('permissions.')).every(
      (item) => item.status === 'dropped',
    )).toBe(true);
  });

  test('builds the shared block from active settings and skills fragments', () => {
    const consumer = makeConsumer('tdk-omp-config-shared-');
    const source = inventory(consumer.root, { effortLevel: 'medium' });


    const result = emitOmpConfigFile({
      inventory: source,
      activeParts: ['settings', 'skills'],
      modelMap: {},
      previousManifest: emptyHarnessManifest('omp'),
    });
    const config = parse(extractOmpManagedPayload(result.file!.content.toString('utf-8'))!) as Record<string, any>;

    expect(config).toEqual({
      defaultThinkingLevel: 'medium',
      skills: { enableClaudeUser: false, enableClaudeProject: false },
    });
  });

  test('preserves user-owned model roles while updating other managed settings', () => {
    const consumer = makeConsumer('tdk-omp-user-model-roles-');
    const userBytes = '# My models\r\nmodelRoles:\r\n  default: user/default\r\n  task: user/task\r\n\r\n';
    writeFile(consumer.root, '.omp/config.yml', mergeConfigYaml(userBytes, 'skills:\n  enableClaudeUser: false').content);
    const source = inventory(consumer.root, { model: 'opus', effortLevel: 'high' });
    const input = {
      inventory: source,
      activeParts: ['settings', 'skills'] as const,
      modelMap: { opus: '@slow' },
      previousManifest: emptyHarnessManifest('omp'),
    };
    const result = emitOmpConfigFile(input);
    const output = result.file!.content.toString('utf-8');
    const payload = extractOmpManagedPayload(output)!;

    expect(parse(output)).toEqual({
      modelRoles: { default: 'user/default', task: 'user/task' },
      defaultThinkingLevel: 'high',
      skills: { enableClaudeUser: false, enableClaudeProject: false },
    });
    expect(mergeConfigYaml(output, '').unmanagedContent).toBe(userBytes);
    expect(parse(payload).modelRoles).toBeUndefined();
    expect(result.facts).toContainEqual(expect.objectContaining({
      status: 'dropped', key: 'model', message: expect.stringMatching(/user-owned/i),
    }));
    fs.writeFileSync(path.join(consumer.root, '.omp/config.yml'), output);
    expect(emitOmpConfigFile(input).file!.content.toString('utf-8')).toBe(output);
  });

  test('updates converter-owned model roles and still rejects unrelated ownership conflicts', () => {
    const consumer = makeConsumer('tdk-omp-managed-model-roles-');
    const source = inventory(consumer.root, { model: 'opus', effortLevel: 'high' });
    writeFile(consumer.root, '.omp/config.yml', mergeConfigYaml(
      'retry:\n  enabled: true\n',
      'modelRoles:\n  default: old/model',
    ).content);
    const input = {
      inventory: source,
      activeParts: ['settings'] as const,
      modelMap: { opus: '@slow' },
      previousManifest: emptyHarnessManifest('omp'),
    };
    expect(parse(emitOmpConfigFile(input).file!.content.toString('utf-8')).modelRoles).toEqual({ default: '@slow' });
    writeFile(consumer.root, '.omp/config.yml', 'modelRoles:\n  default: user/model\ndefaultThinkingLevel: low\n');
    expect(() => emitOmpConfigFile(input)).toThrow(/ownership conflict.*defaultThinkingLevel/);
  });
  test('reports every unsupported settings family without copying its value', () => {
    const consumer = makeConsumer('tdk-omp-config-drops-');
    const marker = 'UNSUPPORTED_VALUE_MARKER';
    const source = inventory(consumer.root, {
      model: 'unmapped',
      effortLevel: 'turbo',
      alwaysThinkingEnabled: true,
      showThinkingSummaries: true,
      permissions: { allow: [marker] },
      env: { marker },
      hooks: { marker },
      statusLine: { marker },
      disabledMcpjsonServers: [marker],
      enabledMcpjsonServers: [marker],
      enabledPlugins: { [marker]: true },
      skillListingBudgetFraction: marker,
      skillListingMaxDescChars: marker,
      skillOverrides: { marker },
      outputStyle: marker,
      attribution: { marker },
      prefersReducedMotion: true,
      $schema: marker,
      unknownSetting: marker,
      enableAllProjectMcpServers: true,
    });

    const result = emitOmpConfigFile({
      inventory: source,
      activeParts: ['settings'],
      modelMap: {},
      previousManifest: emptyHarnessManifest('omp'),
    });
    const factKeys = result.facts.map((item) => item.key);

    expect(factKeys).toEqual(expect.arrayContaining([
      'model',
      'effortLevel',
      'alwaysThinkingEnabled',
      'showThinkingSummaries',
      'permissions.allow[0]',
      'env',
      'hooks',
      'statusLine',
      'disabledMcpjsonServers',
      'enabledMcpjsonServers',
      'enabledPlugins',
      'skillListingBudgetFraction',
      'skillListingMaxDescChars',
      'skillOverrides',
      'outputStyle',
      'attribution',
      'prefersReducedMotion',
      '$schema',
      'unknownSetting',
      'enableAllProjectMcpServers',
    ]));
    expect(JSON.stringify(result)).not.toContain(marker);
  });

  test('strips the shared block and unmanages config when no shared part remains', () => {
    const consumer = makeConsumer('tdk-omp-config-remove-');
    const user = 'retry:\n  enabled: true\n\n';
    const managed = mergeConfigYaml(user, 'defaultThinkingLevel: high\nskills:\n  enableClaudeUser: false');
    writeFile(consumer.root, '.omp/config.yml', managed.content);
    const previous = emptyHarnessManifest('omp');
    previous.convertedParts = ['settings', 'skills'];
    previous.managedFiles.push({
      plugin: 'convert-flat',
      sourceRelativePath: '.claude/settings.json',
      targetRelativePath: '.omp/config.yml',
      sourceChecksum: 'source',
      installedChecksum: sha256Buffer(Buffer.from(managed.content)),
      managedRegionChecksum: sha256Buffer(Buffer.from(extractOmpManagedPayload(managed.content)!)),
    });

    const result = emitOmpConfigFile({
      inventory: inventory(consumer.root, {}),
      activeParts: [],
      modelMap: {},
      previousManifest: previous,
    });

    expect(result.file?.content.toString('utf-8')).toBe(user);
    expect(result.file?.unmanageAfterWrite).toBe(true);
    expect(result.file?.managedRegionChecksum).toBeUndefined();
    expect(result.file?.currentManagedRegionChecksum).toBe(previous.managedFiles[0]?.managedRegionChecksum);
  });
});

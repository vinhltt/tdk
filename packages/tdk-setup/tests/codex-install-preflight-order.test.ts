import { describe, expect, mock, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import { makeConsumer, sha256, writeMultiPluginManifest, writePluginDependencyPolicy, writePluginFile } from './fixtures';

const sourcePath = path.resolve('src');
let confirmationCalls = 0;
let confirmationDetails: { requestedOptionalPlugins: string[]; resolvedPlugins: string[] } | undefined;

await mock.module(`${sourcePath}/prompt`, () => ({
  selectHarnessInteractively: async () => ['codex'],
  selectPluginsInteractively: async () => [],
  confirmOverwrite: async () => false,
  askPrefixInteractively: async (prefix: string) => prefix,
  confirmInstallTarget: async (details: { requestedOptionalPlugins: string[]; resolvedPlugins: string[] }) => {
    confirmationCalls += 1;
    confirmationDetails = {
      requestedOptionalPlugins: [...details.requestedOptionalPlugins],
      resolvedPlugins: [...details.resolvedPlugins],
    };
    return true;
  },
}));

const { createInstallCommand } = await import(`${sourcePath}/install`);

function forceStdinTTY(value: boolean): () => void {
  const previous = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value });
  return () => {
    if (previous) Object.defineProperty(process.stdin, 'isTTY', previous);
    else delete (process.stdin as NodeJS.ReadStream & { isTTY?: boolean }).isTTY;
  };
}

const fourPluginBasePolicy = {
  requiredPlugins: ['tdk-core', 'tdk-inception'],
  dependencies: {
    'tdk-core': ['tdk-utils'],
    'tdk-inception': ['tdk-memory', 'tdk-utils'],
  },
};

function writeCodexPreflightFixture(
  consumer: ReturnType<typeof makeConsumer>,
  scenario: 'missing' | 'incomplete' | 'stale' | 'version-skew',
): void {
  writeMultiPluginManifest(consumer, { 'tdk-core': { version: '1.0.0', files: {} } });
  writePluginDependencyPolicy(consumer);
  const manifestPath = path.join(consumer.root, '.specify', 'codex-plugins', 'manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

  if (scenario === 'missing') {
    fs.writeFileSync(manifestPath, JSON.stringify({ plugins: {} }), 'utf-8');
    return;
  }

  const pluginJson = '{"name":"tdk-core","version":"1.0.0"}\n';
  const pluginJsonPath = path.join(consumer.root, '.specify', 'codex-plugins', 'tdk-core', '.codex-plugin', 'plugin.json');
  fs.mkdirSync(path.dirname(pluginJsonPath), { recursive: true });
  fs.writeFileSync(pluginJsonPath, scenario === 'stale' ? 'stale package bytes\n' : pluginJson, 'utf-8');
  fs.writeFileSync(manifestPath, JSON.stringify({
    plugins: {
      'tdk-core': {
        version: scenario === 'version-skew' ? '2.0.0' : '1.0.0',
        files: scenario === 'incomplete' ? {} : { '.codex-plugin/plugin.json': sha256(pluginJson) },
      },
    },
  }), 'utf-8');
}

function writeFourPluginBaseWithOptional(consumer: ReturnType<typeof makeConsumer>): void {
  const plugins: Record<string, { version: string; files: Record<string, string> }> = {};
  for (const plugin of ['tdk-core', 'tdk-epic', 'tdk-inception', 'tdk-memory', 'tdk-utils']) {
    const sourceRelativePath = `skills/${plugin}/SKILL.md`;
    const content = `# ${plugin}\n`;
    writePluginFile(consumer, sourceRelativePath, content, plugin);
    plugins[plugin] = { version: '1.0.0', files: { [sourceRelativePath]: sha256(content) } };
  }
  writeMultiPluginManifest(consumer, plugins);
  writePluginDependencyPolicy(consumer, fourPluginBasePolicy);
}

describe('Codex CLI preflight ordering', () => {
  for (const scenario of [
    { name: 'missing generated package', fixture: 'missing' as const, error: 'missing generated' },
    { name: 'incomplete generated package', fixture: 'incomplete' as const, error: 'incomplete generated package' },
    { name: 'stale generated package', fixture: 'stale' as const, error: 'stale generated package' },
    { name: 'version-skewed generated package', fixture: 'version-skew' as const, error: 'version mismatch' },
  ]) {
    test(`aborts ${scenario.name} before confirmation`, async () => {
      const consumer = makeConsumer('tdk-codex-preflight-order-');
      const stderr: string[] = [];
      writeCodexPreflightFixture(consumer, scenario.fixture);
      confirmationCalls = 0;
      const restoreTty = forceStdinTTY(true);
      const stderrSpy = spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderr.push(String(chunk));
        return true;
      });
      const stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
      const exitSpy = spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit-stub'); }) as never);

      try {
        await (createInstallCommand() as Command).parseAsync([
          '--harness', 'codex', '--plugins', 'tdk-core', consumer.root,
        ], { from: 'user' });
      } catch (_) {
        // process.exit is stubbed so the command's normal failure path is observable.
      } finally {
        restoreTty();
        stderrSpy.mockRestore();
        stdoutSpy.mockRestore();
        exitSpy.mockRestore();
      }

      expect(stderr.join('')).toContain(scenario.error);
      expect(confirmationCalls).toBe(0);
    });
  }

  test('passes exact requested and resolved plugins to successful TTY confirmation', async () => {
    const consumer = makeConsumer('tdk-confirm-selection-');
    writeFourPluginBaseWithOptional(consumer);
    confirmationCalls = 0;
    confirmationDetails = undefined;
    const restoreTty = forceStdinTTY(true);
    const stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      await (createInstallCommand() as Command).parseAsync([
        '--harness', 'claude', '--plugins', 'tdk-epic', consumer.root,
      ], { from: 'user' });
    } finally {
      restoreTty();
      stdoutSpy.mockRestore();
    }

    expect(confirmationCalls).toBe(1);
    expect(confirmationDetails).toEqual({
      requestedOptionalPlugins: ['tdk-epic'],
      resolvedPlugins: ['tdk-core', 'tdk-epic', 'tdk-inception', 'tdk-memory', 'tdk-utils'],
    });
  });
});

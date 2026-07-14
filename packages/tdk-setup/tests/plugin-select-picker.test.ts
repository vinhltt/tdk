import { describe, expect, mock, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Command } from 'commander';
import { sha256, writePluginDependencyPolicy } from './fixtures';

const sourcePath = path.resolve('src');
let pickedCatalog: string[] = [];

await mock.module(`${sourcePath}/prompt`, () => ({
  selectPluginsInteractively: async (plugins: string[]) => { pickedCatalog = plugins; return []; },
  selectHarnessInteractively: async () => ['claude'],
  confirmOverwrite: async () => false,
  askPrefixInteractively: async (prefix: string) => prefix,
  confirmInstallTarget: async () => false,
}));

const { createInstallCommand } = await import(`${sourcePath}/install`);

function writeConsumer(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-plugin-picker-'));
  const plugins = ['tdk-core', 'tdk-epic', 'tdk-inception', 'tdk-memory', 'tdk-utils'];
  for (const plugin of plugins) fs.mkdirSync(path.join(root, '.specify', 'plugins', plugin), { recursive: true });
  fs.mkdirSync(path.join(root, '.specify', 'scripts', 'ts'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specify', 'plugins', 'manifest.json'), JSON.stringify({
    algorithm: 'sha256',
    plugins: Object.fromEntries(plugins.map((plugin) => [plugin, { version: '1.0.0', files: {} }])),
  }), 'utf-8');
  writePluginDependencyPolicy({ root, scriptsDir: '', pluginRoot: '' }, {
    requiredPlugins: ['tdk-core', 'tdk-inception'],
    dependencies: {
      'tdk-core': ['tdk-utils'],
      'tdk-inception': ['tdk-memory', 'tdk-utils'],
    },
  });
  return root;
}

function forceStdinTTY(): () => void {
  const previous = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
  return () => {
    if (previous) Object.defineProperty(process.stdin, 'isTTY', previous);
    else delete (process.stdin as NodeJS.ReadStream & { isTTY?: boolean }).isTTY;
  };
}

describe('plugin selection picker', () => {
  test('offers optional plugins only and accepts an empty optional request', async () => {
    const root = writeConsumer();
    const restoreTty = forceStdinTTY();
    const stdout: string[] = [];
    const stdoutSpy = spyOn(process.stdout, 'write').mockImplementation((chunk) => { stdout.push(String(chunk)); return true; });
    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await (createInstallCommand() as Command).parseAsync(['--harness', 'claude', root, '--dry-run'], { from: 'user' });
    } finally {
      restoreTty();
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }

    expect(pickedCatalog).toEqual(['tdk-epic']);
    expect(stdout.join('')).toContain('Requested optional plugins: (none)');
    expect(stdout.join('')).toContain('Resolved plugins: tdk-core, tdk-inception, tdk-memory, tdk-utils');
  });
});

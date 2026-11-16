import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PLUGINS_DIR = resolve(import.meta.dir, '../../../../plugins');
const SOURCE_MANIFEST_PATH = join(PLUGINS_DIR, 'manifest.json');
const CORE_PLUGIN_DIR = join(PLUGINS_DIR, 'tdk-core');
const UTILS_PLUGIN_DIR = join(PLUGINS_DIR, 'tdk-utils');
const COUNSEL_AGENT = 'tdk-counsel';
const COUNSEL_FILE = `agents/${COUNSEL_AGENT}.md`;

type PluginManifest = {
  plugins?: Record<
    string,
    {
      components?: {
        agents?: Record<string, unknown>;
      };
      files?: Record<string, string>;
    }
  >;
};

function readSourceManifest(): PluginManifest {
  return JSON.parse(readFileSync(SOURCE_MANIFEST_PATH, 'utf-8')) as PluginManifest;
}

// tdk-plan --validate consults tdk-counsel, so the agent ships with tdk-core, the plugin that owns tdk-plan.
describe('tdk-counsel source plugin ownership', () => {
  it('keeps the agent file only under tdk-core', () => {
    expect(existsSync(join(CORE_PLUGIN_DIR, COUNSEL_FILE))).toBe(true);
    expect(existsSync(join(UTILS_PLUGIN_DIR, COUNSEL_FILE))).toBe(false);
  });

  it('lists the agent and its file under tdk-core in the source manifest', () => {
    const core = readSourceManifest().plugins?.['tdk-core'];

    expect(core?.components?.agents?.[COUNSEL_AGENT]).toBeDefined();
    expect(core?.files?.[COUNSEL_FILE]).toBeDefined();
  });

  it('removes the agent and its file from tdk-utils in the source manifest', () => {
    const utils = readSourceManifest().plugins?.['tdk-utils'];

    expect(utils).toBeDefined();
    expect(utils?.components?.agents?.[COUNSEL_AGENT]).toBeUndefined();
    expect(utils?.files?.[COUNSEL_FILE]).toBeUndefined();
  });
});

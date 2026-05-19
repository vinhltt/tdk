// Check 3: Per plugin, plugin.json.version === manifest.plugins[name].version.

import type { CheckOpts, CheckResult } from './types';
import { readManifest, readJson, resolvePluginJson } from './fs-helpers';

interface PluginJson {
  name?: string;
  version?: string;
}

export function checkPluginVersions(opts: CheckOpts): CheckResult[] {
  const index = 3;
  const name = 'plugin.json vs manifest';

  if (opts.plugins.length === 0) {
    // Nothing to check — treat as a no-op pass so downstream aggregator still counts 5.
    return [{ ok: true, index, name }];
  }

  const manifest = readManifest(opts.root);
  const out: CheckResult[] = [];

  for (const plugin of opts.plugins) {
    const pluginJsonPath = resolvePluginJson(opts.root, plugin);
    if (!pluginJsonPath) {
      out.push({
        ok: false, index, name: `${name} [${plugin}]`,
        expected: '(plugin.json present)',
        actual: 'not found',
        fixHint: `plugin.json missing for "${plugin}" — check plugins/${plugin}/`,
      });
      continue;
    }

    let pluginJson: PluginJson;
    try {
      pluginJson = readJson<PluginJson>(pluginJsonPath);
    } catch (e) {
      out.push({
        ok: false, index, name: `${name} [${plugin}]`,
        expected: '(valid JSON)',
        actual: `parse error: ${(e as Error).message}`,
        fixHint: `fix JSON syntax in ${pluginJsonPath}`,
        path: pluginJsonPath,
      });
      continue;
    }

    const manifestEntry = manifest.plugins[plugin];
    const manifestVersion = manifestEntry?.version ?? '(missing)';
    const pluginVersion = pluginJson.version ?? '(missing)';

    if (pluginVersion === manifestVersion) {
      out.push({ ok: true, index, name: `${name} [${plugin}]`, path: pluginJsonPath });
    } else {
      out.push({
        ok: false, index, name: `${name} [${plugin}]`,
        expected: manifestVersion,
        actual: pluginVersion,
        fixHint: `sync versions: manifest.plugins.${plugin}.version=${manifestVersion} vs ${pluginJsonPath}.version=${pluginVersion}`,
        path: pluginJsonPath,
      });
    }
  }

  return out;
}

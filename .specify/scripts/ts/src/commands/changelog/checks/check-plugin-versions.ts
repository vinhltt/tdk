// Check 3: Per plugin, every existing plugin.json (claude/codex/cursor)
// .version === manifest.plugins[name].version.
// Claude is the anchor — must exist. Codex/Cursor are optional mirrors:
// when present, they must match the anchor version (plugin-bump keeps them in sync).

import type { CheckOpts, CheckResult } from './types';
import { readManifest, readJson, resolvePluginJson, resolveAllPluginJson } from './fs-helpers';

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
    // Anchor (Claude) must exist — Codex/Cursor are optional mirrors.
    const anchorPath = resolvePluginJson(opts.root, plugin);
    if (!anchorPath) {
      out.push({
        ok: false, index, name: `${name} [${plugin}]`,
        expected: '(.claude-plugin/plugin.json present)',
        actual: 'not found',
        fixHint: `plugin.json missing for "${plugin}" — check plugins/${plugin}/.claude-plugin/`,
      });
      continue;
    }

    const manifestEntry = manifest.plugins[plugin];
    const manifestVersion = manifestEntry?.version ?? '(missing)';

    // Verify every existing manifest format matches the manifest.json version.
    for (const { format, path } of resolveAllPluginJson(opts.root, plugin)) {
      let pluginJson: PluginJson;
      try {
        pluginJson = readJson<PluginJson>(path);
      } catch (e) {
        out.push({
          ok: false, index, name: `${name} [${plugin}/${format}]`,
          expected: '(valid JSON)',
          actual: `parse error: ${(e as Error).message}`,
          fixHint: `fix JSON syntax in ${path}`,
          path,
        });
        continue;
      }

      const pluginVersion = pluginJson.version ?? '(missing)';
      if (pluginVersion === manifestVersion) {
        out.push({ ok: true, index, name: `${name} [${plugin}/${format}]`, path });
      } else {
        out.push({
          ok: false, index, name: `${name} [${plugin}/${format}]`,
          expected: manifestVersion,
          actual: pluginVersion,
          fixHint: `sync versions: manifest.plugins.${plugin}.version=${manifestVersion} vs ${path}.version=${pluginVersion} — re-run plugin-bump --target=plugins/${plugin}`,
          path,
        });
      }
    }
  }

  return out;
}

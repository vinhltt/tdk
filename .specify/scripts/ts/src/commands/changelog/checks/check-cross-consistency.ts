// Check 5: Cross-consistency — no orphan drift between manifest / plugin.json / SKILL.md.
// Detects cases missed by 3/4 when a source is present but mismatched in a second axis
// (e.g. manifest has skill but SKILL.md frontmatter lacks metadata.version entirely).

import type { CheckOpts, CheckResult } from './types';
import { findSkillPlugin, readManifest, readSkillVersion, SKILL_MD, resolvePluginJson, readJson } from './fs-helpers';
import { existsSync } from 'node:fs';

interface PluginJson {
  version?: string;
}

export function checkCrossConsistency(opts: CheckOpts): CheckResult[] {
  const index = 5;
  const name = 'cross-consistency';
  const out: CheckResult[] = [];

  const manifest = readManifest(opts.root);

  // Plugin-axis: every requested plugin must appear in manifest AND have plugin.json.
  for (const plugin of opts.plugins) {
    const inManifest = !!manifest.plugins[plugin];
    const pjPath = resolvePluginJson(opts.root, plugin);
    const hasPluginJson = !!pjPath;

    if (!inManifest && !hasPluginJson) {
      out.push({
        ok: false, index, name: `${name} [${plugin}]`,
        expected: 'present in manifest + plugin.json',
        actual: 'missing in both',
        fixHint: `plugin "${plugin}" does not exist — check naming or run bun run manifest`,
      });
    } else if (!inManifest) {
      out.push({
        ok: false, index, name: `${name} [${plugin}]`,
        expected: 'present in manifest.json',
        actual: 'only plugin.json exists',
        fixHint: `run bun run manifest to register "${plugin}" in manifest.json`,
      });
    } else if (!hasPluginJson) {
      out.push({
        ok: false, index, name: `${name} [${plugin}]`,
        expected: 'plugin.json present',
        actual: 'only manifest entry',
        fixHint: `create plugin.json for "${plugin}" or remove stale manifest entry`,
      });
    }
  }

  // Skill-axis: skill must appear in manifest, SKILL.md frontmatter must have version,
  // and its parent plugin's plugin.json must exist.
  for (const skill of opts.skills) {
    const owner = findSkillPlugin(opts.root, skill);
    if (!owner) {
      out.push({
        ok: false, index, name: `${name} [${skill}]`,
        expected: 'skill dir present',
        actual: 'not found',
        fixHint: `no plugins/*/skills/${skill} dir`,
      });
      continue;
    }
    const smd = SKILL_MD(opts.root, owner, skill);
    const inManifest = !!manifest.plugins[owner]?.components?.skills?.[skill];
    const frontmatterVersion = existsSync(smd) ? readSkillVersion(smd) : null;

    if (!inManifest && !frontmatterVersion) {
      out.push({
        ok: false, index, name: `${name} [${skill}]`,
        expected: 'manifest entry + frontmatter version',
        actual: 'missing in both',
        fixHint: `register "${skill}" in manifest.json and add metadata.version to ${smd}`,
        path: smd,
      });
    } else if (!inManifest) {
      out.push({
        ok: false, index, name: `${name} [${skill}]`,
        expected: 'manifest entry',
        actual: `only SKILL.md has version=${frontmatterVersion}`,
        fixHint: `run bun run manifest to register "${skill}" under plugin "${owner}"`,
        path: smd,
      });
    } else if (!frontmatterVersion) {
      out.push({
        ok: false, index, name: `${name} [${skill}]`,
        expected: 'frontmatter metadata.version',
        actual: 'missing from SKILL.md',
        fixHint: `add metadata.version to frontmatter in ${smd}`,
        path: smd,
      });
    }

    // Parent plugin.json existence (sanity).
    const pjPath = resolvePluginJson(opts.root, owner);
    if (!pjPath) {
      out.push({
        ok: false, index, name: `${name} [${skill}->${owner}]`,
        expected: 'parent plugin.json',
        actual: 'missing',
        fixHint: `skill "${skill}" has no sibling plugin.json for plugin "${owner}"`,
      });
    } else {
      try { readJson<PluginJson>(pjPath); } catch (e) {
        out.push({
          ok: false, index, name: `${name} [${skill}->${owner}]`,
          expected: 'valid plugin.json',
          actual: `parse error: ${(e as Error).message}`,
          fixHint: `fix JSON syntax in ${pjPath}`,
          path: pjPath,
        });
      }
    }
  }

  if (out.length === 0) {
    return [{ ok: true, index, name }];
  }
  return out;
}

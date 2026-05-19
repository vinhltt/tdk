// Check 4: Per skill, SKILL.md frontmatter.metadata.version === manifest skill entry.

import type { CheckOpts, CheckResult } from './types';
import { findSkillPlugin, readManifest, readSkillVersion, SKILL_MD } from './fs-helpers';
import { existsSync } from 'node:fs';

export function checkSkillVersions(opts: CheckOpts): CheckResult[] {
  const index = 4;
  const name = 'SKILL.md vs manifest';

  if (opts.skills.length === 0) {
    return [{ ok: true, index, name }];
  }

  const manifest = readManifest(opts.root);
  const out: CheckResult[] = [];

  for (const skill of opts.skills) {
    const owningPlugin = findSkillPlugin(opts.root, skill);
    if (!owningPlugin) {
      out.push({
        ok: false, index, name: `${name} [${skill}]`,
        expected: '(skill dir present)',
        actual: 'not found in any plugin',
        fixHint: `no plugins/*/skills/${skill} — check skill name spelling`,
      });
      continue;
    }

    const skillMdPath = SKILL_MD(opts.root, owningPlugin, skill);
    if (!existsSync(skillMdPath)) {
      out.push({
        ok: false, index, name: `${name} [${skill}]`,
        expected: '(SKILL.md present)',
        actual: 'missing',
        fixHint: `create ${skillMdPath}`,
        path: skillMdPath,
      });
      continue;
    }

    let skillVersion: string | null;
    try {
      skillVersion = readSkillVersion(skillMdPath);
    } catch (e) {
      out.push({
        ok: false, index, name: `${name} [${skill}]`,
        expected: '(parseable YAML frontmatter)',
        actual: `parse error: ${(e as Error).message}`,
        fixHint: `fix frontmatter YAML in ${skillMdPath}`,
        path: skillMdPath,
      });
      continue;
    }

    const manifestSkill = manifest.plugins[owningPlugin]?.components?.skills?.[skill];
    const manifestVersion = manifestSkill?.version ?? '(missing)';
    const actual = skillVersion ?? '(no version in frontmatter)';

    if (actual === manifestVersion) {
      out.push({ ok: true, index, name: `${name} [${skill}]`, path: skillMdPath });
    } else {
      out.push({
        ok: false, index, name: `${name} [${skill}]`,
        expected: manifestVersion,
        actual,
        fixHint: `sync metadata.version in ${skillMdPath} to match manifest.plugins.${owningPlugin}.components.skills.${skill}.version=${manifestVersion}`,
        path: skillMdPath,
      });
    }
  }

  return out;
}

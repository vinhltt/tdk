// Fixture builder for verify.test.ts — writes a synthetic .specify/ + .claude-plugin/ tree
// into a tmpdir with per-scenario knobs for drift. Returns the root path.
// Layout mirrors real tdk:
//   <root>/.claude-plugin/marketplace.json
//   <root>/.specify/CHANGELOG.md
//   <root>/.specify/plugins/manifest.json
//   <root>/.specify/plugins/<plugin>/.claude-plugin/plugin.json
//   <root>/.specify/plugins/<plugin>/skills/<skill>/SKILL.md

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface FixtureSpec {
  version: string;                                     // top-level marketplace version
  changelogHeaderVersion?: string | null;              // override; null = no header; undefined = use version
  marketplaceVersion?: string;                         // override; undefined = use version
  plugins: Array<{
    name: string;
    pluginJsonVersion: string;                          // Claude anchor (always written)
    codexPluginJsonVersion?: string;                    // undefined → no .codex-plugin/plugin.json file
    cursorPluginJsonVersion?: string;                   // undefined → no .cursor-plugin/plugin.json file
    manifestVersion: string;
    skills?: Array<{
      name: string;
      frontmatterVersion: string | null;               // null = omit metadata.version from frontmatter
      manifestVersion: string;
    }>;
  }>;
}

export function buildFixture(root: string, spec: FixtureSpec): void {
  const marketplaceVersion = spec.marketplaceVersion ?? spec.version;
  const changelogVersion = spec.changelogHeaderVersion === undefined
    ? spec.version
    : spec.changelogHeaderVersion;

  // marketplace.json
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'test', metadata: { version: marketplaceVersion } }, null, 2),
  );

  // CHANGELOG.md
  mkdirSync(join(root, '.specify'), { recursive: true });
  const header = changelogVersion
    ? `## [${changelogVersion}] - 2026-04-18\n\n### Changed\n- test\n`
    : '';
  writeFileSync(
    join(root, '.specify', 'CHANGELOG.md'),
    `# Changelog\n\nFormat: Keep a Changelog\n\n${header}`,
  );

  // Build manifest + per-plugin files.
  const manifest: {
    algorithm: string;
    plugins: Record<string, { version: string; components: { skills: Record<string, { version: string }>; agents: Record<string, never>; hooks: Record<string, never>; commands: Record<string, never> }; files: Record<string, string> }>;
  } = { algorithm: 'sha256', plugins: {} };

  for (const p of spec.plugins) {
    const pluginDir = join(root, '.specify', 'plugins', p.name);
    const pluginJsonDir = join(pluginDir, '.claude-plugin');
    mkdirSync(pluginJsonDir, { recursive: true });
    writeFileSync(
      join(pluginJsonDir, 'plugin.json'),
      JSON.stringify({ name: p.name, version: p.pluginJsonVersion }, null, 2),
    );

    if (p.codexPluginJsonVersion !== undefined) {
      // Codex plugin.json lives in the sibling codex-plugins tree post-migration
      const codexPackageDir = join(root, '.specify', 'codex-plugins', p.name, '.codex-plugin');
      mkdirSync(codexPackageDir, { recursive: true });
      writeFileSync(
        join(codexPackageDir, 'plugin.json'),
        JSON.stringify({ name: p.name, version: p.codexPluginJsonVersion }, null, 2),
      );
    }

    if (p.cursorPluginJsonVersion !== undefined) {
      const cursorDir = join(pluginDir, '.cursor-plugin');
      mkdirSync(cursorDir, { recursive: true });
      writeFileSync(
        join(cursorDir, 'plugin.json'),
        JSON.stringify({ name: p.name, version: p.cursorPluginJsonVersion }, null, 2),
      );
    }

    const skillEntries: Record<string, { version: string }> = {};
    for (const s of p.skills ?? []) {
      const skillDir = join(pluginDir, 'skills', s.name);
      mkdirSync(skillDir, { recursive: true });
      const fm = s.frontmatterVersion === null
        ? `---\nname: ${s.name}\ndescription: test\n---\n# ${s.name}\n`
        : `---\nname: ${s.name}\ndescription: test\nmetadata:\n  version: "${s.frontmatterVersion}"\n---\n# ${s.name}\n`;
      writeFileSync(join(skillDir, 'SKILL.md'), fm);
      skillEntries[s.name] = { version: s.manifestVersion };
    }

    manifest.plugins[p.name] = {
      version: p.manifestVersion,
      components: { skills: skillEntries, agents: {}, hooks: {}, commands: {} },
      files: {},
    };
  }

  mkdirSync(join(root, '.specify', 'plugins'), { recursive: true });
  writeFileSync(
    join(root, '.specify', 'plugins', 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
}

/** Canonical "all pass" spec — tests clone + mutate to produce drift scenarios. */
export function happyPathSpec(): FixtureSpec {
  return {
    version: '1.2.0',
    plugins: [{
      name: 'tdk-utils',
      pluginJsonVersion: '0.6.1',
      manifestVersion: '0.6.1',
      skills: [{
        name: 'brainstorming',
        frontmatterVersion: '1.2.0',
        manifestVersion: '1.2.0',
      }],
    }],
  };
}

// CLI: verify — deterministic post-flight check for tdk-bump skill.
// Replaces the LLM-driven markdown checklist (brainstorm §3) with exit-coded TS gate.
// 5 checks: CHANGELOG header, marketplace.json, plugin.json, SKILL.md, cross-consistency.
// No writes, no mutation — pure read + report.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Command } from 'commander';
import type { CheckOpts, CheckResult } from './checks/types';
import { checkChangelogHeader } from './checks/check-changelog-header';
import { checkMarketplaceVersion } from './checks/check-marketplace-version';
import { checkPluginVersions } from './checks/check-plugin-versions';
import { checkSkillVersions } from './checks/check-skill-versions';
import { checkCrossConsistency } from './checks/check-cross-consistency';
import { PLUGIN_DIR, findSkillPlugin } from './checks/fs-helpers';

export interface RunDeps {
  gitDiff?: (root: string) => string[];
}

/** Default git runner: array-form execFile (no shell interpolation). */
function defaultGitDiff(root: string): string[] {
  try {
    const out = execFileSync('git', ['-C', root, 'diff', '--name-only', 'HEAD'], {
      encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Auto-infer affected plugins/skills from changed files.
 * Matches:
 *   .specify/plugins/<plugin>/.claude-plugin/plugin.json
 *   .specify/plugins/<plugin>/skills/<skill>/<anything>
 */
export function inferAffected(files: string[]): { plugins: string[]; skills: string[] } {
  const plugins = new Set<string>();
  const skills = new Set<string>();
  const prefix = '.specify/plugins/';
  for (const f of files) {
    if (!f.startsWith(prefix)) continue;
    const rest = f.slice(prefix.length);
    const parts = rest.split('/');
    if (parts.length < 2) continue;
    const [plugin, ...tail] = parts;
    if (!plugin) continue;

    // Any file under a plugin → mark plugin as affected.
    plugins.add(plugin);

    // skills/<name>/... → mark skill.
    if (tail[0] === 'skills' && tail[1]) {
      skills.add(tail[1]);
    }
  }
  return { plugins: [...plugins].sort(), skills: [...skills].sort() };
}

/** Run all checks; never exits. Pure aggregator — callers decide exit code. */
export function runChecks(opts: CheckOpts, deps: RunDeps = {}): CheckResult[] {
  // Resolve plugins/skills via auto-infer when explicit args are empty.
  let { plugins, skills } = opts;
  if (plugins.length === 0 && skills.length === 0) {
    const git = deps.gitDiff ?? defaultGitDiff;
    const inferred = inferAffected(git(opts.root));
    // Filter out plugins/skills that no longer exist on disk (e.g. decommissioned plugins).
    plugins = inferred.plugins.filter(p => existsSync(PLUGIN_DIR(opts.root, p)));
    skills = inferred.skills.filter(s => findSkillPlugin(opts.root, s) !== null);
  }
  const resolved: CheckOpts = { ...opts, plugins, skills };

  const results: CheckResult[] = [];
  results.push(checkChangelogHeader(resolved));
  results.push(checkMarketplaceVersion(resolved));
  results.push(...checkPluginVersions(resolved));
  results.push(...checkSkillVersions(resolved));
  results.push(...checkCrossConsistency(resolved));
  return results;
}

/** Format + print results; return process exit code (0 = all pass, 1 = any fail). */
export function report(results: CheckResult[]): number {
  const failures = results.filter(r => !r.ok);
  if (failures.length === 0) {
    process.stdout.write('ALL CHECKS PASSED\n');
    return 0;
  }
  for (const f of failures) {
    process.stdout.write(`\u2717 [${f.index}/5] ${f.name}\n`);
    if (f.expected !== undefined || f.actual !== undefined) {
      process.stdout.write(`        expected: ${f.expected ?? '(none)'}    actual: ${f.actual ?? '(none)'}\n`);
    }
    if (f.fixHint) process.stdout.write(`        fix: ${f.fixHint}\n`);
  }
  return 1;
}

function parseCsv(v?: string): string[] {
  if (!v) return [];
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

/** CLI main — only entry point allowed to call process.exit. */
export function main(argv: string[] = process.argv): void {
  const program = new Command()
    .name('verify')
    .description('Deterministic post-flight verify for tdk-bump')
    .option('--expected-version <version>', 'Target marketplace version (REQUIRED)')
    .option('--plugins <csv>', 'Comma-separated plugin names (auto-inferred if omitted)')
    .option('--skills <csv>', 'Comma-separated skill names (auto-inferred if omitted)')
    .option('--root <path>', 'Project root containing .specify/ and .claude-plugin/', process.cwd())
    .action((opts: { expectedVersion?: string; plugins?: string; skills?: string; root: string }) => {
      if (!opts.expectedVersion) {
        process.stderr.write('error: --expected-version is required. SKILL.md Step 13 must propose + confirm version before calling verify.ts.\n');
        process.exit(1);
      }
      const checkOpts: CheckOpts = {
        root: opts.root,
        expectedVersion: opts.expectedVersion,
        plugins: parseCsv(opts.plugins),
        skills: parseCsv(opts.skills),
      };
      const code = report(runChecks(checkOpts));
      process.exit(code);
    });
  program.parse(argv);
}

if (import.meta.main) {
  main();
}

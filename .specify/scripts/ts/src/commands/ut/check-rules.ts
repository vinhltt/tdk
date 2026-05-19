// CLI: UT rules validation — config + 4-level rule resolution

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import {
  detectConfig,
  resolveRulesCascade,
  validateMirrorStructure,
  type OrphanTest,
  type SubWorkspace,
} from '../../utils/index';
import { handleCliError } from './cli-error-handler';

type MirrorValidationPayload = {
  byModule: Record<string, { orphanTests: OrphanTest[] }>;
} | null;

// Auto-gate: runs only when a sub-workspace has strategy === 'mirror'.
// Non-mirror configs → returns null (no-op for caller).
function runMirrorValidation(
  subWorkspaces: SubWorkspace[],
  workspaceRoot: string,
  targetSwName: string | undefined,
): MirrorValidationPayload {
  const byModule: Record<string, { orphanTests: OrphanTest[] }> = {};
  let anyMirror = false;
  for (const sw of subWorkspaces) {
    if (sw.testMapping?.strategy !== 'mirror') continue;
    if (targetSwName && sw.name !== targetSwName) continue;
    anyMirror = true;
    const swRoot = resolve(workspaceRoot, sw.path);
    const exclude = sw.testMapping?.exclude;
    for (const mod of sw.modules ?? []) {
      byModule[mod.name] = validateMirrorStructure(mod, exclude, swRoot);
    }
  }
  return anyMirror ? { byModule } : null;
}

/** Create ut-check-rules command for CLI registration (group: tdk ut check-rules) */
export function createCheckRulesCommand(): Command {
  return new Command('check-rules')
    .description('Check UT rules existence and parse basic info')
    .option('--sub-workspace <name>', 'Target sub-workspace')
    .option('--module <name>', 'Target module')
    .action((opts) => {
    const config = detectConfig({ subWorkspace: opts.subWorkspace, module: opts.module });

    const cliError = handleCliError(config, opts);
    if (cliError) {
      console.log(JSON.stringify(cliError));
      process.exit(1);
    }

    // Cascade resolution — collects all levels in base->specific order.
    const cascade = resolveRulesCascade({
      workspaceRoot: config.workspaceRoot,
      docsPath: config.docsPath,
      ruleSubPath: 'rules/test/ut-rule.md',
      swName: config.targetSubWorkspace?.name ?? opts.subWorkspace,
      moduleName: config.targetModule?.name ?? opts.module,
      targetRoot: config.targetSubWorkspace?.root,
      targetDocsPath: config.targetSubWorkspace?.docsPath,
    });
    const rulesFile = cascade.primary;

    let exists = false;
    let framework = '';
    let coverageTarget = '';

    if (rulesFile) {
      exists = true;
      try {
        const content = readFileSync(rulesFile, 'utf-8');
        const fwMatch = content.match(/[Ff]ramework\s*:\s*(.+)/);
        if (fwMatch) framework = fwMatch[1]!.replace(/[*#]/g, '').trim();
        const covMatch = content.match(/[Cc]overage\s*:\s*(.+)/);
        coverageTarget = covMatch ? covMatch[1]!.replace(/[*#]/g, '').trim() : '80%';
      } catch { /* ignore read errors */ }
    }

    const output: Record<string, unknown> = {
      rulesFile: rulesFile ?? '',
      utRulesFiles: cascade.entries,
      exists,
      framework,
      coverageTarget,
      outputRoot: config.targetSubWorkspace?.root ?? config.workspaceRoot,
      subWorkspaceName: opts.subWorkspace ?? '',
      subWorkspaces: (config.subWorkspaces ?? []).map(sw => ({
        ...sw,
        hasModules: sw.hasModules ?? ((sw.modules?.length ?? 0) > 0),
      })),
    };

    if (config.targetModule) {
      output.moduleName = config.targetModule.name;
      output.testStrategy = config.testStrategy ?? '';
    }

    // Mirror structure auto-gate: adds `mirrorValidation` when any sub-workspace
    // uses strategy='mirror'; `null` otherwise. Skill /tdk-ut-backfill-check-rules Step 2
    // consumes byModule.orphanTests to drive interactive fix/exclude/ignore prompts.
    output.mirrorValidation = runMirrorValidation(
      config.subWorkspaces,
      config.workspaceRoot,
      config.targetSubWorkspace?.name ?? opts.subWorkspace,
    );

    console.log(JSON.stringify(output, null, 2));
  });
}

// Standalone mode: bun src/commands/ut/check-rules.ts
if (import.meta.main) {
  createCheckRulesCommand().parse();
}

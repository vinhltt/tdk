import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Command } from 'commander';
import { applyInstallPlan } from './install-writer';
import { buildCodexReconcilePlan, renderCodexReconcilePlan } from './codex-reconcile';
import { buildCodexWritePlan } from './codex-output-writer';
import { buildMigrationReport, renderMigrationReport } from './flat-claude-migration-report';
import { discoverFlatClaudeInventory } from './flat-claude-adapter';
import { loadHarnessManifest } from './manifest-store';
import { renderApplyResult } from './render';
import { resolveConsumerRoot } from './root-resolution';

interface ConvertFlatOptions {
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
}

async function confirmConvertFlat(consumerRoot: string, force: boolean): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    output.write(`Consumer root: ${consumerRoot}\n`);
    output.write('Source: .claude/ (left untouched)\n');
    output.write('Targets: .codex/ and .agents/skills/\n');
    if (force) output.write('Force: conflicts will be overwritten where possible\n');
    const answer = await rl.question('Apply this convert-flat migration? Type yes to continue: ');
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

export function createConvertFlatCommand(): Command {
  return new Command('convert-flat')
    .description('Convert an existing flat .claude/ tree into Codex harness artifacts')
    .argument('[root]', 'consumer project root')
    .option('--dry-run', 'render the migration and reconcile plan without mutating files')
    .option('--force', 'overwrite convert-flat conflicts instead of reporting and skipping them')
    .option('--yes', 'apply clean writes/removals without prompting')
    .action(async (rootArg: string | undefined, opts: ConvertFlatOptions) => {
      try {
        const root = resolveConsumerRoot(rootArg ? path.resolve(rootArg) : process.cwd());
        const inventory = discoverFlatClaudeInventory(root.consumerRoot);
        const migrationReport = buildMigrationReport(inventory);
        const writePlan = await buildCodexWritePlan(inventory);
        const previousManifest = loadHarnessManifest(root.consumerRoot, 'codex');
        const reconcilePlan = buildCodexReconcilePlan({
          consumerRoot: root.consumerRoot,
          desiredFiles: writePlan.files,
          previousManifest,
          migrationReport: {
            ...migrationReport,
            warnings: [...migrationReport.warnings, ...root.warnings, ...writePlan.warnings],
          },
          force: Boolean(opts.force),
        });

        process.stdout.write(renderMigrationReport(migrationReport));
        process.stdout.write(renderCodexReconcilePlan(reconcilePlan));
        if (opts.dryRun) return;

        if (!opts.yes) {
          if (!process.stdin.isTTY) {
            throw new Error('Non-interactive convert-flat requires --yes. Use --dry-run to inspect changes first.');
          }
          const confirmed = await confirmConvertFlat(root.consumerRoot, Boolean(opts.force));
          if (!confirmed) throw new Error('Convert-flat cancelled.');
        }

        const result = await applyInstallPlan(reconcilePlan.installPlan, {
          yes: true,
          interactive: false,
        });
        process.stdout.write(renderApplyResult(result));
      } catch (err) {
        process.stderr.write(`[tdk-setup convert-flat] error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

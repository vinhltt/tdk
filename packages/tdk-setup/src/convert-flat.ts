import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Command } from 'commander';
import { resolveConvertParts } from './convert-parts';
import {
  buildCodexReconcilePlan,
  buildConvertReconcilePlan,
  OMP_HARNESS_SPEC,
  renderConvertReconcilePlan,
} from './convert-reconcile';
import type { ConvertReconcilePlan } from './convert-reconcile-types';
import { buildCodexWritePlan } from './codex-output-writer';
import { assertCodexHarnessCompat } from './codex-harness-compat';
import { buildMigrationReport, renderMigrationReport } from './flat-claude-migration-report';
import { discoverFlatClaudeInventory } from './flat-claude-adapter';
import type { MigrationReport } from './flat-claude-types';
import { loadInstallSettings, resolveOmpModelMap } from './install-settings';
import { resolveHookTargetPlatform } from './lib/harness-transform/hook-command';
import { applyInstallPlan } from './install-writer';
import { loadHarnessManifest, manifestPathFor } from './manifest-store';
import { buildOmpWritePlan } from './omp-output-writer';
import { checkOmpDrift, renderOmpDriftFindings } from './omp-drift-check';
import { renderApplyResult } from './render';
import { resolveConsumerRoot } from './root-resolution';

interface ConvertFlatOptions {
  harness?: string;
  parts?: string;
  removeParts?: string;
  check?: boolean;
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
  targetPlatform?: string;
}

function writeProgress(message: string): void {
  process.stdout.write(`[tdk-setup convert-flat] ${message}\n`);
}

function writeInventoryProgress(recordCount: number): void {
  writeProgress(`Source inventory: ${recordCount} recognized ${recordCount === 1 ? 'record' : 'records'}.`);
}

async function confirmConvertFlat(consumerRoot: string, harness: 'codex' | 'omp', force: boolean): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    output.write(`Consumer root: ${consumerRoot}\n`);
    output.write('Source: .claude/ (left untouched)\n');
    output.write(harness === 'codex' ? 'Targets: .codex/ and .agents/skills/\n' : 'Target: .omp/\n');
    if (force) output.write('Force: conflicts will be overwritten where possible\n');
    const answer = await rl.question('Apply this convert-flat migration? Type yes to continue: ');
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

export function createConvertFlatCommand(): Command {
  return new Command('convert-flat')
    .description('Convert an existing flat .claude/ tree into harness-native artifacts')
    .argument('[root]', 'consumer project root')
    .option('--harness <name>', 'target harness: codex or omp')
    .option('--parts <csv>', 'OMP parts to add or update')
    .option('--remove-parts <csv>', 'OMP parts to remove')
    .option('--target-platform <win32|linux|darwin>', 'target platform for selected OMP hooks')
    .option('--dry-run', 'render the migration and reconcile plan without mutating files')
    .option('--check', 'check OMP managed sources and targets for checksum drift without writing')
    .option('--force', 'overwrite convert-flat conflicts instead of reporting and skipping them')
    .option('--yes', 'apply clean writes/removals without prompting')
    .action(async (rootArg: string | undefined, opts: ConvertFlatOptions) => {
      try {
        if (opts.harness !== 'codex' && opts.harness !== 'omp') {
          throw new Error('--harness is required and must be one of: codex, omp.');
        }
        const requestedRoot = rootArg ? path.resolve(rootArg) : process.cwd();
        const mode = opts.check ? 'check' : opts.dryRun ? 'dry-run' : 'apply';
        writeProgress(`Start: harness=${opts.harness} mode=${mode} root=${requestedRoot}`);
        const root = resolveConsumerRoot(requestedRoot);
        if (opts.check) {
          if (opts.harness !== 'omp') {
            throw new Error('--check is supported only with --harness omp.');
          }
          const incompatible = [
            opts.parts === undefined ? undefined : '--parts',
            opts.removeParts === undefined ? undefined : '--remove-parts',
            opts.targetPlatform === undefined ? undefined : '--target-platform',
            opts.dryRun ? '--dry-run' : undefined,
            opts.force ? '--force' : undefined,
            opts.yes ? '--yes' : undefined,
          ].filter((flag): flag is string => flag !== undefined);
          if (incompatible.length > 0) {
            throw new Error(`--check cannot be combined with conversion options: ${incompatible.join(', ')}.`);
          }
          const findings = checkOmpDrift(root.consumerRoot);
          process.stdout.write(renderOmpDriftFindings(findings));
          if (findings.length > 0) process.exitCode = 1;
          return;
        }
        let migrationReport: MigrationReport;
        let reconcilePlan: ConvertReconcilePlan;
        if (opts.harness === 'omp') {
          writeProgress('Resolving OMP part selection...');
          const manifestPath = manifestPathFor(root.consumerRoot, 'omp');
          const previousManifest = loadHarnessManifest(root.consumerRoot, 'omp');
          const selection = await resolveConvertParts({
            parts: opts.parts,
            removeParts: opts.removeParts,
            previousConvertedParts: previousManifest.convertedParts,
            manifestExists: fs.existsSync(manifestPath),
          });
          writeProgress(
            `Selection: update=${selection.selectedParts.join(',') || 'none'} `
            + `remove=${selection.removedParts.join(',') || 'none'} `
            + `active=${selection.activeParts.join(',') || 'none'}.`,
          );
          if (opts.targetPlatform !== undefined && !selection.selectedParts.includes('hooks')) {
            throw new Error('--target-platform requires hooks in --parts for OMP conversion.');
          }
          const hookTarget = selection.selectedParts.includes('hooks')
            ? resolveHookTargetPlatform(opts.targetPlatform, previousManifest.hookTargetPlatform)
            : undefined;
          if (hookTarget) {
            writeProgress(`Hook target platform: ${hookTarget.platform} (${hookTarget.source}).`);
          }
          const modelMap = resolveOmpModelMap({
            root: root.consumerRoot,
            settings: loadInstallSettings(root.consumerRoot),
          });
          writeProgress('Scanning source .claude tree...');
          const inventory = discoverFlatClaudeInventory(root.consumerRoot);
          writeInventoryProgress(inventory.records.length);
          const baseReport = buildMigrationReport(inventory);
          writeProgress('Validating and rendering OMP targets...');
          const writePlan = buildOmpWritePlan({
            inventory,
            selectedParts: selection.selectedParts,
            activeParts: selection.activeParts,
            modelMap,
            previousManifest,
            hookTargetPlatform: hookTarget?.platform,
          });
          migrationReport = {
            ...baseReport,
            warnings: [...baseReport.warnings, ...root.warnings, ...writePlan.warnings],
            facts: writePlan.facts,
          };
          writeProgress('Building reconcile plan...');
          reconcilePlan = buildConvertReconcilePlan({
            consumerRoot: root.consumerRoot,
            hookTargetPlatform: hookTarget?.platform,
            desiredFiles: writePlan.files,
            previousManifest,
            migrationReport,
            harnessSpec: OMP_HARNESS_SPEC,
            selection,
            force: Boolean(opts.force),
          });
        } else {
          if (opts.parts !== undefined || opts.removeParts !== undefined || opts.targetPlatform !== undefined) {
            throw new Error('--parts, --remove-parts, and --target-platform are supported only with --harness omp.');
          }
          writeProgress('Scanning source .claude tree...');
          const inventory = discoverFlatClaudeInventory(root.consumerRoot);
          writeInventoryProgress(inventory.records.length);
          // Reject-before-write: refuse a codex-labelling conversion against an
          // installed lib that cannot dispatch the codex harness.
          writeProgress('Checking Codex harness compatibility...');
          const hookSources: Array<{ path: string; content: Buffer }> = [];
          const payloadCopies: Array<{ path: string; content: Buffer }> = [];
          for (const record of inventory.records) {
            if (record.kind !== 'hooks') continue;
            for (const file of record.files) {
              if (!/\.(?:c|m)?js$/.test(file.sourceRelativePath)) continue;
              const content = fs.readFileSync(file.sourcePath);
              hookSources.push({ path: file.sourceRelativePath, content });
              // An installed tree nests the lib under its branded plugin dir,
              // so the payload contract is located from the inventory itself.
              if (file.sourceRelativePath.endsWith('/harness-payload.cjs')) {
                payloadCopies.push({ path: file.sourceRelativePath, content });
              }
            }
          }
          if (payloadCopies.length === 0) {
            assertCodexHarnessCompat({
              hookSources,
              harnessPayload: null,
              harnessPayloadPath: '.claude/hooks/**/lib/harness-payload.cjs',
            }, 'convert-flat --harness codex');
          }
          for (const copy of payloadCopies) {
            assertCodexHarnessCompat({
              hookSources,
              harnessPayload: copy.content,
              harnessPayloadPath: copy.path,
            }, 'convert-flat --harness codex');
          }
          const baseReport = buildMigrationReport(inventory);
          writeProgress('Validating and rendering Codex targets...');
          const writePlan = await buildCodexWritePlan(inventory);
          migrationReport = {
            ...baseReport,
            warnings: [...baseReport.warnings, ...root.warnings, ...writePlan.warnings],
          };
          const previousManifest = loadHarnessManifest(root.consumerRoot, 'codex');
          writeProgress('Building reconcile plan...');
          reconcilePlan = buildCodexReconcilePlan({
            consumerRoot: root.consumerRoot,
            desiredFiles: writePlan.files,
            previousManifest,
            migrationReport,
            force: Boolean(opts.force),
          });
        }

        process.stdout.write(renderMigrationReport(migrationReport));
        process.stdout.write(renderConvertReconcilePlan(reconcilePlan));
        if (opts.dryRun) {
          writeProgress('Complete: dry-run made no changes.');
          return;
        }

        if (!opts.yes) {
          if (!process.stdin.isTTY) {
            throw new Error('Non-interactive convert-flat requires --yes. Use --dry-run to inspect changes first.');
          }
          const confirmed = await confirmConvertFlat(root.consumerRoot, opts.harness, Boolean(opts.force));
          if (!confirmed) throw new Error('Convert-flat cancelled.');
        }

        writeProgress('Applying reconcile plan...');
        const result = await applyInstallPlan(reconcilePlan.installPlan, {
          yes: true,
          interactive: false,
        });
        process.stdout.write(renderApplyResult(result));
        writeProgress('Complete.');
      } catch (err) {
        process.stderr.write(`[tdk-setup convert-flat] error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

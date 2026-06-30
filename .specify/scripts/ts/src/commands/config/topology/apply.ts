import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { writeAgentJson } from '../../../utils/agent-output';
import { CliExitError, EXIT_STALE_PLAN, EXIT_SUCCESS, EXIT_VALIDATION, getExitCode } from '../../../utils/exit-codes';
import { SpecifyConfigSchema } from '../../../utils/types';
import { buildApplyPlan, type ApplyPlan } from './apply-plan';
import {
  buildAuditRecord,
  buildSafeTopologyApplyPaths,
  redactConfigForOutput,
  resolveJsonConfigTarget,
  resolveTopologyForApply,
  validateConfigTargetBeforeRead,
  writeFailureAudit,
} from './apply-security';
import { acquireApplyLock, applyPlan } from './guarded-writer';
import { deriveSpecifyConfig, formatTopologyDiff } from './patch';
import { parseWorkspaceTopology } from './schema';

interface TopologyApplyOptions {
  topology?: string;
  dryRun?: boolean;
  yes?: boolean;
  expectHash?: string;
  acceptOverwrites?: boolean;
  reconcile?: boolean;
}

function parseRawConfig(rawText: string): Record<string, unknown> {
  const raw = JSON.parse(rawText);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CliExitError('.specify/.specify.json must contain a JSON object', EXIT_VALIDATION, 'config-parse');
  }
  return raw as Record<string, unknown>;
}

function buildPlanFromCurrentInputs(input: {
  topology?: string;
  runId?: string;
}): ApplyPlan {
  const target = resolveJsonConfigTarget(process.cwd());
  const safeConfig = validateConfigTargetBeforeRead(target);
  const rawConfig = parseRawConfig(safeConfig.rawText);
  const before = SpecifyConfigSchema.parse(rawConfig);
  const topology = resolveTopologyForApply(target, input.topology);
  const parsedTopology = parseWorkspaceTopology(JSON.parse(topology.rawText));
  const derived = deriveSpecifyConfig(before, parsedTopology.topology, parsedTopology.warnings);

  return buildApplyPlan({
    runId: input.runId,
    rawBeforeText: safeConfig.rawText,
    rawBefore: rawConfig,
    before,
    schemaAfter: derived.config,
    workspaceRootRealPath: target.workspaceRootRealPath,
    configPath: target.configPath,
    configRealPath: safeConfig.configRealPath,
    topologyPath: topology.topologyPath,
    topologyRealPath: topology.topologyRealPath,
    topologyContentHash: topology.contentHash,
    applyEligible: topology.applyEligible,
    warnings: derived.warnings,
    requiresConfirmation: derived.requiresConfirmation,
    confirmationFindings: derived.confirmationFindings,
    targetStat: safeConfig.stat,
  });
}

function writeDryRun(plan: ApplyPlan): void {
  writeAgentJson({
    mode: 'dry-run',
    topologyPath: plan.topologyPath,
    configPath: plan.configPath,
    runId: plan.runId,
    rawBeforeHash: plan.rawBeforeHash,
    planHash: plan.planHash,
    workspaceRootRealPath: plan.workspaceRootRealPath,
    configRealPath: plan.configRealPath,
    topologyRealPath: plan.topologyRealPath,
    topologyContentHash: plan.topologyContentHash,
    applyEligible: plan.applyEligible,
    changes: {
      before: redactConfigForOutput(plan.before),
      after: redactConfigForOutput(plan.writeConfig),
    },
    warnings: plan.warnings,
    requiresConfirmation: plan.requiresConfirmation,
    confirmationFindings: plan.confirmationFindings,
    diff: formatTopologyDiff(plan.before, plan.schemaAfter),
  });
}

function rejectInvalidFlagCombinations(opts: TopologyApplyOptions, command: Command): void {
  const dryRunWasExplicit = command.getOptionValueSource('dryRun') === 'cli';
  if (opts.yes && dryRunWasExplicit) {
    throw new CliExitError('--dry-run and --yes cannot be combined. Run dry-run first, then apply with --yes --expect-hash <planHash>.', EXIT_VALIDATION, 'flag-validation');
  }
  if (opts.yes && opts.reconcile) {
    throw new CliExitError('--reconcile apply is not supported. Reconcile remains report-only; run without --yes.', EXIT_VALIDATION, 'flag-validation');
  }
  if (opts.yes && !opts.expectHash) {
    throw new CliExitError('--yes requires --expect-hash <planHash>. Run dry-run first and parse planHash from the JSON output.', EXIT_VALIDATION, 'expect-hash-required');
  }
}

function runApply(opts: TopologyApplyOptions): void {
  const runId = randomUUID();
  const preLockPlan = buildPlanFromCurrentInputs({ topology: opts.topology, runId });
  if (!preLockPlan.applyEligible) {
    throw new CliExitError('--yes requires layout/topology under .specify/configurations/workspace-layout/ or .specify/configurations/workspace-topology/. External layout/topology dry-runs are not apply-eligible.', EXIT_VALIDATION, 'topology-eligibility');
  }

  const target = resolveJsonConfigTarget(process.cwd());
  const paths = buildSafeTopologyApplyPaths(target, runId, preLockPlan.topologyRealPath);
  const lock = acquireApplyLock(paths, {
    runId,
    target: target.configPath,
    expectedPlanHash: opts.expectHash,
    expectedRawBeforeHash: preLockPlan.rawBeforeHash,
  });

  try {
    const plan = buildPlanFromCurrentInputs({ topology: opts.topology, runId });
    if (!plan.applyEligible) {
      throw new CliExitError('--yes requires layout/topology under .specify/configurations/workspace-layout/ or .specify/configurations/workspace-topology/. External layout/topology dry-runs are not apply-eligible.', EXIT_VALIDATION, 'topology-eligibility');
    }
    if (plan.planHash !== opts.expectHash) {
      throw new CliExitError('Stale topology apply preview. Rerun dry-run and apply with the new planHash.', EXIT_STALE_PLAN, 'stale-plan');
    }
    if (plan.requiresConfirmation && !opts.acceptOverwrites) {
      process.stderr.write(`Confirmation required before overwrite/collision apply: ${JSON.stringify(plan.confirmationFindings)}\n`);
      throw new CliExitError('--accept-overwrites is required for confirmation findings after explicit user approval.', EXIT_VALIDATION, 'confirmation');
    }

    const result = applyPlan(plan, paths);
    const audit = buildAuditRecord({
      runId: plan.runId,
      status: 'success',
      exitCode: EXIT_SUCCESS,
      changedFiles: result.changedFiles,
    });
    writeAgentJson({ ...result, audit });
  } finally {
    lock.release();
  }
}

export function createConfigTopologyApplyCommand(): Command {
  return new Command('apply')
    .description('Preview or apply .specify/.specify.json changes from workspace layout proposal JSON')
    .option('--topology <path>', 'Path to workspace-layout-proposal.json or legacy workspace-topology.json')
    .option('--dry-run', 'Preview changes without writing files')
    .option('--yes', 'Apply the previously previewed topology patch')
    .option('--expect-hash <hash>', 'Plan hash emitted by a prior dry-run')
    .option('--accept-overwrites', 'Allow confirmation findings after explicit approval')
    .option('--reconcile', 'Report-only brownfield reconciliation notes')
    .action((opts: TopologyApplyOptions, command: Command) => {
      try {
        rejectInvalidFlagCombinations(opts, command);
        if (opts.yes) {
          runApply(opts);
          return;
        }

        writeDryRun(buildPlanFromCurrentInputs({ topology: opts.topology }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const exitCode = getExitCode(error);
        writeFailureAudit(buildAuditRecord({
          status: 'failure',
          exitCode,
          failureGate: error instanceof CliExitError ? error.failureGate : undefined,
          message,
        }));
        process.stderr.write(`Error: ${message}\n`);
        process.exit(exitCode);
      }
    });
}

if (import.meta.main) {
  createConfigTopologyApplyCommand().parse();
}

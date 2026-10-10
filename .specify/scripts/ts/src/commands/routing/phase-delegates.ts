import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Command } from 'commander';
import { formatAgentJson, writeAgentJson } from '../../utils/agent-output';
import { parseConfig } from '../../utils/config';
import { checkDelegateRouting, parseDelegateRouting, resolveDelegateRoutingPath } from '../../utils/delegate-routing';
import {
  classifyRouteFile,
  detectDomains,
  extractPhaseRoutingInput,
  parsePhaseDelegates,
  phaseSnapshotDigest,
  PhaseDelegatesError,
  resolveExpected,
  rewriteDelegateSections,
  sha256,
  type DelegateAnchor,
  type DelegateGroups,
  type PlanTestMode,
  type RouteFileState,
  type RoutingDomain,
} from '../../utils/phase-delegates';
import { readPhaseFrontmatterStatus } from '../util/phase-frontmatter';
import { readPhaseFrontmatter } from '../util/phase-frontmatter-reader';
import { parsePhasesTable, type PhaseRow } from '../util/phases-table-parser';

type ResolverOptions = { projectRoot?: string; plan: string; phase: string[]; snapshot?: string; allowInProgressPlan?: boolean };

interface PhaseSnapshot {
  row: PhaseRow;
  path: string;
  canonicalPath: string;
  bytes: Buffer;
  rewritten: Buffer;
  rewriteError?: PhaseDelegatesError;
  report: {
    number: number;
    file: string;
    path: string;
    status: PhaseRow['status'];
    eligible: boolean;
    excludedReason?: string;
    expected: DelegateGroups;
    actual: DelegateGroups;
    domains: RoutingDomain[];
    drift: boolean;
    optOut: boolean;
    anchor: DelegateAnchor;
    phaseSha256: string;
  };
}

interface RoutingSnapshot {
  phases: PhaseSnapshot[];
  rows: PhaseRow[];
  planDirectory: string;
  canonicalDirectory: string;
  payload: {
    ok: true;
    plan: string;
    routingFile: string;
    state: RouteFileState;
    testMode: PlanTestMode;
    routeSha256: string | null;
    snapshotDigest: string;
    warnings: string[];
    phases: PhaseSnapshot['report'][];
  };
}

export type PhaseDelegatesResult = RoutingSnapshot['payload'] & { status: 'checked' | 'applied'; changedPhases?: number[] };

function writeFailure(error: unknown): never {
  const payload = error instanceof PhaseDelegatesError
    ? { status: error.status, ...error.details, errors: [error.message] }
    : { status: 'error', errors: [error instanceof Error ? error.message : String(error)] };
  process.stdout.write(formatAgentJson({ ok: false, ...payload }));
  process.exit(1);
}

/** Both lexical and canonical containment are required before any phase read or write. */
function containedPhasePath(planDirectory: string, canonicalDirectory: string, file: string): { path: string; canonicalPath: string } {
  const path = resolve(planDirectory, file);
  const lexical = relative(planDirectory, path);
  if (!lexical || lexical === '..' || lexical.startsWith(`..${sep}`) || isAbsolute(lexical)) {
    throw new PhaseDelegatesError('path_outside_plan', `Phase path escapes the plan directory: ${file}`, { file });
  }
  const canonicalPath = realpathSync(path);
  const canonical = relative(canonicalDirectory, canonicalPath);
  if (!canonical || canonical === '..' || canonical.startsWith(`..${sep}`) || isAbsolute(canonical)) {
    throw new PhaseDelegatesError('path_outside_plan', `Phase realpath escapes the canonical plan directory: ${file}`, { file });
  }
  return { path, canonicalPath };
}

function collectSnapshot(options: ResolverOptions): RoutingSnapshot {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const plan = resolve(options.plan);
  const planDirectory = dirname(plan);
  const canonicalDirectory = realpathSync(planDirectory);
  const routingFile = resolveDelegateRoutingPath(projectRoot);
  const route = classifyRouteFile(routingFile);
  if (route.state === 'unreadable') {
    throw new PhaseDelegatesError('unreadable', `Cannot read routing file: ${route.error}`, { routingFile, state: route.state });
  }
  const warnings: string[] = [];
  // Detection-only: never parse legacy routes, and warn only while the canonical file is missing.
  if (route.state === 'missing' && existsSync(join(dirname(routingFile), 'plan-skill-routing.md'))) {
    warnings.push('Legacy routing file detected; rename to delegate-routing.md and migrate @agent syntax');
  }
  const document = parseDelegateRouting(route.markdown ?? '');
  const routeCheck = checkDelegateRouting(document);
  warnings.push(...routeCheck.warnings);
  if (routeCheck.errors.length > 0) throw new PhaseDelegatesError('error', routeCheck.errors.join('; '), { routingFile });
  const configPath = join(projectRoot, '.specify', '.specify.json');
  const configBytes = readFileSync(configPath);
  const { config, error } = parseConfig(configPath);
  if (!config || error) throw new PhaseDelegatesError('error', error ?? `Cannot read config: ${configPath}`);
  const planBytes = readFileSync(plan);
  const planMarkdown = planBytes.toString('utf-8');
  const frontmatter = readPhaseFrontmatter(planMarkdown);
  if (frontmatter.error) throw new PhaseDelegatesError('error', frontmatter.error);
  const rawMode = frontmatter.metadata.test_mode;
  const testMode: PlanTestMode = rawMode === 'tdd' || rawMode === 'ut_backfill' ? rawMode : 'none';
  const parsed = parsePhasesTable(planMarkdown);
  if (parsed.errors.length > 0) throw new PhaseDelegatesError('error', parsed.errors.map((entry) => `Line ${entry.line}: ${entry.message}`).join('; '));
  const numbers = parsed.phases.map((row) => row.number);
  if (new Set(numbers).size !== numbers.length) throw new PhaseDelegatesError('error', 'Duplicate phase numbers in the plan table.');
  const selectedNumbers = [...new Set(options.phase.map((value) => {
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 0 || !numbers.includes(number)) {
      throw new PhaseDelegatesError('error', `Unknown or invalid phase selector: ${value}`);
    }
    return number;
  }))].sort((a, b) => a - b);
  const rows = parsed.phases.filter((row) => selectedNumbers.length === 0 || selectedNumbers.includes(row.number));
  const canonicalTargets = new Set<string>();
  const phaseFiles = rows.map((row) => {
    const { path, canonicalPath } = containedPhasePath(planDirectory, canonicalDirectory, row.file);
    if (canonicalTargets.has(canonicalPath)) throw new PhaseDelegatesError('error', `Multiple phase rows resolve to the same file: ${row.file}`);
    canonicalTargets.add(canonicalPath);
    return { row, path, canonicalPath, bytes: readFileSync(canonicalPath) };
  });
  const snapshotDigest = phaseSnapshotDigest(route.bytes, planBytes, configBytes, phaseFiles.map((phase) => ({ path: phase.row.file, bytes: phase.bytes })));
  // Compare approval bytes before interpreting changed statuses, anchors or test-mode semantics.
  if (options.snapshot !== undefined && options.snapshot !== snapshotDigest) {
    throw new PhaseDelegatesError('stale', 'Routing, plan, config, phase bytes or the selected phase set changed since check; rerun check and review.');
  }
  const phases: PhaseSnapshot[] = phaseFiles.map(({ row, path, canonicalPath, bytes }) => {
    const markdown = bytes.toString('utf-8');
    let frontmatterStatus;
    try {
      frontmatterStatus = readPhaseFrontmatterStatus(markdown, row.file);
    } catch (error) {
      throw new PhaseDelegatesError('status_mismatch', `Phase ${row.number}: table status ${row.status}; ${error instanceof Error ? error.message : String(error)}`, {
        phase: row.number, tableStatus: row.status, frontmatterStatus: null,
      });
    }
    if (frontmatterStatus !== row.status) {
      throw new PhaseDelegatesError('status_mismatch', `Phase ${row.number}: table status ${row.status} does not match frontmatter status ${frontmatterStatus}.`, {
        phase: row.number, tableStatus: row.status, frontmatterStatus,
      });
    }
    const input = extractPhaseRoutingInput(markdown);
    const domains = detectDomains(input.title, input.overview, input.paths);
    const expected = route.state === 'missing' || route.state === 'present-empty'
      ? { skills: [], agents: [] }
      : resolveExpected(document, config.subWorkspaces ?? [], input.paths, domains, testMode);
    const actual = parsePhaseDelegates(markdown);
    const anchor: DelegateAnchor = testMode === 'none' || readPhaseFrontmatter(markdown).metadata.phase_type === 'spike' ? 'key-insights' : 'test-quality-gate';
    let rewritten = bytes;
    let rewriteError: PhaseDelegatesError | undefined;
    if (route.state !== 'missing') {
      try {
        // Latin-1 is a reversible byte transport here, not the document's text encoding.
        // UTF-8 decoding is only for discovery; an unrelated invalid byte must still survive.
        const encodedExpected = {
          skills: expected.skills.map((token) => Buffer.from(token).toString('latin1')),
          agents: expected.agents.map((token) => Buffer.from(token).toString('latin1')),
        };
        rewritten = Buffer.from(rewriteDelegateSections(bytes.toString('latin1'), encodedExpected, anchor), 'latin1');
      } catch (error) {
        if (error instanceof PhaseDelegatesError) {
          const phaseError = new PhaseDelegatesError(error.status, `Phase ${row.number} (${row.file}): ${error.message}`, { phase: row.number, file: row.file });
          if (error.status !== 'anchor_missing' && error.status !== 'anchor_in_fence' && error.status !== 'delegate_section_in_fence' && error.status !== 'delegate_section_not_clean' && error.status !== 'fence_container_ambiguous') throw phaseError;
          rewriteError = phaseError;
          warnings.push(`[${error.status}] ${phaseError.message}`);
        } else {
          throw error;
        }
      }
    }
    return {
      row, path, canonicalPath, bytes, rewritten, rewriteError,
      report: {
        number: row.number, file: row.file, path, status: row.status,
        eligible: row.status === 'todo' && rewriteError === undefined,
        ...(rewriteError ? { excludedReason: `[${rewriteError.status}] ${rewriteError.message}` } :
          row.status !== 'todo' ? { excludedReason: `Phase status is ${row.status}; only todo phases are eligible.` } : {}),
        expected, actual, domains, drift: rewriteError !== undefined || !rewritten.equals(bytes), optOut: route.state === 'missing',
        anchor, phaseSha256: sha256(bytes),
      },
    };
  });
  return {
    phases, rows: parsed.phases, planDirectory, canonicalDirectory,
    payload: { ok: true, plan, routingFile, state: route.state, testMode, routeSha256: route.sha, snapshotDigest, warnings, phases: phases.map((phase) => phase.report) },
  };
}

function applySnapshot(options: ResolverOptions, snapshot: RoutingSnapshot): number[] {
  const rewriteError = snapshot.phases.find((phase) => phase.row.status === 'todo' && phase.rewriteError)?.rewriteError;
  if (rewriteError) throw rewriteError;
  if (options.phase.length > 0) {
    const excluded = snapshot.phases.filter((phase) => !phase.report.eligible).map((phase) => phase.row.number);
    if (excluded.length > 0) throw new PhaseDelegatesError('excluded', `Explicitly selected phases are not todo: ${excluded.join(', ')}.`, { phases: excluded });
  }
  if (options.allowInProgressPlan && options.phase.length === 0) {
    throw new PhaseDelegatesError('excluded', '--allow-in-progress-plan requires explicitly selected todo phases.');
  }
  if (!options.allowInProgressPlan && snapshot.rows.some((row) => row.status === 'in_progress')) {
    throw new PhaseDelegatesError('in_progress', 'The plan contains an in_progress phase; routing refresh cannot mutate it.');
  }
  const targets = snapshot.phases.filter((phase) => phase.report.eligible && phase.report.drift);
  // Recheck the whole write set before the first mutation, then each target immediately before writing.
  const assertCurrent = (phase: PhaseSnapshot) => {
    const current = containedPhasePath(snapshot.planDirectory, snapshot.canonicalDirectory, phase.row.file);
    if (current.canonicalPath !== phase.canonicalPath || !readFileSync(current.canonicalPath).equals(phase.bytes)) {
      throw new PhaseDelegatesError('stale', `Phase ${phase.row.number} changed before writing.`);
    }
  };
  for (const phase of targets) assertCurrent(phase);
  const attempted: PhaseSnapshot[] = [];
  try {
    for (const phase of targets) {
      assertCurrent(phase);
      attempted.push(phase);
      writeFileSync(phase.canonicalPath, phase.rewritten);
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const phase of attempted.reverse()) {
      try {
        // Restore the original canonical target, never a replacement out-of-bound symlink.
        const target = containedPhasePath(snapshot.canonicalDirectory, snapshot.canonicalDirectory, relative(snapshot.canonicalDirectory, phase.canonicalPath));
        if (target.canonicalPath !== phase.canonicalPath) throw new Error(`Rollback target changed: ${phase.row.file}`);
        if (!readFileSync(target.canonicalPath).equals(phase.bytes)) writeFileSync(target.canonicalPath, phase.bytes);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
      }
    }
    if (rollbackErrors.length > 0) throw new PhaseDelegatesError('rollback_failed', `Phase write failed and rollback could not restore all bytes: ${rollbackErrors.join('; ')}`, { cause: error instanceof Error ? error.message : String(error) });
    if (error instanceof PhaseDelegatesError) throw error;
    throw new PhaseDelegatesError('write_failed', `Phase write failed; original phase bytes restored: ${error instanceof Error ? error.message : String(error)}`);
  }
  return targets.map((phase) => phase.row.number);
}

/** The CLI and in-process callers share the same approval-bound check/apply transaction. */
export function executePhaseDelegates(action: 'check' | 'apply', options: ResolverOptions): PhaseDelegatesResult {
  if (action === 'apply' && options.snapshot === undefined) {
    throw new PhaseDelegatesError('stale', 'Apply requires the snapshotDigest from a matching check.');
  }
  const snapshot = collectSnapshot(options);
  const changedPhases = action === 'apply' ? applySnapshot(options, snapshot) : [];
  return { ...snapshot.payload, status: action === 'check' ? 'checked' : 'applied', ...(action === 'apply' ? { changedPhases } : {}) };
}

export function createPhaseDelegatesCommand(): Command {
  const command = new Command('phase-delegates').description('Check and approval-bound refresh of phase delegate sections');
  command.command('domains')
    .description('Detect the ordered routing domains from purpose and trigger text')
    .requiredOption('--text <text>', 'purpose and trigger text')
    .action((options: { text: string }) => writeAgentJson({ ok: true, domains: detectDomains(options.text) }));
  for (const action of ['check', 'apply'] as const) {
    const operation = command.command(action)
      .description(action === 'check' ? 'Preview phase delegates and snapshot the selected phase set' : 'Apply an approved snapshot to eligible phase files')
      .option('--project-root <root>', 'project root', process.cwd())
      .requiredOption('--plan <path>', 'plan.md path')
      .option('--phase <number>', 'phase to report; repeat to select the approval scope', (value: string, previous: string[]) => { previous.push(value); return previous; }, []);
    if (action === 'apply') operation.requiredOption('--snapshot <digest>', 'snapshotDigest from the matching check')
      .option('--allow-in-progress-plan', 'allow owned, explicitly selected todo phases in an active plan', false);
    operation.action((options: ResolverOptions) => {
      try {
        writeAgentJson(executePhaseDelegates(action, options));
      } catch (error) {
        writeFailure(error);
      }
    });
  }
  return command;
}

if (import.meta.main) createPhaseDelegatesCommand().parse();

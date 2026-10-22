// CLI: feature/status — collect feature status as JSON
// Replaces: bash/feature/status.sh
// No arg: list all features as JSON array. With arg: detailed feature JSON object.
// Source of truth: plan.md ## Phases table (Phase 05 shift from tasks.md)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import {
  loadFeatureEnv, getRepoRoot, formatAgentJson, writeAgentJson,
  detectConfig, readGitMap, probeSubWorkspaces, isValidBranchRef, runGit, findConfigFile,
  type FeatureEnv, type GitMap, type MilestoneState } from '../../utils/index';
import { parsePhasesTable, type PhaseRow } from '../util/phases-table-parser';
import { extractFrontmatter } from '../util/parse-plan-frontmatter';
import {
  deriveFeatureLifecycleStatus, readOptionalFile, readStoredStatuses, statusMismatchWarnings,
  type FeatureStatus,
} from './feature-lifecycle-status';
import { deriveRetroStatus } from './feature-retro-status';
import { ARCHIVE_DIR } from './archive-incoming-references';
import {
  collectReviewSummary, collectTestEvidence, readMemoryStatus, type TestMode,
} from './next-action-evidence';
import { recommendNextAction } from './next-action-recommendation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhasesStatus {
  total: number;
  done: number;
  skipped: number;
  inProgress: number;
  todo: number;
  blocked: number;
  percent: number;
  feature_status: FeatureStatus;
  currentPhase: string;  // file of first in_progress row, or ''
  nextPhase: string;     // file of first todo row, or ''
  rows: Array<{ number: number; file: string; fileLabel: string; phase_status: string }>;
}

// ---------------------------------------------------------------------------
// Artifact helpers
// ---------------------------------------------------------------------------

function getEpoch(file: string): number {
  try {
    return existsSync(file) ? Math.floor(statSync(file).mtimeMs / 1000) : 0;
  } catch { return 0; }
}

function getModDate(file: string): string {
  const ep = getEpoch(file);
  if (ep <= 0) return 'none';
  try { return new Date(ep * 1000).toISOString().slice(0, 10); } catch { return 'unknown'; }
}

function getDaysAgo(file: string): number {
  const ep = getEpoch(file);
  if (ep <= 0) return -1;
  return Math.floor((Date.now() / 1000 - ep) / 86400);
}

function artifactJson(file: string): object {
  if (!existsSync(file)) return { exists: false, modified: 'none', daysAgo: -1 };
  return { exists: true, modified: getModDate(file), daysAgo: getDaysAgo(file) };
}

function readPlanTestMode(planFile: string, fallbackTaskId: string): TestMode {
  const frontmatter = extractFrontmatter(planFile, fallbackTaskId);
  const value = frontmatter?.parsed['test_mode'];
  return value === 'tdd' || value === 'ut_backfill' ? value : 'none';
}

// ---------------------------------------------------------------------------
// parsePhasesStatus (renamed from parseTasksMd — Phase 05)
// ---------------------------------------------------------------------------

/**
 * Parse plan.md ## Phases table and aggregate status counts.
 * Returns phase aggregate for detail mode JSON output.
 * Throws if plan.md missing or ## Phases section has fatal parse errors.
 */
export function parsePhasesStatus(planFile: string): PhasesStatus {
  if (!existsSync(planFile)) {
    throw new Error(`plan.md not found: ${planFile}`);
  }

  const md = readFileSync(planFile, 'utf-8');
  const { phases, errors } = parsePhasesTable(md);

  // Fatal errors: missing section or ambiguous sections
  const fatal = errors.filter(e =>
    e.message.includes('## Phases section not found') ||
    e.message.includes('ambiguous: multiple ## Phases'),
  );
  if (fatal.length > 0) {
    throw new Error(`## Phases parse error: ${fatal.map(e => e.message).join('; ')}`);
  }

  const total = phases.length;
  const done = phases.filter(p => p.status === 'done').length;
  const skipped = phases.filter(p => p.status === 'skipped').length;
  const inProgress = phases.filter(p => p.status === 'in_progress').length;
  const todo = phases.filter(p => p.status === 'todo').length;
  const blocked = phases.filter(p => p.status === 'blocked').length;

  // Percent: done / (total - skipped) * 100; skipped excluded from denominator
  const denominator = total - skipped;
  const percent = denominator > 0 ? Math.floor(done * 100 / denominator) : 0;

  const currentPhaseRow = phases.find(p => p.status === 'in_progress');
  const nextPhaseRow = phases.find(p => p.status === 'todo');

  const rows = phases.map(row => ({
    number: row.number,
    file: row.file,
    fileLabel: row.fileLabel,
    phase_status: row.status,
  }));

  return {
    total,
    done,
    skipped,
    inProgress,
    todo,
    blocked,
    percent,
    feature_status: 'empty', // caller overrides with deriveFeatureLifecycleStatus
    currentPhase: currentPhaseRow?.file ?? '',
    nextPhase: nextPhaseRow?.file ?? '',
    rows,
  };
}

// ---------------------------------------------------------------------------
// List all features mode
// ---------------------------------------------------------------------------

/**
 * List the active features, then the archived ones under `archive/<defaultFolder>/`.
 * Archived specs from other folders are not listed (same single-folder scope as the active list);
 * detail mode still resolves them.
 */
function listFeatures(activeDir: string, archivedDir: string): void {
  const features: object[] = [];
  for (const [featuresDir, archived] of [[activeDir, false], [archivedDir, true]] as const) {
    if (!existsSync(featuresDir)) continue;
    for (const entry of readdirSync(featuresDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const dir = join(featuresDir, id);

      const specMd = readOptionalFile(join(dir, 'spec.md'));
      const planMd = readOptionalFile(join(dir, 'plan.md'));

      let phases: PhaseRow[] = [];
      let phasesParseOk = false;

      if (planMd !== null) {
        const { phases: parsedPhases, errors } = parsePhasesTable(planMd);
        const fatal = errors.filter(e =>
          e.message.includes('## Phases section not found') ||
          e.message.includes('ambiguous: multiple ## Phases'),
        );
        if (fatal.length === 0) {
          phases = parsedPhases;
          phasesParseOk = true;
        }
      }

      const { status: feature_status } = deriveFeatureLifecycleStatus({
        featureDir: dir, specMd, planMd, phases, phasesParseOk,
      });

      const done = phases.filter(p => p.status === 'done').length;
      const skipped = phases.filter(p => p.status === 'skipped').length;
      const total = phases.length;
      const denominator = total - skipped;
      const percent = denominator > 0 ? Math.floor(done * 100 / denominator) : 0;

      const title = specMd?.match(/^# (.+)$/m)?.[1]?.trim() ?? id;
      const retro = deriveRetroStatus(dir);

      features.push({
        id, title, feature_status, total, done, percent,
        archived, retro_status: retro.retro_status, retro_blocked: retro.blocked,
      });
    }
  }
  writeAgentJson({ features });
}

// ---------------------------------------------------------------------------
// Git info
// ---------------------------------------------------------------------------

function getGitInfo(
  featureDir: string,
  ticket: string,
  repoRoot: string,
  env: FeatureEnv,
  isMonolith: boolean,
): Record<string, unknown> {
  // Anchor every command to repoRoot. An unanchored git call resolves against whatever CWD the
  // caller happened to have, which reports a different repository's branch as this feature's.
  // runGit also strips GIT_DIR/GIT_WORK_TREE, which would otherwise override the anchor.
  const git = (args: string[]): string => runGit(args, { cwd: repoRoot });

  try {
    runGit(['rev-parse', '--git-dir'], { cwd: repoRoot });
  } catch { return { available: false }; }

  const branch = (() => { try { return git(['branch', '--show-current']); } catch { return 'unknown'; } })();

  // spec.md is committed, so its branch fields are untrusted input. A bad value falls back to the
  // conventional name — a read-only status report must never stop on someone else's typo.
  const spec = extractFrontmatter(join(featureDir, 'spec.md'), ticket);
  const specBranch = (key: string): string | null => {
    const value = spec?.parsed[key];
    return isValidBranchRef(value) ? value : null;
  };
  // `branch` is the pre-rename spelling of `feature_branch`; branch preflight still reads it, so
  // reporting a different value here would put the two skills at odds on an older spec.
  const featureBranch = specBranch('feature_branch') ?? specBranch('branch')
    ?? `${env.defaultFolder}/${ticket}`;

  const branchExists = (() => { try { return git(['branch', '--list', featureBranch]).length > 0; } catch { return false; } })();
  const uncommitted = (() => { try { return git(['status', '--porcelain', featureDir]).split('\n').filter(Boolean).length; } catch { return 0; } })();

  return {
    available: true,
    branch,
    // The artifact host's live branch. Named `rootBranch` for continuity; it is not a milestone.
    rootBranch: branch,
    featureBranch,
    featureBranchExists: branchExists,
    uncommitted,
    // On a single-repository project the artifact host IS the code repository, so it is the one
    // place a milestone can be reported. A polyrepo reports milestones per sub-workspace instead,
    // and these two keys are absent there rather than carrying a meaningless whole-project value.
    ...(isMonolith
      ? {
          milestone: specBranch('milestone_branch'),
          milestoneState: monolithMilestoneState(
            repoRoot, specBranch('milestone_branch'), featureBranch, branchExists,
          ),
        }
      : {}),
  };
}

/**
 * Milestone agreement for a single-repository project, which has no git-map row to classify.
 *
 * Derived from whether the feature branch exists: without one there is nothing to compare, and
 * with one the question is whether it descends from the milestone.
 */
function monolithMilestoneState(
  repoRoot: string,
  milestone: string | null,
  featureBranch: string,
  featureBranchExists: boolean,
): MilestoneState {
  if (milestone === null || !featureBranchExists) return 'unknown';
  try {
    runGit(['merge-base', '--is-ancestor', milestone, featureBranch], { cwd: repoRoot });
    return 'matched';
  } catch { return 'drifted'; }
}

// ---------------------------------------------------------------------------
// Detailed feature mode
// ---------------------------------------------------------------------------

/**
 * Effective milestone per sub-workspace, by the git-map contract's precedence:
 * the spec's map, then the row's `Milestone` column, then a scalar — and a scalar applies only to
 * the artifact host, never to a child repository.
 *
 * Resolved once here and passed down, so `status` and the branch guard cannot disagree about which
 * milestone is current after a user edits the spec.
 */
function resolveEffectiveMilestones(
  specMilestone: unknown,
  subWorkspaces: { name: string }[],
  gitMap: GitMap | null,
): Record<string, string> {
  const fromSpec = specMilestone !== null && typeof specMilestone === 'object' && !Array.isArray(specMilestone)
    ? specMilestone as Record<string, unknown>
    : {};

  const resolved = Object.create(null) as Record<string, string>;
  for (const sub of subWorkspaces) {
    const specValue = Object.hasOwn(fromSpec, sub.name) ? fromSpec[sub.name] : undefined;
    if (isValidBranchRef(specValue)) { resolved[sub.name] = specValue; continue; }
    const recorded = gitMap?.rows.find(r => r.subWorkspace === sub.name)?.milestone;
    if (recorded !== null && recorded !== undefined) resolved[sub.name] = recorded;
  }
  return resolved;
}

/**
 * Resolve a detail-mode id to its directory. `archive/<folder>/<ticket>` resolves as written; a bare
 * id missing from the active folder falls back, read-only, to `archive/<defaultFolder>/<id>`.
 * `folder`/`ticket` always describe the canonical `<folder>/<ticket>` identity, never the archive path.
 */
function resolveFeatureLocation(id: string, repoRoot: string, env: FeatureEnv): {
  folder: string; ticket: string; featureDir: string; archived: boolean;
} {
  let folder = env.defaultFolder;
  let ticket = id;
  if (id.includes('/')) {
    folder = id.slice(0, id.indexOf('/'));
    ticket = id.slice(id.indexOf('/') + 1);
  }

  const archiveRoot = join(repoRoot, env.specsRoot, ARCHIVE_DIR);
  if (folder === ARCHIVE_DIR && ticket.includes('/')) {
    const inner = ticket.slice(0, ticket.indexOf('/'));
    const innerTicket = ticket.slice(ticket.indexOf('/') + 1);
    return { folder: inner, ticket: innerTicket, featureDir: join(archiveRoot, inner, innerTicket), archived: true };
  }

  const featureDir = join(repoRoot, env.specsRoot, folder, ticket);
  const archivedDir = join(archiveRoot, env.defaultFolder, ticket);
  if (!id.includes('/') && !existsSync(featureDir) && existsSync(archivedDir)) {
    return { folder, ticket, featureDir: archivedDir, archived: true };
  }
  return { folder, ticket, featureDir, archived: false };
}

function detailFeature(featureId: string, repoRoot: string, env: FeatureEnv): void {
  const id = featureId.toLowerCase();
  const { folder, ticket, featureDir, archived } = resolveFeatureLocation(id, repoRoot, env);
  // Recommendations never carry the archive path: `archive/<folder>/<ticket>` is not a valid task id.
  const taskId = archived ? `${folder}/${ticket}` : id;
  const featuresDir = join(repoRoot, env.specsRoot, env.defaultFolder);

  if (!existsSync(featureDir)) {
    const available: string[] = [];
    try { readdirSync(featuresDir, { withFileTypes: true }).filter(e => e.isDirectory()).forEach(e => available.push(e.name)); } catch { /* ignore */ }
    process.stdout.write(formatAgentJson({ error: 'Feature not found', featureId: id, available }));
    process.exit(1);
  }

  // A duplicate sub-workspace name aliases per-repository git-map state. Stop before either
  // root-branch or sub-workspace probing, while preserving the exact conflicting names for callers.
  const config = detectConfig({ configAnchor: repoRoot, cwd: process.cwd() });
  if (config.error) {
    writeAgentJson({
      featureId: id,
      error: config.error,
      ...(config.duplicateSubWorkspaceNames === undefined
        ? {}
        : { duplicateSubWorkspaceNames: config.duplicateSubWorkspaceNames }),
    });
    return;
  }

  const hasSpec = existsSync(join(featureDir, 'spec.md'));
  const planFile = join(featureDir, 'plan.md');
  const hasPlan = existsSync(planFile);
  const testMode = hasPlan ? readPlanTestMode(planFile, ticket) : 'none';

  // Artifacts — plan.md is the primary SoT; tasks.md entry removed (Phase 05)
  const artifacts = {
    spec: artifactJson(join(featureDir, 'spec.md')),
    plan: artifactJson(planFile),
    utSpec: artifactJson(join(featureDir, 'ut-spec.md')),
    coverage: artifactJson(join(featureDir, 'coverage-report.json')),
    utPlan: artifactJson(join(featureDir, 'ut-plan.md')),
    review: artifactJson(join(featureDir, 'review-report.md')),
    testResults: artifactJson(join(featureDir, 'test-results.md')),
  };

  // ErcSpec workflow presence: spec.md or plan.md
  const hasErcspec = hasSpec || hasPlan;

  // Parse plan.md ## Phases table
  let phasesData: PhasesStatus = {
    total: 0, done: 0, skipped: 0, inProgress: 0, todo: 0, blocked: 0,
    percent: 0, feature_status: 'empty', currentPhase: '', nextPhase: '', rows: [],
  };
  let phasesParseError: string | null = null;
  let phases: PhaseRow[] = [];

  if (hasPlan) {
    try {
      phasesData = parsePhasesStatus(planFile);
      phases = (() => {
        const md = readFileSync(planFile, 'utf-8');
        return parsePhasesTable(md).phases;
      })();
    } catch (err) {
      phasesParseError = err instanceof Error ? err.message : String(err);
    }
  }

  // Derive feature_status (same derivation as the plan root write path; pre-plan uses the live gate)
  const specMd = hasSpec ? readOptionalFile(join(featureDir, 'spec.md')) : null;
  const planMd = hasPlan ? readOptionalFile(planFile) : null;
  const phasesParseOk = hasPlan && phasesParseError === null;
  const derived = deriveFeatureLifecycleStatus({ featureDir, specMd, planMd, phases, phasesParseOk });
  const feature_status = derived.status;
  phasesData.feature_status = feature_status;
  const stored_status = readStoredStatuses(specMd, planMd);
  const retro = deriveRetroStatus(featureDir);

  // Evidence behind both the UT display and the recommendation ladder (single source).
  const testEvidence = collectTestEvidence(featureDir, testMode, phasesData.rows);
  const reviews = collectReviewSummary(featureDir, taskId, phasesData.rows);
  const memory_status = readMemoryStatus(featureDir);
  const hasTestEvidence = testEvidence.strength !== 'none';

  // UT state
  let utState = 'none';
  if (hasTestEvidence) {
    utState = 'planned';
    if (existsSync(join(featureDir, 'ut-spec.md'))) utState = 'specified';
    if (existsSync(join(featureDir, 'coverage-report.json'))) utState = 'analyzed';
    if (existsSync(join(featureDir, 'ut-plan.md'))) utState = 'planned';
    if (existsSync(join(featureDir, 'review-report.md'))) utState = 'reviewed';
    if (existsSync(join(featureDir, 'test-results.md'))) utState = 'executed';
  }

  const git = getGitInfo(featureDir, ticket, repoRoot, env, config.subWorkspaces.length === 0);
  const rec = recommendNextAction({
    taskId,
    feature_status,
    archived,
    phases: {
      rows: phasesData.rows,
      currentPhase: phasesData.currentPhase,
      nextPhase: phasesData.nextPhase,
      percent: phasesData.percent,
    },
    testEvidence,
    reviews,
    retro_status: retro.retro_status,
    memoryStatus: memory_status,
    gitUncommitted: typeof git['uncommitted'] === 'number' ? git['uncommitted'] : 0,
  });

  // Staleness warnings — spec.md, plan.md, ut artifacts (tasks.md removed, Phase 05)
  const warnings: object[] = derived.warnings.map(message => ({ level: 'status_fallback', message }));
  // Archived specs are frozen: their stored status is the archive command's own output, not drift.
  if (!archived) {
    warnings.push(...statusMismatchWarnings({
      featureId: id, planPath: planFile, stored: stored_status, derived: feature_status,
      hasPlan, phasesParseOk,
    }));
  }
  for (const artifact of ['spec.md', 'plan.md', 'ut-spec.md', 'ut-plan.md']) {
    const f = join(featureDir, artifact);
    if (existsSync(f)) {
      const age = getDaysAgo(f);
      if (age > 7) warnings.push({ file: artifact, days: age, level: age > 14 ? 'outdated' : 'stale' });
    }
  }

  // Per-sub-workspace branch state. Anchored to workspaceRoot, not repoRoot: subWorkspaces[].path
  // is defined relative to the directory holding .specify/.
  const gitMap = readGitMap(featureDir);

  // Effective milestone is resolved here, once, and handed down. probeSubWorkspaces has no route
  // to spec.md, and giving it one would duplicate the precedence rule in a second place.
  const specFrontmatter = extractFrontmatter(join(featureDir, 'spec.md'), ticket);
  const effectiveMilestones = resolveEffectiveMilestones(
    specFrontmatter?.parsed['milestone_branch'],
    config.subWorkspaces,
    gitMap,
  );

  const subWorkspaces = probeSubWorkspaces(
    config.workspaceRoot,
    config.subWorkspaces,
    gitMap,
    effectiveMilestones,
  );

  // Title
  let title = id;
  try {
    const m = readFileSync(join(featureDir, 'spec.md'), 'utf-8').match(/^# (.+)$/m);
    if (m) title = m[1]!.trim();
  } catch { /* no spec */ }

  const output: Record<string, unknown> = {
    featureId: id,
    title,
    location: featureDir.replace(repoRoot + '/', ''),
    workflows: { ercspec: hasErcspec, ut: hasTestEvidence },
    feature_status,
    archived,
    retro_status: retro.retro_status,
    retro_blocked: retro.blocked,
    memory_status,
    stored_status,
    testMode,
    utState,
    testEvidence,
    reviews,
    artifacts,
    phases: {
      total: phasesData.total,
      done: phasesData.done,
      skipped: phasesData.skipped,
      inProgress: phasesData.inProgress,
      todo: phasesData.todo,
      blocked: phasesData.blocked,
      percent: phasesData.percent,
      currentPhase: phasesData.currentPhase,
      nextPhase: phasesData.nextPhase,
      rows: phasesData.rows,
    },
    git,
    ...(subWorkspaces.length > 0 ? { subWorkspaces } : {}),
    recommendation: rec,
    warnings,
  };

  if (phasesParseError) {
    output['phasesParseError'] = phasesParseError;
  }

  writeAgentJson(output);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command()
  .name('feature-status')
  .description('Collect feature status as JSON. No arg: list all. With arg: detailed status.')
  .argument('[feature-id]', 'Feature ID (e.g., aa-001, hotfix/aa-123). Omit to list all.')
  .action((featureId?: string) => {
    const repoRoot = getRepoRoot();
    const env = loadFeatureEnv(findConfigFile(repoRoot));
    if (!featureId) {
      listFeatures(
        join(repoRoot, env.specsRoot, env.defaultFolder),
        join(repoRoot, env.specsRoot, ARCHIVE_DIR, env.defaultFolder),
      );
    } else {
      detailFeature(featureId, repoRoot, env);
    }
  });

program.parse();

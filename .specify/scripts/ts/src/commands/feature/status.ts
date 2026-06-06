// CLI: feature/status — collect feature status as JSON
// Replaces: bash/feature/status.sh
// No arg: list all features as JSON array. With arg: detailed feature JSON object.
// Source of truth: plan.md ## Phases table (Phase 05 shift from tasks.md)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import { loadFeatureEnv, getRepoRoot, formatAgentJson, writeAgentJson } from '../../utils/index';
import { parsePhasesTable, type PhaseRow } from '../util/phases-table-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Feature-level status derived from ## Phases table rows per derivation table (Phase 05). */
export type FeatureStatus = 'empty' | 'specified' | 'planned' | 'in_progress' | 'complete' | 'blocked';

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

// ---------------------------------------------------------------------------
// Feature status derivation helper (locked contract — Phase 05 derivation table)
// ---------------------------------------------------------------------------

/**
 * Derive feature-level status from ## Phases rows and artifact presence flags.
 * Implements the 8-row derivation table (Phase 05 spec, §Feature Status Derivation).
 *
 * Percent formula: done / (total - skipped) * 100 — skipped excluded from denominator.
 * F14: skipped satisfies dependency (consistent with Phase 04 executor semantics).
 */
export function deriveFeatureStatus(
  hasSpec: boolean,
  hasPlan: boolean,
  phases: PhaseRow[],
): FeatureStatus {
  // Row 1: No spec.md
  if (!hasSpec) return 'empty';

  // Row 2: Has spec.md, no plan.md or no ## Phases section
  if (!hasPlan) return 'specified';

  // Row 3: Has ## Phases but zero rows
  if (phases.length === 0) return 'specified';

  // Rows with ≥1 phase
  const hasBlocked = phases.some(p => p.status === 'blocked');
  const hasInProgress = phases.some(p => p.status === 'in_progress');
  const doneCount = phases.filter(p => p.status === 'done').length;
  const skippedCount = phases.filter(p => p.status === 'skipped').length;
  const todoCount = phases.filter(p => p.status === 'todo').length;
  const total = phases.length;

  // Row 4: any blocked
  if (hasBlocked) return 'blocked';

  // Row 5: any in_progress
  if (hasInProgress) return 'in_progress';

  // Row 6: all done/skipped with at least 1 done
  if (doneCount + skippedCount === total && doneCount >= 1) return 'complete';

  // Row 7: all todo
  if (todoCount === total) return 'planned';

  // Row 8: mix todo + done/skipped, no in_progress/blocked
  return 'in_progress';
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
    feature_status: 'specified', // caller overrides after computing with deriveFeatureStatus
    currentPhase: currentPhaseRow?.file ?? '',
    nextPhase: nextPhaseRow?.file ?? '',
    rows,
  };
}

// ---------------------------------------------------------------------------
// List all features mode
// ---------------------------------------------------------------------------

function listFeatures(featuresDir: string): void {
  if (!existsSync(featuresDir)) {
    writeAgentJson({ features: [] });
    return;
  }

  const features: object[] = [];
  for (const entry of readdirSync(featuresDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const dir = join(featuresDir, id);

    const hasSpec = existsSync(join(dir, 'spec.md'));
    const planFile = join(dir, 'plan.md');
    const hasPlan = existsSync(planFile);

    let phases: PhaseRow[] = [];
    let phasesParseOk = false;

    if (hasPlan) {
      try {
        const md = readFileSync(planFile, 'utf-8');
        const { phases: parsedPhases, errors } = parsePhasesTable(md);
        const fatal = errors.filter(e =>
          e.message.includes('## Phases section not found') ||
          e.message.includes('ambiguous: multiple ## Phases'),
        );
        if (fatal.length === 0) {
          phases = parsedPhases;
          phasesParseOk = true;
        }
      } catch { /* plan.md unreadable — treat as no phases */ }
    }

    const feature_status = deriveFeatureStatus(hasSpec, hasPlan && phasesParseOk, phases);

    const done = phases.filter(p => p.status === 'done').length;
    const skipped = phases.filter(p => p.status === 'skipped').length;
    const total = phases.length;
    const denominator = total - skipped;
    const percent = denominator > 0 ? Math.floor(done * 100 / denominator) : 0;

    let title = id;
    try {
      const specContent = readFileSync(join(dir, 'spec.md'), 'utf-8');
      const m = specContent.match(/^# (.+)$/m);
      if (m) title = m[1]!.trim();
    } catch { /* no spec */ }

    features.push({ id, title, feature_status, total, done, percent });
  }
  writeAgentJson({ features });
}

// ---------------------------------------------------------------------------
// Git info
// ---------------------------------------------------------------------------

function getGitInfo(featureDir: string, ticket: string): object {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'pipe' });
  } catch { return { available: false }; }

  const branch = (() => { try { return execFileSync('git', ['branch', '--show-current'], { encoding: 'utf-8', stdio: 'pipe' }).trim(); } catch { return 'unknown'; } })();
  const featureBranch = `feature/${ticket}`;
  const branchExists = (() => { try { return execFileSync('git', ['branch', '--list', featureBranch], { encoding: 'utf-8', stdio: 'pipe' }).trim().length > 0; } catch { return false; } })();
  const uncommitted = (() => { try { return execFileSync('git', ['status', '--porcelain', featureDir], { encoding: 'utf-8', stdio: 'pipe' }).trim().split('\n').filter(Boolean).length; } catch { return 0; } })();

  return { available: true, branch, featureBranch, featureBranchExists: branchExists, uncommitted };
}

// ---------------------------------------------------------------------------
// Detailed feature mode
// ---------------------------------------------------------------------------

function detailFeature(featureId: string, repoRoot: string, env: ReturnType<typeof loadFeatureEnv>): void {
  const id = featureId.toLowerCase();
  let folder: string, ticket: string;
  if (id.includes('/')) {
    folder = id.slice(0, id.indexOf('/'));
    ticket = id.slice(id.indexOf('/') + 1);
  } else {
    folder = env.defaultFolder;
    ticket = id;
  }

  const featureDir = join(repoRoot, env.specsRoot, folder, ticket);
  const featuresDir = join(repoRoot, env.specsRoot, env.defaultFolder);

  if (!existsSync(featureDir)) {
    const available: string[] = [];
    try { readdirSync(featuresDir, { withFileTypes: true }).filter(e => e.isDirectory()).forEach(e => available.push(e.name)); } catch { /* ignore */ }
    process.stdout.write(formatAgentJson({ error: 'Feature not found', featureId: id, available }));
    process.exit(1);
  }

  const hasSpec = existsSync(join(featureDir, 'spec.md'));
  const planFile = join(featureDir, 'plan.md');
  const hasPlan = existsSync(planFile);

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
  const hasUt = existsSync(join(featureDir, 'ut-spec.md')) || existsSync(join(featureDir, 'coverage-report.json')) || existsSync(join(featureDir, 'ut-plan.md'));

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

  // Derive feature_status
  const feature_status = deriveFeatureStatus(hasSpec, hasPlan && phasesParseError === null, phases);
  phasesData.feature_status = feature_status;

  // UT state
  let utState = 'none';
  if (hasUt) {
    if (existsSync(join(featureDir, 'ut-spec.md'))) utState = 'specified';
    if (existsSync(join(featureDir, 'coverage-report.json'))) utState = 'analyzed';
    if (existsSync(join(featureDir, 'ut-plan.md'))) utState = 'planned';
    if (existsSync(join(featureDir, 'review-report.md'))) utState = 'reviewed';
    if (existsSync(join(featureDir, 'test-results.md'))) utState = 'executed';
  }

  // Recommendation — mapped to new feature_status vocab
  const rec: { primary: { command: string; reason: string }; alternative?: { command: string; reason: string } } = {
    primary: { command: '', reason: '' },
  };
  switch (feature_status) {
    case 'empty':
      rec.primary = { command: `/tdk-specify ${id}`, reason: 'No artifacts yet, start with specification' };
      break;
    case 'specified':
      rec.primary = { command: `/tdk-plan ${id}`, reason: 'Spec complete, create implementation plan' };
      rec.alternative = { command: `/tdk-ut-backfill-plan ${id}`, reason: 'TDD: write tests first' };
      break;
    case 'planned':
      rec.primary = { command: `/tdk-implement ${id}`, reason: 'Plan ready, start implementing from plan' };
      break;
    case 'in_progress':
      rec.primary = {
        command: `/tdk-implement ${id}`,
        reason: `${phasesData.percent}% done, next phase: ${phasesData.nextPhase || phasesData.currentPhase || 'see phases'}`,
      };
      break;
    case 'blocked':
      rec.primary = { command: `/tdk-plan ${id}`, reason: 'Phases blocked — re-evaluate dependencies in plan' };
      break;
    case 'complete':
      rec.primary = hasUt
        ? { command: '', reason: 'All workflows complete' }
        : { command: `/tdk-ut-backfill-plan ${id}`, reason: 'Implementation done, add tests' };
      break;
  }

  // Staleness warnings — spec.md, plan.md, ut artifacts (tasks.md removed, Phase 05)
  const warnings: object[] = [];
  for (const artifact of ['spec.md', 'plan.md', 'ut-spec.md', 'ut-plan.md']) {
    const f = join(featureDir, artifact);
    if (existsSync(f)) {
      const age = getDaysAgo(f);
      if (age > 7) warnings.push({ file: artifact, days: age, level: age > 14 ? 'outdated' : 'stale' });
    }
  }

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
    workflows: { ercspec: hasErcspec, ut: hasUt },
    feature_status,
    utState,
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
    git: getGitInfo(featureDir, ticket),
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
    const env = loadFeatureEnv();
    const repoRoot = getRepoRoot();
    const featuresDir = join(repoRoot, env.specsRoot, env.defaultFolder);

    if (!featureId) {
      listFeatures(featuresDir);
    } else {
      detailFeature(featureId, repoRoot, env);
    }
  });

program.parse();

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { checkPlanSkillRouting, parsePlanSkillRouting } from '../../utils/plan-skill-routing';
import { parsePhasesTable } from './phases-table-parser';
import { assertPlannerExternalFinalState } from './parallel-planner-external-snapshot';
import {
  assertNoUndeclaredPlannerDelta, capturePlannerFeature, plannerEntryFingerprint, type PlannerSnapshot,
} from './parallel-planner-snapshot';

function run(script: string, args: string[]): void {
  const result = spawnSync('bun', [resolve(import.meta.dir, script), ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `${script} validation failed`);
  }
}

function changedFeaturePaths(snapshot: PlannerSnapshot, current: PlannerSnapshot['entries']): string[] {
  const before = new Map(snapshot.entries.map((entry) => [entry.path, plannerEntryFingerprint(entry)]));
  const after = new Map(current.map((entry) => [entry.path, plannerEntryFingerprint(entry)]));
  return [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path));
}

export function validatePlannerFinalState(input: {
  projectRoot: string; featureDir: string; snapshot: PlannerSnapshot;
}): void {
  assertNoUndeclaredPlannerDelta(input);
  const planPath = resolve(input.featureDir, 'plan.md');
  if (!existsSync(planPath)) throw new Error('planner finalization requires plan.md');
  const plan = readFileSync(planPath, 'utf8'); const parsed = parsePhasesTable(plan);
  if (parsed.errors.length) throw new Error(parsed.errors.map(({ message }) => message).join('; '));
  const phasePaths = new Map(parsed.phases.map((row) => {
    const absolute = resolve(input.featureDir, row.file);
    const path = relative(resolve(input.featureDir), absolute).replaceAll('\\', '/');
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error(`phase ${row.number} escapes feature directory`);
    return [row.number, path] as const;
  }));
  const referenced = new Set(phasePaths.values());
  const phaseDirectory = resolve(input.featureDir, 'phases');
  const canonicalFiles = existsSync(phaseDirectory)
    ? readdirSync(phaseDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^phase-\d{2}-.+\.md$/.test(entry.name)).map((entry) => `phases/${entry.name}`)
    : [];
  const orphan = canonicalFiles.filter((path) => !referenced.has(path));
  if (orphan.length) throw new Error(`planner finalization found orphan phase files: ${orphan.sort().join(', ')}`);

  const current = capturePlannerFeature(input.featureDir);
  const changed = changedFeaturePaths(input.snapshot, current);
  const priorPhases = new Set(input.snapshot.entries
    .filter((entry) => entry.kind === 'file' && /^phases\/phase-\d{2}-.+\.md$/.test(entry.path))
    .map(({ path }) => path));
  const allowed = (path: string): boolean => path === 'plan.md' || referenced.has(path) || priorPhases.has(path)
    || path === 'phases' || ['research', 'reports', 'contracts'].some((root) => path === root || path.startsWith(`${root}/`));
  const unexpected = changed.filter((path) => !allowed(path));
  if (unexpected.length) throw new Error(`planner finalization found unexpected feature changes: ${unexpected.sort().join(', ')}`);

  run('plan-prose-validator.ts', [planPath, '--json']);
  run('plan-status-validator.ts', [planPath, '--json']);
  for (const row of parsed.phases) {
    const path = phasePaths.get(row.number)!;
    if (!changed.includes(path)) continue;
    run('validate-phase-file.ts', [resolve(input.featureDir, path), '--phase-number', String(row.number),
      '--plan', planPath, '--mode', 'parallel', '--project-root', input.projectRoot, '--json']);
  }
  run('resolve-parallel-phase-wave.ts', ['--project-root', input.projectRoot, '--plan', planPath]);
  assertPlannerExternalFinalState({ ...input, entries: input.snapshot.external });
  for (const external of input.snapshot.external) {
    const path = resolve(input.projectRoot, external.path);
    if (external.path.endsWith('/plan.md')) {
      run('plan-prose-validator.ts', [path, '--json']); run('plan-status-validator.ts', [path, '--json']);
      run('resolve-parallel-phase-wave.ts', ['--project-root', input.projectRoot, '--plan', path]);
    } else {
      const check = checkPlanSkillRouting(parsePlanSkillRouting(readFileSync(path, 'utf8')));
      if (check.errors.length) throw new Error(`external routing is invalid: ${check.errors.join('; ')}`);
    }
  }
}

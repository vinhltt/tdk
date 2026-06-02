import { existsSync, readFileSync } from 'node:fs';
import {
  alignPlanPhases,
  extractEntityTerms,
  loadPhases,
  matchesRequirement,
  matchesSpecSuccess,
  parseSpec,
  strongTextMatch,
} from './spec-plan-drift-markdown';
import {
  buildQuestionGroups,
  countByType,
  finding,
  numberFindings,
  type CandidateFinding,
  type SpecPlanDriftInput,
  type SpecPlanDriftResult,
} from './spec-plan-drift-model';

export type {
  DriftAction,
  DriftSeverity,
  DriftType,
  PhaseArtifact,
  SpecPlanDriftFinding,
  SpecPlanDriftInput,
  SpecPlanDriftResult,
} from './spec-plan-drift-model';

export function analyzeSpecPlanDrift(input: SpecPlanDriftInput): SpecPlanDriftResult {
  const spec = parseSpec(input.specMd);
  const phases = alignPlanPhases(input.planMd, input.phases);
  const candidates: CandidateFinding[] = [];

  for (const req of spec.requirements) {
    const coveringPhase = phases.find((phase) => matchesRequirement(req, phase.content));
    if (!coveringPhase) {
      candidates.push(finding('high', 'missing-fr-coverage', req.line, undefined,
        `Requirement ${req.id} has no matching phase coverage`, 'spec-update-needed'));
      continue;
    }
    for (const tag of req.tags) {
      if (!spec.impactTags.has(tag)) {
        candidates.push(finding('medium', 'impact-mismatch', req.line, phaseAnchor(coveringPhase.path),
          `Requirement ${req.id} uses impact tag [${tag}] missing from spec impact surface`, 'spec-update-needed'));
      }
    }
  }

  for (const phase of phases) {
    const matchingReq = spec.requirements.find((req) => matchesRequirement(req, phase.content));
    if (!matchingReq && !matchesSpecSuccess(spec.successText, phase.content)) {
      candidates.push(finding('medium', 'plan-only-phase', undefined, phaseAnchor(phase.path),
        `${phase.path} has no matching spec requirement or success criterion`, 'revise'));
    }

    for (const item of spec.outOfScopeItems) {
      if (strongTextMatch(item.text, phase.content)) {
        candidates.push(finding('critical', 'out-of-scope-contradiction', item.line, phaseAnchor(phase.path),
          `${phase.path} appears to implement out-of-scope item: ${item.text}`, 'revise'));
      }
    }

    for (const term of extractEntityTerms(phase.content)) {
      if (!spec.normalizedText.includes(term.toLowerCase())) {
        candidates.push(finding('medium', 'new-entity-or-contract', undefined, phaseAnchor(phase.path),
          `${phase.path} introduces ${term} not present in spec`, 'spec-update-needed'));
        break;
      }
    }
  }

  const findings = numberFindings(candidates);
  return {
    ok: true,
    summary: { total: findings.length, byType: countByType(findings) },
    findings,
    questionGroups: buildQuestionGroups(findings),
  };
}

function phaseAnchor(path: string): string {
  return `${path}:1`;
}

function readRequired(path: string): string {
  if (!existsSync(path)) throw new Error(`cannot read '${path}'`);
  return readFileSync(path, 'utf-8');
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function main(): void {
  const args = process.argv.slice(2);
  const specPath = argValue(args, '--spec');
  const planPath = argValue(args, '--plan');
  const phasesRoot = argValue(args, '--phases-root');
  const json = args.includes('--json');
  if (!specPath || !planPath || !phasesRoot) {
    console.error('Usage: bun spec-plan-drift.ts --spec <spec.md> --plan <plan.md> --phases-root <dir> [--json]');
    process.exit(1);
  }

  try {
    const result = analyzeSpecPlanDrift({
      specMd: readRequired(specPath),
      planMd: readRequired(planPath),
      phases: loadPhases(phasesRoot),
    });
    console.log(json ? JSON.stringify(result, null, 2) : `${result.summary.total} spec-plan drift finding(s)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.main) main();

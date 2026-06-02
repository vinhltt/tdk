export type DriftSeverity = 'critical' | 'high' | 'medium' | 'low';
export type DriftType =
  | 'missing-fr-coverage'
  | 'plan-only-phase'
  | 'out-of-scope-contradiction'
  | 'impact-mismatch'
  | 'new-entity-or-contract';
export type DriftAction = 'spec-update-needed' | 'revise' | 'no-op';

export interface PhaseArtifact {
  path: string;
  content: string;
}

export interface SpecPlanDriftInput {
  specMd: string;
  planMd: string;
  phases: PhaseArtifact[];
}

export interface SpecPlanDriftFinding {
  id: `D${number}`;
  severity: DriftSeverity;
  type: DriftType;
  specAnchor?: string;
  planAnchor?: string;
  summary: string;
  suggestedAction: DriftAction;
  questionId: string;
}

export interface SpecPlanDriftResult {
  ok: boolean;
  summary: { total: number; byType: Record<DriftType, number> };
  findings: SpecPlanDriftFinding[];
  questionGroups: Array<{ questionId: string; findingIds: string[]; actionOptions: DriftAction[] }>;
}

export interface CandidateFinding extends Omit<SpecPlanDriftFinding, 'id'> {
  order: number;
}

export const TYPE_RANK: Record<DriftType, number> = {
  'missing-fr-coverage': 1,
  'plan-only-phase': 2,
  'out-of-scope-contradiction': 3,
  'impact-mismatch': 4,
  'new-entity-or-contract': 5,
};

export const SEVERITY_RANK: Record<DriftSeverity, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

export const QUESTION_IDS: Record<DriftType, string> = {
  'missing-fr-coverage': 'speckit.missing_fr_coverage',
  'plan-only-phase': 'speckit.plan_only_phase',
  'out-of-scope-contradiction': 'speckit.scope_drift',
  'impact-mismatch': 'speckit.impact_surface_drift',
  'new-entity-or-contract': 'speckit.new_entity_contract',
};

export const ACTION_OPTIONS: Record<DriftType, DriftAction[]> = {
  'missing-fr-coverage': ['spec-update-needed', 'revise', 'no-op'],
  'plan-only-phase': ['spec-update-needed', 'revise', 'no-op'],
  'out-of-scope-contradiction': ['revise', 'spec-update-needed', 'no-op'],
  'impact-mismatch': ['spec-update-needed', 'revise', 'no-op'],
  'new-entity-or-contract': ['spec-update-needed', 'revise', 'no-op'],
};

export function finding(
  severity: DriftSeverity,
  type: DriftType,
  specLine: number | undefined,
  planAnchor: string | undefined,
  summary: string,
  suggestedAction: DriftAction,
): CandidateFinding {
  return {
    severity,
    type,
    specAnchor: specLine ? `spec.md:${specLine}` : undefined,
    planAnchor,
    summary,
    suggestedAction,
    questionId: QUESTION_IDS[type],
    order: (specLine ?? 0) * 10000 + anchorOrder(planAnchor),
  };
}

function anchorOrder(anchor: string | undefined): number {
  const match = anchor?.match(/phase-(\d+)/);
  return match?.[1] ? Number.parseInt(match[1], 10) : 0;
}

export function numberFindings(candidates: CandidateFinding[]): SpecPlanDriftFinding[] {
  return candidates
    .sort((a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      TYPE_RANK[a.type] - TYPE_RANK[b.type] ||
      a.order - b.order)
    .map((candidate, index) => {
      const { order: _order, ...rest } = candidate;
      return { ...rest, id: `D${index + 1}` as `D${number}` };
    });
}

export function countByType(findings: SpecPlanDriftFinding[]): Record<DriftType, number> {
  const counts: Record<DriftType, number> = {
    'missing-fr-coverage': 0,
    'plan-only-phase': 0,
    'out-of-scope-contradiction': 0,
    'impact-mismatch': 0,
    'new-entity-or-contract': 0,
  };
  for (const result of findings) counts[result.type] += 1;
  return counts;
}

export function buildQuestionGroups(findings: SpecPlanDriftFinding[]): SpecPlanDriftResult['questionGroups'] {
  const groups = new Map<string, SpecPlanDriftFinding[]>();
  for (const result of findings) {
    groups.set(result.questionId, [...(groups.get(result.questionId) ?? []), result]);
  }
  return Array.from(groups.entries()).map(([questionId, groupFindings]) => ({
    questionId,
    findingIds: groupFindings.map((result) => result.id),
    actionOptions: ACTION_OPTIONS[groupFindings[0]!.type],
  }));
}

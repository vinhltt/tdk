// Token estimator: chars/4 heuristic. Hint, not a hard gate (per plan decision #6).

export function estimateTokens(body: string): number {
  return Math.ceil(body.length / 4);
}

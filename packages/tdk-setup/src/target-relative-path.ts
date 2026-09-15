import * as path from 'node:path';

export function normalizeTargetRelativePath(targetRelativePath: string): string {
  return path.posix.normalize(targetRelativePath.replace(/\\/g, '/'));
}

const CLAUDE_TARGET_ROOTS = ['.claude'] as const;
const CODEX_TARGET_ROOTS = ['.codex', '.agents/skills'] as const;
const OMP_TARGET_ROOTS = ['.omp'] as const;
const HARNESS_TARGET_ROOTS = [...CLAUDE_TARGET_ROOTS, ...CODEX_TARGET_ROOTS, ...OMP_TARGET_ROOTS];

function assertSafeTargetRelativePath(
  targetRelativePath: string,
  label: string,
  allowedRoots: readonly string[],
): string {
  const normalized = normalizeTargetRelativePath(targetRelativePath);
  if (!allowedRoots.some((root) => normalized.startsWith(`${root}/`))) {
    throw new Error(`Unsafe ${label}: ${targetRelativePath}`);
  }
  return normalized;
}

export function assertSafeClaudeTargetRelativePath(targetRelativePath: string, label: string): string {
  return assertSafeTargetRelativePath(targetRelativePath, label, CLAUDE_TARGET_ROOTS);
}

export function assertSafeHarnessTargetRelativePath(targetRelativePath: string, label: string): string {
  return assertSafeTargetRelativePath(targetRelativePath, label, HARNESS_TARGET_ROOTS);
}

export function assertSafeCodexTargetRelativePath(targetRelativePath: string, label: string): string {
  return assertSafeTargetRelativePath(targetRelativePath, label, CODEX_TARGET_ROOTS);
}

export function assertSafeOmpTargetRelativePath(targetRelativePath: string, label: string): string {
  return assertSafeTargetRelativePath(targetRelativePath, label, OMP_TARGET_ROOTS);
}

export function posixTargetPath(...segments: string[]): string {
  return path.posix.join(...segments.map((segment) => segment.replace(/\\/g, '/')));
}

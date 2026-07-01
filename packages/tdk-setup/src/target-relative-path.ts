import * as path from 'node:path';

export function normalizeTargetRelativePath(targetRelativePath: string): string {
  return path.posix.normalize(targetRelativePath.replace(/\\/g, '/'));
}

export function assertSafeClaudeTargetRelativePath(targetRelativePath: string, label: string): string {
  const normalized = normalizeTargetRelativePath(targetRelativePath);
  if (
    normalized === '.claude' ||
    !normalized.startsWith('.claude/') ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Unsafe ${label}: ${targetRelativePath}`);
  }
  return normalized;
}

export function assertSafeHarnessTargetRelativePath(targetRelativePath: string, label: string): string {
  const normalized = normalizeTargetRelativePath(targetRelativePath);
  const allowed =
    normalized.startsWith('.claude/') ||
    normalized.startsWith('.codex/') ||
    normalized.startsWith('.agents/skills/');
  if (
    !allowed ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Unsafe ${label}: ${targetRelativePath}`);
  }
  return normalized;
}

export function assertSafeCodexTargetRelativePath(targetRelativePath: string, label: string): string {
  const normalized = normalizeTargetRelativePath(targetRelativePath);
  const allowed =
    normalized.startsWith('.codex/') ||
    normalized.startsWith('.agents/skills/');
  if (
    !allowed ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Unsafe ${label}: ${targetRelativePath}`);
  }
  return normalized;
}

export function posixTargetPath(...segments: string[]): string {
  return path.posix.join(...segments.map((segment) => segment.replace(/\\/g, '/')));
}

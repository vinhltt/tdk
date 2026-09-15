import * as path from 'node:path';
import type { ConvertPart } from './convert-parts';
import { posixTargetPath } from './target-relative-path';

const OMP_ROOT_BY_PART: Record<ConvertPart, string> = {
  agents: '.omp/agents',
  rules: '.omp/rules',
  settings: '.omp',
  hooks: '.omp/hooks/pre',
  skills: '.omp/skills',
  context: '.omp',
};

export function ompTargetRelativePath(part: ConvertPart, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  if (
    normalized.length === 0 ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Unsafe OMP ${part} target path: ${relativePath}`);
  }
  return posixTargetPath(OMP_ROOT_BY_PART[part], normalized);
}

export function ompSkillRoot(name: string): string {
  return ompTargetRelativePath('skills', name);
}

export function ompSkillTarget(name: string, skillRelativePath: string): string {
  return posixTargetPath(ompSkillRoot(name), skillRelativePath);
}

export function isOmpInternalSkillEntrypoint(name: string, skillRelativePath: string): boolean {
  return name.startsWith('_') && skillRelativePath.replace(/\\/g, '/') === 'SKILL.md';
}

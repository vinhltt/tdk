import * as path from 'node:path';
import { validateHarnessTargetPath } from './target-path-safety';

const PROTECTED_ROOTS = [
  path.join('.', 'git'),
  path.join('.specify', 'plugins'),
  path.join('.specify', 'scripts'),
  path.join('.specify', 'templates'),
  path.join('.specify', 'docs'),
  'node_modules',
];

const PROTECTED_FILES = new Set([
  'package.json',
  'package-lock.json',
  'bun.lockb',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertRelativePath(value: string, label: string): void {
  if (
    value.trim() === '' ||
    path.isAbsolute(value) ||
    value.includes('\\') ||
    value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function assertNotProtected(relativePath: string, label: string): void {
  const normalized = path.normalize(relativePath);
  if (PROTECTED_FILES.has(normalized)) throw new Error(`${label} targets protected file: ${relativePath}`);
  for (const protectedRoot of PROTECTED_ROOTS) {
    if (isInside(protectedRoot, normalized)) {
      throw new Error(`${label} targets protected path: ${relativePath}`);
    }
  }
}

export function validateContainedNoFollowPath(root: string, relativePath: string, label: string): string {
  assertRelativePath(relativePath, label);
  assertNotProtected(relativePath, label);
  return validateHarnessTargetPath({
    consumerRoot: root,
    targetPath: path.resolve(root, relativePath),
    allowedRoots: [root],
    label,
  });
}

export function validateSafeSegment(input: string, label: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input) || input.startsWith('-') || input.includes('..')) {
    throw new Error(`Unsafe ${label}: ${input}`);
  }
  return input;
}

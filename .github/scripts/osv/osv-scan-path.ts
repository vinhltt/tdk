import { posix, win32 } from 'node:path';

export function normalizeLockfile(sourcePath: string, scanRoot: string): string {
  if (!scanRoot.trim() || /[\x00-\x1f\x7f]/.test(scanRoot + sourcePath)) {
    throw new Error('Invalid OSV scan path or empty scan root');
  }
  const input = sourcePath.replaceAll('\\', '/');
  if (input.split('/').includes('..') || /^[A-Za-z]:(?!\/)/.test(input)) {
    throw new Error(`OSV source path contains traversal: ${sourcePath}`);
  }
  const paths = /^[A-Za-z]:[\\/]/.test(scanRoot) || scanRoot.startsWith('\\\\') ? win32 : posix;
  if (paths === posix && (/^[A-Za-z]:/.test(input) || input.startsWith('//'))) {
    throw new Error(`OSV source path is outside scan root: ${sourcePath}`);
  }
  const root = paths.resolve(scanRoot);
  const absolute = paths.isAbsolute(input) ? paths.resolve(input) : paths.resolve(root, input);
  const relative = paths.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) {
    throw new Error(`OSV source path is outside scan root: ${sourcePath}`);
  }
  return relative.replaceAll('\\', '/');
}

import { relative, isAbsolute } from 'node:path';

/** True when `descendant` is `ancestor` itself or nested inside it. Both must already be real paths. */
export function isWithin(ancestor: string, descendant: string): boolean {
  if (ancestor === descendant) return true;
  const rel = relative(ancestor, descendant);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

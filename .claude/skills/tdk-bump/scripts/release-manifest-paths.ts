import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { ReleaseManifestError } from "./release-manifest-types.ts";

export function assertReleaseManifestRelativePath(path: string): string {
  const segments = path.split("/");
  const hasUnsafeSegment = segments.some((segment) => !segment || segment === "." || segment === "..");
  if (
    !path ||
    path === "." ||
    path.includes("\\") ||
    isAbsolute(path) ||
    /^[A-Za-z]:\//.test(path) ||
    hasUnsafeSegment
  ) {
    throw new ReleaseManifestError(`invalid release manifest path: ${JSON.stringify(path)}`);
  }
  return path;
}

export function resolveReleaseManifestTarget(root: string, path: string): string {
  const safePath = assertReleaseManifestRelativePath(path);
  const canonicalRoot = realpathSync(root);
  const target = resolve(canonicalRoot, safePath);
  const relativeTarget = relative(canonicalRoot, target);
  if (
    !relativeTarget ||
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${sep}`) ||
    isAbsolute(relativeTarget)
  ) {
    throw new ReleaseManifestError(`release manifest path escapes target root: ${JSON.stringify(path)}`);
  }

  let current = canonicalRoot;
  for (const segment of safePath.split("/")) {
    current = join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new ReleaseManifestError(`release manifest path has symlink component: ${JSON.stringify(path)}`);
    }
  }
  return target;
}

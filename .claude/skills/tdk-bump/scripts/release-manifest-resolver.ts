import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  RELEASE_MANIFEST_RELATIVE_PATH,
  type DistributeConfig,
  ReleaseManifestError,
} from "./release-manifest-types.ts";

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function stripTrailingSlash(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function toPosixRelative(projectRoot: string, absolutePath: string): string {
  return normalizeRelativePath(relative(projectRoot, absolutePath));
}

function assertStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new ReleaseManifestError(`Invalid distribute.json ${key}: expected non-empty string array`);
  }
  return [...value];
}

export async function readDistributeConfig(projectRoot: string): Promise<DistributeConfig> {
  const configPath = join(projectRoot, "distribute.json");
  if (!existsSync(configPath)) {
    throw new ReleaseManifestError(`distribute.json not found: ${configPath}`);
  }
  const data = await Bun.file(configPath).json();
  return {
    ship: assertStringArray(data?.ship, "ship"),
    doNotShip: assertStringArray(data?.doNotShip, "doNotShip"),
  };
}

function createReleaseExcluder(patterns: readonly string[]): (normalizedPath: string) => boolean {
  const rules = patterns.map((rawPattern) => {
    const pattern = normalizeRelativePath(rawPattern);
    const directory = pattern.endsWith("/");
    const path = stripTrailingSlash(pattern);
    return {
      path,
      prefix: directory ? pattern : undefined,
      glob: /[*?{}\[\]]/.test(pattern) ? new Bun.Glob(directory ? `${path}{,/**}` : path) : undefined,
    };
  });
  return (normalized) => {
    if (normalized === RELEASE_MANIFEST_RELATIVE_PATH) return true;
    return rules.some((rule) => rule.glob
      ? rule.glob.match(normalized)
      : normalized === rule.path || (rule.prefix !== undefined && normalized.startsWith(rule.prefix)));
  };
}

export function isExcludedByReleaseRules(relativePath: string, patterns: readonly string[]): boolean {
  return createReleaseExcluder(patterns)(normalizeRelativePath(relativePath));
}

function collectDirectoryFiles(projectRoot: string, dirPath: string, isExcluded: (path: string) => boolean): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = join(dirPath, entry.name);
    const relativePath = toPosixRelative(projectRoot, absolutePath);
    if (isExcluded(relativePath)) continue;
    if (entry.isDirectory()) {
      files.push(...collectDirectoryFiles(projectRoot, absolutePath, isExcluded));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

export async function resolveShippableFiles(
  projectRoot: string,
  config?: DistributeConfig,
): Promise<string[]> {
  const resolvedConfig = config ?? (await readDistributeConfig(projectRoot));
  const isExcluded = createReleaseExcluder(resolvedConfig.doNotShip);
  const files = new Set<string>();

  for (const rawPattern of resolvedConfig.ship) {
    const pattern = normalizeRelativePath(rawPattern);
    if (isExcluded(pattern)) continue;
    const target = join(projectRoot, stripTrailingSlash(pattern));
    if (!existsSync(target)) continue;

    const stat = statSync(target);
    if (stat.isFile()) {
      files.add(pattern);
    } else if (stat.isDirectory()) {
      for (const relativePath of collectDirectoryFiles(projectRoot, target, isExcluded)) {
        files.add(relativePath);
      }
    }
  }

  return [...files].sort();
}

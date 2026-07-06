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

export function isExcludedByReleaseRules(relativePath: string, patterns: readonly string[]): boolean {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized === RELEASE_MANIFEST_RELATIVE_PATH) return true;

  for (const rawPattern of patterns) {
    const pattern = normalizeRelativePath(rawPattern);
    if (pattern.endsWith("/")) {
      const dir = stripTrailingSlash(pattern);
      if (normalized === dir || normalized.startsWith(`${dir}/`)) return true;
    } else if (normalized === pattern) {
      return true;
    }
  }
  return false;
}

function collectDirectoryFiles(projectRoot: string, dirPath: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectDirectoryFiles(projectRoot, absolutePath));
    } else if (entry.isFile()) {
      files.push(toPosixRelative(projectRoot, absolutePath));
    }
  }
  return files;
}

export async function resolveShippableFiles(
  projectRoot: string,
  config?: DistributeConfig,
): Promise<string[]> {
  const resolvedConfig = config ?? (await readDistributeConfig(projectRoot));
  const files = new Set<string>();

  for (const rawPattern of resolvedConfig.ship) {
    const pattern = normalizeRelativePath(rawPattern);
    const target = join(projectRoot, stripTrailingSlash(pattern));
    if (!existsSync(target)) continue;

    const stat = statSync(target);
    if (stat.isFile()) {
      if (!isExcludedByReleaseRules(pattern, resolvedConfig.doNotShip)) files.add(pattern);
    } else if (stat.isDirectory()) {
      for (const relativePath of collectDirectoryFiles(projectRoot, target)) {
        if (!isExcludedByReleaseRules(relativePath, resolvedConfig.doNotShip)) files.add(relativePath);
      }
    }
  }

  return [...files].sort();
}

#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { canonicalReleaseFileMode } from "./canonical-release-file-mode.ts";
import {
  RELEASE_MANIFEST_ALGORITHM,
  RELEASE_MANIFEST_RELATIVE_PATH,
  RELEASE_MANIFEST_SCHEMA_VERSION,
  ReleaseManifestError,
  type ManifestDiffEntry,
  type ReleaseManifest,
  type ReleaseManifestFileEntry,
} from "./release-manifest-types.ts";
import {
  assertReleaseManifestRelativePath,
  resolveReleaseManifestTarget,
} from "./release-manifest-paths.ts";
import {
  assertReleaseManifest,
  assertReleaseManifestSha256,
  releaseManifestPathInventory,
} from "./release-manifest-validation.ts";

function sameFileEntry(source: ReleaseManifestFileEntry, target: ReleaseManifestFileEntry): boolean {
  return source.sha256 === target.sha256 && source.size === target.size && source.mode === target.mode;
}

export function assertCompatibleManifests(source: ReleaseManifest, target: ReleaseManifest): void {
  const sourceKey = `${source.schemaVersion}/${source.algorithm}`;
  const targetKey = `${target.schemaVersion}/${target.algorithm}`;
  if (
    source.schemaVersion !== RELEASE_MANIFEST_SCHEMA_VERSION ||
    target.schemaVersion !== RELEASE_MANIFEST_SCHEMA_VERSION ||
    source.algorithm !== RELEASE_MANIFEST_ALGORITHM ||
    target.algorithm !== RELEASE_MANIFEST_ALGORITHM ||
    sourceKey !== targetKey
  ) {
    throw new ReleaseManifestError(
      `release manifest schema/algorithm mismatch: source=${sourceKey} target=${targetKey}`,
    );
  }
}

export function diffReleaseManifests(
  source: ReleaseManifest,
  target: ReleaseManifest,
): ManifestDiffEntry[] {
  assertCompatibleManifests(source, target);
  for (const path of Object.keys(source.files)) assertReleaseManifestRelativePath(path);
  for (const path of Object.keys(target.files)) assertReleaseManifestRelativePath(path);
  const paths = new Set([...Object.keys(source.files), ...Object.keys(target.files)]);
  const entries: ManifestDiffEntry[] = [];

  for (const path of [...paths].sort()) {
    const sourceEntry = source.files[path];
    const targetEntry = target.files[path];
    if (sourceEntry && !targetEntry) entries.push({ action: "new", path });
    else if (!sourceEntry && targetEntry) {
      entries.push({ action: "deleted", path, expectedTargetSha256: targetEntry.sha256 });
    }
    else if (sourceEntry && targetEntry && sameFileEntry(sourceEntry, targetEntry)) {
      entries.push({ action: "unchanged", path, expectedTargetSha256: targetEntry.sha256 });
    } else {
      entries.push({ action: "updated", path, expectedTargetSha256: targetEntry?.sha256 });
    }
  }

  return entries;
}

export function diffForceTargetInventory(
  source: ReleaseManifest,
  targetPaths: readonly string[],
): ManifestDiffEntry[] {
  assertCompatibleManifests(source, source);
  for (const path of Object.keys(source.files)) assertReleaseManifestRelativePath(path);
  for (const path of targetPaths) assertReleaseManifestRelativePath(path);

  const sourcePaths = new Set(Object.keys(source.files));
  const targetPathSet = new Set(targetPaths);
  const paths = new Set([...sourcePaths, ...targetPathSet]);

  return [...paths].sort().map((path) => {
    if (!sourcePaths.has(path)) return { action: "deleted", path };
    if (!targetPathSet.has(path)) return { action: "new", path };
    return { action: "updated", path };
  });
}

export function formatManifestDiffTsv(entries: readonly ManifestDiffEntry[]): string {
  return entries.map((entry) => [entry.action, entry.path, entry.expectedTargetSha256]
    .filter((value) => value !== undefined)
    .join("\t")).join("\n") + (entries.length ? "\n" : "");
}

export function formatManifestDiffNul(entries: readonly ManifestDiffEntry[]): string {
  return entries.map((entry) => {
    assertReleaseManifestRelativePath(entry.path);
    if (entry.expectedTargetSha256 !== undefined) {
      assertReleaseManifestSha256(entry.expectedTargetSha256, entry.path);
    }
    return [entry.action, entry.path, entry.expectedTargetSha256 ?? ""].join("\0");
  }).join("\0") + (entries.length ? "\0" : "");
}

export function materializeTargetManifest(
  source: ReleaseManifest,
  targetRoot: string,
): ReleaseManifest {
  assertCompatibleManifests(source, source);
  const files: ReleaseManifest["files"] = {};
  for (const relativePath of Object.keys(source.files).sort()) {
    const target = resolveReleaseManifestTarget(targetRoot, relativePath);
    const stat = existsSync(target) ? lstatSync(target) : undefined;
    if (!stat?.isFile()) {
      throw new ReleaseManifestError(`target payload is not a regular file: ${relativePath}`);
    }
    files[relativePath] = {
      sha256: createHash("sha256").update(readFileSync(target)).digest("hex"),
      size: stat.size,
      mode: canonicalReleaseFileMode(stat.mode),
    };
  }
  return { ...source, files };
}

function readManifestValue(path: string, label: string, expectedSha256?: string): unknown {
  const bytes = readFileSync(path);
  if (expectedSha256 !== undefined) {
    assertReleaseManifestSha256(expectedSha256, `${label} release manifest snapshot`);
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== expectedSha256) {
      throw new ReleaseManifestError(`${label} release manifest changed after snapshot`);
    }
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ReleaseManifestError(`invalid ${label} release manifest JSON`);
  }
}

async function readManifest(
  root: string,
  label: string,
  expectedSha256?: string,
): Promise<ReleaseManifest> {
  const path = join(root, RELEASE_MANIFEST_RELATIVE_PATH);
  if (!existsSync(path)) throw new ReleaseManifestError(`${label} release manifest not found: ${path}`);
  const manifest = readManifestValue(path, label, expectedSha256);
  assertReleaseManifest(manifest, label);
  for (const relativePath of Object.keys(manifest.files)) {
    resolveReleaseManifestTarget(root, relativePath);
  }
  return manifest;
}

async function readSourceManifest(root: string): Promise<ReleaseManifest> {
  return readManifest(root, "source");
}

async function readManifestPathInventory(
  root: string,
  label: string,
  expectedSha256?: string,
  expectAbsent = false,
): Promise<string[]> {
  const path = join(root, RELEASE_MANIFEST_RELATIVE_PATH);
  if (expectAbsent) {
    if (existsSync(path)) {
      throw new ReleaseManifestError(`${label} release manifest appeared after snapshot`);
    }
    return [];
  }
  if (!existsSync(path)) {
    if (expectedSha256 !== undefined) {
      throw new ReleaseManifestError(`${label} release manifest changed after snapshot`);
    }
    return [];
  }
  const manifest = readManifestValue(path, label, expectedSha256);
  const paths = releaseManifestPathInventory(manifest, label);
  for (const relativePath of paths) resolveReleaseManifestTarget(root, relativePath);
  return paths;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "source-root": { type: "string" },
      "target-root": { type: "string" },
      "materialize-target-root": { type: "string" },
      "validate-root": { type: "string" },
      "force-target-inventory": { type: "boolean" },
      "expected-target-manifest-sha": { type: "string" },
      "expect-target-manifest-absent": { type: "boolean" },
      output: { type: "string" },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values["validate-root"]) {
    const manifest = await readSourceManifest(values["validate-root"]);
    assertCompatibleManifests(manifest, manifest);
    return 0;
  }
  if (!values["source-root"]) throw new ReleaseManifestError("--source-root is required");
  if (values["materialize-target-root"]) {
    const source = await readSourceManifest(values["source-root"]);
    console.log(JSON.stringify(materializeTargetManifest(source, values["materialize-target-root"]), null, 2));
    return 0;
  }
  if (!values["target-root"]) throw new ReleaseManifestError("--target-root is required");
  const output = values.output ?? "tsv";
  if (output !== "tsv" && output !== "json" && output !== "nul") {
    throw new ReleaseManifestError(`Unsupported --output: ${output}`);
  }

  if (values["expected-target-manifest-sha"] && values["expect-target-manifest-absent"]) {
    throw new ReleaseManifestError("target manifest cannot be both snapshotted and absent");
  }
  const source = await readSourceManifest(values["source-root"]);
  const entries = values["force-target-inventory"]
    ? diffForceTargetInventory(source, await readManifestPathInventory(
      values["target-root"],
      "target",
      values["expected-target-manifest-sha"],
      values["expect-target-manifest-absent"],
    ))
    : diffReleaseManifests(source, await readManifest(
      values["target-root"],
      "target",
      values["expected-target-manifest-sha"],
    ));
  if (output === "nul") process.stdout.write(formatManifestDiffNul(entries));
  else console.log(output === "json" ? JSON.stringify(entries) : formatManifestDiffTsv(entries).trimEnd());
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

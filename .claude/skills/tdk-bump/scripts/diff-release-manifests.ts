#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

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

export function formatManifestDiffTsv(entries: readonly ManifestDiffEntry[]): string {
  return entries.map((entry) => [entry.action, entry.path, entry.expectedTargetSha256]
    .filter((value) => value !== undefined)
    .join("\t")).join("\n") + (entries.length ? "\n" : "");
}

export function materializeTargetManifest(
  source: ReleaseManifest,
  targetRoot: string,
): ReleaseManifest {
  assertCompatibleManifests(source, source);
  const files: ReleaseManifest["files"] = {};
  for (const relativePath of Object.keys(source.files).sort()) {
    const target = resolveReleaseManifestTarget(targetRoot, relativePath);
    if (!existsSync(target) || !lstatSync(target).isFile()) {
      throw new ReleaseManifestError(`target payload is not a regular file: ${relativePath}`);
    }
    const stat = statSync(target);
    files[relativePath] = {
      sha256: createHash("sha256").update(readFileSync(target)).digest("hex"),
      size: stat.size,
      mode: (stat.mode & 0o777).toString(8).padStart(4, "0"),
    };
  }
  return { ...source, files };
}

async function readManifest(root: string, label: string): Promise<ReleaseManifest> {
  const path = join(root, RELEASE_MANIFEST_RELATIVE_PATH);
  if (!existsSync(path)) throw new ReleaseManifestError(`${label} release manifest not found: ${path}`);
  const manifest = await Bun.file(path).json() as ReleaseManifest;
  for (const relativePath of Object.keys(manifest.files)) {
    resolveReleaseManifestTarget(root, relativePath);
  }
  return manifest;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "source-root": { type: "string" },
      "target-root": { type: "string" },
      "materialize-target-root": { type: "string" },
      "validate-root": { type: "string" },
      output: { type: "string" },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values["validate-root"]) {
    await readManifest(values["validate-root"], "release");
    return 0;
  }
  if (!values["source-root"]) throw new ReleaseManifestError("--source-root is required");
  if (values["materialize-target-root"]) {
    const source = await readManifest(values["source-root"], "source");
    console.log(JSON.stringify(materializeTargetManifest(source, values["materialize-target-root"]), null, 2));
    return 0;
  }
  if (!values["target-root"]) throw new ReleaseManifestError("--target-root is required");
  const output = values.output ?? "tsv";
  if (output !== "tsv" && output !== "json") throw new ReleaseManifestError(`Unsupported --output: ${output}`);

  const source = await readManifest(values["source-root"], "source");
  const target = await readManifest(values["target-root"], "target");
  const entries = diffReleaseManifests(source, target);
  console.log(output === "json" ? JSON.stringify(entries) : formatManifestDiffTsv(entries).trimEnd());
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

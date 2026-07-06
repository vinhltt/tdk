#!/usr/bin/env bun
import { existsSync } from "node:fs";
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
  const paths = new Set([...Object.keys(source.files), ...Object.keys(target.files)]);
  const entries: ManifestDiffEntry[] = [];

  for (const path of [...paths].sort()) {
    const sourceEntry = source.files[path];
    const targetEntry = target.files[path];
    if (sourceEntry && !targetEntry) entries.push({ action: "new", path });
    else if (!sourceEntry && targetEntry) entries.push({ action: "deleted", path });
    else if (sourceEntry && targetEntry && sameFileEntry(sourceEntry, targetEntry)) {
      entries.push({ action: "unchanged", path });
    } else {
      entries.push({ action: "updated", path });
    }
  }

  return entries;
}

export function formatManifestDiffTsv(entries: readonly ManifestDiffEntry[]): string {
  return entries.map((entry) => `${entry.action}\t${entry.path}`).join("\n") + (entries.length ? "\n" : "");
}

async function readManifest(root: string, label: string): Promise<ReleaseManifest> {
  const path = join(root, RELEASE_MANIFEST_RELATIVE_PATH);
  if (!existsSync(path)) throw new ReleaseManifestError(`${label} release manifest not found: ${path}`);
  return await Bun.file(path).json();
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "source-root": { type: "string" },
      "target-root": { type: "string" },
      output: { type: "string" },
    },
    allowPositionals: false,
    strict: true,
  });

  if (!values["source-root"]) throw new ReleaseManifestError("--source-root is required");
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

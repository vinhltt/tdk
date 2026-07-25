#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { canonicalReleaseFileMode } from "./canonical-release-file-mode.ts";
import { readDistributeConfig, resolveShippableFiles } from "./release-manifest-resolver.ts";
import {
  RELEASE_MANIFEST_ALGORITHM,
  RELEASE_MANIFEST_RELATIVE_PATH,
  RELEASE_MANIFEST_SCHEMA_VERSION,
  ReleaseManifestError,
  type ReleaseManifest,
  type ReleaseManifestFileEntry,
} from "./release-manifest-types.ts";

interface BuildOptions {
  now?: string;
  previousManifest?: ReleaseManifest;
}

function fileEntry(projectRoot: string, relativePath: string): ReleaseManifestFileEntry {
  const absolutePath = join(projectRoot, relativePath);
  const stat = statSync(absolutePath);
  return {
    sha256: createHash("sha256").update(readFileSync(absolutePath)).digest("hex"),
    size: stat.size,
    mode: canonicalReleaseFileMode(stat.mode),
  };
}

function semanticJson(manifest: ReleaseManifest): string {
  const { generatedAt: _generatedAt, ...semantic } = manifest;
  return JSON.stringify(semantic);
}

function preserveGeneratedAt(next: ReleaseManifest, previous?: ReleaseManifest): ReleaseManifest {
  if (!previous) return next;
  return semanticJson(next) === semanticJson({ ...previous, generatedAt: next.generatedAt })
    ? { ...next, generatedAt: previous.generatedAt }
    : next;
}

export async function buildReleaseManifest(
  projectRoot: string,
  options: BuildOptions = {},
): Promise<ReleaseManifest> {
  const config = await readDistributeConfig(projectRoot);
  const filePaths = await resolveShippableFiles(projectRoot, config);
  const files: ReleaseManifest["files"] = {};
  for (const relativePath of filePaths) files[relativePath] = fileEntry(projectRoot, relativePath);

  const next: ReleaseManifest = {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    algorithm: RELEASE_MANIFEST_ALGORITHM,
    generatedAt: options.now ?? new Date().toISOString(),
    rules: {
      source: "distribute.json",
      ship: [...config.ship],
      doNotShip: [...config.doNotShip],
    },
    files,
  };

  return preserveGeneratedAt(next, options.previousManifest);
}

function manifestPath(projectRoot: string): string {
  return join(projectRoot, RELEASE_MANIFEST_RELATIVE_PATH);
}

async function readExistingManifest(projectRoot: string): Promise<ReleaseManifest | undefined> {
  const path = manifestPath(projectRoot);
  return existsSync(path) ? await Bun.file(path).json() : undefined;
}

function stableJson(manifest: ReleaseManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "project-root": { type: "string" },
      write: { type: "boolean" },
      check: { type: "boolean" },
      output: { type: "string" },
    },
    allowPositionals: false,
    strict: true,
  });

  const projectRoot = values["project-root"] ?? process.cwd();
  const output = values.output ?? "json";
  if (values.write && values.check) throw new ReleaseManifestError("Use --write or --check, not both");
  if (output !== "json") throw new ReleaseManifestError(`Unsupported --output: ${output}`);

  const existing = await readExistingManifest(projectRoot);
  const next = await buildReleaseManifest(projectRoot, { previousManifest: existing });
  const nextJson = stableJson(next);
  const path = manifestPath(projectRoot);

  if (values.check) {
    if (!existing) throw new ReleaseManifestError(`release manifest not found: ${path}`);
    const currentJson = readFileSync(path, "utf8");
    if (currentJson !== nextJson) {
      console.error(`release manifest is out of date: ${path}`);
      console.log(JSON.stringify({ ok: false, path, status: "out-of-date" }));
      return 1;
    }
    console.log(JSON.stringify({ ok: true, path, status: "current" }));
    return 0;
  }

  if (values.write) {
    const changed = !existing || readFileSync(path, "utf8") !== nextJson;
    if (changed) writeFileSync(path, nextJson);
    console.log(JSON.stringify({ ok: true, path, status: changed ? "written" : "unchanged" }));
    return 0;
  }

  console.log(nextJson.trimEnd());
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

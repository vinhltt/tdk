import { assertReleaseManifestRelativePath } from "./release-manifest-paths.ts";
import {
  ReleaseManifestError,
  type ReleaseManifest,
  type ReleaseManifestFileEntry,
} from "./release-manifest-types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.includes("\0"))) {
    throw new ReleaseManifestError(`invalid release manifest ${field}`);
  }
}

export function assertReleaseManifestSha256(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new ReleaseManifestError(`invalid release manifest SHA-256: ${field}`);
  }
}

function assertReleaseManifestFileEntry(
  value: unknown,
  relativePath: string,
): asserts value is ReleaseManifestFileEntry {
  if (!isRecord(value)) {
    throw new ReleaseManifestError(`invalid release manifest file entry: ${JSON.stringify(relativePath)}`);
  }
  assertReleaseManifestSha256(value.sha256, relativePath);
  if (!Number.isSafeInteger(value.size) || (value.size as number) < 0) {
    throw new ReleaseManifestError(`invalid release manifest file size: ${JSON.stringify(relativePath)}`);
  }
  if (typeof value.mode !== "string" || !/^0[0-7]{3}$/.test(value.mode)) {
    throw new ReleaseManifestError(`invalid release manifest file mode: ${JSON.stringify(relativePath)}`);
  }
}

export function assertReleaseManifest(value: unknown, label: string): asserts value is ReleaseManifest {
  if (!isRecord(value)) throw new ReleaseManifestError(`invalid ${label} release manifest root`);
  if (!Number.isSafeInteger(value.schemaVersion)) {
    throw new ReleaseManifestError(`invalid ${label} release manifest schemaVersion`);
  }
  if (typeof value.algorithm !== "string" || typeof value.generatedAt !== "string") {
    throw new ReleaseManifestError(`invalid ${label} release manifest metadata`);
  }
  if (!isRecord(value.rules) || value.rules.source !== "distribute.json") {
    throw new ReleaseManifestError(`invalid ${label} release manifest rules`);
  }
  assertStringArray(value.rules.ship, "rules.ship");
  assertStringArray(value.rules.doNotShip, "rules.doNotShip");
  if (!isRecord(value.files)) throw new ReleaseManifestError(`invalid ${label} release manifest files`);

  for (const [relativePath, entry] of Object.entries(value.files)) {
    assertReleaseManifestRelativePath(relativePath);
    assertReleaseManifestFileEntry(entry, relativePath);
  }
}

export function releaseManifestPathInventory(value: unknown, label: string): string[] {
  if (!isRecord(value)) throw new ReleaseManifestError(`invalid ${label} release manifest root`);
  if (!isRecord(value.files)) throw new ReleaseManifestError(`invalid ${label} release manifest files`);

  const paths = Object.keys(value.files);
  for (const relativePath of paths) assertReleaseManifestRelativePath(relativePath);
  return paths;
}

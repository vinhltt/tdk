import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const TDK_ROOT = resolve(import.meta.dir, "../../../..");
const MANIFEST_PATH = join(TDK_ROOT, ".specify", "release-manifest.json");
const DISTRIBUTE_JSON_PATH = join(TDK_ROOT, "distribute.json");

type FileEntry = { sha256: string; size: number; mode: string };
type ReleaseManifest = {
  rules: { source: string; ship: string[]; doNotShip: string[] };
  files: Record<string, FileEntry>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("shipped release manifest stays in sync with the source tree", () => {
  test("rules mirror distribute.json ship/doNotShip", () => {
    const manifest = readJson<ReleaseManifest>(MANIFEST_PATH);
    const distributeJson = readJson<{ ship: string[]; doNotShip: string[] }>(DISTRIBUTE_JSON_PATH);

    expect(manifest.rules.source).toBe("distribute.json");
    expect(manifest.rules.ship).toEqual(distributeJson.ship);
    expect(manifest.rules.doNotShip).toEqual(distributeJson.doNotShip);
  });

  // Iterates manifest entries, never the on-disk tree: files excluded from the payload stay in
  // the source repo on purpose, so walking the tree would fail on files the manifest must ignore.
  test("every entry's recorded sha256 and size match the file on disk", () => {
    const manifest = readJson<ReleaseManifest>(MANIFEST_PATH);
    const entries = Object.entries(manifest.files);
    expect(entries.length).toBeGreaterThan(0);

    const missing: string[] = [];
    const mismatched: string[] = [];

    for (const [relativePath, recorded] of entries) {
      const absolute = join(TDK_ROOT, relativePath);
      if (!existsSync(absolute) || !lstatSync(absolute).isFile()) {
        missing.push(relativePath);
        continue;
      }
      const bytes = readFileSync(absolute);
      const actualSha = createHash("sha256").update(bytes).digest("hex");
      if (actualSha !== recorded.sha256 || bytes.byteLength !== recorded.size) {
        mismatched.push(relativePath);
      }
    }

    expect({ missing, mismatched }).toEqual({ missing: [], mismatched: [] });
  });

  test("no entry falls under a doNotShip prefix", () => {
    const manifest = readJson<ReleaseManifest>(MANIFEST_PATH);
    const offenders = Object.keys(manifest.files).filter((path) =>
      manifest.rules.doNotShip.some((rule) =>
        rule.endsWith("/") ? path.startsWith(rule) : path === rule
      )
    );

    expect(offenders).toEqual([]);
  });
});

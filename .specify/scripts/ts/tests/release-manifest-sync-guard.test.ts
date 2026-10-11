import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isExcludedByReleaseRules } from "../../../../.claude/skills/tdk-bump/scripts/release-manifest-resolver";

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

  // The resolver prunes while walking, so a rule is applied to every ancestor directory, not only to the file path.
  // Matching the file alone misses `**/tests{,/**}`-style globs at depth.
  function isShipExcluded(path: string, rules: readonly string[]): boolean {
    const parts = path.split("/");
    return parts.some((_, index) => isExcludedByReleaseRules(parts.slice(0, index + 1).join("/"), rules));
  }

  test("no entry falls under a doNotShip rule", () => {
    const manifest = readJson<ReleaseManifest>(MANIFEST_PATH);
    const offenders = Object.keys(manifest.files).filter((path) => isShipExcluded(path, manifest.rules.doNotShip));

    expect(offenders).toEqual([]);
  });

  // Runs against the live distribute.json, so it does not depend on the manifest being regenerated first.
  test("distribute.json excludes node_modules, tests and __tests__ at any depth and keeps lookalike names", () => {
    const { doNotShip } = readJson<{ doNotShip: string[] }>(DISTRIBUTE_JSON_PATH);

    for (const path of ["x/a/node_modules/y/z.js", "x/a/tests/b/c.md", "x/__tests__/d.cjs", "x/tests/top.md"]) {
      expect({ path, excluded: isShipExcluded(path, doNotShip) }).toEqual({ path, excluded: true });
    }
    for (const path of ["x/tests-helper.cjs", "x/latests/a.md", "x/a/keep.md"]) {
      expect({ path, excluded: isShipExcluded(path, doNotShip) }).toEqual({ path, excluded: false });
    }
  });
});

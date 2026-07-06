import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  diffReleaseManifests,
  formatManifestDiffTsv,
} from "../diff-release-manifests.ts";
import type { ReleaseManifest } from "../release-manifest-types.ts";

const DIFF_SCRIPT = resolve(import.meta.dir, "..", "diff-release-manifests.ts");

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "release-manifest-diff-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function manifest(files: ReleaseManifest["files"], overrides: Partial<ReleaseManifest> = {}): ReleaseManifest {
  return {
    schemaVersion: 1,
    algorithm: "sha256",
    generatedAt: "2026-07-05T00:00:00.000Z",
    rules: { source: "distribute.json", ship: [".specify/"], doNotShip: [] },
    files,
    ...overrides,
  };
}

function writeManifest(root: string, data: ReleaseManifest): void {
  const manifestPath = join(root, ".specify", "release-manifest.json");
  mkdirSync(join(manifestPath, ".."), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(data, null, 2));
}

describe("release manifest diff", () => {
  test("classifies new updated deleted and unchanged entries", () => {
    const source = manifest({
      "a.txt": { sha256: "a", size: 1, mode: "0644" },
      "b.txt": { sha256: "b2", size: 2, mode: "0644" },
      "c.txt": { sha256: "c", size: 3, mode: "0755" },
    });
    const target = manifest({
      "b.txt": { sha256: "b1", size: 2, mode: "0644" },
      "c.txt": { sha256: "c", size: 3, mode: "0755" },
      "d.txt": { sha256: "d", size: 4, mode: "0644" },
    });

    expect(diffReleaseManifests(source, target)).toEqual([
      { action: "new", path: "a.txt" },
      { action: "updated", path: "b.txt" },
      { action: "unchanged", path: "c.txt" },
      { action: "deleted", path: "d.txt" },
    ]);
  });

  test("formats stable TSV without a header", () => {
    expect(formatManifestDiffTsv([{ action: "new", path: ".specify/setup.sh" }])).toBe(
      "new\t.specify/setup.sh\n",
    );
  });

  test("schema or algorithm mismatch exits non-zero", async () => {
    const sourceRoot = join(tmp, "source");
    const targetRoot = join(tmp, "target");
    writeManifest(sourceRoot, manifest({}));
    writeManifest(targetRoot, manifest({}, { algorithm: "md5" }));

    const proc = Bun.spawn(["bun", DIFF_SCRIPT, "--source-root", sourceRoot, "--target-root", targetRoot], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    expect(proc.exitCode).not.toBe(0);
    expect(await new Response(proc.stderr).text()).toContain("schema/algorithm mismatch");
  });
});

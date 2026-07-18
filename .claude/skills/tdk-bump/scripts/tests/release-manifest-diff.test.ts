import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  diffReleaseManifests,
  formatManifestDiffTsv,
  materializeTargetManifest,
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
      { action: "updated", path: "b.txt", expectedTargetSha256: "b1" },
      { action: "unchanged", path: "c.txt", expectedTargetSha256: "c" },
      { action: "deleted", path: "d.txt", expectedTargetSha256: "d" },
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

  test("rejects unsafe keys in either manifest", () => {
    expect(() => diffReleaseManifests(
      manifest({ "../outside": { sha256: "source", size: 1, mode: "0644" } }),
      manifest({}),
    )).toThrow(/release manifest path/);
    expect(() => diffReleaseManifests(
      manifest({}),
      manifest({ "a\\b": { sha256: "target", size: 1, mode: "0644" } }),
    )).toThrow(/release manifest path/);
  });

  test("formats the prior target checksum for guarded mutations", () => {
    expect(formatManifestDiffTsv([
      { action: "updated", path: ".specify/setup.sh", expectedTargetSha256: "before" },
    ])).toBe("updated\t.specify/setup.sh\tbefore\n");
  });

  test("materializes checksums from rendered target bytes while retaining source keys", () => {
    const targetRoot = join(tmp, "target");
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "echo SAMPLE\n");
    const source = manifest({
      ".specify/setup.sh": { sha256: "source-bytes", size: 12, mode: "0644" },
    });

    const result = materializeTargetManifest(source, targetRoot);

    expect(result.files[".specify/setup.sh"]).toEqual({
      sha256: createHash("sha256").update("echo SAMPLE\n").digest("hex"),
      size: 12,
      mode: "0644",
    });
    expect(result.generatedAt).toBe(source.generatedAt);
  });
});

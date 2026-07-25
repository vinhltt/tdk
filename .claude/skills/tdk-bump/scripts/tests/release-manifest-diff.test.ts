import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  diffReleaseManifests,
  formatManifestDiffNul,
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

function writePayload(root: string, relativePath: string, content: string): ReleaseManifest["files"][string] {
  const path = join(root, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return {
    sha256: createHash("sha256").update(content).digest("hex"),
    size: Buffer.byteLength(content),
    mode: "0644",
  };
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

  test("treats a legacy mode-only difference as an update", () => {
    const source = manifest({ "a.txt": { sha256: "same", size: 1, mode: "0644" } });
    const target = manifest({ "a.txt": { sha256: "same", size: 1, mode: "0775" } });

    expect(diffReleaseManifests(source, target)).toEqual([
      { action: "updated", path: "a.txt", expectedTargetSha256: "same" },
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

  test("force target inventory accepts legacy metadata without trusting entry checksums", async () => {
    const sourceRoot = join(tmp, "source");
    const targetRoot = join(tmp, "target");
    const sourceEntry = writePayload(sourceRoot, ".specify/setup.sh", "a");
    writeManifest(sourceRoot, manifest({
      ".specify/setup.sh": sourceEntry,
    }));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "release-manifest.json"), JSON.stringify({
      schemaVersion: 0,
      algorithm: "md5",
      files: {
        ".specify/setup.sh": { checksum: "stale" },
        ".specify/old-managed.md": null,
      },
    }, null, 2));

    const proc = Bun.spawn([
      "bun", DIFF_SCRIPT,
      "--source-root", sourceRoot,
      "--target-root", targetRoot,
      "--force-target-inventory",
      "--output", "json",
    ], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;

    expect(proc.exitCode, await new Response(proc.stderr).text()).toBe(0);
    expect(JSON.parse(await new Response(proc.stdout).text())).toEqual([
      { action: "deleted", path: ".specify/old-managed.md" },
      { action: "updated", path: ".specify/setup.sh" },
    ]);
  });

  test("force target inventory rejects malformed files objects and unsafe paths", async () => {
    const sourceRoot = join(tmp, "source");
    writeManifest(sourceRoot, manifest({}));

    for (const [name, targetManifest] of [
      ["malformed", { schemaVersion: 1, algorithm: "md5", files: [] }],
      ["unsafe", { schemaVersion: 1, algorithm: "md5", files: { "../outside": {} } }],
    ] as const) {
      const targetRoot = join(tmp, name);
      mkdirSync(join(targetRoot, ".specify"), { recursive: true });
      writeFileSync(
        join(targetRoot, ".specify", "release-manifest.json"),
        JSON.stringify(targetManifest),
      );
      const proc = Bun.spawn([
        "bun", DIFF_SCRIPT,
        "--source-root", sourceRoot,
        "--target-root", targetRoot,
        "--force-target-inventory",
        "--output", "nul",
      ], { stdout: "pipe", stderr: "pipe" });
      await proc.exited;

      expect(proc.exitCode).not.toBe(0);
      expect(await new Response(proc.stdout).text()).toBe("");
    }
  });

  test("force target inventory preserves target-only paths in NUL output", async () => {
    const sourceRoot = join(tmp, "source");
    const targetRoot = join(tmp, "target");
    const targetOnlyPath = ".specify/tab\tand\nnewline.txt";
    writeManifest(sourceRoot, manifest({}));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "release-manifest.json"), JSON.stringify({
      schemaVersion: 0,
      algorithm: "md5",
      files: { [targetOnlyPath]: {} },
    }));

    const proc = Bun.spawnSync({
      cmd: [
        "bun", DIFF_SCRIPT,
        "--source-root", sourceRoot,
        "--target-root", targetRoot,
        "--force-target-inventory",
        "--output", "nul",
      ],
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(proc.exitCode, new TextDecoder().decode(proc.stderr)).toBe(0);
    expect(new TextDecoder().decode(proc.stdout)).toBe(`deleted\0${targetOnlyPath}\0\0`);
  });

  test("rejects malformed manifest checksums before emitting framed output", async () => {
    const sourceRoot = join(tmp, "source");
    const targetRoot = join(tmp, "target");
    const sourceEntry = writePayload(sourceRoot, ".specify/setup.sh", "a");
    writeManifest(sourceRoot, manifest({
      ".specify/setup.sh": sourceEntry,
    }));
    writeManifest(targetRoot, manifest({
      ".specify/setup.sh": { sha256: "not-a-sha256", size: 1, mode: "0644" },
    }));

    const proc = Bun.spawn([
      "bun", DIFF_SCRIPT,
      "--source-root", sourceRoot,
      "--target-root", targetRoot,
      "--output", "nul",
    ], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;

    expect(proc.exitCode).not.toBe(0);
    expect(await new Response(proc.stdout).text()).toBe("");
    expect(await new Response(proc.stderr).text()).toContain("invalid release manifest SHA-256");
  });

  test("binds force target inventory to the snapshotted target manifest state", async () => {
    const sourceRoot = join(tmp, "source");
    const targetRoot = join(tmp, "target");
    writeManifest(sourceRoot, manifest({}));
    writeManifest(targetRoot, manifest({}));

    const proc = Bun.spawn([
      "bun", DIFF_SCRIPT,
      "--source-root", sourceRoot,
      "--target-root", targetRoot,
      "--force-target-inventory",
      "--expect-target-manifest-absent",
      "--output", "nul",
    ], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;

    expect(proc.exitCode).not.toBe(0);
    expect(await new Response(proc.stdout).text()).toBe("");
    expect(await new Response(proc.stderr).text()).toContain("appeared after snapshot");

    rmSync(join(targetRoot, ".specify", "release-manifest.json"));
    const missingProc = Bun.spawn([
      "bun", DIFF_SCRIPT,
      "--source-root", sourceRoot,
      "--target-root", targetRoot,
      "--force-target-inventory",
      "--expected-target-manifest-sha", "a".repeat(64),
      "--output", "nul",
    ], { stdout: "pipe", stderr: "pipe" });
    await missingProc.exited;

    expect(missingProc.exitCode).not.toBe(0);
    expect(await new Response(missingProc.stdout).text()).toBe("");
    expect(await new Response(missingProc.stderr).text()).toContain("changed after snapshot");
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

  test("formats NUL records containing tabs and newlines", () => {
    const expectedSha256 = "a".repeat(64);
    expect(formatManifestDiffNul([
      { action: "new", path: ".specify/tab\tpath.txt" },
      { action: "updated", path: ".specify/newline\npath.txt", expectedTargetSha256: expectedSha256 },
    ])).toBe(`new\0.specify/tab\tpath.txt\0\0updated\0.specify/newline\npath.txt\0${expectedSha256}\0`);
  });

  test("rejects fields that can corrupt NUL-framed diff records", () => {
    expect(() => formatManifestDiffNul([
      { action: "new", path: ".specify/injected\0deleted" },
    ])).toThrow(/release manifest path/);
    expect(() => formatManifestDiffNul([
      { action: "updated", path: ".specify/setup.sh", expectedTargetSha256: "not-a-sha256" },
    ])).toThrow(/SHA-256/);
  });

  test.each([0o664, 0o775])("materializes physical target mode %o as canonical metadata", (physicalMode) => {
    const targetRoot = join(tmp, `target-${physicalMode}`);
    const targetPath = join(targetRoot, ".specify", "setup.sh");
    mkdirSync(join(targetPath, ".."), { recursive: true });
    writeFileSync(targetPath, "echo SAMPLE\n");
    chmodSync(targetPath, physicalMode);
    const source = manifest({
      ".specify/setup.sh": { sha256: "source-bytes", size: 12, mode: "0644" },
    });

    expect(materializeTargetManifest(source, targetRoot).files[".specify/setup.sh"]?.mode).toBe("0644");
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

import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const TDK_ROOT = resolve(import.meta.dir, "../../../..");
const DISTRIBUTE_SH = resolve(TDK_ROOT, "distribute.sh");
const MANIFEST_TOOLING = resolve(TDK_ROOT, ".claude", "skills", "tdk-bump", "scripts");

function makeSource(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, ".specify"), { recursive: true });
  writeFileSync(join(root, "distribute.json"), JSON.stringify({
    ship: [".specify/setup.sh", ".specify/release-manifest.json"],
    doNotShip: [],
  }, null, 2));
  writeFileSync(join(root, ".specify", "setup.sh"), "#!/usr/bin/env bash\necho setup\n");
  cpSync(DISTRIBUTE_SH, join(root, "distribute.sh"));
  cpSync(MANIFEST_TOOLING, join(root, ".claude", "skills", "tdk-bump", "scripts"), {
    recursive: true,
  });
  return root;
}

function writeReleaseManifest(root: string, algorithm = "sha256", files = {
  ".specify/setup.sh": {
    sha256: "fixture",
    size: 31,
    mode: "0644",
  },
}): void {
  writeFileSync(join(root, ".specify", "release-manifest.json"), JSON.stringify({
    schemaVersion: 1,
    algorithm,
    generatedAt: "2026-07-05T00:00:00.000Z",
    rules: {
      source: "distribute.json",
      ship: [".specify/setup.sh", ".specify/release-manifest.json"],
      doNotShip: [],
    },
    files,
  }, null, 2));
}

function runDistribute(sourceRoot: string, targetRoot: string, args: string[]) {
  return Bun.spawnSync({
    cmd: ["bash", join(sourceRoot, "distribute.sh"), targetRoot, ...args],
    cwd: sourceRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("distribute.sh release manifest contract", () => {
  test("source missing release manifest fails before copying", () => {
    const sourceRoot = makeSource("tdk-dist-missing-source-manifest-");
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-target-"));

    const result = runDistribute(sourceRoot, targetRoot, ["--dry-run"]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("source release manifest");
    expect(existsSync(join(targetRoot, ".specify", "setup.sh"))).toBe(false);
  });

  test("target missing release manifest ships payload without deleting target orphans", () => {
    const sourceRoot = makeSource("tdk-dist-target-missing-manifest-");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "stale-local.md"), "keep me\n");

    const result = runDistribute(sourceRoot, targetRoot, ["--yes", "--yes-delete"]);

    expect(
      result.exitCode,
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    ).toBe(0);
    expect(existsSync(join(targetRoot, ".specify", "setup.sh"))).toBe(true);
    expect(readFileSync(join(targetRoot, ".specify", "stale-local.md"), "utf8")).toBe("keep me\n");
    expect(result.stdout.toString().indexOf("[root] .specify/release-manifest.json")).toBeGreaterThan(
      result.stdout.toString().indexOf("[root] .specify/setup.sh"),
    );
  });

  test("target schema or algorithm mismatch fails hard", () => {
    const sourceRoot = makeSource("tdk-dist-mismatch-source-");
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-mismatch-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeReleaseManifest(sourceRoot);
    writeReleaseManifest(targetRoot, "md5");

    const result = runDistribute(sourceRoot, targetRoot, ["--dry-run"]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("schema/algorithm mismatch");
  });

  test("--force bypasses manifest mismatch and uses full classification", () => {
    const sourceRoot = makeSource("tdk-dist-force-source-");
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-force-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeReleaseManifest(sourceRoot);
    writeReleaseManifest(targetRoot, "md5");

    const result = runDistribute(sourceRoot, targetRoot, ["--force", "--dry-run", "--no-delete"]);

    expect(
      result.exitCode,
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    ).toBe(0);
    expect(result.stdout.toString()).toContain("Release manifest fast path bypassed");
  });

  test("--no-delete removes manifest deleted entries from the execution set", () => {
    const sourceRoot = makeSource("tdk-dist-no-delete-source-");
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-no-delete-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeReleaseManifest(sourceRoot);
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": {
        sha256: "fixture",
        size: 31,
        mode: "0644",
      },
      ".specify/old-managed.md": {
        sha256: "old",
        size: 4,
        mode: "0644",
      },
    });

    const result = runDistribute(sourceRoot, targetRoot, ["--dry-run", "--no-delete"]);

    expect(
      result.exitCode,
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    ).toBe(0);
    expect(result.stdout.toString()).toContain("Deleted:");
    expect(result.stdout.toString()).toContain("0 files");
    expect(result.stdout.toString()).not.toContain("- .specify/old-managed.md");
  });
});

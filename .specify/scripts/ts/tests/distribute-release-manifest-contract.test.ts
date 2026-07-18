import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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

function entry(content: string) {
  return {
    sha256: createHash("sha256").update(content).digest("hex"),
    size: Buffer.byteLength(content),
    mode: "0644",
  };
}

function writeReleaseManifest(
  root: string,
  algorithm = "sha256",
  files?: Record<string, ReturnType<typeof entry>>,
): void {
  const setupPath = join(root, ".specify", "setup.sh");
  const manifestFiles = files ?? (existsSync(setupPath)
    ? { ".specify/setup.sh": entry(readFileSync(setupPath, "utf8")) }
    : {});
  writeFileSync(join(root, ".specify", "release-manifest.json"), JSON.stringify({
    schemaVersion: 1,
    algorithm,
    generatedAt: "2026-07-05T00:00:00.000Z",
    rules: {
      source: "distribute.json",
      ship: [".specify/setup.sh", ".specify/release-manifest.json"],
      doNotShip: [],
    },
    files: manifestFiles,
  }, null, 2));
}

function runDistribute(sourceRoot: string, targetRoot: string, args: string[], env: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: ["bash", join(sourceRoot, "distribute.sh"), targetRoot, ...args],
    cwd: sourceRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
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

  test("--force never bypasses manifest compatibility proof", () => {
    const sourceRoot = makeSource("tdk-dist-force-source-");
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-force-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeReleaseManifest(sourceRoot);
    writeReleaseManifest(targetRoot, "md5");

    const result = runDistribute(sourceRoot, targetRoot, ["--force", "--dry-run", "--no-delete"]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("schema/algorithm mismatch");
  });

  test("--no-delete removes manifest deleted entries from the execution set", () => {
    const sourceRoot = makeSource("tdk-dist-no-delete-source-");
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-no-delete-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "#!/usr/bin/env bash\necho setup\n");
    writeReleaseManifest(sourceRoot);
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": entry("#!/usr/bin/env bash\necho setup\n"),
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

  test.each(["../outside", "/absolute", "a\\b", "a//b", "a/../b"])(
    "rejects unsafe source manifest path %p before mutation",
    (unsafePath) => {
      const sourceRoot = makeSource("tdk-dist-unsafe-source-");
      writeReleaseManifest(sourceRoot, "sha256", {
        [unsafePath]: entry("unsafe\n"),
      });
      const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-target-"));

      const result = runDistribute(sourceRoot, targetRoot, ["--yes"]);

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("release manifest path");
      expect(existsSync(join(targetRoot, ".specify", "setup.sh"))).toBe(false);
    },
  );

  test("rejects unsafe target manifest paths before mutation", () => {
    const sourceRoot = makeSource("tdk-dist-unsafe-target-source-");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-unsafe-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "old payload\n");
    writeReleaseManifest(targetRoot, "sha256", {
      "../outside": entry("outside sentinel\n"),
    });

    const result = runDistribute(sourceRoot, targetRoot, ["--yes"]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("release manifest path");
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("old payload\n");
  });

  test("rejects a missing target still claimed by the prior manifest", () => {
    const sourceRoot = makeSource("tdk-dist-missing-managed-source-");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-missing-managed-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": entry("#!/usr/bin/env bash\necho setup\n"),
    });

    const result = runDistribute(sourceRoot, targetRoot, ["--yes"]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("checksum proof failed");
    expect(existsSync(join(targetRoot, ".specify", "setup.sh"))).toBe(false);
  });

  test("rejects a nonregular target still claimed by the prior manifest", () => {
    const sourceRoot = makeSource("tdk-dist-nonregular-source-");
    writeFileSync(join(sourceRoot, ".specify", "setup.sh"), "new payload\n");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-nonregular-target-"));
    mkdirSync(join(targetRoot, ".specify", "setup.sh"), { recursive: true });
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": entry("old payload\n"),
    });

    const result = runDistribute(sourceRoot, targetRoot, ["--yes", "--force"]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("checksum proof failed");
    expect(existsSync(join(targetRoot, ".specify", "setup.sh"))).toBe(true);
  });

  test("rejects drifted managed updates without publishing the new manifest", () => {
    const sourceRoot = makeSource("tdk-dist-drift-source-");
    writeFileSync(join(sourceRoot, ".specify", "setup.sh"), "new payload\n");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-drift-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "user edit\n");
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": entry("trusted old\n"),
    });
    const oldManifest = readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8");

    const result = runDistribute(sourceRoot, targetRoot, ["--yes"]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("checksum proof failed");
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("user edit\n");
    expect(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8")).toBe(oldManifest);
  });

  test("--yes-delete does not bypass checksum proof for a drifted orphan", () => {
    const sourceRoot = makeSource("tdk-dist-drift-delete-source-");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-drift-delete-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "#!/usr/bin/env bash\necho setup\n");
    writeFileSync(join(targetRoot, ".specify", "old-managed.md"), "user edit\n");
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": entry("#!/usr/bin/env bash\necho setup\n"),
      ".specify/old-managed.md": entry("trusted old\n"),
    });

    const result = runDistribute(sourceRoot, targetRoot, ["--yes", "--yes-delete"]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("checksum proof failed");
    expect(readFileSync(join(targetRoot, ".specify", "old-managed.md"), "utf8")).toBe("user edit\n");
  });

  test("rejects symlinked managed targets without touching the outside file", () => {
    const sourceRoot = makeSource("tdk-dist-symlink-source-");
    writeFileSync(join(sourceRoot, ".specify", "setup.sh"), "new payload\n");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-symlink-target-"));
    const outsideRoot = mkdtempSync(join(tmpdir(), "tdk-dist-outside-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(outsideRoot, "setup.sh"), "outside sentinel\n");
    symlinkSync(join(outsideRoot, "setup.sh"), join(targetRoot, ".specify", "setup.sh"));
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": entry("outside sentinel\n"),
    });

    const result = runDistribute(sourceRoot, targetRoot, ["--yes", "--force"]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("symlink");
    expect(readFileSync(join(outsideRoot, "setup.sh"), "utf8")).toBe("outside sentinel\n");
  });

  test("applies checksum-proven update and delete before publishing the manifest", () => {
    const sourceRoot = makeSource("tdk-dist-clean-source-");
    writeFileSync(join(sourceRoot, ".specify", "setup.sh"), "new payload\n");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-clean-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "old payload\n");
    writeFileSync(join(targetRoot, ".specify", "old-managed.md"), "old managed\n");
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": entry("old payload\n"),
      ".specify/old-managed.md": entry("old managed\n"),
    });

    const result = runDistribute(sourceRoot, targetRoot, ["--yes", "--yes-delete"]);

    expect(result.exitCode, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("new payload\n");
    expect(existsSync(join(targetRoot, ".specify", "old-managed.md"))).toBe(false);
    expect(result.stdout.toString().lastIndexOf("release-manifest.json")).toBeGreaterThan(
      result.stdout.toString().lastIndexOf("old-managed.md"),
    );
  });

  test("injected failure after an earlier copy rolls back payload and rerun repairs", () => {
    const sourceRoot = makeSource("tdk-dist-failure-source-");
    writeFileSync(join(sourceRoot, "distribute.json"), JSON.stringify({
      ship: [".specify/another.md", ".specify/setup.sh", ".specify/release-manifest.json"],
      doNotShip: [],
    }, null, 2));
    writeFileSync(join(sourceRoot, ".specify", "another.md"), "new first payload\n");
    writeFileSync(join(sourceRoot, ".specify", "setup.sh"), "new payload\n");
    writeReleaseManifest(sourceRoot, "sha256", {
      ".specify/another.md": entry("new first payload\n"),
      ".specify/setup.sh": entry("new payload\n"),
    });
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-failure-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "another.md"), "old first payload\n");
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "old payload\n");
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/another.md": entry("old first payload\n"),
      ".specify/setup.sh": entry("old payload\n"),
    });
    const oldManifest = readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8");

    const failed = runDistribute(sourceRoot, targetRoot, ["--yes"], {
      TDK_DISTRIBUTE_FAIL_AT: ".specify/setup.sh",
    });
    expect(failed.exitCode).not.toBe(0);
    expect(readFileSync(join(targetRoot, ".specify", "another.md"), "utf8")).toBe("old first payload\n");
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("old payload\n");
    expect(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8")).toBe(oldManifest);

    const repaired = runDistribute(sourceRoot, targetRoot, ["--yes"]);
    expect(repaired.exitCode, `stdout:\n${repaired.stdout}\nstderr:\n${repaired.stderr}`).toBe(0);
    expect(readFileSync(join(targetRoot, ".specify", "another.md"), "utf8")).toBe("new first payload\n");
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("new payload\n");
    expect(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8")).not.toBe(oldManifest);
  });

  test("injected delete failure rolls back an earlier update and rerun repairs", () => {
    const sourceRoot = makeSource("tdk-dist-delete-failure-source-");
    writeFileSync(join(sourceRoot, ".specify", "setup.sh"), "new payload\n");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-delete-failure-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "old payload\n");
    writeFileSync(join(targetRoot, ".specify", "old-managed.md"), "old managed\n");
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": entry("old payload\n"),
      ".specify/old-managed.md": entry("old managed\n"),
    });
    const oldManifest = readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8");

    const failed = runDistribute(sourceRoot, targetRoot, ["--yes", "--yes-delete"], {
      TDK_DISTRIBUTE_FAIL_AT: ".specify/old-managed.md",
    });

    expect(failed.exitCode).not.toBe(0);
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("old payload\n");
    expect(readFileSync(join(targetRoot, ".specify", "old-managed.md"), "utf8")).toBe("old managed\n");
    expect(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8")).toBe(oldManifest);

    const repaired = runDistribute(sourceRoot, targetRoot, ["--yes", "--yes-delete"]);
    expect(repaired.exitCode, `stdout:\n${repaired.stdout}\nstderr:\n${repaired.stderr}`).toBe(0);
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("new payload\n");
    expect(existsSync(join(targetRoot, ".specify", "old-managed.md"))).toBe(false);
  });

  test("prefixed updates use checksums of the rendered target bytes", () => {
    const sourceRoot = makeSource("tdk-dist-prefix-source-");
    writeFileSync(join(sourceRoot, ".specify", "setup.sh"), "echo TDK tdk-command\n");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-prefix-target-"));

    const first = runDistribute(sourceRoot, targetRoot, ["--prefix", "sample", "--yes"]);
    expect(first.exitCode, `stdout:\n${first.stdout}\nstderr:\n${first.stderr}`).toBe(0);
    const firstManifest = JSON.parse(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8"));
    const rendered = readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8");
    expect(rendered).toBe("echo SAMPLE sample-command\n");
    expect(firstManifest.files[".specify/setup.sh"].sha256).toBe(entry(rendered).sha256);

    writeFileSync(join(sourceRoot, ".specify", "setup.sh"), "echo TDK tdk-command updated\n");
    writeReleaseManifest(sourceRoot);
    const second = runDistribute(sourceRoot, targetRoot, ["--prefix", "sample", "--yes"]);

    expect(second.exitCode, `stdout:\n${second.stdout}\nstderr:\n${second.stderr}`).toBe(0);
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe(
      "echo SAMPLE sample-command updated\n",
    );
  });
});

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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

function writeRawReleaseManifest(root: string, manifest: unknown): void {
  mkdirSync(join(root, ".specify"), { recursive: true });
  writeFileSync(
    join(root, ".specify", "release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
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

function makeDisappearingDeleteWrapper(): string {
  const wrapper = mkdtempSync(join(tmpdir(), "tdk-dist-cp-wrapper-"));
  writeFileSync(join(wrapper, "cp"), `#!/usr/bin/env bash
if ! /bin/cp "$@"; then exit $?; fi
normalize_test_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$1" 2>/dev/null || printf '%s\\n' "$1"
  else
    printf '%s\\n' "$1"
  fi
}
if [[ "$(normalize_test_path "\${2:-}")" == "$(normalize_test_path "$TDK_TEST_BACKUP_TRIGGER")" ]]; then
  /bin/rm -f "$(normalize_test_path "$TDK_TEST_DISAPPEARING_DELETE")"
fi
`);
  chmodSync(join(wrapper, "cp"), 0o755);
  return wrapper;
}

function makeSha256sumWrapper(mode: "git-bash-stdin" | "malformed" | "multiline-malformed"): string {
  const wrapper = mkdtempSync(join(tmpdir(), "tdk-dist-sha256-wrapper-"));
  let body: string;
  if (mode === "git-bash-stdin") {
    body = `tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cat > "$tmp"
bun -e 'import { createHash } from "node:crypto"; import { readFileSync } from "node:fs"; const digest = createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"); process.stdout.write(digest + " *-\\n");' "$tmp"
`;
  } else if (mode === "multiline-malformed") {
    body = `cat > /dev/null
printf '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\\n*-\\n'
`;
  } else {
    body = `cat > /dev/null
printf 'not-a-sha *-\\n'
`;
  }
  writeFileSync(join(wrapper, "sha256sum"), `#!/usr/bin/env bash
set -euo pipefail
${body}`);
  chmodSync(join(wrapper, "sha256sum"), 0o755);
  return wrapper;
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

  test("accepts Git Bash sha256sum binary-mode stdin output", () => {
    const sourceRoot = makeSource("tdk-dist-git-bash-sha-source-");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-git-bash-sha-target-"));
    const wrapper = makeSha256sumWrapper("git-bash-stdin");

    const result = runDistribute(sourceRoot, targetRoot, ["--yes", "--yes-delete"], {
      PATH: `${wrapper}:${process.env.PATH}`,
    });

    expect(result.exitCode, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
    expect(existsSync(join(targetRoot, ".specify", "setup.sh"))).toBe(true);
  });

  test("rejects malformed sha256sum stdout", () => {
    const sourceRoot = makeSource("tdk-dist-malformed-sha-source-");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-malformed-sha-target-"));
    const wrapper = makeSha256sumWrapper("malformed");

    const result = runDistribute(sourceRoot, targetRoot, ["--yes"], {
      PATH: `${wrapper}:${process.env.PATH}`,
    });

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("invalid SHA-256 output");
  });

  test("rejects multiline sha256sum stdout", () => {
    const sourceRoot = makeSource("tdk-dist-multiline-sha-source-");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-multiline-sha-target-"));
    const wrapper = makeSha256sumWrapper("multiline-malformed");

    const result = runDistribute(sourceRoot, targetRoot, ["--yes"], {
      PATH: `${wrapper}:${process.env.PATH}`,
    });

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("invalid SHA-256 output");
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

  test("--force migrates a legacy target manifest and overwrites consumer drift", () => {
    const sourceRoot = makeSource("tdk-dist-force-source-");
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-force-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeReleaseManifest(sourceRoot);
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "consumer drift\n");
    writeRawReleaseManifest(targetRoot, {
      schemaVersion: 0,
      algorithm: "md5",
      files: {
        ".specify/setup.sh": { checksum: "stale" },
        ".specify/release-manifest.json": { checksum: "legacy-self-entry" },
      },
    });

    const result = runDistribute(sourceRoot, targetRoot, ["--force", "--yes", "--no-delete"]);

    expect(result.exitCode, `${result.stdout}${result.stderr}`).toBe(0);
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8"))
      .toBe("#!/usr/bin/env bash\necho setup\n");
    expect(JSON.parse(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8")))
      .toMatchObject({ schemaVersion: 1, algorithm: "sha256" });
  });

  test("--force --prefix publishes checksums for current rendered bytes over legacy ownership", () => {
    const sourceRoot = makeSource("tdk-dist-force-prefix-source-");
    writeFileSync(join(sourceRoot, ".specify", "setup.sh"), "echo TDK tdk-command\n");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-force-prefix-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "consumer legacy rendering\n");
    writeRawReleaseManifest(targetRoot, {
      schemaVersion: 0,
      algorithm: "md5",
      files: { ".specify/setup.sh": {} },
    });

    const result = runDistribute(
      sourceRoot,
      targetRoot,
      ["--prefix", "sample", "--force", "--yes", "--no-delete"],
    );

    expect(result.exitCode, `${result.stdout}${result.stderr}`).toBe(0);
    const rendered = readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8");
    const manifest = JSON.parse(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8"));
    expect(rendered).toBe("echo SAMPLE sample-command\n");
    expect(manifest).toMatchObject({ schemaVersion: 1, algorithm: "sha256" });
    expect(manifest.files[".specify/setup.sh"].sha256).toBe(entry(rendered).sha256);
  });

  test("--force overwrites an unowned existing path on a first ship", () => {
    const sourceRoot = makeSource("tdk-dist-force-first-ship-source-");
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-force-first-ship-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeReleaseManifest(sourceRoot);
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "unowned consumer file\n");

    const result = runDistribute(sourceRoot, targetRoot, ["--force", "--yes"]);

    expect(result.exitCode, `${result.stdout}${result.stderr}`).toBe(0);
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8"))
      .toBe("#!/usr/bin/env bash\necho setup\n");
  });

  test("--force leaves config-enumerated paths outside both release manifests untouched", () => {
    for (const withTargetManifest of [false, true]) {
      const sourceRoot = makeSource(`tdk-dist-force-unlisted-source-${withTargetManifest}-`);
      writeFileSync(join(sourceRoot, "distribute.json"), JSON.stringify({
        ship: [".specify/setup.sh", ".specify/unlisted.md", ".specify/release-manifest.json"],
        doNotShip: [],
      }, null, 2));
      writeFileSync(join(sourceRoot, ".specify", "unlisted.md"), "source unlisted bytes\n");
      writeReleaseManifest(sourceRoot, "sha256", {
        ".specify/setup.sh": entry("#!/usr/bin/env bash\necho setup\n"),
      });
      const targetRoot = mkdtempSync(join(tmpdir(), `tdk-dist-force-unlisted-target-${withTargetManifest}-`));
      mkdirSync(join(targetRoot, ".specify"), { recursive: true });
      writeFileSync(join(targetRoot, ".specify", "setup.sh"), "consumer setup\n");
      writeFileSync(join(targetRoot, ".specify", "unlisted.md"), "consumer unlisted bytes\n");
      if (withTargetManifest) {
        writeRawReleaseManifest(targetRoot, {
          schemaVersion: 0,
          algorithm: "md5",
          files: { ".specify/setup.sh": {} },
        });
      }

      const result = runDistribute(sourceRoot, targetRoot, ["--force", "--yes", "--no-delete"]);

      expect(result.exitCode, `${result.stdout}${result.stderr}`).toBe(0);
      expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8"))
        .toBe("#!/usr/bin/env bash\necho setup\n");
      expect(readFileSync(join(targetRoot, ".specify", "unlisted.md"), "utf8"))
        .toBe("consumer unlisted bytes\n");
      const manifest = JSON.parse(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8"));
      expect(manifest.files[".specify/unlisted.md"]).toBeUndefined();
    }
  }, 15000);

  test("--force dry-run previews authoritative mutations without prompts or writes", () => {
    const sourceRoot = makeSource("tdk-dist-force-dry-run-source-");
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-force-dry-run-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeReleaseManifest(sourceRoot);
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "consumer drift\n");
    writeRawReleaseManifest(targetRoot, {
      schemaVersion: 0,
      algorithm: "md5",
      files: { ".specify/setup.sh": {} },
    });
    const manifestBefore = readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8");

    const result = runDistribute(sourceRoot, targetRoot, ["--force", "--dry-run"]);
    const resultOutput = `${result.stdout}${result.stderr}`;

    expect(result.exitCode, resultOutput).toBe(0);
    expect(resultOutput).toContain("[FORCE] .specify/setup.sh → UPDATED");
    expect(resultOutput).toContain("--force (destructive consumer override)");
    expect(resultOutput).toContain("FORCE OVERRIDE ENABLED");
    expect(resultOutput).toContain("Target ownership, checksums, and legacy manifest compatibility are ignored.");
    expect(resultOutput).toContain("Dry-run complete. No files were written.");
    expect(resultOutput).not.toContain("Proceed with sync");
    expect(resultOutput).not.toContain("Destructively overwrite consumer changes in");
    expect(resultOutput).not.toContain("Type 'delete'");
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("consumer drift\n");
    expect(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8")).toBe(manifestBefore);
  });

  test("--force recreates a manifest-claimed missing path and rolls it back as new", () => {
    const sourceRoot = makeSource("tdk-dist-force-missing-source-");
    writeFileSync(join(sourceRoot, "distribute.json"), JSON.stringify({
      ship: [".specify/another.md", ".specify/setup.sh", ".specify/release-manifest.json"],
      doNotShip: [],
    }, null, 2));
    writeFileSync(join(sourceRoot, ".specify", "another.md"), "new file\n");
    writeReleaseManifest(sourceRoot, "sha256", {
      ".specify/another.md": entry("new file\n"),
      ".specify/setup.sh": entry("#!/usr/bin/env bash\necho setup\n"),
    });
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-force-missing-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "consumer setup\n");
    writeRawReleaseManifest(targetRoot, {
      schemaVersion: 0,
      algorithm: "md5",
      files: { ".specify/another.md": {}, ".specify/setup.sh": {} },
    });
    const manifestBefore = readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8");

    const result = runDistribute(sourceRoot, targetRoot, ["--force", "--yes", "--no-delete"], {
      TDK_DISTRIBUTE_FAIL_AT: ".specify/setup.sh",
    });

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("injected copy failure");
    expect(existsSync(join(targetRoot, ".specify", "another.md"))).toBe(false);
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("consumer setup\n");
    expect(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8")).toBe(manifestBefore);
  });

  test("--force deletes only present prior-manifest orphans and respects --no-delete", () => {
    for (const noDelete of [false, true]) {
      const sourceRoot = makeSource(`tdk-dist-force-delete-source-${noDelete}-`);
      const targetRoot = mkdtempSync(join(tmpdir(), `tdk-dist-force-delete-target-${noDelete}-`));
      mkdirSync(join(targetRoot, ".specify"), { recursive: true });
      writeReleaseManifest(sourceRoot);
      writeFileSync(join(targetRoot, ".specify", "setup.sh"), "consumer setup\n");
      writeFileSync(join(targetRoot, ".specify", "old-managed.md"), "consumer-edited orphan\n");
      writeRawReleaseManifest(targetRoot, {
        schemaVersion: 0,
        algorithm: "md5",
        files: { ".specify/setup.sh": {}, ".specify/old-managed.md": {} },
      });

      const args = ["--force", "--yes", ...(noDelete ? ["--no-delete"] : ["--yes-delete"])];
      const result = runDistribute(sourceRoot, targetRoot, args);

      expect(result.exitCode, `${result.stdout}${result.stderr}`).toBe(0);
      expect(existsSync(join(targetRoot, ".specify", "old-managed.md"))).toBe(noDelete);
    }
  }, 15000);

  test("--force --no-delete still rejects a prior-manifest-only nonregular node", () => {
    const sourceRoot = makeSource("tdk-dist-force-no-delete-nonregular-source-");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-force-no-delete-nonregular-target-"));
    mkdirSync(join(targetRoot, ".specify", "old-managed"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "consumer setup\n");
    writeRawReleaseManifest(targetRoot, {
      schemaVersion: 0,
      algorithm: "md5",
      files: { ".specify/setup.sh": {}, ".specify/old-managed": {} },
    });
    const manifestBefore = readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8");

    const result = runDistribute(sourceRoot, targetRoot, ["--force", "--yes", "--no-delete"]);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("not a regular non-symlink file");
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("consumer setup\n");
    expect(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8")).toBe(manifestBefore);
  }, 15000);

  test("--force treats a delete candidate absent at physical snapshot as a rollback-safe no-op", () => {
    const sourceRoot = makeSource("tdk-dist-force-delete-race-source-");
    writeFileSync(join(sourceRoot, ".specify", "setup.sh"), "new setup\n");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-force-delete-race-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "consumer setup\n");
    writeFileSync(join(targetRoot, ".specify", "disappearing.md"), "external removal\n");
    writeFileSync(join(targetRoot, ".specify", "failing.md"), "preserve me\n");
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": entry("consumer setup\n"),
      ".specify/disappearing.md": entry("external removal\n"),
      ".specify/failing.md": entry("preserve me\n"),
    });
    const manifestBefore = readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8");
    const wrapper = makeDisappearingDeleteWrapper();

    const result = runDistribute(sourceRoot, targetRoot, ["--force", "--yes", "--yes-delete"], {
      PATH: `${wrapper}:${process.env.PATH}`,
      TDK_DISTRIBUTE_FAIL_AT: ".specify/failing.md",
      TDK_TEST_BACKUP_TRIGGER: join(targetRoot, ".specify", "setup.sh"),
      TDK_TEST_DISAPPEARING_DELETE: join(targetRoot, ".specify", "disappearing.md"),
    });
    const resultOutput = `${result.stdout}${result.stderr}`;

    expect(result.exitCode).not.toBe(0);
    expect(resultOutput).toContain("injected delete failure");
    expect(resultOutput).not.toContain("rollback was incomplete");
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("consumer setup\n");
    expect(existsSync(join(targetRoot, ".specify", "disappearing.md"))).toBe(false);
    expect(readFileSync(join(targetRoot, ".specify", "failing.md"), "utf8")).toBe("preserve me\n");
    expect(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8")).toBe(manifestBefore);
  });

  test("--no-delete removes manifest deleted entries from the execution set", () => {
    const sourceRoot = makeSource("tdk-dist-no-delete-source-");
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-no-delete-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "#!/usr/bin/env bash\necho setup\n");
    writeReleaseManifest(sourceRoot);
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": entry("#!/usr/bin/env bash\necho setup\n"),
      ".specify/old-managed.md": entry("old\n"),
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
    for (const args of [["--yes"], ["--force", "--yes"]]) {
      const sourceRoot = makeSource("tdk-dist-unsafe-target-source-");
      writeReleaseManifest(sourceRoot);
      const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-unsafe-target-"));
      mkdirSync(join(targetRoot, ".specify"), { recursive: true });
      writeFileSync(join(targetRoot, ".specify", "setup.sh"), "old payload\n");
      writeReleaseManifest(targetRoot, "sha256", {
        "../outside": entry("outside sentinel\n"),
      });

      const result = runDistribute(sourceRoot, targetRoot, args);

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain("release manifest path");
      expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("old payload\n");
    }
  });

  test("--force rejects malformed target manifest JSON before mutation", () => {
    const sourceRoot = makeSource("tdk-dist-malformed-target-source-");
    writeReleaseManifest(sourceRoot);
    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-malformed-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), "old payload\n");
    writeFileSync(join(targetRoot, ".specify", "release-manifest.json"), "{invalid json\n");

    const result = runDistribute(sourceRoot, targetRoot, ["--force", "--yes"]);

    expect(result.exitCode).not.toBe(0);
    expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("old payload\n");
    expect(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8"))
      .toBe("{invalid json\n");
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
    expect(`${result.stdout}${result.stderr}`).toContain("not a regular non-symlink file");
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
  }, 15000);

  test("injected delete failure rolls back an earlier update and rerun repairs", () => {
    for (const force of [false, true]) {
      const sourceRoot = makeSource(`tdk-dist-delete-failure-source-${force}-`);
      writeFileSync(join(sourceRoot, ".specify", "setup.sh"), "new payload\n");
      writeReleaseManifest(sourceRoot);
      const targetRoot = mkdtempSync(join(tmpdir(), `tdk-dist-delete-failure-target-${force}-`));
      mkdirSync(join(targetRoot, ".specify"), { recursive: true });
      writeFileSync(join(targetRoot, ".specify", "setup.sh"), "old payload\n");
      writeFileSync(join(targetRoot, ".specify", "old-managed.md"), "old managed\n");
      writeReleaseManifest(targetRoot, "sha256", {
        ".specify/setup.sh": entry("old payload\n"),
        ".specify/old-managed.md": entry("old managed\n"),
      });
      const oldManifest = readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8");
      const args = [...(force ? ["--force"] : []), "--yes", "--yes-delete"];

      const failed = runDistribute(sourceRoot, targetRoot, args, {
        TDK_DISTRIBUTE_FAIL_AT: ".specify/old-managed.md",
      });

      expect(failed.exitCode).not.toBe(0);
      expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("old payload\n");
      expect(readFileSync(join(targetRoot, ".specify", "old-managed.md"), "utf8")).toBe("old managed\n");
      expect(readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8")).toBe(oldManifest);

      const repaired = runDistribute(sourceRoot, targetRoot, args);
      expect(repaired.exitCode, `stdout:\n${repaired.stdout}\nstderr:\n${repaired.stderr}`).toBe(0);
      expect(readFileSync(join(targetRoot, ".specify", "setup.sh"), "utf8")).toBe("new payload\n");
      expect(existsSync(join(targetRoot, ".specify", "old-managed.md"))).toBe(false);
    }
  }, 20000);

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
  }, 15000);

  test("declining the delete prompt keeps orphans recorded so the next run re-offers them", () => {
    const sourceRoot = makeSource("tdk-dist-decline-delete-source-");
    const setupContent = "#!/usr/bin/env bash\necho setup\n";
    const orphanContent = "orphaned managed file\n";
    writeReleaseManifest(sourceRoot);

    const targetRoot = mkdtempSync(join(tmpdir(), "tdk-dist-decline-delete-target-"));
    mkdirSync(join(targetRoot, ".specify"), { recursive: true });
    writeFileSync(join(targetRoot, ".specify", "setup.sh"), setupContent);
    writeFileSync(join(targetRoot, ".specify", "orphan.md"), orphanContent);
    writeReleaseManifest(targetRoot, "sha256", {
      ".specify/setup.sh": entry(setupContent),
      ".specify/orphan.md": entry(orphanContent),
    });

    // No --yes-delete: answer the delete prompt with anything but "delete".
    const declined = Bun.spawnSync({
      cmd: ["bash", join(sourceRoot, "distribute.sh"), targetRoot, "--yes"],
      cwd: sourceRoot,
      stdin: new TextEncoder().encode("no\n"),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(declined.exitCode, `${declined.stdout}${declined.stderr}`).toBe(0);
    expect(existsSync(join(targetRoot, ".specify", "orphan.md"))).toBe(true);

    const afterDecline = JSON.parse(
      readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8"),
    );
    expect(Object.keys(afterDecline.files)).toContain(".specify/orphan.md");
    expect(afterDecline.files[".specify/orphan.md"].sha256).toBe(entry(orphanContent).sha256);

    const reoffered = runDistribute(sourceRoot, targetRoot, ["--yes", "--yes-delete"]);

    expect(reoffered.exitCode, `${reoffered.stdout}${reoffered.stderr}`).toBe(0);
    expect(existsSync(join(targetRoot, ".specify", "orphan.md"))).toBe(false);
    const afterDelete = JSON.parse(
      readFileSync(join(targetRoot, ".specify", "release-manifest.json"), "utf8"),
    );
    expect(Object.keys(afterDelete.files)).not.toContain(".specify/orphan.md");
  }, 20000);
});

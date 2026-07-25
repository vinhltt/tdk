import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const TDK_ROOT = resolve(import.meta.dir, "../../../../..");
const DISTRIBUTE_SH = join(TDK_ROOT, "distribute.sh");
const TOOLING = join(TDK_ROOT, ".claude/skills/tdk-bump/scripts");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function makeRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
function entry(content: string, mode = "0644") {
  return {
    sha256: createHash("sha256").update(content).digest("hex"),
    size: Buffer.byteLength(content),
    mode,
  };
}
function writeManifest(root: string, files: Record<string, ReturnType<typeof entry>>): void {
  writeFileSync(join(root, ".specify/release-manifest.json"), JSON.stringify({
    schemaVersion: 1,
    algorithm: "sha256",
    generatedAt: "2026-07-25T00:00:00.000Z",
    rules: {
      source: "distribute.json",
      ship: [".specify/setup.sh", ".specify/release-manifest.json"],
      doNotShip: [],
    },
    files,
  }, null, 2) + "\n");
}
function makeSource(content: string): string {
  const root = makeRoot("tdk-mode-source-");
  mkdirSync(join(root, ".specify"), { recursive: true });
  writeFileSync(join(root, "distribute.json"), JSON.stringify({
    ship: [".specify/setup.sh", ".specify/release-manifest.json"],
    doNotShip: [],
  }, null, 2));
  writeFileSync(join(root, ".specify/setup.sh"), content);
  chmodSync(join(root, ".specify/setup.sh"), 0o644);
  writeManifest(root, { ".specify/setup.sh": entry(content) });
  cpSync(DISTRIBUTE_SH, join(root, "distribute.sh"));
  cpSync(TOOLING, join(root, ".claude/skills/tdk-bump/scripts"), { recursive: true });
  return root;
}
function makeLegacyTarget(content: string, files?: Record<string, ReturnType<typeof entry>>): string {
  const root = makeRoot("tdk-mode-target-");
  mkdirSync(join(root, ".specify"), { recursive: true });
  writeFileSync(join(root, ".specify/setup.sh"), content);
  chmodSync(join(root, ".specify/setup.sh"), 0o775);
  writeManifest(root, files ?? { ".specify/setup.sh": entry(content, "0775") });
  return root;
}
function run(source: string, target: string, args: string[], env: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: ["bash", join(source, "distribute.sh"), target, ...args],
    cwd: source,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
}
function output(result: { stdout: Uint8Array; stderr: Uint8Array }): string {
  return `${new TextDecoder().decode(result.stdout)}${new TextDecoder().decode(result.stderr)}`;
}
async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, expected: string): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes(expected)) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text;
}
describe("distribute release manifest mode canonicalization", () => {
  test("rewrites a checksum-proven unprefixed legacy mode difference once", () => {
    const content = "echo setup\n";
    const source = makeSource(content); const target = makeLegacyTarget(content);
    const failed = run(source, target, ["--yes"], { TDK_DISTRIBUTE_FAIL_AT: ".specify/setup.sh" });
    expect(failed.exitCode).not.toBe(0);
    expect(output(failed)).toContain("injected copy failure");
    const migrated = run(source, target, ["--yes"]);
    expect(migrated.exitCode, output(migrated)).toBe(0);
    expect(JSON.parse(readFileSync(join(target, ".specify/release-manifest.json"), "utf8"))
      .files[".specify/setup.sh"].mode).toBe("0644");
    const second = run(source, target, ["--yes"]);
    expect(second.exitCode, output(second)).toBe(0);
    expect(output(second)).toContain("Target is already up to date");
  });
  test("keeps SHA-256-identical prefixed payloads and republishes canonical metadata", () => {
    const content = "echo setup\n";
    const source = makeSource(content);
    const target = makeLegacyTarget(content);
    const migrated = run(source, target, ["--prefix", "sample", "--yes"], {
      TDK_DISTRIBUTE_FAIL_AT: ".specify/setup.sh",
    });
    expect(migrated.exitCode, output(migrated)).toBe(0);
    const manifest = JSON.parse(readFileSync(join(target, ".specify/release-manifest.json"), "utf8"));
    expect(manifest.files[".specify/setup.sh"]).toEqual(entry(content));
    const second = run(source, target, ["--prefix", "sample", "--yes"], {
      TDK_DISTRIBUTE_FAIL_AT: ".specify/setup.sh",
    });
    expect(second.exitCode, output(second)).toBe(0);
    expect(output(second)).toContain("Target is already up to date");
    expect(JSON.parse(readFileSync(join(target, ".specify/release-manifest.json"), "utf8"))
      .files[".specify/setup.sh"]).toEqual(entry(content));
  });
  test("force copies a SHA-256-identical current path", () => {
    const content = "echo setup\n";
    const source = makeSource(content);
    const target = makeLegacyTarget(content, { ".specify/setup.sh": entry(content) });
    const result = run(source, target, ["--force", "--yes"], {
      TDK_DISTRIBUTE_FAIL_AT: ".specify/setup.sh",
    });
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("injected copy failure");
  });
  test("rewrites real prefixed content once and leaves the materialized manifest unchanged on run two", () => {
    const sourceContent = "echo tdk\n";
    const renderedContent = "echo sample\n";
    const source = makeSource(sourceContent);
    const target = makeLegacyTarget(sourceContent);
    const failed = run(source, target, ["--prefix", "sample", "--yes"], {
      TDK_DISTRIBUTE_FAIL_AT: ".specify/setup.sh",
    });
    expect(failed.exitCode).not.toBe(0);
    expect(output(failed)).toContain("injected copy failure");
    const migrated = run(source, target, ["--prefix", "sample", "--yes"]);
    expect(migrated.exitCode, output(migrated)).toBe(0);
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe(renderedContent);
    const manifestPath = join(target, ".specify/release-manifest.json");
    const materializedManifest = readFileSync(manifestPath, "utf8");
    expect(JSON.parse(materializedManifest).files[".specify/setup.sh"]).toEqual(entry(renderedContent));
    const second = run(source, target, ["--prefix", "sample", "--yes"], {
      TDK_DISTRIBUTE_FAIL_AT: ".specify/setup.sh",
    });
    expect(second.exitCode, output(second)).toBe(0);
    expect(output(second)).toContain("Target is already up to date");
    expect(readFileSync(manifestPath, "utf8")).toBe(materializedManifest);
  });
  test("force prefix republishes materialized metadata when the prior manifest equals the source", () => {
    const sourceContent = "tdk setup\n";
    const renderedContent = "sample setup\n";
    const source = makeSource(sourceContent);
    const target = makeLegacyTarget(sourceContent, { ".specify/setup.sh": entry(sourceContent) });
    expect(readFileSync(join(target, ".specify/release-manifest.json"), "utf8"))
      .toBe(readFileSync(join(source, ".specify/release-manifest.json"), "utf8"));

    const result = run(source, target, ["--prefix", "sample", "--force", "--yes"]);

    expect(result.exitCode, output(result)).toBe(0);
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe(renderedContent);
    expect(JSON.parse(readFileSync(join(target, ".specify/release-manifest.json"), "utf8"))
      .files[".specify/setup.sh"]).toEqual(entry(renderedContent));
  });
  test("rejects an unchanged prefixed payload without target manifest ownership", () => {
    const content = "echo setup\n";
    const source = makeSource(content);
    const target = makeLegacyTarget(content, {});
    const result = run(source, target, ["--prefix", "sample", "--yes"]);
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("checksum proof missing for unchanged prefixed target");
  });
  test("rejects a prefixed unchanged target mutated after preflight", async () => {
    const content = "echo setup\n";
    const source = makeSource(content);
    const target = makeLegacyTarget(content);
    const before = readFileSync(join(target, ".specify/release-manifest.json"), "utf8");
    const child = Bun.spawn(["bash", join(source, "distribute.sh"), target, "--prefix", "sample"], {
      cwd: source,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    const reader = child.stdout.getReader();
    const prompt = await readUntil(reader, "Proceed with sync");
    expect(prompt).toContain("Proceed with sync");
    writeFileSync(join(target, ".specify/setup.sh"), "late mutation\n");
    child.stdin.write("yes\n");
    child.stdin.end();
    await child.exited;
    expect(child.exitCode).not.toBe(0);
    expect(await new Response(child.stderr).text()).toContain("unchanged prefixed target changed");
    expect(readFileSync(join(target, ".specify/release-manifest.json"), "utf8")).toBe(before);
  });
  test("restores the prior manifest when a wrapper mutates an unchanged payload at publish", () => {
    const content = "echo setup\n";
    const source = makeSource(content);
    const target = makeLegacyTarget(content);
    const before = readFileSync(join(target, ".specify/release-manifest.json"), "utf8");
    const wrapper = makeManifestMutationWrapper();
    const result = run(source, target, ["--prefix", "sample", "--yes"], mutationEnvironment(wrapper, target));
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("unchanged prefixed target changed before manifest publish");
    expect(readFileSync(join(target, ".specify/release-manifest.json"), "utf8")).toBe(before);
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe("external mutation\n");
  });
  test("uses NUL-framed diff records for paths containing tabs", () => {
    const content = "echo setup\n";
    const path = ".specify/tab\tpath.txt";
    const source = makeSource(content);
    const target = makeLegacyTarget(content);
    writeFileSync(join(source, "distribute.json"), JSON.stringify({
      ship: [path, ".specify/release-manifest.json"], doNotShip: [],
    }, null, 2));
    writeFileSync(join(source, path), content);
    writeManifest(source, { [path]: entry(content) });
    writeFileSync(join(target, path), content); chmodSync(join(target, path), 0o775);
    writeManifest(target, { [path]: entry(content, "0775") });
    const result = run(source, target, ["--yes"]);
    expect(result.exitCode, output(result)).toBe(0);
    expect(JSON.parse(readFileSync(join(target, ".specify/release-manifest.json"), "utf8"))
      .files[path].mode).toBe("0644");
  });
  test("rejects a drifted prefixed newline path before publication", () => {
    const content = "echo setup\n";
    const path = ".specify/newline\npath.txt";
    const source = makeSource(content); const target = makeLegacyTarget(content);
    writeFileSync(join(source, "distribute.json"), JSON.stringify({ ship: [path, ".specify/release-manifest.json"], doNotShip: [] }));
    writeFileSync(join(source, path), content);
    writeManifest(source, { [path]: entry(content) });
    writeFileSync(join(target, path), "externally changed\n");
    writeManifest(target, { [path]: entry(content, "0775") });
    const before = readFileSync(join(target, ".specify/release-manifest.json"), "utf8");
    const result = run(source, target, ["--prefix", "sample", "--yes"]);
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("→ UPDATED"); expect(output(result)).toContain("checksum proof failed");
    expect(readFileSync(join(target, path), "utf8")).toBe("externally changed\n");
    expect(readFileSync(join(target, ".specify/release-manifest.json"), "utf8")).toBe(before);
  });
  test("rejects a failing hash backend rather than accepting empty manifest digests", () => {
    const content = "echo setup\n";
    const source = makeSource(content);
    const target = makeLegacyTarget(content);
    const wrapper = makeRoot("tdk-mode-sha256sum-wrapper-");
    writeFileSync(join(wrapper, "sha256sum"), "#!/usr/bin/env bash\nexit 1\n");
    chmodSync(join(wrapper, "sha256sum"), 0o755);
    const result = run(source, target, ["--yes"], { PATH: `${wrapper}:${process.env.PATH}` });
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("failed to hash file");
    expect(output(result)).not.toContain("Target is already up to date");
  });
  test("rejects a missing file without emitting a digest to its shell caller", () => {
    const missingPath = join(makeRoot("tdk-mode-missing-hash-"), "missing file\nname");
    const result = runHashCaller(missingPath);
    expect(result.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toBe("rejected\n");
    expect(new TextDecoder().decode(result.stderr)).toContain("failed to hash file");
  });
  test("rejects empty successful hash output instead of treating two hashes as equal", () => {
    const content = "echo setup\n";
    const source = makeSource(content);
    const target = makeLegacyTarget(content);
    writeManifest(source, {});
    writeFileSync(join(target, ".specify/release-manifest.json"), JSON.stringify({
      schemaVersion: 1,
      algorithm: "sha256",
      generatedAt: "2026-07-26T00:00:00.000Z",
      rules: { source: "distribute.json", ship: [".specify/setup.sh", ".specify/release-manifest.json"], doNotShip: [] },
      files: {},
    }, null, 2) + "\n");
    const wrapper = makeRoot("tdk-mode-empty-sha256sum-wrapper-");
    writeFileSync(join(wrapper, "sha256sum"), "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(join(wrapper, "sha256sum"), 0o755);
    const result = run(source, target, ["--yes"], { PATH: `${wrapper}:${process.env.PATH}` });
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("invalid SHA-256 output");
    expect(output(result)).not.toContain("Target is already up to date");
  });
  test("rejects NUL inside a distribution config entry", () => {
    const content = "echo setup\n";
    const source = makeSource(content);
    const target = makeRoot("tdk-mode-target-");
    writeFileSync(join(source, "distribute.json"), JSON.stringify({
      ship: [`.specify/missing\0.specify/setup.sh`, ".specify/release-manifest.json"],
      doNotShip: [],
    }));
    const result = run(source, target, ["--yes"]);
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("Invalid array entry");
    expect(existsSync(join(target, ".specify/setup.sh"))).toBe(false);
  });
  test("rejects unsupported source manifest schema and algorithm before fresh-target mutation", () => {
    for (const override of [{ schemaVersion: 2 }, { algorithm: "md5" }]) {
      for (const args of [["--yes"], ["--force", "--yes"]]) {
        const source = makeSource("echo setup\n");
        const target = makeRoot("tdk-mode-target-");
        const manifestPath = join(source, ".specify/release-manifest.json");
        const manifest = { ...JSON.parse(readFileSync(manifestPath, "utf8")), ...override };
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

        const result = run(source, target, args);
        expect(result.exitCode, output(result)).not.toBe(0);
        expect(output(result)).toContain("schema/algorithm mismatch");
        expect(existsSync(join(target, ".specify/setup.sh"))).toBe(false);
        expect(existsSync(join(target, ".specify/release-manifest.json"))).toBe(false);
      }
    }
  });
  test("rejects NUL inside a target manifest path before mutating payload", () => {
    const content = "echo setup\n";
    const localContent = "consumer-owned\n";
    const source = makeSource(content);
    const target = makeLegacyTarget(content);
    const localPath = join(target, ".specify/local.txt");
    writeFileSync(localPath, localContent);
    const injectedPath = `.specify/local.txt\0${entry(localContent).sha256}\0unchanged\0.specify/setup.sh`;
    writeManifest(target, {
      ".specify/setup.sh": entry(content, "0775"),
      [injectedPath]: entry("injected-record"),
    });
    const manifestBefore = readFileSync(join(target, ".specify/release-manifest.json"), "utf8");
    const result = run(source, target, ["--yes", "--yes-delete"]);
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("invalid release manifest path");
    expect(readFileSync(localPath, "utf8")).toBe(localContent);
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe(content);
    expect(readFileSync(join(target, ".specify/release-manifest.json"), "utf8")).toBe(manifestBefore);
  });
  test("rejects NUL diff records with trailing non-NUL bytes", () => {
    const content = "echo setup\n";
    const source = makeSource(content);
    const target = makeLegacyTarget(content);
    writeMalformedDiffProducer(source, "new\0path\0sha\0trailing");
    const result = run(source, target, ["--yes"]);
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("invalid NUL-delimited release manifest diff");
  });
  test("rejects NUL diff records missing the optional checksum terminator", () => {
    const content = "echo setup\n";
    const source = makeSource(content);
    const target = makeLegacyTarget(content);
    writeMalformedDiffProducer(source, "new\0path\0");
    const result = run(source, target, ["--yes"]);
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("invalid NUL-delimited release manifest diff");
  });
  test("restores the prior manifest when an unprefixed manifest-only publish races an unchanged payload", () => {
    const content = "echo setup\n";
    const source = makeSource(content);
    const target = makeLegacyTarget(content, { ".specify/setup.sh": entry(content) });
    const targetManifestPath = join(target, ".specify/release-manifest.json");
    const priorManifest = JSON.parse(readFileSync(targetManifestPath, "utf8"));
    priorManifest.generatedAt = "2026-07-26T00:00:00.000Z";
    const before = `${JSON.stringify(priorManifest, null, 2)}\n`;
    writeFileSync(targetManifestPath, before);
    const wrapper = makeManifestMutationWrapper();
    const result = run(source, target, ["--yes"], mutationEnvironment(wrapper, target));
    const resultOutput = output(result);
    expect(result.exitCode).not.toBe(0);
    expect(resultOutput).toContain("unchanged target changed before manifest publish");
    expect(resultOutput).not.toContain("✓ [root] .specify/release-manifest.json");
    expect(resultOutput).not.toContain("Distribution complete!");
    expect(resultOutput).not.toContain("the previous release manifest remains authoritative");
    const restoredManifestText = readFileSync(targetManifestPath, "utf8");
    expect(restoredManifestText).toBe(before);
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe("external mutation\n");
    const restoredManifest = JSON.parse(restoredManifestText);
    expect(restoredManifest.files[".specify/setup.sh"].sha256)
      .not.toBe(entry("external mutation\n").sha256);
  });
  test("restores the prior manifest when publication races an unprefixed payload update", () => {
    const sourceContent = "source setup\n";
    const targetContent = "target setup\n";
    const source = makeSource(sourceContent);
    const target = makeLegacyTarget(targetContent);
    const before = readFileSync(join(target, ".specify/release-manifest.json"), "utf8");
    const wrapper = makeManifestMutationWrapper();
    const result = run(source, target, ["--yes"], mutationEnvironment(wrapper, target));
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("transaction output changed before manifest publish");
    expect(readFileSync(join(target, ".specify/release-manifest.json"), "utf8")).toBe(before);
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe("external mutation\n");
  });
  test("restores the prior manifest when publication races a forced prefixed payload update", () => {
    const sourceContent = "tdk setup\n";
    const targetContent = "target setup\n";
    const source = makeSource(sourceContent);
    const target = makeLegacyTarget(targetContent);
    const before = readFileSync(join(target, ".specify/release-manifest.json"), "utf8");
    const wrapper = makeManifestMutationWrapper();
    const result = run(source, target, ["--prefix", "sample", "--force", "--yes"], mutationEnvironment(wrapper, target));
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("transaction output changed before manifest publish");
    expect(readFileSync(join(target, ".specify/release-manifest.json"), "utf8")).toBe(before);
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe("external mutation\n");
  });
  test("fails closed when the published release manifest is mutated after mv", () => {
    const source = makeSource("source setup\n");
    const target = makeLegacyTarget("consumer setup\n");
    const wrapper = makePostPublishManifestMutationWrapper();
    const result = run(source, target, ["--force", "--yes"], {
      PATH: `${wrapper}:${process.env.PATH}`,
      TDK_TEST_TARGET_MANIFEST: join(target, ".specify/release-manifest.json"),
    });
    const resultOutput = output(result);

    expect(result.exitCode).not.toBe(0);
    expect(resultOutput).toContain("target release manifest changed after publish");
    expect(resultOutput).not.toContain("Distribution complete!");
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe("consumer setup\n");
    expect(readFileSync(join(target, ".specify/release-manifest.json"), "utf8"))
      .toBe("externally corrupted manifest\n");
  });
  test("force aborts when an absent prior-only path appears after classification", async () => {
    const source = makeSource("source setup\n");
    const target = makeLegacyTarget("consumer setup\n", {
      ".specify/setup.sh": entry("consumer setup\n"),
      ".specify/late-orphan.md": entry("prior orphan\n"),
    });
    const manifestPath = join(target, ".specify/release-manifest.json");
    const before = readFileSync(manifestPath, "utf8");
    const child = Bun.spawn(["bash", join(source, "distribute.sh"), target, "--force", "--yes-delete"], {
      cwd: source,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    const reader = child.stdout.getReader();
    const prompt = await readUntil(reader, "Destructively overwrite consumer changes");
    expect(prompt).toContain("Destructively overwrite consumer changes");
    writeFileSync(join(target, ".specify/late-orphan.md"), "appeared late\n");
    child.stdin.write("yes\n");
    child.stdin.end();
    await child.exited;

    expect(child.exitCode).not.toBe(0);
    expect(await new Response(child.stderr).text()).toContain("appeared after classification");
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe("consumer setup\n");
    expect(readFileSync(manifestPath, "utf8")).toBe(before);
  });
  test("force aborts when a target changes after the physical preimage snapshot", () => {
    const source = makeSource("source setup\n");
    const target = makeLegacyTarget("consumer setup\n");
    const manifestPath = join(target, ".specify/release-manifest.json");
    const before = readFileSync(manifestPath, "utf8");
    const wrapper = makeBackupMutationWrapper();
    const result = run(source, target, ["--force", "--yes"], {
      PATH: `${wrapper}:${process.env.PATH}`,
      TDK_TEST_TARGET_PAYLOAD: join(target, ".specify/setup.sh"),
    });
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("force target changed after snapshot");
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe("external mutation\n");
    expect(readFileSync(manifestPath, "utf8")).toBe(before);
  });
  test("TERM rolls back completed force mutations and preserves the prior manifest", async () => {
    const source = makeSource("new setup\n");
    writeFileSync(join(source, "distribute.json"), JSON.stringify({
      ship: [".specify/another.md", ".specify/setup.sh", ".specify/release-manifest.json"],
      doNotShip: [],
    }));
    writeFileSync(join(source, ".specify/another.md"), "new first\n");
    writeManifest(source, {
      ".specify/another.md": entry("new first\n"),
      ".specify/setup.sh": entry("new setup\n"),
    });
    const target = makeLegacyTarget("old setup\n", {
      ".specify/another.md": entry("old first\n"),
      ".specify/setup.sh": entry("old setup\n"),
    });
    writeFileSync(join(target, ".specify/another.md"), "old first\n");
    const manifestPath = join(target, ".specify/release-manifest.json");
    const before = readFileSync(manifestPath, "utf8");
    const control = makeRoot("tdk-mode-signal-control-");
    const marker = join(control, "blocked");
    const release = join(control, "release");
    const blockingSource = join(source, ".specify/setup.sh");
    const wrapper = makeBlockingCopyWrapper();
    const child = Bun.spawn(["bash", join(source, "distribute.sh"), target, "--force", "--yes", "--no-delete"], {
      cwd: source,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: `${wrapper}:${process.env.PATH}`,
        TDK_TEST_BLOCKING_SOURCE: blockingSource,
        TDK_TEST_BLOCKING_MARKER: marker,
        TDK_TEST_BLOCKING_RELEASE: release,
      },
    });

    for (let attempt = 0; attempt < 200 && !existsSync(marker); attempt += 1) {
      await Bun.sleep(10);
    }
    expect(existsSync(marker)).toBe(true);
    child.kill("SIGTERM");
    writeFileSync(release, "continue\n");
    await child.exited;
    const resultOutput = `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}`;

    expect(child.exitCode).not.toBe(0);
    expect(resultOutput).toContain("interrupted by TERM");
    expect(readFileSync(join(target, ".specify/another.md"), "utf8")).toBe("old first\n");
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe("old setup\n");
    expect(readFileSync(manifestPath, "utf8")).toBe(before);
    expect(readdirSync(join(target, ".specify")).filter((name) => name.startsWith(".distribute.")))
      .toEqual([]);
  });
  test("TERM after payload mv records the mutation before rollback", () => {
    const source = makeSource("new setup\n");
    const target = makeLegacyTarget("old setup\n");
    const manifestPath = join(target, ".specify/release-manifest.json");
    const before = readFileSync(manifestPath, "utf8");
    const marker = join(makeRoot("tdk-mode-post-mv-signal-control-"), "signaled");
    const wrapper = makePostMoveSignalWrapper();
    const result = run(source, target, ["--force", "--yes"], {
      PATH: `${wrapper}:${process.env.PATH}`,
      TDK_TEST_SIGNAL_TARGET: join(target, ".specify/setup.sh"),
      TDK_TEST_SIGNAL_MARKER: marker,
    });

    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("interrupted by TERM");
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe("old setup\n");
    expect(readFileSync(manifestPath, "utf8")).toBe(before);
  });
  test("TERM after delete rm records the mutation before rollback", () => {
    const source = makeSource("new setup\n");
    const target = makeLegacyTarget("old setup\n", {
      ".specify/setup.sh": entry("old setup\n"),
      ".specify/old-managed.md": entry("old managed\n"),
    });
    writeFileSync(join(target, ".specify/old-managed.md"), "old managed\n");
    const manifestPath = join(target, ".specify/release-manifest.json");
    const before = readFileSync(manifestPath, "utf8");
    const marker = join(makeRoot("tdk-mode-post-rm-signal-control-"), "signaled");
    const wrapper = makePostRemoveSignalWrapper();
    const result = run(source, target, ["--force", "--yes", "--yes-delete"], {
      PATH: `${wrapper}:${process.env.PATH}`,
      TDK_TEST_SIGNAL_TARGET: join(target, ".specify/old-managed.md"),
      TDK_TEST_SIGNAL_MARKER: marker,
    });

    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("interrupted by TERM");
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe("old setup\n");
    expect(readFileSync(join(target, ".specify/old-managed.md"), "utf8")).toBe("old managed\n");
    expect(readFileSync(manifestPath, "utf8")).toBe(before);
  });
  test("TERM after manifest mv exits only after the consistent transaction commits", () => {
    const source = makeSource("new setup\n");
    const target = makeLegacyTarget("old setup\n");
    const marker = join(makeRoot("tdk-mode-post-manifest-signal-control-"), "signaled");
    const wrapper = makePostMoveSignalWrapper();
    const result = run(source, target, ["--force", "--yes"], {
      PATH: `${wrapper}:${process.env.PATH}`,
      TDK_TEST_SIGNAL_TARGET: join(target, ".specify/release-manifest.json"),
      TDK_TEST_SIGNAL_MARKER: marker,
    });

    expect(result.exitCode).not.toBe(0);
    expect(output(result)).toContain("committed before handling TERM");
    expect(readFileSync(join(target, ".specify/setup.sh"), "utf8")).toBe("new setup\n");
    expect(JSON.parse(readFileSync(join(target, ".specify/release-manifest.json"), "utf8"))
      .files[".specify/setup.sh"]).toEqual(entry("new setup\n"));
    expect(readdirSync(join(target, ".specify")).filter((name) => name.startsWith(".release-manifest.previous.")))
      .toEqual([]);
  });
});

function runHashCaller(path: string) {
  const source = readFileSync(DISTRIBUTE_SH, "utf8");
  const hashFunction = source.match(/^file_sha256\(\) \{[\s\S]*?^\}$/m)?.[0];
  if (!hashFunction) throw new Error("file_sha256 function not found");
  return Bun.spawnSync({
    cmd: ["bash", "-c", `${hashFunction}
if digest="$(file_sha256 "$1")"; then
  printf 'accepted:%s\\n' "$digest"
  exit 0
fi
printf 'rejected\\n'
exit 1`, "--", path],
    stdout: "pipe",
    stderr: "pipe",
  });
}

function writeMalformedDiffProducer(source: string, output: string): void {
  writeFileSync(join(source, ".claude/skills/tdk-bump/scripts/diff-release-manifests.ts"), `
const args = process.argv.slice(2);
if (args.includes("--validate-root")) process.exit(0);
if (args[args.indexOf("--output") + 1] === "nul") process.stdout.write(${JSON.stringify(output)});
`);
}

function makeManifestMutationWrapper(): string {
  const wrapper = makeRoot("tdk-mode-mv-wrapper-");
  writeFileSync(join(wrapper, "mv"), `#!/usr/bin/env bash
if [[ "$3" == "$TDK_TEST_TARGET_MANIFEST" ]]; then printf 'external mutation\\n' > "$TDK_TEST_TARGET_PAYLOAD"; fi
exec /bin/mv "$@"
`);
  chmodSync(join(wrapper, "mv"), 0o755);
  return wrapper;
}

function makePostPublishManifestMutationWrapper(): string {
  const wrapper = makeRoot("tdk-mode-post-publish-mv-wrapper-");
  writeFileSync(join(wrapper, "mv"), `#!/usr/bin/env bash
/bin/mv "$@"
status=$?
if [[ $status -eq 0 && "\${3:-}" == "$TDK_TEST_TARGET_MANIFEST" ]]; then
  printf 'externally corrupted manifest\\n' > "$TDK_TEST_TARGET_MANIFEST"
fi
exit $status
`);
  chmodSync(join(wrapper, "mv"), 0o755);
  return wrapper;
}

function makeBackupMutationWrapper(): string {
  const wrapper = makeRoot("tdk-mode-cp-wrapper-");
  writeFileSync(join(wrapper, "cp"), `#!/usr/bin/env bash
if ! /bin/cp "$@"; then exit $?; fi
if [[ "\${2:-}" == "$TDK_TEST_TARGET_PAYLOAD" ]]; then
  printf 'external mutation\\n' > "$TDK_TEST_TARGET_PAYLOAD"
fi
`);
  chmodSync(join(wrapper, "cp"), 0o755);
  return wrapper;
}

function makeBlockingCopyWrapper(): string {
  const wrapper = makeRoot("tdk-mode-blocking-cp-wrapper-");
  writeFileSync(join(wrapper, "cp"), `#!/usr/bin/env bash
if [[ "\${2:-}" == "$TDK_TEST_BLOCKING_SOURCE" ]]; then
  : > "$TDK_TEST_BLOCKING_MARKER"
  while [[ ! -e "$TDK_TEST_BLOCKING_RELEASE" ]]; do sleep 0.01; done
fi
exec /bin/cp "$@"
`);
  chmodSync(join(wrapper, "cp"), 0o755);
  return wrapper;
}

function makePostMoveSignalWrapper(): string {
  const wrapper = makeRoot("tdk-mode-post-mv-signal-wrapper-");
  writeFileSync(join(wrapper, "mv"), `#!/usr/bin/env bash
/bin/mv "$@"
status=$?
if [[ $status -eq 0 && "\${3:-}" == "$TDK_TEST_SIGNAL_TARGET" && ! -e "$TDK_TEST_SIGNAL_MARKER" ]]; then
  : > "$TDK_TEST_SIGNAL_MARKER"
  kill -TERM "$PPID"
fi
exit $status
`);
  chmodSync(join(wrapper, "mv"), 0o755);
  return wrapper;
}

function makePostRemoveSignalWrapper(): string {
  const wrapper = makeRoot("tdk-mode-post-rm-signal-wrapper-");
  writeFileSync(join(wrapper, "rm"), `#!/usr/bin/env bash
/bin/rm "$@"
status=$?
for arg in "$@"; do
  if [[ $status -eq 0 && "$arg" == "$TDK_TEST_SIGNAL_TARGET" && ! -e "$TDK_TEST_SIGNAL_MARKER" ]]; then
    : > "$TDK_TEST_SIGNAL_MARKER"
    kill -TERM "$PPID"
    break
  fi
done
exit $status
`);
  chmodSync(join(wrapper, "rm"), 0o755);
  return wrapper;
}

function mutationEnvironment(wrapper: string, target: string): Record<string, string> {
  return {
    PATH: `${wrapper}:${process.env.PATH}`,
    TDK_TEST_TARGET_MANIFEST: join(target, ".specify/release-manifest.json"),
    TDK_TEST_TARGET_PAYLOAD: join(target, ".specify/setup.sh"),
  };
}

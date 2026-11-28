import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { writeFixtureMarketplace } from "./fixture-marketplace";

const ROOT = resolve(import.meta.dir, "../../../..");
const TOOLING = ".claude/skills/tdk-bump/scripts";
const TIMEOUT_MS = 60_000;
const ANSI = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const SUMMARY_HEADER = "━━━ Summary";
const RESULT_HEADER = "━━━ Result";
const SUCCESS_TEXT = "Distribution complete!";
const TARGET_MANIFEST = ".specify/release-manifest.json";
const temporaryRoots: string[] = [];

interface Fixture {
  scratch: string;
  source: string;
  target: string;
}

interface RunResult {
  exitCode: number;
  text: string;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): Fixture {
  const scratch = mkdtempSync(join(tmpdir(), "tdk-version-line-"));
  temporaryRoots.push(scratch);
  const source = join(scratch, "source");
  const target = join(scratch, "target");
  mkdirSync(join(source, ".specify"), { recursive: true });
  mkdirSync(target, { recursive: true });
  cpSync(join(ROOT, "distribute.sh"), join(source, "distribute.sh"));
  cpSync(join(ROOT, TOOLING), join(source, TOOLING), { recursive: true });
  writeFileSync(join(source, "distribute.json"), JSON.stringify({
    ship: [".specify/setup.sh", TARGET_MANIFEST], doNotShip: [],
  }));
  setPayload(source, "first");
  return { scratch, source, target };
}

function setPayload(source: string, label: string): void {
  writeFileSync(join(source, ".specify/setup.sh"), `#!/usr/bin/env bash\necho ${label}\n`);
}

// Writes the fixture marketplace version and regenerates the source release manifest,
// the same way existing distribute tests do. Never hand-edits the manifest.
function publishRelease(f: Fixture, version: string): void {
  writeFixtureMarketplace(f.source, version);
  const result = Bun.spawnSync({
    cmd: [process.execPath, join(f.source, TOOLING, "generate-release-manifest.ts"), "--project-root", f.source, "--write"],
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
}

function distribute(f: Fixture, args: string[] = []): RunResult {
  const result = Bun.spawnSync({
    cmd: ["bash", join(f.source, "distribute.sh"), f.target, "--yes", ...args],
    cwd: f.source, stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const text = `${result.stdout}\n${result.stderr}`.replace(ANSI, "");
  return { exitCode: result.exitCode, text };
}

function expectSuccess(run: RunResult): void {
  expect(run.exitCode, run.text).toBe(0);
  expect(run.text, run.text).toContain(SUCCESS_TEXT);
}

function readTargetManifest(f: Fixture): Record<string, unknown> {
  return JSON.parse(readFileSync(join(f.target, TARGET_MANIFEST), "utf8"));
}

// Returns the TDK version lines that appear inside one output section, from its header
// up to the next "━━━" header. Asserting on a bounded slice keeps a stray line elsewhere
// from satisfying the check.
function versionLinesIn(text: string, header: string): string[] {
  const start = text.indexOf(header);
  expect(start, text).toBeGreaterThan(-1);
  const rest = text.slice(start + header.length);
  const next = rest.indexOf("━━━ ");
  const body = next === -1 ? rest : rest.slice(0, next);
  return body.split("\n").map(line => line.trim()).filter(line => line.startsWith("TDK version:"));
}

function expectVersionLines(run: RunResult, expected: string, { result = true }: { result?: boolean } = {}): void {
  expect(versionLinesIn(run.text, SUMMARY_HEADER), run.text).toEqual([`TDK version: ${expected}`]);
  if (result) {
    expect(versionLinesIn(run.text, RESULT_HEADER), run.text).toEqual([`TDK version: ${expected}`]);
    const resultLine = `TDK version: ${expected}`;
    expect(run.text.indexOf(resultLine, run.text.indexOf(RESULT_HEADER)), run.text).toBeLessThan(run.text.indexOf(SUCCESS_TEXT));
  }
}

// Relative path -> file bytes for every regular file under dir, so a dry run must leave
// the whole tree unchanged, including files it could have rewritten in place.
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const rel of readdirSync(dir, { recursive: true }) as string[]) {
    const full = join(dir, rel);
    if (statSync(full).isFile()) files[rel] = readFileSync(full, "base64");
  }
  return files;
}

describe("distribute TDK version line", () => {
  test("fresh target without a release manifest shows unknown and the source version in Summary and Result", () => {
    const f = fixture();
    try {
      publishRelease(f, "1.2.3");
      const run = distribute(f);
      expectSuccess(run);
      expectVersionLines(run, "unknown → 1.2.3");
      expect(readTargetManifest(f).tdkVersion).toBe("1.2.3");
    } finally { rmSync(f.scratch, { recursive: true, force: true }); }
  }, TIMEOUT_MS);

  for (const prefixArgs of [[], ["--prefix", "sample"]] as const) {
    const label = prefixArgs.length ? "with prefix" : "without prefix";
    test(`re-distribute after a version bump shows the pre-publish target version, not the new one (${label})`, () => {
      const f = fixture();
      try {
        publishRelease(f, "1.2.3");
        const first = distribute(f, [...prefixArgs]);
        expectSuccess(first);
        // Precondition: the first publish must have written X, or the next assertion is vacuous.
        expect(readTargetManifest(f).tdkVersion).toBe("1.2.3");

        setPayload(f.source, "second");
        publishRelease(f, "1.3.0");
        const second = distribute(f, [...prefixArgs]);
        expectSuccess(second);
        expectVersionLines(second, "1.2.3 → 1.3.0");
        expect(second.text).not.toContain("1.3.0 → 1.3.0");
        expect(readTargetManifest(f).tdkVersion).toBe("1.3.0");
      } finally { rmSync(f.scratch, { recursive: true, force: true }); }
    }, TIMEOUT_MS);
  }

  test("dry run prints the Summary line and leaves the target tree byte-identical", () => {
    const f = fixture();
    try {
      publishRelease(f, "1.2.3");
      expectSuccess(distribute(f));
      const before = snapshot(f.target);

      setPayload(f.source, "second");
      publishRelease(f, "1.3.0");
      const run = distribute(f, ["--dry-run"]);
      expect(run.exitCode, run.text).toBe(0);
      expectVersionLines(run, "1.2.3 → 1.3.0", { result: false });
      expect(run.text, run.text).not.toContain(RESULT_HEADER);
      expect(snapshot(f.target)).toEqual(before);
    } finally { rmSync(f.scratch, { recursive: true, force: true }); }
  }, TIMEOUT_MS);

  test("dry run against a fresh target shows unknown and creates nothing", () => {
    const f = fixture();
    try {
      publishRelease(f, "1.2.3");
      const run = distribute(f, ["--dry-run"]);
      expect(run.exitCode, run.text).toBe(0);
      expectVersionLines(run, "unknown → 1.2.3", { result: false });
      expect(readdirSync(f.target)).toEqual([]);
    } finally { rmSync(f.scratch, { recursive: true, force: true }); }
  }, TIMEOUT_MS);

  for (const corrupted of [123, "not-a-version"] as const) {
    test(`target manifest with non-semver tdkVersion ${JSON.stringify(corrupted)} shows unknown and still succeeds`, () => {
      const f = fixture();
      try {
        publishRelease(f, "1.2.3");
        expectSuccess(distribute(f));

        const manifestPath = join(f.target, TARGET_MANIFEST);
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        manifest.tdkVersion = corrupted;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

        // A payload change makes the run reach Result instead of exiting on "Nothing to sync".
        setPayload(f.source, "second");
        publishRelease(f, "1.2.3");
        const run = distribute(f);
        expectSuccess(run);
        expectVersionLines(run, "unknown → 1.2.3");
        expect(readTargetManifest(f).tdkVersion).toBe("1.2.3");
      } finally { rmSync(f.scratch, { recursive: true, force: true }); }
    }, TIMEOUT_MS);
  }

  test("unchanged rerun prints the Summary line, exits 0, and omits the Result block", () => {
    const f = fixture();
    try {
      publishRelease(f, "1.2.3");
      expectSuccess(distribute(f));
      const run = distribute(f);
      expect(run.exitCode, run.text).toBe(0);
      expect(run.text, run.text).toContain("Target is already up to date");
      expectVersionLines(run, "1.2.3 → 1.2.3", { result: false });
      expect(run.text, run.text).not.toContain(RESULT_HEADER);
    } finally { rmSync(f.scratch, { recursive: true, force: true }); }
  }, TIMEOUT_MS);

  test("failing run exits non-zero and prints no version line in the Result block", () => {
    const f = fixture();
    try {
      publishRelease(f, "1.2.3");
      // A consumer edit to a managed file with no matching checksum fails preflight, before publication.
      mkdirSync(join(f.target, ".specify"), { recursive: true });
      writeFileSync(join(f.target, ".specify/setup.sh"), "consumer-owned\n");
      const run = distribute(f);
      expect(run.exitCode, run.text).not.toBe(0);
      expect(run.text, run.text).toContain("checksum proof failed for managed target");
      expect(run.text, run.text).not.toContain(SUCCESS_TEXT);
      expect(run.text, run.text).not.toContain(RESULT_HEADER);
      // Preflight fails before the Summary block, so no version line is printed at all.
      expect(run.text, run.text).not.toContain("TDK version:");
    } finally { rmSync(f.scratch, { recursive: true, force: true }); }
  }, TIMEOUT_MS);
});

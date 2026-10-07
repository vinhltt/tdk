import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const TDK_ROOT = resolve(import.meta.dir, "../../../..");
const TOOLING = ".claude/skills/tdk-bump/scripts";
const SETUP_PACKAGE = "packages/tdk-setup";
const BASH = Bun.which("bash")!;
const temporaryRoots: string[] = [];
const STALE_NOTICE = "STALE: harness projection is behind .specify/plugins";

interface Fixture {
  root: string;
  source: string;
  target: string;
  cwd: string;
  prefix?: string;
  skills: Record<string, string>;
}

interface CommandResult {
  exitCode: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function put(root: string, rel: string, contents: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), contents);
}

function output(result: CommandResult): string {
  return `${Buffer.from(result.stdout)}\n${Buffer.from(result.stderr)}`.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function expectSuccess(result: CommandResult): void {
  expect(result.exitCode, output(result)).toBe(0);
}

function regenerateRelease(f: Fixture): void {
  expectSuccess(Bun.spawnSync({
    cmd: [process.execPath, join(f.source, TOOLING, "generate-release-manifest.ts"), "--project-root", f.source, "--write"],
    cwd: f.cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe",
  }));
}

function writePluginManifest(f: Fixture): void {
  const plugins = Object.fromEntries(Object.entries(f.skills).map(([plugin, content]) => {
    const skill = plugin === "tdk-core" ? "tdk-demo" : `${plugin}-demo`;
    put(f.source, `.specify/plugins/${plugin}/skills/${skill}/SKILL.md`, content);
    return [plugin, {
      version: "1.0.0",
      components: { skills: {}, agents: {}, hooks: {}, commands: {} },
      files: { [`skills/${skill}/SKILL.md`]: createHash("sha256").update(content).digest("hex") },
    }];
  }));
  put(f.source, ".specify/plugins/manifest.json", JSON.stringify({
    algorithm: "sha256", generated_at: "2026-10-04T00:00:00Z", plugins,
  }));
}

function setup(f: Fixture, args: string[]): CommandResult {
  return Bun.spawnSync({
    cmd: [process.execPath, join(f.source, SETUP_PACKAGE, "src/index.ts"), ...args],
    cwd: f.cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
}

function fixture(selection: string[] = [], prefix?: string): Fixture {
  const root = mkdtempSync(join(tmpdir(), "tdk-distribute-freshness-"));
  temporaryRoots.push(root);
  const f: Fixture = {
    root, source: join(root, "source with spaces"), target: join(root, "consumer with spaces"),
    cwd: join(root, "unrelated cwd"), prefix, skills: {},
  };
  for (const dir of [f.source, f.target, f.cwd]) mkdirSync(dir, { recursive: true });
  cpSync(join(TDK_ROOT, "distribute.sh"), join(f.source, "distribute.sh"));
  cpSync(join(TDK_ROOT, TOOLING), join(f.source, TOOLING), { recursive: true });
  cpSync(join(TDK_ROOT, SETUP_PACKAGE, "src"), join(f.source, SETUP_PACKAGE, "src"), { recursive: true });
  cpSync(join(TDK_ROOT, SETUP_PACKAGE, "package.json"), join(f.source, SETUP_PACKAGE, "package.json"));
  symlinkSync(join(TDK_ROOT, SETUP_PACKAGE, "node_modules"), join(f.source, SETUP_PACKAGE, "node_modules"), "junction");
  put(f.source, "distribute.json", JSON.stringify({
    ship: [".specify/setup.sh", ".specify/scripts/ts/", ".specify/plugins/", ".specify/release-manifest.json"],
    doNotShip: [],
  }));
  put(f.source, ".specify/setup.sh", "#!/usr/bin/env bash\necho first\n");
  put(f.source, ".specify/scripts/ts/package.json", '{"name":"scratch-substrate"}\n');
  for (const plugin of ["tdk-core", ...selection]) {
    const skill = plugin === "tdk-core" ? "tdk-demo" : `${plugin}-demo`;
    f.skills[plugin] = `---\nname: ${skill}\ndescription: Fixture skill\n---\n# ${skill}\nInitial payload.\n`;
  }
  writePluginManifest(f);
  put(f.source, ".specify/plugins/plugin-dependencies.json", JSON.stringify({
    version: 1, requiredPlugins: ["tdk-core"], dependencies: {},
  }));
  regenerateRelease(f);
  cpSync(join(f.source, ".specify"), join(f.target, ".specify"), { recursive: true });
  expectSuccess(setup(f, [
    "install", f.target, "--harness", "claude", "--plugins", selection.join(",") || "tdk-core",
    ...(prefix ? ["--prefix", prefix] : []), "--yes",
  ]));
  expectSuccess(setup(f, ["convert-flat", f.target, "--harness", "omp", "--parts", "skills", "--yes"]));
  return f;
}

function changeSetup(f: Fixture): void {
  put(f.source, ".specify/setup.sh", "#!/usr/bin/env bash\necho synced\n");
  regenerateRelease(f);
}

function changeSkill(f: Fixture): void {
  f.skills["tdk-core"] += "Payload changed without a version bump.\n";
  writePluginManifest(f);
  regenerateRelease(f);
}

function distribute(f: Fixture, args: string[] = [], env: Record<string, string> = {}): CommandResult {
  return Bun.spawnSync({
    cmd: [BASH, join(f.source, "distribute.sh"), f.target, "--yes", "--yes-delete", ...(f.prefix ? ["--prefix", f.prefix] : []), ...args],
    cwd: f.cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env },
  });
}

function harnessSnapshot(f: Fixture): Record<string, string> {
  const files: Record<string, string> = {};
  function walk(rel: string): void {
    const absolute = join(f.target, rel);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else files[child] = readFileSync(join(f.target, child)).toString("base64");
    }
  }
  for (const rel of [".claude", ".omp", ".specify/state/harness-install"]) walk(rel);
  const settings = ".specify/install-settings.json";
  if (existsSync(join(f.target, settings))) files[settings] = readFileSync(join(f.target, settings)).toString("base64");
  return files;
}

function removeOmpSkill(f: Fixture): void {
  const manifest = JSON.parse(readFileSync(join(f.target, ".specify/state/harness-install/omp.json"), "utf8"));
  const skill = manifest.managedFiles.find((file: { targetRelativePath: string }) => file.targetRelativePath.startsWith(".omp/skills/"));
  expect(skill).toBeDefined();
  rmSync(join(f.target, skill.targetRelativePath));
}

function expectRunnableInstallHints(f: Fixture, text: string, plugins: string[]): void {
  const commands = [...new Set(text.split("\n")
    .map(line => line.replace(/^\s*(?:(?:Next|Install):\s*)?/, ""))
    .filter(line => line.startsWith("bun ")))];
  if (commands.length === 0) throw new Error("Distribution did not emit an installer command");
  const before = harnessSnapshot(f);
  for (const command of commands) {
    const result = Bun.spawnSync({
      cmd: [BASH, "-c", command], cwd: f.cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe",
    });
    expectSuccess(result);
    const requested = output(result).match(/^Requested optional plugins:\s*(.+)$/m)?.[1];
    expect(requested === "(none)" ? [] : requested?.split(/,\s*/).sort()).toEqual([...plugins].sort());
    expect(harnessSnapshot(f)).toEqual(before);
  }
}

function copyWrapper(f: Fixture, body: string): string {
  const bin = join(f.root, "bin");
  mkdirSync(bin, { recursive: true });
  put(bin, "cp", `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
  chmodSync(join(bin, "cp"), 0o755);
  return bin;
}

describe("distribute.sh real harness freshness", () => {
  test("stale payload prints a notice and selection-preserving hints from an unrelated cwd without modifying either harness", () => {
    const f = fixture(["tdk-extra-one", "tdk-extra-two"]);
    const before = harnessSnapshot(f);
    changeSkill(f);
    const result = distribute(f);
    expectSuccess(result);
    const text = output(result);
    expect(text).toContain("Distribution complete!");
    expect(text).toContain(STALE_NOTICE);
    expect(text).toContain("Claude projection is stale (");
    expect(text).not.toContain("Harness freshness not checked");
    expectRunnableInstallHints(f, text, ["tdk-extra-one", "tdk-extra-two"]);
    expect(text).not.toContain("--plugins tdk-core");
    expect(readFileSync(join(f.target, ".specify/plugins/tdk-core/skills/tdk-demo/SKILL.md"), "utf8")).toBe(f.skills["tdk-core"]);
    expect(harnessSnapshot(f)).toEqual(before);
  });

  test("fresh Claude and OMP projections are silent after a real payload sync", () => {
    const f = fixture();
    const before = harnessSnapshot(f);
    changeSetup(f);
    const result = distribute(f);
    expectSuccess(result);
    expect(output(result)).toContain("Distribution complete!");
    expect(output(result)).not.toContain(STALE_NOTICE);
    expect(output(result)).not.toContain("Harness freshness not checked");
    expect(output(result)).not.toContain("Claude projection is current");
    expect(output(result)).not.toContain("No OMP convert-flat drift detected");
    expect(harnessSnapshot(f)).toEqual(before);
  });

  test("saved prefix stays fresh and explicit distribution prefix survives every hint", () => {
    const f = fixture(["tdk-extra-one"], "sample");
    changeSetup(f);
    const result = distribute(f);
    expectSuccess(result);
    expect(output(result)).not.toContain(STALE_NOTICE);
    expect(output(result)).not.toContain("Harness freshness not checked");
    expectRunnableInstallHints(f, output(result), ["tdk-extra-one"]);
    expect(existsSync(join(f.target, ".claude/skills/sample-demo/SKILL.md"))).toBe(true);
  });

  test("local-only managed edits are preserved and do not produce a stale notice", () => {
    const f = fixture();
    put(f.target, ".claude/skills/tdk-demo/SKILL.md", `${f.skills["tdk-core"]}Local edit.\n`);
    // OMP really is fresh relative to this local Claude source after conversion.
    expectSuccess(setup(f, ["convert-flat", f.target, "--harness", "omp", "--parts", "skills", "--yes"]));
    const before = harnessSnapshot(f);
    changeSetup(f);
    const result = distribute(f);
    expectSuccess(result);
    expect(output(result)).not.toContain(STALE_NOTICE);
    expect(output(result)).not.toContain("Harness freshness not checked");
    expect(harnessSnapshot(f)).toEqual(before);
  });

  test("both stale checks report their actual drift with Claude before OMP", () => {
    const f = fixture();
    removeOmpSkill(f);
    changeSkill(f);
    const result = distribute(f);
    expectSuccess(result);
    const text = output(result);
    expect(text).toContain(STALE_NOTICE);
    expect(text).toContain("OMP convert-flat drift detected:");
    expect(text.indexOf("Claude projection is stale (")).toBeLessThan(text.indexOf("OMP convert-flat drift detected:"));
    expect(text).not.toContain("Harness freshness not checked");
  });

  for (const failed of ["claude", "omp"] as const) {
    test(`${failed} operational failure is not stale, while the other proved drift is still reported`, () => {
      const f = fixture();
      put(f.target, `.specify/state/harness-install/${failed}.json`, "{invalid json\n");
      if (failed === "omp") changeSkill(f);
      else { removeOmpSkill(f); changeSetup(f); }
      const result = distribute(f);
      expectSuccess(result);
      expect(output(result)).toContain(STALE_NOTICE);
      expect(output(result)).toContain(`Harness freshness not checked (${failed} check exited 2)`);
      expect(output(result)).toContain(`[tdk-setup ${failed === "claude" ? "install" : "convert-flat"}] error:`);
    });
  }

  test("an invalid Claude manifest with otherwise fresh OMP is not a stale consumer", () => {
    const f = fixture();
    put(f.target, ".specify/state/harness-install/claude.json", "{invalid json\n");
    changeSetup(f);
    const result = distribute(f);
    expectSuccess(result);
    expect(output(result)).not.toContain(STALE_NOTICE);
    expect(output(result)).toContain("Harness freshness not checked (claude check exited 2)");
  });

  test("missing harness manifests report not checked after successful sync", () => {
    const f = fixture();
    rmSync(join(f.target, ".specify/state/harness-install"), { recursive: true });
    changeSetup(f);
    const result = distribute(f);
    expectSuccess(result);
    expect(output(result)).not.toContain(STALE_NOTICE);
    expect(output(result)).toContain("Harness freshness not checked (claude manifest missing)");
    expect(output(result)).toContain("Harness freshness not checked (omp manifest missing)");
  });

  for (const selection of ["nonempty", "empty", "missing"] as const) {
    test(`${selection} saved selection produces consistent, runnable dry-run hints`, () => {
      const plugins = selection === "nonempty" ? ["tdk-extra-one", "tdk-extra-two"] : [];
      const f = fixture(plugins);
      if (selection === "missing") rmSync(join(f.target, ".specify/install-settings.json"));
      changeSetup(f);
      const result = distribute(f);
      expectSuccess(result);
      expectRunnableInstallHints(f, output(result), plugins);
      const preview = distribute(f, ["--dry-run"]);
      expectSuccess(preview);
      expectRunnableInstallHints(f, output(preview), plugins);
      expect(output(preview)).not.toContain("Harness freshness not checked");
    });
  }

  test("missing source setup dependencies are not checked and do not change distribution success", () => {
    const f = fixture();
    rmSync(join(f.source, SETUP_PACKAGE, "node_modules"));
    changeSetup(f);
    const result = distribute(f);
    expectSuccess(result);
    expect(output(result)).not.toContain(STALE_NOTICE);
    expect(output(result)).toContain("Harness freshness not checked (tdk-setup dependencies missing)");
  });

  test("Bun startup failures from an empty dependency directory are not mistaken for rc=1 drift", () => {
    const f = fixture();
    rmSync(join(f.source, SETUP_PACKAGE, "node_modules"));
    mkdirSync(join(f.source, SETUP_PACKAGE, "node_modules"));
    changeSetup(f);
    const result = distribute(f);
    expectSuccess(result);
    expect(output(result)).not.toContain(STALE_NOTICE);
    expect(output(result)).toContain("Harness freshness not checked (claude check exited 1 without a drift result)");
    expect(output(result)).toContain("Harness freshness not checked (omp check exited 1 without a drift result)");
    expect(output(result)).toContain("Cannot find package");
  });

  test("bun disappearing after real manifest publication reports not checked without failing the sync", () => {
    const f = fixture();
    changeSetup(f);
    const realCp = Bun.which("cp")!;
    const bin = copyWrapper(f, `"$REAL_CP" "$@"\nfor argument in "$@"; do\n  if [[ "$argument" == "$SOURCE_RELEASE_FILE" ]]; then rm -f "$BUN_WRAPPER"; fi\ndone`);
    // Restrict PATH rather than installing a fake freshness CLI. Every command is
    // real; cp only removes the runtime link after publishing the real payload.
    for (const tool of ["bash", "dirname", "date", "mktemp", "rm", "find", "sha256sum", "shasum", "mkdir", "mv", "chmod", "stat", "git", "cat", "readlink", "sort", "tr", "cmp", "rmdir", "touch", "wc", "node"]) {
      const executable = Bun.which(tool);
      if (executable) symlinkSync(executable, join(bin, tool));
    }
    symlinkSync(process.execPath, join(bin, "bun"));
    const result = distribute(f, [], {
      PATH: bin, REAL_CP: realCp, SOURCE_RELEASE_FILE: join(f.source, ".specify/release-manifest.json"), BUN_WRAPPER: join(bin, "bun"),
    });
    expectSuccess(result);
    expect(output(result)).toContain("Distribution complete!");
    expect(output(result)).not.toContain(STALE_NOTICE);
    expect(output(result)).toContain("Harness freshness not checked (bun not available)");
    expect(existsSync(join(bin, "bun"))).toBe(false);
    expect(readFileSync(join(f.target, ".specify/setup.sh"), "utf8")).toBe(readFileSync(join(f.source, ".specify/setup.sh"), "utf8"));
  });

  test("distribution dry-run skips checks even when drift and a check error are waiting", () => {
    const f = fixture(["tdk-extra-one"]);
    put(f.target, ".specify/state/harness-install/omp.json", "{invalid json\n");
    changeSkill(f);
    const before = harnessSnapshot(f);
    const payload = readFileSync(join(f.target, ".specify/plugins/tdk-core/skills/tdk-demo/SKILL.md"));
    const result = distribute(f, ["--dry-run"]);
    expectSuccess(result);
    expect(output(result)).toContain("Dry-run complete. No files were written.");
    expect(output(result)).not.toContain(STALE_NOTICE);
    expect(output(result)).not.toContain("Harness freshness not checked");
    expect(output(result)).not.toContain("[tdk-setup convert-flat] error:");
    expect(harnessSnapshot(f)).toEqual(before);
    expect(readFileSync(join(f.target, ".specify/plugins/tdk-core/skills/tdk-demo/SKILL.md"))).toEqual(payload);
  });

  test("failed real payload copying never runs freshness checks", () => {
    const f = fixture();
    changeSkill(f);
    changeSetup(f);
    const bin = copyWrapper(f, `for argument in "$@"; do\n  if [[ "$argument" == "$FAIL_COPY_SOURCE" ]]; then exit 72; fi\ndone\nexec "$REAL_CP" "$@"`);
    const result = distribute(f, [], {
      PATH: `${bin}:${process.env.PATH}`, REAL_CP: Bun.which("cp")!, FAIL_COPY_SOURCE: join(f.source, ".specify/setup.sh"),
    });
    expect(result.exitCode).not.toBe(0);
    expect(output(result)).not.toContain(STALE_NOTICE);
    expect(output(result)).not.toContain("Harness freshness not checked");
    expect(output(result)).not.toContain("Claude projection is stale (");
  });
});

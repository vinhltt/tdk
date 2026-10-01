import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../../..");
const TOOLING = ".claude/skills/tdk-bump/scripts";

interface PrefixFixture {
  scratch: string;
  source: string;
  target: string;
  temps: string;
}

function fixture() {
  const scratch = mkdtempSync(join(tmpdir(), "tdk-prefix-contract-"));
  const source = join(scratch, "source");
  const target = join(scratch, "target");
  const temps = join(scratch, "temps");
  for (const dir of [join(source, ".specify/docs"), target, temps]) mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, "distribute.sh"), join(source, "distribute.sh"));
  cpSync(join(ROOT, TOOLING), join(source, TOOLING), { recursive: true });
  writeFileSync(join(source, "distribute.json"), JSON.stringify({
    ship: [".specify/setup.sh", ".specify/docs/", ".specify/release-manifest.json"], doNotShip: [],
  }));
  writeFileSync(join(source, ".specify/setup.sh"), "#!/usr/bin/env bash\necho 'tdk-task TDK tdk'\n");
  chmodSync(join(source, ".specify/setup.sh"), 0o755);
  return { scratch, source, target, temps };
}

function manifest(source: string) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, join(source, TOOLING, "generate-release-manifest.ts"), "--project-root", source, "--write"],
    stdout: "pipe", stderr: "pipe",
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
}

function distribute(f: PrefixFixture, args: string[] = [], env: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: ["bash", join(f.source, "distribute.sh"), f.target, "--prefix", "sample", "--yes", ...args],
    stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: f.source,
    env: { ...process.env, TMPDIR: f.temps, ...env },
  });
}

function expectRenderedManifest(f: PrefixFixture) {
  const published = JSON.parse(readFileSync(join(f.target, ".specify/release-manifest.json"), "utf8"));
  for (const [rel, entry] of Object.entries(published.files) as [string, { sha256: string; size: number }][]) {
    const bytes = readFileSync(join(f.target, rel));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
    expect(bytes.byteLength).toBe(entry.size);
  }
}

describe("prefix batch distribution contracts", () => {
  test("bootstrap, new+updated sync and force publish branded bytes with source mode", () => {
    const f = fixture();
    try {
      manifest(f.source);
      const first = distribute(f, [], { TMPDIR: "../temps" });
      expect(first.exitCode, `${first.stdout}\n${first.stderr}`).toBe(0);
      expect(readFileSync(join(f.target, ".specify/setup.sh"), "utf8")).toBe("#!/usr/bin/env bash\necho 'sample-task SAMPLE sample'\n");
      expect(statSync(join(f.target, ".specify/setup.sh")).mode & 0o777).toBe(0o755);
      expectRenderedManifest(f);

      writeFileSync(join(f.source, ".specify/setup.sh"), "#!/usr/bin/env bash\necho 'tdk-updated TDK'\n");
      writeFileSync(join(f.source, ".specify/docs/new.md"), "tdk-new TDK tdk\n");
      manifest(f.source);
      const changed = distribute(f);
      expect(changed.exitCode, `${changed.stdout}\n${changed.stderr}`).toBe(0);
      expect(readFileSync(join(f.target, ".specify/setup.sh"), "utf8")).toBe("#!/usr/bin/env bash\necho 'sample-updated SAMPLE'\n");
      expect(readFileSync(join(f.target, ".specify/docs/new.md"), "utf8")).toBe("sample-new SAMPLE sample\n");
      expect(statSync(join(f.target, ".specify/setup.sh")).mode & 0o777).toBe(0o755);
      expectRenderedManifest(f);

      writeFileSync(join(f.target, ".specify/setup.sh"), "consumer edit\n");
      const forced = distribute(f, ["--force"]);
      expect(forced.exitCode, `${forced.stdout}\n${forced.stderr}`).toBe(0);
      expect(readFileSync(join(f.target, ".specify/setup.sh"), "utf8")).toBe("#!/usr/bin/env bash\necho 'sample-updated SAMPLE'\n");
      expectRenderedManifest(f);
      expect(readdirSync(f.temps)).toEqual([]);
    } finally { rmSync(f.scratch, { recursive: true, force: true }); }
  });

  test("helper UTF-8 failure after a valid file aborts before any target mutation and cleans staged bytes", () => {
    const f = fixture();
    try {
      writeFileSync(join(f.source, ".specify/docs/invalid.md"), Buffer.from([0xff]));
      manifest(f.source);
      const result = distribute(f);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain("prefix classification helper failed");
      expect(existsSync(join(f.target, ".specify/setup.sh"))).toBe(false);
      expect(existsSync(join(f.target, ".specify/release-manifest.json"))).toBe(false);
      expect(readdirSync(f.temps)).toEqual([]);
    } finally { rmSync(f.scratch, { recursive: true, force: true }); }
  });

  for (const corruption of ["missing-trailer", "wrong-count", "trailing-bytes", "truncated-record", "truncated-trailer"] as const) {
    test(`rejects ${corruption} from a successful helper without mutating the target`, () => {
      const f = fixture();
      try {
        manifest(f.source);
        const wrappers = join(f.scratch, "bin");
        mkdirSync(wrappers);
        // Invoke the real helper, then corrupt its transport. All other Bun calls
        // reach the real runtime, including manifest validation and publication.
        writeFileSync(join(wrappers, "bun"), `#!/usr/bin/env bash\nset -euo pipefail\nif [[ "$1" == */classify-distribution.ts ]]; then\n  "$REAL_BUN" -e '
const child = Bun.spawnSync({ cmd: [process.env.REAL_BUN, ...process.argv.slice(1)], stdout: "pipe", stderr: "pipe" });
process.stderr.write(child.stderr);
if (child.exitCode) process.exit(child.exitCode);
const fields = child.stdout.toString().split("\\0");
if (process.env.CORRUPTION === "missing-trailer") fields.splice(-5);
if (process.env.CORRUPTION === "wrong-count") fields[fields.length - 4] = "999";
let output = fields.join("\\0");
if (process.env.CORRUPTION === "missing-trailer") output += "\\0";
if (process.env.CORRUPTION === "trailing-bytes") output += "unexpected";
if (process.env.CORRUPTION === "truncated-record") output = fields.slice(0, 2).join("\\0") + "\\0";
if (process.env.CORRUPTION === "truncated-trailer") output = output.slice(0, -1);
process.stdout.write(output);
' "$@"\nelse\n  exec "$REAL_BUN" "$@"\nfi\n`);
        chmodSync(join(wrappers, "bun"), 0o755);
        const result = distribute(f, [], {
          REAL_BUN: process.execPath, CORRUPTION: corruption, PATH: `${wrappers}:${process.env.PATH}`,
        });
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr.toString()).toContain("invalid or incomplete prefix classification stream");
        expect(existsSync(join(f.target, ".specify/setup.sh"))).toBe(false);
        expect(existsSync(join(f.target, ".specify/release-manifest.json"))).toBe(false);
        expect(readdirSync(f.temps)).toEqual([]);
      } finally { rmSync(f.scratch, { recursive: true, force: true }); }
    });
  }
});

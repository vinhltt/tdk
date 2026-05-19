// Tests for collect-diff-data.ts — config loading (JSON-only) + pure helpers.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  classifyGroup,
  isExcluded,
  isTracked,
  parseDiffLines,
  prefixToRegex,
} from "../collect-diff-data.ts";

const DIFF_SCRIPT = resolve(import.meta.dir, "..", "collect-diff-data.ts");

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "collect-diff-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function runScript(args: string[], cwd = tmp): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(["bun", DIFF_SCRIPT, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { stdout, stderr, exitCode: proc.exitCode ?? 0 };
}

describe("config loading (parity with pytest suite)", () => {
  test("changelog.exclude from json → no speckit error", async () => {
    const specifyDir = join(tmp, ".specify");
    mkdirSync(specifyDir);
    writeFileSync(
      join(specifyDir, ".specify.json"),
      JSON.stringify({ changelog: { exclude: ["*.lock", "dist/**"] } }),
    );
    const { stderr } = await runScript(["--project-root", tmp]);
    expect(stderr).not.toContain("speckit:");
  });

  test("json without changelog key → no speckit error", async () => {
    const specifyDir = join(tmp, ".specify");
    mkdirSync(specifyDir);
    writeFileSync(
      join(specifyDir, ".specify.json"),
      JSON.stringify({ prefixList: "MRR" }),
    );
    const { stderr } = await runScript(["--project-root", tmp]);
    expect(stderr).not.toContain("speckit:");
  });

  test("missing json → hard error (exit 1)", async () => {
    const { exitCode } = await runScript(["--project-root", tmp]);
    expect(exitCode).not.toBe(0);
  });

  test("yaml-only → hard error with migrate instruction", async () => {
    const specifyDir = join(tmp, ".specify");
    mkdirSync(specifyDir);
    writeFileSync(
      join(specifyDir, ".specify.yaml"),
      "changelog:\n  exclude:\n    - '*.lock'",
    );
    const { stderr, exitCode } = await runScript(["--project-root", tmp]);
    expect(stderr).toContain("migrate-yaml-to-json.sh");
    expect(exitCode).not.toBe(0);
  });
});

describe("pure helpers", () => {
  test("prefixToRegex('**') matches nested path", () => {
    const re = prefixToRegex(".specify/**/skills/");
    expect(re.test(".specify/plugin-marketplaces/example-plugin/skills/")).toBe(true);
    expect(re.test(".specify/foo/skills/bar")).toBe(true);
    expect(re.test(".specify/skills/")).toBe(false);
  });

  test("prefixToRegex escapes special chars (dot in prefix)", () => {
    const re = prefixToRegex(".specify/");
    expect(re.test(".specify/x")).toBe(true);
    expect(re.test("Xspecify/x")).toBe(false);
  });

  test("parseDiffLines handles rename R100 → R", () => {
    const lines = ["R100\told/path.md\tnew/path.md"];
    expect(parseDiffLines(lines)).toEqual([
      { status: "R", old_path: "old/path.md", path: "new/path.md" },
    ]);
  });

  test("parseDiffLines handles copy C75 → C", () => {
    const lines = ["C75\tsrc/a.ts\tsrc/b.ts"];
    expect(parseDiffLines(lines)).toEqual([
      { status: "C", old_path: "src/a.ts", path: "src/b.ts" },
    ]);
  });

  test("parseDiffLines handles plain A/M/D", () => {
    const lines = ["A\tnew.ts", "M\tchanged.ts", "D\tgone.ts"];
    expect(parseDiffLines(lines)).toEqual([
      { status: "A", path: "new.ts" },
      { status: "M", path: "changed.ts" },
      { status: "D", path: "gone.ts" },
    ]);
  });

  test("parseDiffLines skips blank lines", () => {
    expect(parseDiffLines(["", "   ", "A\tx.ts"])).toEqual([
      { status: "A", path: "x.ts" },
    ]);
  });

  test("classifyGroup: .specify/scripts/foo → Scripts", () => {
    expect(classifyGroup(".specify/scripts/foo.py")).toBe("Scripts");
  });

  test("classifyGroup: .claude/skills/foo → Claude Skills", () => {
    expect(classifyGroup(".claude/skills/foo/SKILL.md")).toBe("Claude Skills");
  });

  test("classifyGroup: .specify/plugins/x/skills/y → Skills (glob)", () => {
    expect(classifyGroup(".specify/plugins/tdk-x/skills/y/SKILL.md")).toBe(
      "Skills",
    );
  });

  test("classifyGroup: unknown path → General", () => {
    expect(classifyGroup(".specify/unknown/file.md")).toBe("General");
    expect(classifyGroup("random/file.md")).toBe("General");
  });

  test("classifyGroup normalizes backslash (Windows path)", () => {
    expect(classifyGroup(".specify\\scripts\\foo.py")).toBe("Scripts");
  });

  test("isExcluded glob dist/** matches nested", () => {
    expect(isExcluded("dist/a/b.js", ["dist/**"])).toBe(true);
    expect(isExcluded("src/a.js", ["dist/**"])).toBe(false);
  });

  test("isExcluded trailing slash matches directory prefix", () => {
    expect(isExcluded(".specify/docs/x.md", [".specify/docs/"])).toBe(true);
    expect(isExcluded(".specify/other.md", [".specify/docs/"])).toBe(false);
  });

  test("isExcluded exact file match", () => {
    expect(isExcluded(".specify/CHANGELOG.md", [".specify/CHANGELOG.md"])).toBe(true);
    expect(isExcluded(".specify/CHANGELOG.mdx", [".specify/CHANGELOG.md"])).toBe(false);
  });

  test("isTracked prefixes", () => {
    expect(isTracked(".specify/x")).toBe(true);
    expect(isTracked(".claude/x")).toBe(true);
    expect(isTracked(".github/x")).toBe(true);
    expect(isTracked("src/x")).toBe(false);
  });

  test("isTracked normalizes backslash", () => {
    expect(isTracked(".specify\\x\\y")).toBe(true);
  });
});

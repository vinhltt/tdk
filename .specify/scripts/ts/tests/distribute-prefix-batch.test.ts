import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  collectDistributionFiles,
  isRewriteCandidate,
  rewritePayloadText,
} from "../../../../.claude/skills/tdk-bump/scripts/classify-distribution";

const HELPER = resolve(import.meta.dir, "../../../../.claude/skills/tdk-bump/scripts/classify-distribution.ts");
const FIXTURES = join(import.meta.dir, "fixtures/distribute-prefix-batch");
const temporaryRoots: string[] = [];
const symlinkTest = process.platform === "win32" ? test.skip : test;

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Sandbox {
  root: string;
  source: string;
  target: string;
  render: string;
}

interface HelperResult {
  exitCode: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

function sandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "sample-prefix-batch-"));
  temporaryRoots.push(root);
  const source = join(root, "source");
  const target = join(root, "target");
  const render = join(root, "render");
  for (const directory of [source, target, render]) mkdirSync(directory);
  return { root, source, target, render };
}

function put(root: string, rel: string, bytes: string | Uint8Array): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function configure(source: string, ship: string[], doNotShip: string[] = []): void {
  put(source, "distribute.json", JSON.stringify({ ship, doNotShip }));
}


function runHelper(
  dirs: Sandbox,
  mode: "compare" | "bootstrap" | "force",
  extra: string[] = [],
): HelperResult {
  return Bun.spawnSync({
    cmd: [
      process.execPath, HELPER,
      "--source-root", dirs.source,
      "--target-root", dirs.target,
      "--render-dir", dirs.render,
      "--prefix", "sample-",
      "--mode", mode,
      ...extra,
    ],
    cwd: dirs.root,
    stdout: "pipe",
    stderr: "pipe",
  });
}

type RecordAction = "new" | "updated" | "unchanged";
interface ClassificationRecord {
  action: RecordAction;
  rel: string;
  sha256: string;
  rendered: string;
}

function recordsFrom(result: HelperResult): ClassificationRecord[] {
  expect(result.exitCode, Buffer.from(result.stderr).toString()).toBe(0);
  const fields = Buffer.from(result.stdout).toString().split("\0");
  expect(fields.pop()).toBe("");
  expect(fields.length % 4).toBe(0);
  const trailer = fields.splice(-4);
  expect(trailer).toEqual(["end", String(fields.length / 4), "", ""]);
  const records: ClassificationRecord[] = [];
  for (let index = 0; index < fields.length; index += 4) {
    const [action, rel, sha256, rendered] = fields.slice(index, index + 4);
    expect(["new", "updated", "unchanged"]).toContain(action);
    records.push({ action: action as RecordAction, rel, sha256, rendered });
  }
  return records;
}

function expectArtifact(record: ClassificationRecord, renderRoot: string, expected: Uint8Array): void {
  const artifact = join(renderRoot, record.rendered);
  const rel = relative(renderRoot, artifact);
  expect(rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)).toBe(false);
  const bytes = readFileSync(artifact);
  expect(bytes).toEqual(Buffer.from(expected));
  expect(record.sha256).toBe(createHash("sha256").update(expected).digest("hex"));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(record.sha256);
}

function expectFailure(result: HelperResult): void {
  expect(result.exitCode).not.toBe(0);
  expect(Buffer.from(result.stderr).toString().trim()).not.toBe("");
  expect(Buffer.from(result.stdout).toString().split("\0")).not.toContain("end");
}

describe("prefix payload rewrite golden corpus", () => {
  // Expected bytes were generated once by the frozen pre-port Python rewrite.
  // Keep its sentinel collision behavior as well as the normal protected paths.
  for (const name of [
    "protected-paths",
    "relative-file-like-paths",
    "json-quoted-keys",
    "markdown-anchors",
    "unicode-boundaries",
    "unicode-version-boundaries",
    "unicode-whitespace",
    "sentinel-collisions",
    "byte-framing",
  ]) {
    test(`matches frozen rewrite bytes: ${name}`, () => {
      const input = readFileSync(join(FIXTURES, `${name}.input.txt`));
      const expected = readFileSync(join(FIXTURES, `${name}.expected.txt`));
      const actual = rewritePayloadText(input.toString("utf8"), "tdk-", "sample-");
      expect(Buffer.from(actual, "utf8")).toEqual(expected);
    });
  }

  test("limits rewriting to the distributed text surfaces", () => {
    const candidates = [
      ".specify/setup.sh",
      ".specify/CHANGELOG.md",
      ".specify/.specify.json.example",
      ".specify/scripts/ts/src/main.ts",
      ".specify/scripts/ts/package.json",
      ".specify/scripts/ts/notes.md",
      ".specify/scripts/ts/notes.txt",
      ".specify/scripts/ts/config.yaml",
      ".specify/scripts/ts/config.yml",
      ...["md", "mdx", "txt", "json", "yaml", "yml", "tpl", "sh", "svg", "excalidraw"]
        .map(extension => `.specify/docs/guide.${extension}`),
      ".specify/docs/assets/diagram.svg",
      ".specify/templates/skill.md.tpl",
      ".specify/claude-rules/guide.md",
    ];
    for (const rel of candidates) expect(isRewriteCandidate(rel), rel).toBe(true);
    for (const rel of [
      "setup.sh",
      "docs/guide.md",
      ".claude/rules/guide.md",
      ".specify/plugins/tdk-core/guide.md",
      ".specify/codex-plugins/tdk-core/guide.md",
      ".specify/schemas/schema.json",
      ".specify/scripts/bash/main.sh",
      ".specify/scripts/ts/native.sh",
      ".specify/scripts/ts/main.tsx",
      ".specify/docs/assets/image.png",
      ".specify/docs/source.ts",
      ".specify/docs/guide.MD",
      ".specify/cache/tdk-scout/notes.md",
    ]) expect(isRewriteCandidate(rel), rel).toBe(false);
  });
});

describe("distribution walk parity", () => {
  test("preserves include order and byte sorting with root-anchored literal excludes", () => {
    const { source } = sandbox();
    for (const rel of [
      "last.txt", "first.txt",
      ".specify/docs/.hidden", ".specify/docs/Z.txt", ".specify/docs/a.txt", ".specify/docs/é.txt",
      ".specify/docs/nested/exact.txt", ".specify/docs/nested/private/keep.txt",
      ".specify/docs/note.md", ".specify/docs/exact.txt", ".specify/docs/private/drop.txt",
      ".specify/docs/private-copy/keep.txt",
    ]) put(source, rel, rel);
    expect(collectDistributionFiles(
      source,
      ["last.txt", ".specify/docs/", "first.txt", "missing/"],
      [".specify/docs/private/", ".specify/docs/exact.txt", ".specify/docs/*.md"],
    )).toEqual([
      "last.txt",
      ".specify/docs/.hidden", ".specify/docs/Z.txt", ".specify/docs/a.txt",
      ".specify/docs/nested/exact.txt", ".specify/docs/nested/private/keep.txt",
      ".specify/docs/note.md", ".specify/docs/private-copy/keep.txt", ".specify/docs/é.txt",
      "first.txt",
    ]);
  });

  test("preserves find directory glob pruning without making exact-file excludes globs", () => {
    const { source } = sandbox();
    for (const rel of [
      ".specify/docs/.logs/drop.md",
      ".specify/docs/.hidden/deep/.logs/drop.md",
      ".specify/docs/.hidden/deep/.logs-copy/keep.md",
      ".specify/docs/public.md",
      ".specify/plugins/tdk-memory/one/node_modules/drop.txt",
      ".specify/plugins/tdk-memory/one/two/node_modules/drop.txt",
      ".specify/plugins/tdk-memory/.hidden/deep/node_modules/drop.txt",
      ".specify/plugins/tdk-memory/one/two/node_modules-copy/keep.txt",
      ".specify/plugins/tdk-memory/node_modules/top-level-kept.txt",
      ".specify/templates/one/vendor/drop.txt",
      ".specify/templates/one/two/vendor/drop.txt",
      ".specify/templates/.hidden/two/vendor/drop.txt",
      ".specify/templates/one/two/vendor-copy/keep.txt",
    ]) put(source, rel, rel);
    expect(collectDistributionFiles(
      source,
      [".specify/docs/", ".specify/plugins/", ".specify/templates/"],
      [
        "**/.logs/",
        ".specify/plugins/tdk-memory/**/node_modules/",
        ".specify/templates/*/vendor/",
        ".specify/docs/*.md",
        "**/keep.txt",
      ],
    )).toEqual([
      ".specify/docs/.hidden/deep/.logs-copy/keep.md",
      ".specify/docs/public.md",
      ".specify/plugins/tdk-memory/node_modules/top-level-kept.txt",
      ".specify/plugins/tdk-memory/one/two/node_modules-copy/keep.txt",
      ".specify/templates/one/two/vendor-copy/keep.txt",
    ]);
  });

  test("treats wildcard-looking file exclusions literally and bypasses directory pruning for explicit files", () => {
    const { source } = sandbox();
    put(source, ".specify/docs/.logs", "log file\n");
    put(source, ".specify/plugins/tdk-memory/one/two/node_modules", "module file\n");
    const paths = [".specify/docs/.logs", ".specify/plugins/tdk-memory/one/two/node_modules"];
    expect(collectDistributionFiles(
      source,
      [".specify/docs/", ".specify/plugins/"],
      ["**/.logs", ".specify/plugins/tdk-memory/**/node_modules"],
    )).toEqual(paths);
    expect(collectDistributionFiles(
      source,
      paths,
      ["**/.logs/", ".specify/plugins/tdk-memory/**/node_modules/"],
    )).toEqual(paths);
    expect(collectDistributionFiles(
      source,
      [".specify/docs/", ".specify/plugins/"],
      ["**/.logs/", ".specify/plugins/tdk-memory/**/node_modules/"],
    )).toEqual([]);
    expect(collectDistributionFiles(source, paths, paths)).toEqual([]);
  });

  symlinkTest("skips recursive symlinks but follows explicit file includes, not explicit directory includes", () => {
    const { root, source } = sandbox();
    put(source, ".specify/docs/regular.txt", "regular\n");
    put(root, "outside/file.txt", "linked file\n");
    put(root, "outside/tree/inside.txt", "linked directory\n");
    symlinkSync(join(root, "outside/file.txt"), join(source, ".specify/docs/file-link.txt"));
    symlinkSync(join(root, "outside/tree"), join(source, ".specify/docs/dir-link"), "dir");
    expect(collectDistributionFiles(source, [".specify/docs/"], [])).toEqual([".specify/docs/regular.txt"]);
    expect(collectDistributionFiles(source, [".specify/docs/file-link.txt"], [])).toEqual([".specify/docs/file-link.txt"]);
    expect(collectDistributionFiles(source, [".specify/docs/dir-link/"], [])).toEqual([]);
    expect(collectDistributionFiles(source, [".specify/docs/file-link.txt"], [".specify/docs/file-link.txt"])).toEqual([]);
  });
});

describe("prefix classification CLI", () => {
  for (const mode of ["compare", "bootstrap", "force"] as const) {
    test(`${mode} classifies real target state and hashes every materialized file`, () => {
      const dirs = sandbox();
      const input = readFileSync(join(FIXTURES, "byte-framing.input.txt"));
      const expected = readFileSync(join(FIXTURES, "byte-framing.expected.txt"));
      const docs = ["directory.md", "new.md", "unchanged.md", "updated.md", "with spaces\nand newline.md"];
      for (const name of docs) put(dirs.source, `.specify/docs/${name}`, input);
      const pluginRel = ".specify/plugins/tdk-core/payload.json";
      const pluginBytes = Buffer.from('{"tdk-plan":"TDK plugin stays unchanged"}\n');
      put(dirs.source, pluginRel, pluginBytes);
      const manifestRel = ".specify/release-manifest.json";
      const manifestBytes = Buffer.from('{"schemaVersion":1,"files":{"tdk-plan":{"sha256":"source"}}}\n');
      put(dirs.source, manifestRel, manifestBytes);
      configure(dirs.source, [".specify/docs/", ".specify/plugins/", manifestRel]);
      put(dirs.target, ".specify/docs/unchanged.md", expected);
      put(dirs.target, ".specify/docs/updated.md", "old target bytes\n");
      mkdirSync(join(dirs.target, ".specify/docs/directory.md"));
      put(dirs.target, ".specify/docs/orphan.md", "consumer-owned orphan\n");
      put(dirs.target, pluginRel, pluginBytes);
      const records = recordsFrom(runHelper(dirs, mode));
      const existing = mode === "compare" ? "unchanged" : "updated";
      expect(records.map(({ action, rel }) => [action, rel])).toEqual([
        [mode === "force" ? "updated" : "new", ".specify/docs/directory.md"],
        ["new", ".specify/docs/new.md"],
        [existing, ".specify/docs/unchanged.md"],
        ["updated", ".specify/docs/updated.md"],
        ["new", ".specify/docs/with spaces\nand newline.md"],
        [existing, pluginRel],
        ["new", manifestRel],
      ]);
      for (const record of records) {
        expectArtifact(record, dirs.render, record.rel === pluginRel ? pluginBytes : record.rel === manifestRel ? manifestBytes : expected);
      }
      expect(readFileSync(join(dirs.target, ".specify/docs/updated.md"), "utf8")).toBe("old target bytes\n");
      expect(readFileSync(join(dirs.target, ".specify/docs/orphan.md"), "utf8")).toBe("consumer-owned orphan\n");
    });
  }

  symlinkTest("compare/bootstrap follow target file symlinks; force also recognizes dangling symlinks", () => {
    const dirs = sandbox();
    put(dirs.source, ".specify/docs/linked.md", "tdk-plan\n");
    put(dirs.source, ".specify/docs/dangling.md", "tdk-plan\n");
    put(dirs.root, "linked-target.md", "sample-plan\n");
    mkdirSync(join(dirs.target, ".specify/docs"), { recursive: true });
    symlinkSync(join(dirs.root, "linked-target.md"), join(dirs.target, ".specify/docs/linked.md"));
    symlinkSync(join(dirs.root, "missing-target.md"), join(dirs.target, ".specify/docs/dangling.md"));
    configure(dirs.source, [".specify/docs/"]);
    for (const mode of ["compare", "bootstrap", "force"] as const) {
      const records = recordsFrom(runHelper(dirs, mode));
      expect(records.map(({ action, rel }) => [action, rel])).toEqual([
        [mode === "force" ? "updated" : "new", ".specify/docs/dangling.md"],
        [mode === "compare" ? "unchanged" : "updated", ".specify/docs/linked.md"],
      ]);
      for (const record of records) expectArtifact(record, dirs.render, Buffer.from("sample-plan\n"));
    }
  });

  test("force uses the supplied manifest paths in order rather than current ship/exclude rules", () => {
    const dirs = sandbox();
    const paths = [".specify/docs/z-last.md", ".specify/docs/a-first.md", ".specify/release-manifest.json"];
    for (const rel of paths.slice(0, 2)) put(dirs.source, rel, "tdk-plan TDK\n");
    put(dirs.source, paths[2], '{"files":{}}\n');
    configure(dirs.source, [], [".specify/docs/"]);
    mkdirSync(join(dirs.target, paths[0]), { recursive: true });
    const pathsFile = join(dirs.root, "manifest-paths.nul");
    writeFileSync(pathsFile, `${paths.join("\0")}\0`);
    const records = recordsFrom(runHelper(dirs, "force", ["--paths-file", pathsFile]));
    expect(records.map(({ action, rel }) => [action, rel])).toEqual([
      ["updated", paths[0]], ["new", paths[1]], ["new", paths[2]],
    ]);
    for (const record of records) {
      expectArtifact(record, dirs.render, Buffer.from(record.rel === paths[2] ? '{"files":{}}\n' : "sample-plan SAMPLE\n"));
    }
  });

  test("renders eligible script text but preserves invalid UTF8 binary bytes outside the rewrite scope", () => {
    const dirs = sandbox();
    const scriptRel = ".specify/scripts/ts/src/main.ts";
    const binaryRel = ".specify/docs/assets/image.png";
    const schemaRel = ".specify/schemas/schema.json";
    const binary = Buffer.from([0xff, 0x00, 0xc3, 0x28, 0x74, 0x64, 0x6b, 0x2d]);
    put(dirs.source, scriptRel, 'const label = "tdk-plan TDK";\n');
    put(dirs.source, binaryRel, binary);
    put(dirs.source, schemaRel, '{"tdk-plan":"TDK schema stays unchanged"}\n');
    configure(dirs.source, [scriptRel, binaryRel, schemaRel]);
    const records = recordsFrom(runHelper(dirs, "bootstrap"));
    const expected = [Buffer.from('const label = "sample-plan SAMPLE";\n'), binary, readFileSync(join(dirs.source, schemaRel))];
    expect(records.map(record => [record.action, record.rel])).toEqual([
      ["new", scriptRel], ["new", binaryRel], ["new", schemaRel],
    ]);
    records.forEach((record, index) => expectArtifact(record, dirs.render, expected[index]));
  });

  for (const [name, bytes] of [
    ["invalid continuation", Buffer.from([0xc3, 0x28])],
    ["truncated multibyte character", Buffer.from([0xf0, 0x9f, 0x92])],
    ["encoded surrogate", Buffer.from([0xed, 0xa0, 0x80])],
  ] as const) {
    test(`rejects ${name} in rewrite candidates instead of replacing invalid bytes`, () => {
      const dirs = sandbox();
      put(dirs.source, ".specify/docs/invalid.md", bytes);
      configure(dirs.source, [".specify/docs/"]);
      expectFailure(runHelper(dirs, "compare"));
    });
  }

  test("rejects an unterminated manifest paths stream without a successful trailer", () => {
    const dirs = sandbox();
    put(dirs.source, ".specify/docs/guide.md", "tdk-plan\n");
    const pathsFile = join(dirs.root, "truncated-paths.nul");
    writeFileSync(pathsFile, ".specify/docs/guide.md");
    expectFailure(runHelper(dirs, "force", ["--paths-file", pathsFile]));
  });

  test("rejects a missing manifest-selected source file instead of silently reducing the force changeset", () => {
    const dirs = sandbox();
    put(dirs.source, ".specify/docs/present.md", "tdk-plan\n");
    const pathsFile = join(dirs.root, "manifest-paths.nul");
    writeFileSync(pathsFile, ".specify/docs/present.md\0.specify/docs/missing.md\0");
    expectFailure(runHelper(dirs, "force", ["--paths-file", pathsFile]));
  });
});

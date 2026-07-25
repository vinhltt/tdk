import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  assertReleaseManifestRelativePath,
  resolveReleaseManifestTarget,
} from "../release-manifest-paths.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "release-manifest-paths-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("release manifest paths", () => {
  test("accepts strict POSIX-relative paths", () => {
    expect(assertReleaseManifestRelativePath(".specify/plugins/tdk-core/SKILL.md")).toBe(
      ".specify/plugins/tdk-core/SKILL.md",
    );
  });

  test.each([
    "",
    ".",
    "..",
    "../outside",
    "/absolute",
    "C:/absolute",
    "a\\b",
    "a\0b",
    "a//b",
    "a/./b",
    "a/../b",
  ])("rejects unsafe path %p", (path) => {
    expect(() => assertReleaseManifestRelativePath(path)).toThrow(/release manifest path/);
  });

  test("resolves contained targets under the canonical root", () => {
    mkdirSync(join(root, ".specify"));
    expect(resolveReleaseManifestTarget(root, ".specify/setup.sh")).toBe(
      join(root, ".specify", "setup.sh"),
    );
  });

  test("rejects symlink ancestors and leaves", () => {
    const outside = mkdtempSync(join(tmpdir(), "release-manifest-outside-"));
    mkdirSync(join(root, ".specify"));
    symlinkSync(outside, join(root, ".specify", "linked"));
    expect(() => resolveReleaseManifestTarget(root, ".specify/linked/file.md")).toThrow(/symlink/);

    writeFileSync(join(outside, "target.md"), "outside\n");
    symlinkSync(join(outside, "target.md"), join(root, ".specify", "leaf.md"));
    expect(() => resolveReleaseManifestTarget(root, ".specify/leaf.md")).toThrow(/symlink/);
    rmSync(outside, { recursive: true, force: true });
  });
});

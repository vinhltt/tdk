import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  isExcludedByReleaseRules,
  readDistributeConfig,
  resolveShippableFiles,
} from "../release-manifest-resolver.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "release-manifest-resolver-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeFile(relativePath: string, content = "fixture\n"): void {
  const filePath = join(tmp, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, content);
}

function writeConfig(ship: string[], doNotShip: string[]): void {
  writeFileSync(join(tmp, "distribute.json"), JSON.stringify({ ship, doNotShip }, null, 2));
}

describe("release manifest resolver", () => {
  test("resolves ship files and directories with distribute.sh exclude parity", async () => {
    writeConfig(
      [".specify/setup.sh", ".specify/templates/", ".specify/docs/"],
      [".specify/templates/private.md", ".specify/docs/"],
    );
    writeFile(".specify/setup.sh");
    writeFile(".specify/templates/public.md");
    writeFile(".specify/templates/private.md");
    writeFile(".specify/docs/guide.md");

    const config = await readDistributeConfig(tmp);
    await expect(resolveShippableFiles(tmp, config)).resolves.toEqual([
      ".specify/setup.sh",
      ".specify/templates/public.md",
    ]);
  });

  test("always excludes release-manifest.json from manifest file entries", async () => {
    writeConfig([".specify/setup.sh", ".specify/release-manifest.json"], []);
    writeFile(".specify/setup.sh");
    writeFile(".specify/release-manifest.json", "{}\n");

    const config = await readDistributeConfig(tmp);
    await expect(resolveShippableFiles(tmp, config)).resolves.toEqual([
      ".specify/setup.sh",
    ]);
  });

  test("directory excludes are root anchored", () => {
    expect(isExcludedByReleaseRules(".specify/docs/guide.md", [".specify/docs/"])).toBe(true);
    expect(isExcludedByReleaseRules(".specify/templates/docs/guide.md", [".specify/docs/"])).toBe(false);
  });
});

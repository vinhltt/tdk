import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { collectDistributionFiles } from "../classify-distribution.ts";
import { resolveShippableFiles } from "../release-manifest-resolver.ts";

// The release resolver and the distribute.sh-coupled classifier each carry their own doNotShip matcher.
// They must agree on what the real distribute.json rules exclude, or a release ships different files than it records.
const REAL_RULES = JSON.parse(readFileSync(resolve(import.meta.dir, "../../../../../distribute.json"), "utf8")) as {
  ship: string[];
  doNotShip: string[];
};

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "do-not-ship-globs-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function put(path: string): void {
  mkdirSync(join(tmp, path, ".."), { recursive: true });
  writeFileSync(join(tmp, path), "fixture\n");
}

const EXCLUDED = [
  ".specify/plugins/x/node_modules/y/z.js",
  ".specify/plugins/x/skills/s/scripts/node_modules/a/b/c.js",
  ".specify/plugins/x/tests/a.md",
  ".specify/plugins/x/skills/s/tests/b/c.md",
  ".specify/plugins/x/__tests__/d.cjs",
  ".specify/tests/top.md",
];
const SHIPPED = [
  ".specify/plugins/x/keep.md",
  ".specify/plugins/x/tests-helper.cjs",
  ".specify/plugins/x/latests/a.md",
  ".specify/plugins/x/skills/s/scripts/tool.js",
];

describe("distribute.json doNotShip globs", () => {
  test("the resolver and the bump classifier both exclude tests, __tests__ and node_modules at any depth, and keep lookalikes", async () => {
    for (const path of [...EXCLUDED, ...SHIPPED]) put(path);
    const config = { ship: [".specify/"], doNotShip: REAL_RULES.doNotShip };
    writeFileSync(join(tmp, "distribute.json"), JSON.stringify(config));

    const fromResolver = await resolveShippableFiles(tmp, config);
    const fromClassifier = collectDistributionFiles(tmp, config.ship, config.doNotShip)
      .filter((path) => path !== ".specify/release-manifest.json");

    expect(fromResolver).toEqual([...SHIPPED].sort());
    expect(fromClassifier.sort()).toEqual([...SHIPPED].sort());
  });
});

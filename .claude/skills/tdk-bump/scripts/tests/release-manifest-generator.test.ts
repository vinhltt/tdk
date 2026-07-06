import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildReleaseManifest } from "../generate-release-manifest.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "release-manifest-generator-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeFile(relativePath: string, content = "fixture\n"): void {
  const filePath = join(tmp, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, content);
}

function writeConfig(): void {
  writeFileSync(
    join(tmp, "distribute.json"),
    JSON.stringify(
      {
        ship: [".specify/setup.sh", ".specify/templates/"],
        doNotShip: [".specify/templates/private.md"],
      },
      null,
      2,
    ),
  );
}

describe("release manifest generator", () => {
  test("builds deterministic sha256 file entries", async () => {
    writeConfig();
    writeFile(".specify/setup.sh", "#!/usr/bin/env bash\n");
    writeFile(".specify/templates/a.md", "A\n");
    writeFile(".specify/templates/private.md", "secret\n");

    const manifest = await buildReleaseManifest(tmp, { now: "2026-07-05T00:00:00.000Z" });

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.algorithm).toBe("sha256");
    expect(Object.keys(manifest.files)).toEqual([
      ".specify/setup.sh",
      ".specify/templates/a.md",
    ]);
    expect(manifest.files[".specify/setup.sh"]?.sha256).toHaveLength(64);
    expect(manifest.files[".specify/setup.sh"]?.size).toBe(20);
    expect(manifest.files[".specify/release-manifest.json"]).toBeUndefined();
  });

  test("preserves generatedAt when semantic manifest content is unchanged", async () => {
    writeConfig();
    writeFile(".specify/setup.sh", "#!/usr/bin/env bash\n");

    const first = await buildReleaseManifest(tmp, { now: "2026-07-05T00:00:00.000Z" });
    const second = await buildReleaseManifest(tmp, {
      now: "2026-07-06T00:00:00.000Z",
      previousManifest: first,
    });

    expect(second.generatedAt).toBe(first.generatedAt);

    writeFile(".specify/setup.sh", "#!/usr/bin/env bash\necho changed\n");
    const changed = await buildReleaseManifest(tmp, {
      now: "2026-07-06T00:00:00.000Z",
      previousManifest: first,
    });

    expect(changed.generatedAt).toBe("2026-07-06T00:00:00.000Z");
  });
});

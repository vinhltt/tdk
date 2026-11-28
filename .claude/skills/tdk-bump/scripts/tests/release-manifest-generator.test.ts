import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildReleaseManifest } from "../generate-release-manifest.ts";
import { FIXTURE_TDK_VERSION, writeFixtureMarketplace } from "./fixture-marketplace.ts";

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
  writeFixtureMarketplace(tmp);
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

  test.each([0o644, 0o664, 0o755, 0o775])("canonicalizes physical mode %o", async (physicalMode) => {
    writeConfig();
    writeFile(".specify/setup.sh", "#!/usr/bin/env bash\n");
    chmodSync(join(tmp, ".specify/setup.sh"), physicalMode);

    const manifest = await buildReleaseManifest(tmp, { now: "2026-07-05T00:00:00.000Z" });

    expect(manifest.files[".specify/setup.sh"]?.mode).toBe("0644");
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

  describe("tdkVersion stamp", () => {
    const NOW = "2026-07-05T00:00:00.000Z";

    test("stamps the marketplace version right after schemaVersion", async () => {
      writeConfig();
      writeFile(".specify/setup.sh");

      const manifest = await buildReleaseManifest(tmp, { now: NOW });

      expect(manifest.tdkVersion).toBe(FIXTURE_TDK_VERSION);
      expect(Object.keys(manifest).slice(0, 3)).toEqual(["schemaVersion", "tdkVersion", "algorithm"]);
    });

    test("accepts a prerelease semver", async () => {
      writeConfig();
      writeFixtureMarketplace(tmp, "2.0.0-rc.1");

      expect((await buildReleaseManifest(tmp, { now: NOW })).tdkVersion).toBe("2.0.0-rc.1");
    });

    test("fails when the marketplace file is missing", async () => {
      writeConfig();
      rmSync(join(tmp, ".claude-plugin"), { recursive: true, force: true });

      await expect(buildReleaseManifest(tmp, { now: NOW })).rejects.toThrow(/marketplace file not found/);
    });

    test("fails when the marketplace file is not valid JSON", async () => {
      writeConfig();
      writeFileSync(join(tmp, ".claude-plugin", "marketplace.json"), "{ not json");

      await expect(buildReleaseManifest(tmp, { now: NOW })).rejects.toThrow(/not valid JSON/);
    });

    test.each(["1.2", "v1.2.3", "latest", "1.2.3.4", ""])("fails when metadata.version is %p", async (version) => {
      writeConfig();
      writeFixtureMarketplace(tmp, version);

      await expect(buildReleaseManifest(tmp, { now: NOW })).rejects.toThrow(/not a semver string/);
    });

    test("fails when metadata.version is absent or not a string", async () => {
      writeConfig();
      writeFileSync(join(tmp, ".claude-plugin", "marketplace.json"), JSON.stringify({ metadata: { version: 123 } }));

      await expect(buildReleaseManifest(tmp, { now: NOW })).rejects.toThrow(/not a semver string/);
    });

    test("refreshes generatedAt when only tdkVersion changes and keeps it otherwise", async () => {
      writeConfig();
      writeFile(".specify/setup.sh");
      const first = await buildReleaseManifest(tmp, { now: NOW });

      const same = await buildReleaseManifest(tmp, { now: "2026-07-06T00:00:00.000Z", previousManifest: first });
      expect(same.generatedAt).toBe(NOW);

      writeFixtureMarketplace(tmp, "1.2.4");
      const bumped = await buildReleaseManifest(tmp, { now: "2026-07-06T00:00:00.000Z", previousManifest: first });
      expect(bumped.tdkVersion).toBe("1.2.4");
      expect(bumped.generatedAt).toBe("2026-07-06T00:00:00.000Z");
    });

    test("the CLI exits non-zero when the marketplace file is missing", () => {
      writeConfig();
      rmSync(join(tmp, ".claude-plugin"), { recursive: true, force: true });
      const script = join(import.meta.dir, "..", "generate-release-manifest.ts");

      const result = Bun.spawnSync({ cmd: [process.execPath, script, "--project-root", tmp], stdout: "pipe", stderr: "pipe" });

      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("marketplace file not found");
    });
  });
});

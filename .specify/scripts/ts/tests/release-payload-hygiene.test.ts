import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { buildReleaseManifest } from '../../../../.claude/skills/tdk-bump/scripts/generate-release-manifest';

const ROOT = resolve(import.meta.dir, '../../../..');
const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

test('release generation ships runtime and notice but excludes nested logs, tests, dependencies, and retired seeds', async () => {
  const root = mkdtempSync(join(tmpdir(), 'memory-payload-'));
  temporary.push(root);
  const prefix = '.specify/plugins/tdk-memory/';
  const files = [
    `${prefix}skills/tdk-memory-checksum/scripts/memory-manifest.cjs`,
    `${prefix}skills/tdk-memory-checksum/scripts/RUNTIME-LICENSE.txt`,
    `${prefix}.logs/x.md`,
    `${prefix}skills/nested/.logs/session.md`,
    `${prefix}tests/fixture.test.mjs`,
    `${prefix}node_modules/yaml/index.js`,
    `${prefix}skills/tdk-memory-checksum/scripts/node_modules/yaml/index.js`,
    '.specify/templates/memory/retired.md.tpl',
  ];
  for (const path of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), `fixture bytes for ${path}\n`);
  }
  const rules = JSON.parse(readFileSync(join(ROOT, 'distribute.json'), 'utf8'));
  writeFileSync(join(root, 'distribute.json'), JSON.stringify({
    ship: [prefix, '.specify/templates/'],
    doNotShip: rules.doNotShip,
  }));
  const manifest = await buildReleaseManifest(root);
  expect(Object.keys(manifest.files).sort()).toEqual(files.slice(0, 2).sort());
});

import { expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanPluginFiles } from '../../src/commands/manifest/scan-files';

it('hashes shipped runtime bytes without ingesting local build dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'tdk-plugin-inventory-'));
  try {
    mkdirSync(join(root, 'skills/checksum/scripts'), { recursive: true });
    mkdirSync(join(root, 'node_modules/yaml'), { recursive: true });
    mkdirSync(join(root, 'skills/checksum/node_modules/private'), { recursive: true });
    writeFileSync(join(root, 'skills/checksum/scripts/runtime.cjs'), 'module.exports = 1;\n');
    writeFileSync(join(root, 'node_modules/yaml/index.js'), 'development dependency');
    writeFileSync(join(root, 'skills/checksum/node_modules/private/index.js'), 'nested dependency');
    const first = scanPluginFiles(root);
    expect([...first.keys()]).toEqual(['skills/checksum/scripts/runtime.cjs']);
    writeFileSync(join(root, 'node_modules/yaml/index.js'), 'changed dependency');
    expect(scanPluginFiles(root)).toEqual(first);
    writeFileSync(join(root, 'skills/checksum/scripts/runtime.cjs'), 'module.exports = 2;\n');
    expect(scanPluginFiles(root).get('skills/checksum/scripts/runtime.cjs')).not.toBe(first.get('skills/checksum/scripts/runtime.cjs'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('leaves test directories out of the plugin inventory at any depth, and keeps lookalike names', () => {
  const root = mkdtempSync(join(tmpdir(), 'tdk-plugin-inventory-tests-'));
  try {
    const kept = ['skills/s/scripts/tool.js', 'skills/s/scripts/tests-helper.cjs', 'skills/latests/a.md'];
    const dropped = ['tests/top.md', 'skills/s/tests/a.test.ts', 'skills/s/scripts/tests/b.py', '__tests__/c.test.cjs', 'skills/s/__tests__/d.cjs'];
    for (const path of [...kept, ...dropped]) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), 'x');
    }
    expect([...scanPluginFiles(root).keys()].sort()).toEqual([...kept].sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


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

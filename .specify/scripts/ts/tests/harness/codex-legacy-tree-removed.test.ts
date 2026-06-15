// Regression guard: generated Codex packages live in the sibling .specify/codex-plugins/ tree,
// so no in-plugin .specify/plugins/<plugin>/.codex-plugin/ directory may exist any more.
import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Tests run with cwd = .specify/scripts/ts (matches the existing harness e2e convention).
const pluginsRoot = path.resolve('../../plugins');

describe('legacy codex tree removal', () => {
  test('no .specify/plugins/<plugin>/.codex-plugin directory remains', () => {
    const offenders = fs
      .readdirSync(pluginsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join('plugins', entry.name, '.codex-plugin'))
      .filter((relPath) => fs.existsSync(path.join(pluginsRoot, '..', relPath)));
    expect(offenders).toEqual([]);
  });
});

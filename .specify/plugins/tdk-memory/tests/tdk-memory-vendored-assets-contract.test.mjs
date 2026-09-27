import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(TESTS_DIR, '..');
const MEMORY_SKILLS_DIR = join(PLUGIN_ROOT, 'skills');
const REFERENCE_FILES = ['obsidian-markdown.md', 'obsidian-json-canvas.md'];
const LICENSE_FILE = 'VENDORED-LICENSE.md';
const VENDORED_RECORD = 'VENDORED.md';

test('keeps vendored Obsidian references and their MIT notice in a flat-copied init skill', () => {
  const flatSkillsRoot = mkdtempSync(join(tmpdir(), 'tdk-memory-flat-'));

  try {
    const installedSkills = join(flatSkillsRoot, 'skills');
    cpSync(MEMORY_SKILLS_DIR, installedSkills, { recursive: true });
    const installedReferences = join(installedSkills, 'tdk-memory-init', 'references');
    const installedLicense = join(installedReferences, LICENSE_FILE);
    const installedVendoredRecord = join(installedReferences, VENDORED_RECORD);

    assert.equal(existsSync(installedLicense), true);
    assert.equal(existsSync(installedVendoredRecord), true);
    assert.match(readFileSync(installedLicense, 'utf8'), /Copyright \(c\) 2026 Steph Ango \(@kepano\)/);

    for (const file of REFERENCE_FILES) {
      const reference = join(installedReferences, file);
      assert.equal(existsSync(reference), true);
      assert.match(readFileSync(reference, 'utf8'), /^---\r?\n/);
    }
  } finally {
    rmSync(flatSkillsRoot, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(TESTS_DIR, '..');
const MEMORY_SKILLS = join(PLUGIN_ROOT, 'skills');
const SEED_DIRECTORY = join(MEMORY_SKILLS, 'tdk-memory-init/references/templates/memory');


test('keeps exactly twenty byte-identical routed seeds after a skills-only copy', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'tdk-memory-seed-'));
  const copiedSkills = join(sandbox, 'flat-install', 'skills');

  try {
    cpSync(MEMORY_SKILLS, copiedSkills, { recursive: true });
    const copiedSeedDirectory = join(copiedSkills, 'tdk-memory-init/references/templates/memory');
    const sourceTemplates = readdirSync(SEED_DIRECTORY)
      .filter((entry) => entry.endsWith('.md.tpl'))
      .sort((left, right) => left.localeCompare(right));
    const copiedTemplates = readdirSync(copiedSeedDirectory)
      .filter((entry) => entry.endsWith('.md.tpl'))
      .sort((left, right) => left.localeCompare(right));

    assert.equal(sourceTemplates.length, 20);
    assert.deepEqual(copiedTemplates, sourceTemplates);
    for (const template of sourceTemplates) {
      assert.deepEqual(
        readFileSync(join(copiedSeedDirectory, template)),
        readFileSync(join(SEED_DIRECTORY, template)),
      );
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// tdk-handoff is a common skill: its instructions, references and source name no other workflow command
// and import nothing from another skill, so any caller can use it without it knowing about that caller.
const SKILL = resolve(import.meta.dir, '..');
const files = [
  'SKILL.md',
  ...readdirSync(join(SKILL, 'references')).filter(name => name.endsWith('.md')).map(name => join('references', name)),
  ...readdirSync(join(SKILL, 'scripts')).filter(name => name.endsWith('.ts')).map(name => join('scripts', name)),
];

describe('tdk-handoff independence', () => {
  it('names no other tdk slash command', () => {
    for (const file of files) {
      const others = readFileSync(join(SKILL, file), 'utf8').match(/\/tdk-(?!handoff\b)[a-z][a-z0-9-]*/g) ?? [];
      expect({ file, others }).toEqual({ file, others: [] });
    }
  });

  it('imports no other plugin or skill source', () => {
    for (const file of files.filter(name => name.endsWith('.ts'))) {
      const imports = [...readFileSync(join(SKILL, file), 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1]!);
      expect({ file, crossSkill: imports.filter(path => /\/(?:plugins|skills)\//.test(path)) }).toEqual({ file, crossSkill: [] });
    }
  });
});

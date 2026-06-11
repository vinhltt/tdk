import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TDK_ROOT = resolve(import.meta.dir, '../../../..');
const SKILL_PATHS = [
  resolve(TDK_ROOT, '.claude/skills/tdk-distribute/SKILL.md'),
  resolve(TDK_ROOT, '.agents/skills/tdk-distribute/SKILL.md'),
];

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('tdk-distribute skill contract', () => {
  for (const skillPath of SKILL_PATHS) {
    it(`${skillPath} uses resolved source path for distribute.sh`, () => {
      const skillText = read(skillPath);
      expect(skillText).toContain('bash "{source_path}/../distribute.sh" <target-project-path> --dry-run');
      expect(skillText).toContain('bash "{source_path}/../distribute.sh" <target-project-path> [--force] [--with-claude]');
      expect(skillText).not.toMatch(/^\s*bash\s+distribute\.sh\b/m);
    });

    it(`${skillPath} requires an existing project root target`, () => {
      const skillText = read(skillPath);
      expect(skillText).toContain('target project root must exist');
      expect(skillText).toContain('creates or updates `.specify/` inside it');
      expect(skillText).not.toContain('path must exist or will be created on sync');
    });
  }
});

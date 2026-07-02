import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TDK_ROOT = resolve(import.meta.dir, '../../../..');
const DISTRIBUTE_SH_PATH = resolve(TDK_ROOT, 'distribute.sh');
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

  it('distribute.sh built-in fallback ships the full docs tree', () => {
    const script = read(DISTRIBUTE_SH_PATH);
    expect(script).toContain('"docs/"');
    expect(script).not.toContain('"docs/setup/"');
    expect(script).toContain('sync-config.yaml not found — using built-in include/exclude rules');
  });

  it('distribute.sh built-in fallback ships public schemas', () => {
    const script = read(DISTRIBUTE_SH_PATH);
    expect(script).toContain('"schemas/"');
  });

  it('distribute.sh built-in fallback ships claude rule payloads', () => {
    const script = read(DISTRIBUTE_SH_PATH);
    expect(script).toContain('"claude-rules/"');
  });

  it('distribute.sh built-in fallback ships the full template tree', () => {
    const script = read(DISTRIBUTE_SH_PATH);
    expect(script).toContain('"templates/"');
    expect(script).not.toContain('"templates" "setup.sh"');
  });

  it('distribute.sh documents branded payload prefix distribution', () => {
    const script = read(DISTRIBUTE_SH_PATH);
    expect(script).toContain('--prefix PREFIX');
    expect(script).toContain('bash distribute.sh /path/to/my-project --prefix pav --dry-run');
    expect(script).toContain('tdk-setup install');
  });
});

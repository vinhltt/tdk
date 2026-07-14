import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const INCEPTION_SKILLS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-inception/skills');
const INCEPTION_AGENTS_DIR = resolve(import.meta.dir, '../../../plugins/tdk-inception/agents');
const TEMPLATES_DIR = resolve(import.meta.dir, '../../../templates/sub-workspace-docs');
const MANIFEST_PATH = resolve(import.meta.dir, '../../../plugins/manifest.json');
const README_PATH = resolve(import.meta.dir, '../../../../README.md');

const SKILL_NAME = 'tdk-sub-workspace-docs';
const EXPECTED_DOCS = ['README.md', 'architecture.md', 'interfaces.md', 'engineering.md'];
const OLD_DOCS = ['codebase-summary.md', 'code-standards.md', 'system-architecture.md'];

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
}

describe('TDK sub-workspace docs contracts', () => {
  const skillPath = join(INCEPTION_SKILLS_DIR, SKILL_NAME, 'SKILL.md');
  const writerPath = join(INCEPTION_AGENTS_DIR, 'tdk-docs-writer.md');
  const skill = existsSync(skillPath) ? read(skillPath) : '';
  const writer = existsSync(writerPath) ? read(writerPath) : '';

  it('registers the arc42-lite sub-workspace docs skill under the existing skill name', () => {
    expect(existsSync(skillPath)).toBe(true);
    expect(skill).toContain('name: tdk-sub-workspace-docs');
    expect(skill).toContain('[--sub-workspace NAME | --all] [--force]');
    expect(skill).toContain('arc42-lite');
    expect(skill).toContain('<docsPath>/sub-workspaces/<name>/');
    expect(skill).toContain('workspace-dependency-policy.md');
    expect(skill).toContain('does not delete old generated docs');
    expect(skill).not.toContain('compatibility route');
    expect(skill).not.toContain('transition window');
  });

  it('defines the new four-file docs set in templates and writer contract', () => {
    for (const filename of EXPECTED_DOCS) {
      expect(existsSync(join(TEMPLATES_DIR, `${filename}.tpl`))).toBe(true);
      expect(skill).toContain(filename);
      expect(writer).toContain(filename);
    }

    for (const filename of OLD_DOCS) {
      expect(skill).not.toContain(filename);
      expect(writer).not.toContain(filename);
    }
  });

  it('keeps templates source-grounded with AUTO-GEN markers', () => {
    const combinedTemplates = walkFiles(TEMPLATES_DIR)
      .filter((path) => path.endsWith('.tpl'))
      .map((path) => read(path))
      .join('\n');

    expect(combinedTemplates).toContain('AUTO-GEN-START');
    expect(combinedTemplates).toContain('USER EDIT ZONE');
    expect(read(join(TEMPLATES_DIR, 'architecture.md.tpl'))).toContain('Purpose And Goals');
    expect(read(join(TEMPLATES_DIR, 'architecture.md.tpl'))).toContain('Quality Requirements');
    expect(read(join(TEMPLATES_DIR, 'interfaces.md.tpl'))).toContain('Allowed Dependency Edges');
    expect(read(join(TEMPLATES_DIR, 'interfaces.md.tpl'))).toContain('Forbidden Dependency Edges');
    expect(read(join(TEMPLATES_DIR, 'engineering.md.tpl'))).toContain('Quality Gates');
  });

  it('registers docs command in manifest and README', () => {
    const manifest = read(MANIFEST_PATH);
    const readme = read(README_PATH);

    expect(manifest).toContain('"tdk-sub-workspace-docs"');
    expect(readme).toContain('/tdk-sub-workspace-docs');
  });
});

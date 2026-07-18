import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOCS_ROOT = resolve(import.meta.dir, '../../../docs');

function readGuide(language: 'en' | 'vi', path: string): string {
  return readFileSync(resolve(DOCS_ROOT, language, 'guides', path), 'utf-8');
}

function expectBothLanguagesContain(path: string, expected: string[]): void {
  for (const language of ['en', 'vi'] as const) {
    const content = readGuide(language, path);
    for (const value of expected) {
      expect(content).toContain(value);
    }
  }
}

describe('tdk-inception guide ownership contract', () => {
  it('documents the coupled base, selectors, persisted intent, and safe reinstall', () => {
    expectBothLanguagesContain('setup/setup-guide.md', [
      '`tdk-core`',
      '`tdk-inception`',
      '`tdk-memory`',
      '`tdk-utils`',
      '`--plugins tdk-core`',
      '`--all-plugins`',
      '`Requested optional plugins`',
      '`Resolved plugins`',
      '`.specify/install-settings.json`',
      'Claude',
      'Codex',
    ]);

    expect(readGuide('en', 'setup/setup-guide.md')).toContain('saved-selection migration');
    expect(readGuide('vi', 'setup/setup-guide.md')).toContain(
      'Không có cơ chế migration cho lựa chọn đã lưu',
    );
  });

  it('keeps source ownership and public command stability aligned across languages', () => {
    expectBothLanguagesContain('skills-guide.md', [
      '`tdk-core`',
      '`tdk-inception`',
      '`tdk-epic`',
      '`tdk-utils`',
      '`tdk-memory`',
      '`tdk-test-api`',
      '`tdk-retro`',
      '`tdk-scaffold`',
      'core-only',
      'inception-only',
    ]);

    expectBothLanguagesContain('workflow-map.md', [
      '`tdk-core`',
      '`tdk-inception`',
      '`tdk-epic`',
      '`tdk-utils`',
    ]);
    expect(readGuide('en', 'workflow-map.md')).toContain('packaging ownership');
    expect(readGuide('vi', 'workflow-map.md')).toContain('quyền sở hữu đóng gói');
  });

  it('states the greenfield coupled-base prerequisite without changing routes', () => {
    expectBothLanguagesContain('scenarios/10-greenfield-full-start-architecture-topology.md', [
      '`tdk-core`',
      '`tdk-inception`',
      '`tdk-memory`',
      '`tdk-utils`',
      '`tdk-scaffold`',
      '/tdk-greenfield-start',
      '/tdk-workflow-config-apply',
      '/tdk-sub-workspace-docs',
      '/tdk-sub-workspace-automation-recommend',
    ]);
    expect(readGuide('en', 'scenarios/10-greenfield-full-start-architecture-topology.md')).toContain(
      'artifact paths are unchanged',
    );
    expect(readGuide('vi', 'scenarios/10-greenfield-full-start-architecture-topology.md')).toContain(
      'đường dẫn artifact không đổi',
    );
  });
});

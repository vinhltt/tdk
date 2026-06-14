import { describe, expect, test } from 'bun:test';
import { buildMigrationReport, renderMigrationReport } from '../../src/commands/harness/flat-claude-migration-report';
import type { FlatClaudeInventory } from '../../src/commands/harness/flat-claude-types';

function inventoryFixture(): FlatClaudeInventory {
  return {
    consumerRoot: '/tmp/consumer',
    records: [
      {
        kind: 'agent',
        sourcePath: '/tmp/consumer/.claude/agents/reviewer.md',
        sourceRelativePath: '.claude/agents/reviewer.md',
        name: 'reviewer',
        frontmatter: {},
        body: 'review',
      },
      {
        kind: 'skill',
        sourcePath: '/tmp/consumer/.claude/skills/demo/SKILL.md',
        sourceRelativePath: '.claude/skills/demo/SKILL.md',
        skillName: 'demo',
        rootRelativePath: '.claude/skills/demo',
        name: 'demo',
        frontmatter: {},
        body: 'demo',
        files: [
          {
            sourcePath: '/tmp/consumer/.claude/skills/demo/SKILL.md',
            sourceRelativePath: '.claude/skills/demo/SKILL.md',
            skillRelativePath: 'SKILL.md',
          },
          {
            sourcePath: '/tmp/consumer/.claude/skills/demo/scripts/run.sh',
            sourceRelativePath: '.claude/skills/demo/scripts/run.sh',
            skillRelativePath: 'scripts/run.sh',
          },
        ],
      },
    ],
    unrecognized: [{ path: '.claude/unknown.bin', reason: 'No matcher' }],
    warnings: ['Skipped malformed hook'],
  };
}

describe('flat claude migration report', () => {
  test('reports recognized top-level and nested artifact paths', () => {
    const report = buildMigrationReport(inventoryFixture());

    expect(report.recognized).toEqual([
      '.claude/agents/reviewer.md',
      '.claude/skills/demo/SKILL.md',
      '.claude/skills/demo/scripts/run.sh',
    ]);
    expect(report.reported).toEqual([{ path: '.claude/unknown.bin', reason: 'No matcher' }]);
    expect(report.warnings).toEqual(['Skipped malformed hook']);
  });

  test('renders unknown, skipped, and warning sections', () => {
    const report = buildMigrationReport(inventoryFixture(), [{ path: '.claude/skip.txt', reason: 'Manual skip' }]);
    const rendered = renderMigrationReport(report);

    expect(rendered).toContain('Recognized: 3');
    expect(rendered).toContain('Reported unknown: 1');
    expect(rendered).toContain('.claude/skip.txt: Manual skip');
    expect(rendered).toContain('Skipped malformed hook');
  });
});

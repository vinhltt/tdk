import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256Buffer, sha256File } from '../src/checksum';
import { discoverFlatClaudeInventory } from '../src/flat-claude-adapter';
import { emitOmpSkillFiles } from '../src/omp-skill-emitter';
import { makeConsumer } from './fixtures';
import type { FlatClaudeSkillRecord } from '../src/flat-claude-types';

function writeFile(root: string, relativePath: string, content: string | Buffer): string {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function skills(root: string): FlatClaudeSkillRecord[] {
  return discoverFlatClaudeInventory(root).records.filter(
    (record): record is FlatClaudeSkillRecord => record.kind === 'skill',
  );
}

describe('OMP skill emitter', () => {
  test('copies complete skill trees byte-for-byte and skips only internal entrypoints', () => {
    const consumer = makeConsumer('tdk-omp-skills-copy-');
    const skill = writeFile(consumer.root, '.claude/skills/release/SKILL.md', [
      '---',
      'name: release-helper',
      'description: Release safely',
      '---',
      '# Release\n',
    ].join('\n'));
    const binary = writeFile(
      consumer.root,
      '.claude/skills/release/assets/payload.bin',
      Buffer.from([0, 255, 1, 13, 10, 42]),
    );
    writeFile(consumer.root, '.claude/skills/_shared/SKILL.md', '# Internal entrypoint\n');
    const reference = writeFile(consumer.root, '.claude/skills/_shared/references/schema.md', '# Schema\n');
    writeFile(consumer.root, '.claude/skills/_empty/SKILL.md', '# Empty internal entrypoint\n');

    const result = emitOmpSkillFiles(skills(consumer.root));
    const targets = result.files.map((file) => file.targetRelativePath);

    expect(targets).toEqual([
      '.omp/skills/_shared/references/schema.md',
      '.omp/skills/release/assets/payload.bin',
      '.omp/skills/release/SKILL.md',
    ]);
    expect(targets).not.toContain('.omp/skills/_shared/SKILL.md');
    expect(targets.some((target) => target.startsWith('.omp/skills/_empty/'))).toBe(false);
    for (const [sourcePath, targetRelativePath] of [
      [skill, '.omp/skills/release/SKILL.md'],
      [binary, '.omp/skills/release/assets/payload.bin'],
      [reference, '.omp/skills/_shared/references/schema.md'],
    ] as const) {
      const file = result.files.find((candidate) => candidate.targetRelativePath === targetRelativePath)!;
      expect(file.content).toEqual(fs.readFileSync(sourcePath));
      expect(file.sourceChecksum).toBe(sha256File(sourcePath));
      expect(file.installedChecksum).toBe(sha256Buffer(file.content));
      expect(file.part).toBe('skills');
    }
  });

  test('aggregates malformed, missing-description, and duplicate-name errors before emitting', () => {
    const consumer = makeConsumer('tdk-omp-skills-invalid-');
    writeFile(consumer.root, '.claude/skills/first/SKILL.md', '---\nname: duplicate\n---\n# First\n');
    writeFile(consumer.root, '.claude/skills/second/SKILL.md', [
      '---',
      'name: duplicate',
      'description: Second skill',
      '---',
      '# Second\n',
    ].join('\n'));
    writeFile(consumer.root, '.claude/skills/third/SKILL.md', '---\ndescription: [unterminated\n---\n# Third\n');
    writeFile(consumer.root, '.claude/skills/fourth/SKILL.md', '# Fourth\n');

    let error: Error | undefined;
    try {
      emitOmpSkillFiles(skills(consumer.root));
    } catch (caught) {
      error = caught as Error;
    }

    expect(error?.message).toContain('Invalid OMP skill sources');
    expect(error?.message).toContain('.claude/skills/first/SKILL.md');
    expect(error?.message).toContain('.claude/skills/second/SKILL.md');
    expect(error?.message).toContain('.claude/skills/third/SKILL.md');
    expect(error?.message).toContain('.claude/skills/fourth/SKILL.md');
    expect(error?.message).toMatch(/missing description/i);
    expect(error?.message).toMatch(/frontmatter/i);
    expect(error?.message).toMatch(/duplicate effective name "duplicate"/i);
  });
});

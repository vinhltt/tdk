import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse } from 'yaml';
import { sha256Buffer } from '../src/checksum';
import { emptyHarnessManifest } from '../src/manifest-store';
import { emitOmpRuleFiles } from '../src/omp-rule-emitter';
import { makeConsumer } from './fixtures';
import type { FlatClaudeRuleRecord } from '../src/flat-claude-types';
import type { HarnessInstallManifest } from '../src/types';

function writeFile(root: string, relativePath: string, content: string): string {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function rule(
  root: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  body: string,
  frontmatterParseError?: string,
): FlatClaudeRuleRecord {
  const sourceRelativePath = `.claude/rules/${filename}`;
  const sourcePath = writeFile(root, sourceRelativePath, body);
  return {
    kind: 'rule',
    sourcePath,
    sourceRelativePath,
    name: path.basename(filename, path.extname(filename)),
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    frontmatter,
    frontmatterParseError,
    body,
  };
}

function frontmatter(content: Buffer): Record<string, unknown> {
  const text = content.toString('utf-8');
  const end = text.indexOf('\n---\n', 4);
  return parse(text.slice(4, end)) as Record<string, unknown>;
}

function claudeManifest(): HarnessInstallManifest {
  return emptyHarnessManifest('claude');
}

describe('OMP rule emitter', () => {
  test('translates native and consumer fields while extracting deterministic placeholders', () => {
    const consumer = makeConsumer('tdk-omp-rule-schema-');
    const records = [
      rule(consumer.root, 'h1.md', {}, '# H1 description\nBody.\n'),
      rule(consumer.root, 'line.mdc', {}, '\nFirst non-empty line.\nSecond.\n'),
      rule(consumer.root, 'paths.md', { paths: ['src/**/*.ts'], inject: 'reference' }, '# Path rule\n'),
      rule(consumer.root, 'always.md', { paths: ['**'], inject: 'full' }, 'Always body.\n'),
      rule(consumer.root, 'native.md', {
        description: 'Native rule',
        globs: ['src/**/*.tsx'],
        alwaysApply: false,
        condition: 'tool:read',
        astCondition: 'kind == call_expression',
        scope: 'project',
        interruptMode: 'block',
      }, 'Native body.\n'),
    ];

    const result = emitOmpRuleFiles(records, consumer.root, claudeManifest());
    const byTarget = new Map(result.files.map((file) => [file.targetRelativePath, frontmatter(file.content)]));

    expect(result.files.map((file) => file.targetRelativePath)).toEqual([
      '.omp/rules/always.md',
      '.omp/rules/h1.md',
      '.omp/rules/line.mdc',
      '.omp/rules/native.md',
      '.omp/rules/paths.md',
    ]);
    expect(byTarget.get('.omp/rules/h1.md')).toEqual({ description: 'H1 description' });
    expect(byTarget.get('.omp/rules/line.mdc')).toEqual({ description: 'First non-empty line.' });
    expect(byTarget.get('.omp/rules/paths.md')).toEqual({ description: 'Path rule', globs: ['src/**/*.ts'] });
    expect(byTarget.get('.omp/rules/always.md')).toEqual({ alwaysApply: true });
    expect(byTarget.get('.omp/rules/native.md')).toEqual({
      description: 'Native rule',
      globs: ['src/**/*.tsx'],
      alwaysApply: false,
      condition: 'tool:read',
      astCondition: 'kind == call_expression',
      scope: 'project',
      interruptMode: 'block',
    });
    expect(result.warnings).toEqual([
      'Placeholder rule description: .claude/rules/h1.md -> .omp/rules/h1.md: "H1 description"',
      'Placeholder rule description: .claude/rules/line.mdc -> .omp/rules/line.mdc: "First non-empty line."',
      'Placeholder rule description: .claude/rules/paths.md -> .omp/rules/paths.md: "Path rule"',
    ]);
  });

  test('maps each bucket signal independently and prefers the first H1 over earlier prose', () => {
    const consumer = makeConsumer('tdk-omp-rule-buckets-');
    const records = [
      rule(consumer.root, 'paths-only.md', { paths: ['**'] }, 'Always by paths.\n'),
      rule(consumer.root, 'inject-only.md', { inject: 'full' }, 'Always by inject.\n'),
      rule(consumer.root, 'reference-only.md', { inject: 'reference' }, 'Prose before heading.\n  # Later H1\n'),
    ];

    const result = emitOmpRuleFiles(records, consumer.root, claudeManifest());
    const byTarget = new Map(result.files.map((file) => [file.targetRelativePath, frontmatter(file.content)]));

    expect(byTarget.get('.omp/rules/paths-only.md')).toEqual({ alwaysApply: true });
    expect(byTarget.get('.omp/rules/inject-only.md')).toEqual({ alwaysApply: true });
    expect(byTarget.get('.omp/rules/reference-only.md')).toEqual({ description: 'Later H1' });
    expect(result.warnings).toContain(
      'Placeholder rule description: .claude/rules/reference-only.md -> .omp/rules/reference-only.md: "Later H1"',
    );
  });

  test('regenerates only manifest-owned rules from specify sources', () => {
    const consumer = makeConsumer('tdk-omp-rule-managed-');
    const managedOutput = rule(consumer.root, 'managed.md', {}, '# Installed output\n');
    const user = rule(consumer.root, 'user.md', {}, '# User source\n');
    const managedSourceRelativePath = '.specify/claude-rules/managed.md';
    const managedSourcePath = writeFile(consumer.root, managedSourceRelativePath, '# Managed source\n');
    writeFile(consumer.root, '.specify/claude-rules/not-installed.md', '# Not installed\n');
    const manifest = claudeManifest();
    manifest.managedFiles.push({
      plugin: 'claude-rules',
      sourceRelativePath: managedSourceRelativePath,
      targetRelativePath: managedOutput.sourceRelativePath,
      sourceChecksum: sha256Buffer(fs.readFileSync(managedSourcePath)),
      installedChecksum: sha256Buffer(Buffer.from('# Installed output\n')),
    });

    const result = emitOmpRuleFiles([managedOutput, user], consumer.root, manifest);
    const managed = result.files.find((file) => file.targetRelativePath === '.omp/rules/managed.md');

    expect(result.files.map((file) => file.targetRelativePath)).toEqual([
      '.omp/rules/managed.md',
      '.omp/rules/user.md',
    ]);
    expect(managed?.sourceRelativePath).toBe(managedSourceRelativePath);
    expect(managed?.content.toString('utf-8')).toContain('# Managed source');
    expect(managed?.content.toString('utf-8')).not.toContain('Installed output');
    expect(result.warnings).toContain(
      'Placeholder rule description: .specify/claude-rules/managed.md -> .omp/rules/managed.md: "Managed source"',
    );
  });

  test('rejects a duplicate logical name across a managed rule and user-owned extension variant', () => {
    const consumer = makeConsumer('tdk-omp-rule-managed-duplicate-');
    const managedOutput = rule(consumer.root, 'shared.md', {}, '# Installed output\n');
    const user = rule(consumer.root, 'shared.mdc', {}, '# User source\n');
    const managedSourceRelativePath = '.specify/claude-rules/shared.md';
    const managedSourcePath = writeFile(consumer.root, managedSourceRelativePath, '# Managed source\n');
    const manifest = claudeManifest();
    manifest.managedFiles.push({
      plugin: 'claude-rules',
      sourceRelativePath: managedSourceRelativePath,
      targetRelativePath: managedOutput.sourceRelativePath,
      sourceChecksum: sha256Buffer(fs.readFileSync(managedSourcePath)),
      installedChecksum: sha256Buffer(Buffer.from('# Installed output\n')),
    });

    expect(() => emitOmpRuleFiles([managedOutput, user], consumer.root, manifest)).toThrow(
      /duplicate logical rule name "shared": .*\.claude\/rules\/shared\.mdc.*\.specify\/claude-rules\/shared\.md/,
    );
  });

  test('rejects a manifest-owned source reached through a symlinked ancestor', () => {
    const consumer = makeConsumer('tdk-omp-rule-managed-symlink-');
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-omp-rule-external-'));
    writeFile(externalRoot, 'managed.md', '# External source\n');
    fs.symlinkSync(externalRoot, path.join(consumer.root, '.specify/claude-rules'), 'dir');
    const manifest = claudeManifest();
    manifest.managedFiles.push({
      plugin: 'claude-rules',
      sourceRelativePath: '.specify/claude-rules/managed.md',
      targetRelativePath: '.claude/rules/managed.md',
      sourceChecksum: 'external',
      installedChecksum: 'installed',
    });

    expect(() => emitOmpRuleFiles([], consumer.root, manifest)).toThrow(/symlinked ancestor/);
  });

  test('aggregates malformed, empty, reserved, and duplicate logical names before emitting', () => {
    const consumer = makeConsumer('tdk-omp-rule-invalid-');
    const records = [
      rule(consumer.root, 'x.md', {}, '# First x\n'),
      rule(consumer.root, 'x.mdc', {}, '# Second x\n'),
      rule(consumer.root, 'RULES.md', {}, '# Reserved\n'),
      rule(consumer.root, 'broken.md', { description: 'Loose fallback' }, 'Body\n', 'Invalid YAML frontmatter'),
      rule(consumer.root, 'empty.md', {}, '  \n'),
    ];

    expect(() => emitOmpRuleFiles(records, consumer.root, claudeManifest())).toThrow(
      /broken\.md.*Invalid YAML frontmatter[\s\S]*empty\.md.*cannot extract description[\s\S]*RULES[\s\S]*duplicate logical rule name "x".*x\.md.*x\.mdc/,
    );
  });

  test('warns and drops unsupported or invalid consumer fields', () => {
    const consumer = makeConsumer('tdk-omp-rule-warnings-');
    const record = rule(consumer.root, 'warnings.md', {
      description: 'Warnings rule',
      paths: ['src/**', 42],
      inject: 'mystery',
      color: 'blue',
    }, 'Body\n');

    const result = emitOmpRuleFiles([record], consumer.root, claudeManifest());

    expect(frontmatter(result.files[0]!.content)).toEqual({ description: 'Warnings rule' });
    expect(result.warnings).toEqual([
      'OMP rule warnings (.claude/rules/warnings.md) dropped invalid paths field',
      'OMP rule warnings (.claude/rules/warnings.md) dropped unsupported inject value: mystery',
      'OMP rule warnings (.claude/rules/warnings.md) dropped unsupported field: color',
    ]);
  });
});

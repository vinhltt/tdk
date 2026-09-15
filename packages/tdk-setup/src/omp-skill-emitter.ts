import * as fs from 'node:fs';
import { sha256Buffer, sha256File } from './checksum';
import { isOmpInternalSkillEntrypoint, ompSkillTarget } from './omp-target-mapper';
import type { ConvertTargetFile, FlatClaudeSkillRecord } from './flat-claude-types';

export interface OmpSkillEmitResult {
  files: ConvertTargetFile[];
  warnings: string[];
}

function explicitString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function validateOmpSkillSources(
  records: FlatClaudeSkillRecord[],
  settingsValue?: unknown,
  skillSymlinks: readonly string[] = [],
): void {
  const invalid: string[] = [];
  const sourcesByName = new Map<string, string[]>();
  for (const record of records) {
    if (record.skillName.startsWith('_')) continue;
    const effectiveName = explicitString(record.frontmatter.name) ?? record.skillName;
    const sources = sourcesByName.get(effectiveName) ?? [];
    sources.push(record.sourceRelativePath);
    sourcesByName.set(effectiveName, sources);

    const reasons: string[] = [];
    if (record.frontmatterParseError) reasons.push(`frontmatter: ${record.frontmatterParseError}`);
    if (!explicitString(record.frontmatter.description)) reasons.push('missing description');
    if (reasons.length > 0) invalid.push(`- ${record.sourceRelativePath}: ${reasons.join('; ')}`);
  }
  for (const [name, sources] of sourcesByName) {
    if (sources.length > 1) {
      invalid.push(`- duplicate effective name "${name}": ${sources.sort().join(', ')}`);
    }
  }
  if (settingsValue && typeof settingsValue === 'object' && !Array.isArray(settingsValue)) {
    const settings = settingsValue as Record<string, unknown>;
    for (const key of ['skills', 'disabledProviders']) {
      if (Object.hasOwn(settings, key)) {
        invalid.push(`- .claude/settings.json#${key}: conflicts with OMP skill takeover due project settings precedence`);
      }
    }
  }
  for (const symlink of skillSymlinks) {
    invalid.push(`- ${symlink}: symlink is not supported by OMP skill takeover`);
  }
  if (invalid.length > 0) throw new Error(`Invalid OMP skill sources:\n${invalid.join('\n')}`);
}

export function emitOmpSkillFiles(
  records: FlatClaudeSkillRecord[],
  settingsValue?: unknown,
  skillSymlinks: readonly string[] = [],
): OmpSkillEmitResult {
  validateOmpSkillSources(records, settingsValue, skillSymlinks);
  const files: ConvertTargetFile[] = [];
  for (const record of records) {
    for (const skillFile of record.files) {
      if (isOmpInternalSkillEntrypoint(record.skillName, skillFile.skillRelativePath)) continue;
      const content = fs.readFileSync(skillFile.sourcePath);
      files.push({
        sourcePath: skillFile.sourcePath,
        sourceRelativePath: skillFile.sourceRelativePath,
        targetRelativePath: ompSkillTarget(record.skillName, skillFile.skillRelativePath),
        sourceChecksum: sha256File(skillFile.sourcePath),
        installedChecksum: sha256Buffer(content),
        content,
        part: 'skills',
      });
    }
  }
  files.sort((left, right) => left.targetRelativePath.localeCompare(right.targetRelativePath));
  return { files, warnings: [] };
}

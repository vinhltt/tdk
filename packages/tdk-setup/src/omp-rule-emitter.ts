import * as fs from 'node:fs';
import * as path from 'node:path';
import { stringify } from 'yaml';
import { sha256Buffer, sha256File } from './checksum';
import { parseFlatClaudeFrontmatter } from './flat-claude-adapter';
import { ompTargetRelativePath } from './omp-target-mapper';
import { validateHarnessTargetPath } from './target-path-safety';
import type { ConvertTargetFile, FlatClaudeRuleRecord } from './flat-claude-types';
import type { HarnessInstallManifest, ManagedFile } from './types';

const NATIVE_RULE_FIELDS: Readonly<Record<string, true>> = {
  description: true,
  globs: true,
  alwaysApply: true,
  condition: true,
  astCondition: true,
  scope: true,
  interruptMode: true,
  paths: true,
  inject: true,
};

export interface OmpRuleEmitResult {
  files: ConvertTargetFile[];
  warnings: string[];
}

interface RuleCandidate extends FlatClaudeRuleRecord {
  targetRelativePath: string;
}

interface CandidateResult {
  candidates: RuleCandidate[];
  errors: string[];
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function logicalName(filename: string): string {
  return path.basename(filename, path.extname(filename));
}

function ruleTargetFilename(targetRelativePath: string): string | undefined {
  const normalized = targetRelativePath.replace(/\\/g, '/');
  return /^\.claude\/rules\/[^/]+\.(?:md|mdc)$/.test(normalized)
    ? path.posix.basename(normalized)
    : undefined;
}

function safeManagedSourceRelativePath(sourceRelativePath: string): string | undefined {
  const normalized = path.posix.normalize(sourceRelativePath.replace(/\\/g, '/'));
  if (
    normalized !== sourceRelativePath.replace(/\\/g, '/') ||
    !/^\.specify\/claude-rules\/[^/]+\.(?:md|mdc)$/.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function managedCandidate(
  consumerRoot: string,
  managedFile: ManagedFile,
  targetFilename: string,
): RuleCandidate | string {
  const sourceRelativePath = safeManagedSourceRelativePath(managedFile.sourceRelativePath);
  if (!sourceRelativePath) {
    return `- ${managedFile.targetRelativePath}: managed rule source must be under .specify/claude-rules/`;
  }
  const sourcePath = validateHarnessTargetPath({
    consumerRoot,
    targetPath: path.join(consumerRoot, ...sourceRelativePath.split('/')),
    allowedRoots: [path.join(consumerRoot, '.specify', 'claude-rules')],
    label: 'OMP managed rule source',
  });
  if (!fs.existsSync(sourcePath)) return `- ${sourceRelativePath}: managed rule source does not exist`;
  const stat = fs.lstatSync(sourcePath);
  if (!stat.isFile() || stat.isSymbolicLink()) return `- ${sourceRelativePath}: managed rule source must be a regular file`;
  const parsed = parseFlatClaudeFrontmatter(fs.readFileSync(sourcePath, 'utf-8'));
  return {
    kind: 'rule',
    sourcePath,
    sourceRelativePath,
    name: logicalName(targetFilename),
    description: stringField(parsed.frontmatter.description),
    frontmatter: parsed.frontmatter,
    frontmatterParseError: parsed.frontmatterParseError,
    body: parsed.body,
    targetRelativePath: ompTargetRelativePath('rules', targetFilename),
  };
}

function buildCandidates(
  records: FlatClaudeRuleRecord[],
  consumerRoot: string,
  claudeManifest: HarnessInstallManifest,
): CandidateResult {
  const errors: string[] = [];
  const managedRuleFiles: Array<{ file: ManagedFile; targetFilename: string }> = [];
  const managedTargets = new Set<string>();
  for (const file of claudeManifest.managedFiles) {
    const targetFilename = ruleTargetFilename(file.targetRelativePath);
    if (!targetFilename) continue;
    managedTargets.add(file.targetRelativePath.replace(/\\/g, '/'));
    managedRuleFiles.push({ file, targetFilename });
  }

  const candidates: RuleCandidate[] = records
    .filter((record) => !managedTargets.has(record.sourceRelativePath))
    .map((record) => ({
      ...record,
      targetRelativePath: ompTargetRelativePath('rules', path.basename(record.sourceRelativePath)),
    }));
  for (const managed of managedRuleFiles) {
    const candidate = managedCandidate(consumerRoot, managed.file, managed.targetFilename);
    if (typeof candidate === 'string') errors.push(candidate);
    else candidates.push(candidate);
  }
  candidates.sort((left, right) => left.targetRelativePath.localeCompare(right.targetRelativePath));
  return { candidates, errors };
}

function extractDescription(body: string): string | undefined {
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^ {0,3}#\s+(.+?)(?:\s+#+)?\s*$/);
    if (heading?.[1]?.trim()) return heading[1].trim();
  }
  for (const line of body.split(/\r?\n/)) {
    if (line.trim()) return line.trim();
  }
  return undefined;
}

function preserveStringField(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  field: 'condition' | 'astCondition' | 'scope' | 'interruptMode',
  label: string,
  warnings: string[],
): void {
  if (!Object.hasOwn(source, field)) return;
  const value = stringField(source[field]);
  if (value) target[field] = value;
  else warnings.push(`${label} dropped invalid ${field} field`);
}

function buildRuleFrontmatter(candidate: RuleCandidate, warnings: string[], errors: string[]): Record<string, unknown> {
  const source = candidate.frontmatter;
  const target: Record<string, unknown> = {};
  const label = `OMP rule ${candidate.name} (${candidate.sourceRelativePath})`;

  const description = stringField(source.description);
  if (description) target.description = description;
  else if (Object.hasOwn(source, 'description')) {
    warnings.push(`${label} dropped invalid description field`);
  }

  if (Object.hasOwn(source, 'globs')) {
    if (typeof source.globs === 'string' || isStringList(source.globs)) target.globs = source.globs;
    else warnings.push(`${label} dropped invalid globs field`);
  }
  if (Object.hasOwn(source, 'alwaysApply')) {
    if (typeof source.alwaysApply === 'boolean') target.alwaysApply = source.alwaysApply;
    else warnings.push(`${label} dropped invalid alwaysApply field`);
  }

  if (Object.hasOwn(source, 'paths')) {
    if (!isStringList(source.paths)) {
      warnings.push(`${label} dropped invalid paths field`);
    } else if (source.paths.length === 1 && source.paths[0] === '**') {
      if (!Object.hasOwn(target, 'alwaysApply')) target.alwaysApply = true;
    } else if (!Object.hasOwn(target, 'globs')) {
      target.globs = source.paths;
    }
  }

  if (Object.hasOwn(source, 'inject')) {
    if (source.inject === 'full') {
      if (!Object.hasOwn(target, 'alwaysApply')) target.alwaysApply = true;
    } else if (source.inject !== 'reference') {
      warnings.push(`${label} dropped unsupported inject value: ${String(source.inject)}`);
    }
  }

  preserveStringField(source, target, 'condition', label, warnings);
  preserveStringField(source, target, 'astCondition', label, warnings);
  preserveStringField(source, target, 'scope', label, warnings);
  preserveStringField(source, target, 'interruptMode', label, warnings);

  for (const field of Object.keys(source)) {
    if (!Object.hasOwn(NATIVE_RULE_FIELDS, field)) {
      warnings.push(`${label} dropped unsupported field: ${field}`);
    }
  }

  if (!Object.hasOwn(target, 'description') && target.alwaysApply !== true) {
    const placeholder = extractDescription(candidate.body);
    if (!placeholder) {
      errors.push(`- ${candidate.sourceRelativePath} (${candidate.name}): cannot extract description from empty rule body`);
    } else {
      target.description = placeholder;
      warnings.push(
        `Placeholder rule description: ${candidate.sourceRelativePath} -> ${candidate.targetRelativePath}: ${JSON.stringify(placeholder)}`,
      );
    }
  }
  return target;
}

export function emitOmpRuleFiles(
  records: FlatClaudeRuleRecord[],
  consumerRoot: string,
  claudeManifest: HarnessInstallManifest,
): OmpRuleEmitResult {
  const built = buildCandidates(records, consumerRoot, claudeManifest);
  const errors = [...built.errors];
  const warnings: string[] = [];
  const files: ConvertTargetFile[] = [];
  const sourcesByName = new Map<string, string[]>();

  for (const candidate of built.candidates) {
    const sources = sourcesByName.get(candidate.name) ?? [];
    sources.push(candidate.sourceRelativePath);
    sourcesByName.set(candidate.name, sources);
    if (candidate.frontmatterParseError) {
      errors.push(`- ${candidate.sourceRelativePath} (${candidate.name}): ${candidate.frontmatterParseError}`);
    }
    if (candidate.name === 'RULES') {
      errors.push(`- reserved logical rule name "RULES": ${candidate.sourceRelativePath}`);
    }
    const ruleFrontmatter = buildRuleFrontmatter(candidate, warnings, errors);
    const yaml = stringify(ruleFrontmatter).trimEnd();
    const content = Buffer.from(`---\n${yaml}\n---\n${candidate.body}`, 'utf-8');
    files.push({
      sourcePath: candidate.sourcePath,
      sourceRelativePath: candidate.sourceRelativePath,
      targetRelativePath: candidate.targetRelativePath,
      sourceChecksum: sha256File(candidate.sourcePath),
      installedChecksum: sha256Buffer(content),
      content,
      part: 'rules',
    });
  }

  for (const [name, sources] of sourcesByName) {
    if (sources.length > 1) {
      errors.push(`- duplicate logical rule name "${name}": ${sources.sort().join(', ')}`);
    }
  }
  if (errors.length > 0) throw new Error(`Invalid OMP rule sources:\n${errors.join('\n')}`);

  return { files, warnings };
}

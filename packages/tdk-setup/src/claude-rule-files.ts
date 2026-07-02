import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256Buffer } from './checksum';
import { transformFileContent } from './prefix-transform';
import type { PrefixTransformSettings } from './prefix-transform';
import { posixTargetPath } from './target-relative-path';
import type { BuildPlanInput, TransformedPluginFile } from './types';

export function discoverClaudeRuleFiles(input: BuildPlanInput, settings: PrefixTransformSettings, rewriteTextFiles: boolean): TransformedPluginFile[] {
  const rulesDir = path.join(input.consumerRoot, '.specify', 'claude-rules');
  if (!fs.existsSync(rulesDir)) return [];

  const rulesDirStat = fs.lstatSync(rulesDir);
  if (!rulesDirStat.isDirectory() || rulesDirStat.isSymbolicLink()) {
    throw new Error(`Claude rules source is not a directory: .specify/claude-rules`);
  }

  const targetDir = input.targetDir ?? '.claude';
  const contentSettings = rewriteTextFiles
    ? settings
    : { sourcePrefix: settings.sourcePrefix, targetPrefix: settings.sourcePrefix };
  const ruleFiles: TransformedPluginFile[] = [];

  for (const entry of fs.readdirSync(rulesDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.name.endsWith('.md')) continue;
    const sourceRelativePath = posixTargetPath('.specify/claude-rules', entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlinked Claude rule source file: ${sourceRelativePath}`);
    if (!entry.isFile()) continue;

    const sourcePath = path.join(rulesDir, entry.name);
    const sourceContent = fs.readFileSync(sourcePath);
    const content = transformFileContent(sourcePath, sourceContent, contentSettings);
    ruleFiles.push({
      plugin: 'claude-rules',
      sourceRelativePath,
      sourcePath,
      sourceChecksum: sha256Buffer(sourceContent),
      targetRelativePath: posixTargetPath(targetDir, 'rules', entry.name),
      installedChecksum: sha256Buffer(content),
      content,
    });
  }

  return ruleFiles;
}

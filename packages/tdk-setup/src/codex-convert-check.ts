import * as fs from 'node:fs';
import * as path from 'node:path';
import { codexPackageRoot } from './codex-package-root';
import { buildCodexPluginArtifacts } from './codex-plugin-emitter';
import type { CodexConvertPlugin } from './codex-convert-ir';

export interface CodexConvertCheckMismatch {
  plugin: string;
  path: string;
  reason: 'missing' | 'extra' | 'different';
}

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files.sort();
}

export async function checkCodexPluginFreshness(consumerRoot: string, plugins: CodexConvertPlugin[]): Promise<CodexConvertCheckMismatch[]> {
  const mismatches: CodexConvertCheckMismatch[] = [];
  for (const plugin of plugins) {
    const pkgRoot = codexPackageRoot(consumerRoot, plugin.name);
    const generated = await buildCodexPluginArtifacts(plugin);
    const expected = new Map(generated.artifacts.map((artifact) => [artifact.artifactRelativePath, artifact.content]));
    for (const [relativePath, content] of expected) {
      const filePath = path.join(pkgRoot, relativePath);
      if (!fs.existsSync(filePath)) {
        mismatches.push({ plugin: plugin.name, path: relativePath, reason: 'missing' });
        continue;
      }
      if (!fs.readFileSync(filePath).equals(content)) {
        mismatches.push({ plugin: plugin.name, path: relativePath, reason: 'different' });
      }
    }
    // Walk the committed codex package root for "extra" files (not in expected set)
    for (const filePath of walkFiles(pkgRoot)) {
      const relativePath = path.relative(pkgRoot, filePath).replace(/\\/g, '/');
      if (!expected.has(relativePath)) {
        mismatches.push({ plugin: plugin.name, path: relativePath, reason: 'extra' });
      }
    }
  }
  return mismatches.sort((a, b) => `${a.plugin}/${a.path}`.localeCompare(`${b.plugin}/${b.path}`));
}

export function renderFreshnessMismatches(mismatches: CodexConvertCheckMismatch[]): string {
  if (mismatches.length === 0) return 'Codex plugin artifacts are fresh.\n';
  return [
    'Codex plugin artifacts are stale:',
    ...mismatches.map((item) => `  - ${item.plugin}: ${item.reason} ${item.path}`),
  ].join('\n') + '\n';
}

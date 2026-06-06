// CLI: Config index — scan docs directory and output file list
// Replaces: config/index.sh (154L)

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Command } from 'commander';
import { detectConfig, writeAgentJson } from '../../utils/index';

/** Recursively find all .md files with metadata */
function scanMdFiles(dir: string, base: string = dir): { path: string; size: number; modified: number }[] {
  if (!existsSync(dir)) return [];
  const results: { path: string; size: number; modified: number }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanMdFiles(fullPath, base));
    } else if (entry.name.endsWith('.md')) {
      const relPath = relative(base, fullPath);
      if (relPath === 'document-manager.md' || relPath === 'custom-document-manager.md') continue;
      const stat = statSync(fullPath);
      results.push({ path: relPath, size: stat.size, modified: Math.floor(stat.mtimeMs / 1000) });
    }
  }
  return results;
}

/** Create config-index command for CLI registration */
export function createConfigIndexCommand(): Command {
  return new Command('index')
    .description('Scan docs directory and output file list')
    .option('--sub-workspace <name>', 'Target sub-workspace')
    .option('--full', 'Full rebuild mode', false)
    .action((opts) => {
      const config = detectConfig({ subWorkspace: opts.subWorkspace });

      if (config.error === 'sub_workspace_not_found') {
        process.stderr.write(`Error: Sub-workspace '${config.requestedSubWorkspace}' not found\n`);
        process.exit(1);
      }

      const outputRoot = config.targetSubWorkspace?.root ?? config.workspaceRoot;
      const outputDocsPath = config.targetSubWorkspace?.docsPath ?? config.docsPath;
      const docsDir = join(outputRoot, outputDocsPath);
      const managerFile = join(docsDir, 'document-manager.md');

      if (!existsSync(docsDir)) {
        process.stderr.write(`Error: Docs directory not found: ${docsDir}\n`);
        process.exit(1);
      }

      const hasManager = existsSync(managerFile);
      const files = scanMdFiles(docsDir);

      let mode = 'create';
      if (hasManager) {
        mode = opts.full ? 'full_rebuild' : 'incremental';
      }

      const output = {
        docsDir,
        managerFile,
        hasManager,
        mode,
        fullRebuild: opts.full,
        fileCount: files.length,
        files,
        outputRoot,
        subWorkspaceName: opts.subWorkspace ?? '',
        subWorkspaces: config.subWorkspaces,
      };

      writeAgentJson(output);
    });
}

// Standalone mode: bun src/commands/config/index.ts
if (import.meta.main) {
  createConfigIndexCommand().parse();
}

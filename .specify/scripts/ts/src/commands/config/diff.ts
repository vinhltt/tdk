// CLI: Config diff — compare docs between workspace and sub-workspace
// Replaces: config/diff.sh (221L)
// [RT3-9] Compares raw JSON (pre-Zod) when diffing config files

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import { detectConfig } from '../../utils/index';

// [RT2-3] Validate git ref format — allowlist only safe characters
const GIT_REF_REGEX = /^[a-zA-Z0-9._/~^@{}\-]+$/;

function validateGitRef(ref: string): boolean {
  return GIT_REF_REGEX.test(ref) && !ref.includes('..') && ref.length < 256;
}

/** Recursively find all .md files in a directory */
function findMdFiles(dir: string, base: string = dir): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMdFiles(fullPath, base));
    } else if (entry.name.endsWith('.md')) {
      results.push(relative(base, fullPath));
    }
  }
  return results;
}

/** Create config-diff command for CLI registration */
export function createConfigDiffCommand(): Command {
  return new Command('diff')
    .description('Compare docs between workspace and sub-workspace')
    .requiredOption('--sub-workspace <name>', 'Target sub-workspace')
    .option('--detailed', 'Include diff content', false)
    .option('--base <ref>', 'Git ref for base comparison')
    .action((opts) => {
    // [RT2-3] Validate git ref if provided
    if (opts.base && !validateGitRef(opts.base)) {
      process.stderr.write(`Error: Invalid git ref format: ${opts.base}\n`);
      process.exit(1);
    }

    const config = detectConfig({ subWorkspace: opts.subWorkspace });

    if (config.error === 'sub_workspace_not_found') {
      process.stderr.write(`Error: Sub-workspace '${config.requestedSubWorkspace}' not found\n`);
      process.exit(1);
    }

    if (!config.targetSubWorkspace) {
      process.stderr.write(`Error: Could not determine sub-workspace root\n`);
      process.exit(1);
    }

    const workspaceDocs = join(config.workspaceRoot, config.docsPath);
    const swDocs = join(config.targetSubWorkspace.root, config.targetSubWorkspace.docsPath);

    if (!existsSync(swDocs)) {
      process.stderr.write(`Error: Sub-workspace docs not found: ${swDocs}\n`);
      process.exit(1);
    }

    // Collect files from both directories
    const wsFiles = new Set(findMdFiles(workspaceDocs).filter(
      f => !f.startsWith('sub-workspaces/') && f !== 'document-manager.md' && f !== 'custom-document-manager.md'
    ));
    const swFiles = new Set(findMdFiles(swDocs).filter(
      f => f !== 'document-manager.md' && f !== 'custom-document-manager.md'
    ));

    const allFiles = new Set([...wsFiles, ...swFiles]);
    const files: Record<string, unknown>[] = [];
    let countNew = 0, countModified = 0, countIdentical = 0, countWsOnly = 0;

    for (const filePath of allFiles) {
      const wsFile = join(workspaceDocs, filePath);
      const swFile = join(swDocs, filePath);
      const inWs = wsFiles.has(filePath);
      const inSw = swFiles.has(filePath);

      let status: string, details: string;

      if (inSw && !inWs) {
        status = 'new'; details = 'Sub-workspace only'; countNew++;
      } else if (inWs && !inSw) {
        status = 'workspace_only'; details = 'Workspace only'; countWsOnly++;
      } else {
        const wsContent = readFileSync(wsFile, 'utf-8');
        const swContent = readFileSync(swFile, 'utf-8');
        if (wsContent === swContent) {
          status = 'identical'; details = 'No changes'; countIdentical++;
        } else {
          status = 'modified';
          const wsLines = wsContent.split('\n');
          const swLines = swContent.split('\n');
          details = `+${Math.max(0, swLines.length - wsLines.length)} -${Math.max(0, wsLines.length - swLines.length)} lines`;
          countModified++;
        }
      }

      const entry: Record<string, string> = { path: filePath, status, details };
      if (opts.detailed && status === 'modified') {
        try {
          // [RT4-7] execFileSync with array args
          const diff = execFileSync('diff', ['-u', wsFile, swFile], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
          entry.diff = diff.slice(0, 2000);
        } catch (e: unknown) {
          const err = e as { stdout?: string };
          entry.diff = (err.stdout ?? '').slice(0, 2000);
        }
      }
      files.push(entry);
    }

    const output = {
      subWorkspaceName: opts.subWorkspace,
      workspaceDocs,
      subWorkspaceDocs: swDocs,
      detailed: opts.detailed,
      summary: {
        new: countNew, modified: countModified, identical: countIdentical,
        workspaceOnly: countWsOnly,
        total: countNew + countModified + countIdentical + countWsOnly,
      },
      files,
    };

    console.log(JSON.stringify(output, null, 2));
  });
}

// Standalone mode: bun src/commands/config/diff.ts
if (import.meta.main) {
  createConfigDiffCommand().parse();
}

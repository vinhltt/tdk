// sync-commands.ts
// Sync commands from source to all AI platform targets
// Replaces: bash/sync-commands.sh

import { Command } from 'commander';
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { getRepoRoot } from '../../utils/index';

interface SyncOptions {
  dryRun: boolean;
  verbose: boolean;
}

interface SyncDirs {
  sourceFeature: string;
  sourceUt: string;
  claude: string;
  github: string;
  gemini: string;
  opencode: string;
}

function ensureDir(dir: string, opts: SyncOptions): void {
  if (!existsSync(dir)) {
    if (opts.dryRun) {
      process.stdout.write(`[DRY-RUN] Would create: ${dir}\n`);
    } else {
      mkdirSync(dir, { recursive: true });
      process.stdout.write(`[INFO] Created: ${dir}\n`);
    }
  }
}

function copyFile(src: string, dest: string, opts: SyncOptions): void {
  if (opts.dryRun) {
    process.stdout.write(`[DRY-RUN] Would copy: ${src} -> ${dest}\n`);
    return;
  }
  copyFileSync(src, dest);
  if (opts.verbose) process.stdout.write(`[OK] Copied: ${dest}\n`);
}

function extractDescription(filePath: string): string {
  const name = basename(filePath, '.md');
  const content = readFileSync(filePath, 'utf-8');
  const line = content.split('\n').find(l => new RegExp(`#.*/${name}`).test(l));
  if (line) {
    const afterDash = line.replace(/^.*- */, '').trimEnd();
    if (afterDash && !afterDash.startsWith('#')) return afterDash;
  }
  return `Execute ${name} command`;
}

function convertToToml(src: string, dest: string, opts: SyncOptions): void {
  if (opts.dryRun) {
    process.stdout.write(`[DRY-RUN] Would convert: ${src} -> ${dest}\n`);
    return;
  }
  const description = extractDescription(src);
  const content = readFileSync(src, 'utf-8');
  const toml = [
    `description = "${description}"`,
    '',
    'prompt = """',
    '---',
    `description: ${description}`,
    '---',
    '',
    content.trimEnd(),
    '"""',
  ].join('\n');
  writeFileSync(dest, toml, 'utf-8');
  if (opts.verbose) process.stdout.write(`[OK] Converted: ${dest}\n`);
}

function syncFeatureCommands(dirs: SyncDirs, opts: SyncOptions): number {
  process.stdout.write('[INFO] Syncing ErcSpec commands...\n');
  if (!existsSync(dirs.sourceFeature)) {
    process.stderr.write(`[ERROR] Source directory not found: ${dirs.sourceFeature}\n`);
    return 0;
  }
  ensureDir(dirs.claude, opts);
  ensureDir(dirs.github, opts);
  ensureDir(dirs.gemini, opts);
  ensureDir(dirs.opencode, opts);

  let count = 0;
  for (const file of readdirSync(dirs.sourceFeature)) {
    if (!file.endsWith('.md')) continue;
    const src = join(dirs.sourceFeature, file);
    const name = basename(file, '.md');
    copyFile(src, join(dirs.claude, `tdk-${name}.md`), opts);
    copyFile(src, join(dirs.github, `tdk-${name}.prompt.md`), opts);
    copyFile(src, join(dirs.opencode, `tdk-${name}.md`), opts);
    if (name !== 'status') {
      convertToToml(src, join(dirs.gemini, `tdk-${name}.toml`), opts);
    }
    count++;
  }
  process.stdout.write(`[OK] ErcSpec: ${count} commands synced\n`);
  return count;
}

function syncUtCommands(dirs: SyncDirs, opts: SyncOptions): number {
  process.stdout.write('[INFO] Syncing UT commands...\n');
  if (!existsSync(dirs.sourceUt)) {
    process.stderr.write(`[ERROR] Source directory not found: ${dirs.sourceUt}\n`);
    return 0;
  }
  ensureDir(join(dirs.claude, 'ut'), opts);
  ensureDir(dirs.github, opts);

  let count = 0;
  for (const file of readdirSync(dirs.sourceUt)) {
    if (!file.endsWith('.md')) continue;
    const src = join(dirs.sourceUt, file);
    const name = basename(file, '.md');
    copyFile(src, join(dirs.claude, 'ut', `${name}.md`), opts);
    copyFile(src, join(dirs.github, `ut.${name}.prompt.md`), opts);
    count++;
  }
  process.stdout.write(`[OK] UT: ${count} commands synced\n`);
  return count;
}

const program = new Command()
  .name('sync-commands')
  .description('Sync commands from .specify/commands/ to all AI platform targets')
  .option('--dry-run', 'Preview changes without making them', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action((opts: { dryRun: boolean; verbose: boolean }) => {
    const repoRoot = getRepoRoot();
    const dirs = {
      sourceFeature: join(repoRoot, '.specify', 'commands', 'feature'),
      sourceUt: join(repoRoot, '.specify', 'commands', 'ut'),
      claude: join(repoRoot, '.claude', 'commands'),
      github: join(repoRoot, '.github', 'prompts'),
      gemini: join(repoRoot, '.gemini', 'commands'),
      opencode: join(repoRoot, '.opencode', 'command'),
    };

    process.stdout.write('==============================================\n');
    process.stdout.write('  Command Sync Script\n');
    process.stdout.write('==============================================\n\n');

    if (opts.dryRun) process.stdout.write('[WARN] Running in DRY-RUN mode (no changes will be made)\n\n');

    process.stdout.write(`[INFO] Source: ${join(repoRoot, '.specify', 'commands')}\n`);
    process.stdout.write('[INFO] Targets: Claude, GitHub Copilot, Gemini, OpenCode\n\n');

    if (!existsSync(join(repoRoot, '.specify', 'commands'))) {
      process.stderr.write(`[ERROR] Source directory not found: ${join(repoRoot, '.specify', 'commands')}\n`);
      process.exit(1);
    }

    syncFeatureCommands(dirs, opts);
    syncUtCommands(dirs, opts);

    process.stdout.write('\n==============================================\n');
    process.stdout.write('[OK] All commands synced successfully!\n');
    process.stdout.write('==============================================\n\n');
    process.stdout.write('Synced to:\n');
    process.stdout.write(`  - ${dirs.claude}/\n`);
    process.stdout.write(`  - ${dirs.github}/\n`);
    process.stdout.write(`  - ${dirs.gemini}/\n`);
    process.stdout.write(`  - ${dirs.opencode}/\n`);
  });

program.parse();

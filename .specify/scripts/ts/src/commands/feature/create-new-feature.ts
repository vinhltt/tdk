// CLI: create-new-feature — create feature directory and spec from ticket ID
// Replaces: bash/create-new-feature.sh

import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import {
  loadFeatureEnv, parseTicketId, runValidationHook, getRepoRoot,
} from '../../utils/index';

const program = new Command()
  .name('create-new-feature')
  .description('Create feature directory and spec from ticket ID')
  .argument('<ticket-id>', 'Ticket ID (e.g., aa-001, hotfix/aa-123)')
  .argument('<feature-description>', 'Short description of the feature')
  .option('--json', 'Output in JSON format', false)
  .action((ticketId: string, featureDescription: string, opts: { json: boolean }) => {
    const env = loadFeatureEnv();
    const repoRoot = getRepoRoot();
    ticketId = ticketId.toLowerCase();

    const parts = parseTicketId(ticketId, env);
    if (!parts) {
      process.stderr.write(`Error: Invalid ticket ID '${ticketId}'\n`);
      process.stderr.write(`Allowed prefixes: ${env.prefixList}, format: ${env.ticketFormat}\n`);
      process.exit(1);
    }
    const { folder, prefix, number } = parts;

    const displayTicketId = folder === env.defaultFolder
      ? `${prefix}-${number}`
      : `${folder}/${prefix}-${number}`;
    const ticketIdentifier = `${prefix}-${number}`;
    const branchName = `${folder}/${ticketIdentifier}`;

    // Check if ticket already exists (dir or git branch)
    const featureDir = join(repoRoot, env.specsRoot, folder, ticketIdentifier);
    if (existsSync(featureDir)) {
      process.stderr.write(`Error: Ticket ID '${displayTicketId}' already exists\n`);
      process.stderr.write('Please use a different ticket ID or work on the existing feature\n');
      process.exit(1);
    }

    let hasGit = false;
    try {
      execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: 'pipe' });
      hasGit = true;
    } catch { /* not a git repo */ }

    if (hasGit) {
      // Check remote branch
      try {
        const remotes = execFileSync('git', ['ls-remote', '--heads', 'origin'], { encoding: 'utf-8', stdio: 'pipe' });
        if (remotes.includes(`refs/heads/${branchName}`)) {
          process.stderr.write(`Error: Ticket ID '${displayTicketId}' already exists as remote branch\n`);
          process.exit(1);
        }
      } catch { /* no remotes */ }
      // Check local branch
      try {
        const locals = execFileSync('git', ['branch'], { encoding: 'utf-8', stdio: 'pipe' });
        if (locals.split('\n').some(b => b.replace(/^[* ]+/, '') === branchName)) {
          process.stderr.write(`Error: Ticket ID '${displayTicketId}' already exists as local branch\n`);
          process.exit(1);
        }
      } catch { /* ignore */ }
    }

    // Run validation hook
    if (env.validationHook) {
      const ok = runValidationHook({
        prefix, number, folder, phase: 'create',
        hookPath: env.validationHook, repoRoot,
        timeout: env.hookTimeout, failBehavior: env.hookFailBehavior,
      });
      if (!ok) {
        process.stderr.write(`Error: Validation failed for ticket '${displayTicketId}'\n`);
        process.exit(1);
      }
    }

    // Create feature directory and spec file
    mkdirSync(featureDir, { recursive: true });
    const templateFile = join(repoRoot, env.specsRoot, 'templates', 'spec-template.md.tpl');
    const specFile = join(featureDir, 'spec.md');
    if (existsSync(templateFile)) {
      copyFileSync(templateFile, specFile);
    } else {
      writeFileSync(specFile, '');
    }

    // Warn if not on expected branch
    if (hasGit) {
      try {
        const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8', stdio: 'pipe' }).trim();
        if (currentBranch !== branchName) {
          process.stderr.write(`WARNING: Current branch (${currentBranch}) does not match expected (${branchName})\n`);
          process.stderr.write(`Create branch manually: git checkout -b ${branchName}\n`);
        }
      } catch { /* ignore */ }
    }

    if (opts.json) {
      console.log(JSON.stringify({
        taskId: displayTicketId,
        branchName,
        specFile,
        folder,
        prefix,
        number,
        featureDescription,
      }, null, 2));
    } else {
      console.log(`TASK_ID: ${displayTicketId}`);
      console.log(`EXPECTED_BRANCH: ${branchName}`);
      let currentBranch = 'N/A';
      if (hasGit) {
        try { currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8', stdio: 'pipe' }).trim(); } catch { /* ignore */ }
      }
      console.log(`CURRENT_BRANCH: ${currentBranch}`);
      console.log(`SPEC_FILE: ${specFile}`);
      console.log(`FOLDER: ${folder}`);
      console.log(`PREFIX: ${prefix}`);
      console.log(`NUMBER: ${number}`);
      console.log(`FEATURE_DESCRIPTION: ${featureDescription}`);
    }
  });

program.parse();

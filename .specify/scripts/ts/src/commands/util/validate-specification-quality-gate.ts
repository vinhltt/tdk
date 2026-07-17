// CLI: validate-specification-quality-gate — enforce embedded gate with legacy fallback

import { existsSync, readFileSync } from 'node:fs';
import { Command } from 'commander';
import { writeAgentJson } from '../../utils/index';
import { validateSpecificationQualityGate } from './specification-quality-gate';

const program = new Command()
  .name('validate-specification-quality-gate')
  .description('Validate the Specification Quality Gate in spec.md')
  .argument('<spec-path>', 'Path to spec.md')
  .option('--legacy-checklist <path>', 'Legacy checklists/requirements.md fallback path')
  .option('--json', 'Output compact JSON', false)
  .action((specPath: string, options: { legacyChecklist?: string; json: boolean }) => {
    let markdown: string;
    try {
      markdown = readFileSync(specPath, 'utf-8');
    } catch {
      process.stderr.write(`ERROR: Cannot read spec: ${specPath}\n`);
      process.exitCode = 1;
      return;
    }

    const result = validateSpecificationQualityGate(markdown, {
      legacyChecklistExists: options.legacyChecklist
        ? existsSync(options.legacyChecklist)
        : false,
    });

    if (options.json) {
      writeAgentJson(result);
    } else {
      process.stdout.write(`${result.allowed ? 'PASS' : 'BLOCKED'}: ${result.mode}\n`);
      for (const warning of result.warnings) process.stderr.write(`WARNING: ${warning}\n`);
      for (const error of result.errors) process.stderr.write(`ERROR: ${error}\n`);
    }
    if (!result.allowed) process.exitCode = 1;
  });

program.parse();

import { Command } from 'commander';
import { writeAgentJson } from '../../utils';
import { planArtifactMigration } from './artifact-migration-planner';
import {
  applyArtifactMigration,
  findPendingArtifactMigration,
  rollbackArtifactMigration,
} from './artifact-migration-transaction';

const program = new Command()
  .name('migrate-plan-artifacts')
  .description('Dry-run or apply lean artifact migration for one feature directory')
  .argument('<feature-dir>', 'Feature directory containing spec.md and plan.md')
  .option('--apply', 'Apply the reviewed migration plan', false)
  .option('--yes', 'Confirm deletion after staged writes validate', false)
  .option('--resume <manifest>', 'Rollback an interrupted transaction, then re-plan and apply')
  .option('--rollback <manifest>', 'Rollback an interrupted transaction')
  .option('--json', 'Emit compact JSON', false)
  .action((featureDir: string, options: {
    apply: boolean;
    yes: boolean;
    resume?: string;
    rollback?: string;
    json: boolean;
  }) => {
    try {
      if (options.resume && options.rollback) throw new Error('--resume and --rollback are mutually exclusive');
      if (options.rollback) {
        const result = rollbackArtifactMigration(options.rollback);
        return options.json ? writeAgentJson(result) : console.log(`Rolled back: ${options.rollback}`);
      }
      if (options.resume) {
        rollbackArtifactMigration(options.resume);
        options.apply = true;
      } else {
        const pending = findPendingArtifactMigration(featureDir);
        if (pending) throw new Error(`Interrupted migration found: ${pending}. Use --resume or --rollback.`);
      }

      const plan = planArtifactMigration(featureDir);
      if (!options.apply) {
        if (options.json) writeAgentJson(plan);
        else console.log(JSON.stringify(plan, null, 2));
        if (plan.errors.length > 0) process.exitCode = 1;
        return;
      }
      const result = applyArtifactMigration(plan, { yes: options.yes });
      if (options.json) writeAgentJson(result);
      else console.log(`Migration ${result.state}: ${result.transactionDir}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) writeAgentJson({ error: message });
      else process.stderr.write(`ERROR: ${message}\n`);
      process.exitCode = 1;
    }
  });

program.parse();

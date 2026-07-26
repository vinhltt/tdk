/**
 * inspect-controller-lease.ts (C-B7 CLI edge)
 *
 * Standalone script: `bun src/commands/util/inspect-controller-lease.ts --project-root <path>`
 *
 * Read-only wrapper over `inspectControllerLease`. Writes nothing anywhere
 * (including no temp path) and runs no filesystem case probe — unlike
 * `resolve-parallel-phase-wave.ts`, this CLI must stay side-effect free.
 *
 * Exit 0 = lease not held (caller proceeds). Exit 2 = lease held (an
 * expected policy rejection the caller turns into its own STOP). Exit 1 =
 * unexpected I/O/runtime failure (e.g. --project-root does not exist).
 */

import { realpathSync } from 'node:fs';
import { Command } from 'commander';
import { formatAgentJson, writeAgentJson } from '../../utils';
import { inspectControllerLease } from './parallel-controller-lease-read';

const program = new Command()
  .name('inspect-controller-lease')
  .description('Read-only check for an active parallel controller lease; never acquires, writes, or waits')
  .requiredOption('--project-root <path>', 'Project root to inspect')
  .action((options: { projectRoot: string }) => {
    try {
      const realRoot = realpathSync.native(options.projectRoot);
      const result = inspectControllerLease(realRoot);
      writeAgentJson(result);
      process.exitCode = result.held ? 2 : 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.stdout.write(formatAgentJson({ error: message }));
      process.exitCode = 1;
    }
  });

program.parse();

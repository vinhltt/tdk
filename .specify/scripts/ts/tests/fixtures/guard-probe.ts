// Guard probe for milestone-guard-per-repo.test.ts.
//
// Performs the read-only work a guard does plus the one mutation it is allowed — creating the
// feature branch inside the code repository — either through the shipped `runGit` helper or
// through raw `execFileSync`, so a test can show the difference the helper makes.
//
// argv: <host> <codeRepo> <branchName> <runner: runGit|raw>

import { execFileSync } from 'node:child_process';
import { runGit } from '../../src/utils/index';

const [host, codeRepo, branchName, runner] = process.argv.slice(2);
if (host === undefined || codeRepo === undefined || branchName === undefined) {
  throw new Error('usage: guard-probe.ts <host> <codeRepo> <branch> <runGit|raw>');
}

const exec = runner === 'raw'
  ? (args: string[]): string =>
      execFileSync('git', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  : (args: string[]): string => runGit(args);

exec(['-C', host, 'rev-parse', '--abbrev-ref', 'HEAD']);
exec(['-C', codeRepo, 'rev-parse', '--show-toplevel']);
exec(['-C', codeRepo, 'branch', '--show-current']);
exec(['-C', codeRepo, 'worktree', 'list', '--porcelain']);
exec(['-C', codeRepo, 'branch', '--', branchName, 'HEAD']);

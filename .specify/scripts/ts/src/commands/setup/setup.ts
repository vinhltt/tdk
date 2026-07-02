#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';
import { parseSetupArgs, runSetupSteps } from './setup-cli';
import { defaultRunner } from './utils/default-command-runner';
import { banner, stepHeader, successMsg, failMsg, skipMsg, summaryTable, manualSteps, finalMessage } from './utils/output-helpers';

function getProjectRoot(): string {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
  } catch {
    return process.cwd();
  }
}

function detectOs(): string {
  switch (process.platform) {
    case 'linux': return 'linux';
    case 'darwin': return 'macos';
    case 'win32': return 'windows';
    default: return 'unknown';
  }
}

function detectArch(): string {
  switch (process.arch) {
    case 'x64': return 'amd64';
    case 'arm64': return 'arm64';
    default: return process.arch;
  }
}

async function claudeAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['claude', '--version'], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function main() {
  const argv = Bun.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: bun setup.ts [OPTIONS]

Automates TDK setup from .specify/docs/en/guides/setup/setup-guide.md
Smart re-run: skips already-installed components automatically.

OPTIONS:
  --skip-venv     Skip Python venv creation
  --skip-config   Skip config detection verification
  --skip-plugins  Skip plugin marketplace registration
  --force         Force reinstall all (ignore existing state)
  --help          Show this help`);
    process.exit(0);
  }

  const opts = parseSetupArgs(argv);
  const projectRoot = getProjectRoot();
  const ctx = {
    projectRoot,
    os: detectOs(),
    arch: detectArch(),
    venvPath: `${projectRoot}/.venv`,
  };

  process.stdout.write(banner(projectRoot, opts.force));

  const hasClaude = opts.skipPlugins ? false : await claudeAvailable();
  const results = await runSetupSteps(opts, ctx, defaultRunner, { claudeAvailable: hasClaude });

  for (const entry of results) {
    process.stdout.write(`${stepHeader(entry.label)}\n`);
    const msg = entry.result.message ?? entry.result.status;
    switch (entry.result.status) {
      case 'pass': process.stdout.write(`${successMsg(msg)}\n`); break;
      case 'fail': process.stdout.write(`${failMsg(msg)}\n`); break;
      case 'skipped': process.stdout.write(`${skipMsg(msg)}\n`); break;
    }
    process.stdout.write('\n');
  }

  process.stdout.write(manualSteps(hasClaude));
  process.stdout.write(summaryTable(results));

  const hasFails = results.some(r => r.result.status === 'fail');
  process.stdout.write(`${finalMessage(hasFails)}\n`);
  process.exit(hasFails ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`Setup failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

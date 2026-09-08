// Runs in its own process (node --test file isolation) so the child_process spy
// below can never leak into another suite. AC10: the resolver probes only the
// repository containing the activity CWD, never every configured sub-workspace.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const childProcess = require('child_process');
const realExecFileSync = childProcess.execFileSync;
const gitCalls = [];
childProcess.execFileSync = (file, args, options) => {
  if (file === 'git') gitCalls.push(args);
  return realExecFileSync(file, args, options);
};

const { resolveSessionTickets } = require('../lib/session-ticket-resolver.cjs');

function git(cwd, ...args) {
  return realExecFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 3000
  }).trim();
}

function initRepo(repoPath, branch) {
  fs.mkdirSync(repoPath, { recursive: true });
  git(repoPath, 'init', '--quiet');
  git(repoPath, 'config', 'user.email', 'tdk-tests@example.invalid');
  git(repoPath, 'config', 'user.name', 'TDK Tests');
  git(repoPath, 'config', 'commit.gpgSign', 'false');
  fs.writeFileSync(path.join(repoPath, '.gitkeep'), 'fixture\n');
  git(repoPath, 'add', '.gitkeep');
  git(repoPath, 'commit', '--quiet', '-m', 'fixture');
  git(repoPath, 'branch', '-M', branch);
}

test('branch fallback probes at most the CWD repository and its own branch', (t) => {
  const fixtureRoot = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-git-isolation-'))
  );
  t.after(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    childProcess.execFileSync = realExecFileSync;
  });

  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const specsDir = path.join(workspaceRoot, '.specify', 'specs');
  fs.mkdirSync(path.join(specsDir, 'cd-002'), { recursive: true });
  fs.mkdirSync(path.join(specsDir, 'cd-003'), { recursive: true });
  initRepo(workspaceRoot, 'main');

  const active = path.join(workspaceRoot, 'active');
  const idle = path.join(workspaceRoot, 'idle');
  initRepo(active, 'feature/CD-002');
  initRepo(idle, 'feature/CD-003');

  const config = {
    subWorkspaces: [{ name: 'active', path: 'active' }, { name: 'idle', path: 'idle' }],
    git: { prefixList: 'CD' },
    specs: { root: '.specify', defaultFolder: 'specs', ticketFormat: '^([a-z]+)-([0-9]+)$' }
  };

  gitCalls.length = 0;
  const resolution = resolveSessionTickets({
    payload: { sessionId: 'isolation-session', prompt: 'continue', cwd: active },
    config,
    workspaceRoot
  });

  assert.deepEqual(resolution, {
    associations: [{ ticketId: 'cd-002', source: 'cwd-branch' }],
    skipped: [],
    reason: null
  });
  assert.equal(gitCalls.length, 2, `expected 2 git calls, got ${JSON.stringify(gitCalls)}`);
  assert.deepEqual(gitCalls[0], ['-C', active, 'rev-parse', '--show-toplevel']);
  assert.deepEqual(gitCalls[1], ['-C', active, 'branch', '--show-current']);
  assert.equal(gitCalls.some(args => args.includes(idle)), false);
});

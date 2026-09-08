const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  getGitBranch,
  extractTicketFromBranch
} = require('../lib/context-builder.cjs');
const {
  resolveSessionTickets
} = require('../lib/session-ticket-resolver.cjs');

function makeFixture(t) {
  const fixtureRoot = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-ticket-resolver-'))
  );
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const specsDir = path.join(workspaceRoot, '.specify', 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  return {
    fixtureRoot,
    workspaceRoot,
    specsDir,
    config: {
      subWorkspaces: [],
      git: { prefixList: 'AA,CD,MRR,tdk' },
      specs: {
        root: '.specify',
        defaultFolder: 'specs',
        ticketFormat: '^([a-z]+)-([0-9]+)$'
      }
    }
  };
}

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 3000
  }).trim();
}

function initRepo(repoPath, branch = 'main') {
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

function addTaskFolder(specsDir, ticketId) {
  fs.mkdirSync(path.join(specsDir, ticketId), { recursive: true });
}

function resolve(fixture, overrides = {}) {
  const payload = {
    sessionId: 'session-001',
    prompt: '',
    ...overrides.payload
  };
  return resolveSessionTickets({
    payload,
    config: overrides.config === undefined ? fixture.config : overrides.config,
    workspaceRoot: overrides.workspaceRoot || fixture.workspaceRoot
  });
}

function recorded(ticketIds, source = 'prompt-mention', skipped = []) {
  return {
    associations: ticketIds.map(ticketId => ({ ticketId, source })),
    skipped,
    reason: null
  };
}

function unresolved(reason) {
  return { associations: [], skipped: [], reason };
}

test('getGitBranch reads the requested repository and returns null when detached', (t) => {
  const fixture = makeFixture(t);
  const repo = path.join(fixture.workspaceRoot, 'service');
  initRepo(repo, 'feature/CD-001');

  assert.equal(getGitBranch(repo), 'feature/CD-001');
  git(repo, 'checkout', '--quiet', '--detach');
  assert.equal(getGitBranch(repo), null);
});

test('extractTicketFromBranch keeps case-sensitive default and supports opt-in insensitive matching', () => {
  const format = '^([a-z]+)-([0-9]+)$';
  assert.equal(extractTicketFromBranch('feature/CD-001', format, ''), null);
  assert.equal(
    extractTicketFromBranch('feature/CD-001', format, '', { caseInsensitive: true }),
    'CD-001'
  );
});

test('prompt lexemes only associate on full-token matches', (t) => {
  const fixture = makeFixture(t);
  for (const ticketId of ['cd-001', 'cd-002']) addTaskFolder(fixture.specsDir, ticketId);

  const cases = [
    ['spec cd-001 đang làm gì', ['cd-001']],
    ['CD-001, (cd-002)', ['cd-001', 'cd-002']],
    ['cd-001 cd-001', ['cd-001']],
    ['/pav-status CD-001 then /tdk-status cd-002', ['cd-001', 'cd-002']],
    ['https://tracker.invalid/browse/CD-001', ['cd-001']],
    ['.specify/specs/cd-001/plan.md', ['cd-001']],
    ['`cd-001`', ['cd-001']],
    ['xCD-001y cd-001_suffix cd-001-suffix', []],
    ['écd-001 cd-001é', []]
  ];

  // No CWD is supplied, so a row with zero prompt candidates falls through to
  // the branch step and stops at `invalid-cwd` instead of associating anything.
  for (const [prompt, expected] of cases) {
    assert.deepEqual(
      resolve(fixture, { payload: { sessionId: `session-${expected.join('-') || 'none'}`, prompt } }),
      expected.length > 0 ? recorded(expected) : unresolved('invalid-cwd'),
      prompt
    );
  }
});

test('a mentioned ticket without a spec folder is skipped and blocks branch fallback', (t) => {
  const fixture = makeFixture(t);
  addTaskFolder(fixture.specsDir, 'cd-001');
  initRepo(fixture.workspaceRoot, 'feature/CD-001');

  assert.deepEqual(
    resolve(fixture, { payload: { prompt: 'compare cd-001 with cd-999' } }),
    recorded(['cd-001'], 'prompt-mention', [{ ticketId: 'cd-999', reason: 'no-task-folder' }])
  );
  assert.deepEqual(
    resolve(fixture, { payload: { prompt: 'inspect cd-999 only' } }),
    { associations: [], skipped: [{ ticketId: 'cd-999', reason: 'no-task-folder' }], reason: null }
  );
});

test('configured syntax and literal prefixes are alternatives', (t) => {
  const fixture = makeFixture(t);
  addTaskFolder(fixture.specsDir, 'cd-001');

  const formatOnly = { ...fixture.config, git: { prefixList: '' } };
  assert.deepEqual(
    resolve(fixture, { config: formatOnly, payload: { prompt: 'cd-001' } }),
    recorded(['cd-001'])
  );

  const prefixesOnly = { ...fixture.config, specs: { ...fixture.config.specs, ticketFormat: '' } };
  assert.deepEqual(
    resolve(fixture, { config: prefixesOnly, payload: { prompt: 'CD-001' } }),
    recorded(['cd-001'])
  );
  assert.deepEqual(
    resolve(fixture, { config: prefixesOnly, payload: { prompt: 'aa-001 unknown-7' } }),
    { associations: [], skipped: [{ ticketId: 'aa-001', reason: 'no-task-folder' }], reason: null }
  );
});

test('unusable ticket rules are an invalid-config outcome', (t) => {
  const fixture = makeFixture(t);
  addTaskFolder(fixture.specsDir, 'cd-001');

  const noRules = { ...fixture.config, git: { prefixList: '' }, specs: { ...fixture.config.specs, ticketFormat: '' } };
  const brokenRegex = { ...fixture.config, git: { prefixList: '' }, specs: { ...fixture.config.specs, ticketFormat: '^([a-z' } };
  const emptyMatching = { ...fixture.config, git: { prefixList: '' }, specs: { ...fixture.config.specs, ticketFormat: '.*' } };
  const noSpecsRoot = { ...fixture.config, specs: { ...fixture.config.specs, root: '' } };

  for (const config of [noRules, brokenRegex, emptyMatching, noSpecsRoot]) {
    assert.deepEqual(resolve(fixture, { config, payload: { prompt: 'cd-001' } }), unresolved('invalid-config'));
  }
});

test('session id, prompt type, and workspace root are validated before any probe', (t) => {
  const fixture = makeFixture(t);
  addTaskFolder(fixture.specsDir, 'cd-001');

  for (const sessionId of [null, '', '   ', 42]) {
    assert.deepEqual(
      resolve(fixture, { payload: { sessionId, prompt: 'cd-001' } }),
      unresolved('no-session-id')
    );
  }
  assert.deepEqual(resolveSessionTickets(null), unresolved('no-session-id'));
  assert.deepEqual(
    resolve(fixture, { payload: { prompt: { text: 'cd-001' } } }),
    unresolved('invalid-prompt')
  );
  assert.deepEqual(
    resolve(fixture, { workspaceRoot: path.join(fixture.fixtureRoot, 'missing') }),
    unresolved('invalid-workspace-root')
  );
  assert.deepEqual(
    resolve(fixture, { workspaceRoot: '.specify' }),
    unresolved('invalid-workspace-root')
  );
});

test('branch fallback uses only the repository containing the activity CWD', (t) => {
  const fixture = makeFixture(t);
  addTaskFolder(fixture.specsDir, 'cd-001');
  addTaskFolder(fixture.specsDir, 'cd-002');
  initRepo(fixture.workspaceRoot, 'main');

  const service = path.join(fixture.workspaceRoot, 'service');
  initRepo(service, 'feature/CD-002');
  fixture.config.subWorkspaces = [{ name: 'service', path: 'service' }];

  assert.deepEqual(
    resolve(fixture, { payload: { cwd: service } }),
    recorded(['cd-002'], 'cwd-branch')
  );
  const nested = path.join(service, 'deep');
  fs.mkdirSync(nested, { recursive: true });
  assert.deepEqual(
    resolve(fixture, { payload: { sessionId: 'session-nested', cwd: nested } }),
    recorded(['cd-002'], 'cwd-branch')
  );

  assert.deepEqual(
    resolve(fixture, { payload: { sessionId: 'session-root', cwd: fixture.workspaceRoot } }),
    unresolved('no-ticket')
  );
});

test('branch tickets resolve descriptive suffixes but stay ambiguous for two distinct ids', (t) => {
  const fixture = makeFixture(t);
  addTaskFolder(fixture.specsDir, 'cd-001');
  initRepo(fixture.workspaceRoot, 'feature/CD-001-fix');

  assert.deepEqual(
    resolve(fixture, { payload: { cwd: fixture.workspaceRoot } }),
    recorded(['cd-001'], 'cwd-branch')
  );

  git(fixture.workspaceRoot, 'branch', '-M', 'feature/CD-001-vs-CD-002');
  assert.deepEqual(
    resolve(fixture, { payload: { sessionId: 'session-ambiguous', cwd: fixture.workspaceRoot } }),
    unresolved('ambiguous-branch-ticket')
  );
});

test('escaping or unapproved repositories never supply a branch ticket', (t) => {
  const fixture = makeFixture(t);
  addTaskFolder(fixture.specsDir, 'cd-001');
  initRepo(fixture.workspaceRoot, 'main');

  const unapproved = path.join(fixture.workspaceRoot, 'vendor');
  initRepo(unapproved, 'feature/CD-001');
  assert.deepEqual(
    resolve(fixture, { payload: { cwd: unapproved } }),
    unresolved('unapproved-repository')
  );

  const outside = path.join(fixture.fixtureRoot, 'outside');
  initRepo(outside, 'feature/CD-001');
  assert.deepEqual(
    resolve(fixture, { payload: { sessionId: 'session-outside', cwd: outside } }),
    unresolved('cwd-outside-workspace')
  );

  const link = path.join(fixture.workspaceRoot, 'linked');
  fs.symlinkSync(outside, link, 'dir');
  fixture.config.subWorkspaces = [{ name: 'linked', path: 'linked' }];
  assert.deepEqual(
    resolve(fixture, { payload: { sessionId: 'session-symlink', cwd: link } }),
    unresolved('cwd-outside-workspace')
  );

  fixture.config.subWorkspaces = [{ name: 'absolute', path: outside }];
  assert.deepEqual(
    resolve(fixture, { payload: { sessionId: 'session-absolute', cwd: outside } }),
    unresolved('cwd-outside-workspace')
  );
});

test('missing CWD, non-repository, and detached HEAD report distinct reasons', (t) => {
  const fixture = makeFixture(t);
  addTaskFolder(fixture.specsDir, 'cd-001');

  assert.deepEqual(resolve(fixture), unresolved('invalid-cwd'));
  assert.deepEqual(
    resolve(fixture, { payload: { cwd: path.join(fixture.workspaceRoot, 'missing') } }),
    unresolved('invalid-cwd')
  );
  assert.deepEqual(
    resolve(fixture, { payload: { cwd: '.specify' } }),
    unresolved('invalid-cwd')
  );

  const plain = makeFixture(t);
  addTaskFolder(plain.specsDir, 'cd-001');
  assert.deepEqual(
    resolve(plain, { payload: { cwd: plain.workspaceRoot } }),
    unresolved('git-error')
  );

  initRepo(fixture.workspaceRoot, 'feature/CD-001');
  git(fixture.workspaceRoot, 'checkout', '--quiet', '--detach');
  assert.deepEqual(
    resolve(fixture, { payload: { sessionId: 'session-detached', cwd: fixture.workspaceRoot } }),
    unresolved('detached-head')
  );
});

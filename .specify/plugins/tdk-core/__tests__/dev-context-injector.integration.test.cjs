const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const hookPath = path.resolve(__dirname, '../hooks/dev-context-injector.cjs');
const projectRoot = path.resolve(__dirname, '../../../../');
const directLogRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-context-injector-log-'));
const previousProjectDir = process.env.CLAUDE_PROJECT_DIR;
process.env.CLAUDE_PROJECT_DIR = directLogRoot;
const { main } = require('../hooks/dev-context-injector.cjs');
if (previousProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
else process.env.CLAUDE_PROJECT_DIR = previousProjectDir;

test.after(() => fs.rmSync(directLogRoot, { recursive: true, force: true }));

function runHook(cwd, payload, { harness = 'claude', logRoot = directLogRoot } = {}) {
  return spawnSync(process.execPath, [hookPath], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: logRoot,
      TDK_HARNESS: harness
    }
  });
}

function runGit(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 3000
  });
}

function initializeGitRepository(cwd, branch) {
  runGit(cwd, ['init', '--quiet']);
  runGit(cwd, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
}

function makeWorkspace(t, {
  ticketIds = ['mrr-2836'],
  rootBranch = null,
  subWorkspaces = []
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-context-injector-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const specifyDir = path.join(root, '.specify');
  fs.mkdirSync(path.join(specifyDir, 'specs'), { recursive: true });
  fs.writeFileSync(path.join(specifyDir, '.specify.json'), JSON.stringify({
    version: '1.0',
    name: 'session-ticket-fixture',
    subWorkspaces,
    git: {
      mainBranch: 'main',
      prefixList: 'mrr,cd'
    },
    specs: {
      root: '.specify',
      defaultFolder: 'specs',
      ticketFormat: '^([a-zA-Z]+)-([0-9]+)$'
    }
  }));

  for (const ticketId of ticketIds) {
    fs.mkdirSync(path.join(specifyDir, 'specs', ticketId), { recursive: true });
  }
  if (rootBranch) initializeGitRepository(root, rootBranch);

  return root;
}

function makeTranscript(t, root, withMarker = true) {
  const transcript = path.join(root, `transcript-${Date.now()}-${Math.random()}.jsonl`);
  fs.writeFileSync(
    transcript,
    withMarker ? '...\n<!-- speckit-dev-context-injected -->\n...' : '...\n## Workspace\n...',
    'utf-8'
  );
  return transcript;
}

function sessionsPath(root, ticketId) {
  return path.join(root, '.specify', 'specs', ticketId, 'sessions.txt');
}

function captureMain(stdin, trackingDependencies, { projectRoot: trustedRoot, cwd } = {}) {
  const output = [];
  const originalLog = console.log;
  const previousRoot = process.env.CLAUDE_PROJECT_DIR;
  const previousCwd = process.cwd();
  console.log = (...args) => output.push(args.join(' '));
  if (trustedRoot === null) delete process.env.CLAUDE_PROJECT_DIR;
  else if (trustedRoot !== undefined) process.env.CLAUDE_PROJECT_DIR = trustedRoot;
  if (cwd) process.chdir(cwd);
  try {
    return {
      status: main(JSON.stringify(stdin), trackingDependencies),
      output
    };
  } finally {
    console.log = originalLog;
    if (cwd) process.chdir(previousCwd);
    if (previousRoot === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = previousRoot;
  }
}

function trackerEntries(root) {
  const logPath = path.join(root, '.claude', 'hooks', '.logs', 'hook-log.jsonl');
  return fs.readFileSync(logPath, 'utf-8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.hook === 'session-tracker');
}

test('hook can be required without MODULE_NOT_FOUND', () => {
  assert.equal(typeof main, 'function');
});

test('standalone execution injects expected sections in commondragon root', () => {
  const result = runHook(projectRoot, { prompt: 'test', transcript_path: '' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /## Session/);
  assert.match(result.stdout, /## Workspace/);
  assert.match(result.stdout, /commondragon/);
  assert.match(result.stdout, /## Paths/);
  assert.match(result.stdout, /\.specify\/specs\//);
});

test('workspace detection shows backend when running under backend path', () => {
  const backendPath = path.resolve(projectRoot, 'backend');
  const result = runHook(backendPath, { prompt: 'test', transcript_path: '' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Active workspace: backend/);
});

test('workspace detection shows frontend when running under frontend path', () => {
  const frontendPath = path.resolve(projectRoot, 'frontend');
  const result = runHook(frontendPath, { prompt: 'test', transcript_path: '' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Active workspace: frontend/);
});

test('dedup skips second injection when transcript has explicit marker', (t) => {
  const root = makeWorkspace(t);
  const transcript = makeTranscript(t, root);

  const result = runHook(projectRoot, {
    prompt: 'test',
    transcript_path: transcript,
    cwd: root
  }, { logRoot: root });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});

test('dedup does not skip when transcript only has generic heading', (t) => {
  const root = makeWorkspace(t);
  const transcript = makeTranscript(t, root, false);

  const result = runHook(projectRoot, {
    prompt: 'test',
    transcript_path: transcript,
    cwd: root
  }, { logRoot: root });
  assert.equal(result.status, 0);
  assert.notEqual(result.stdout.trim(), '');
});

test('every mentioned spec receives the session before dedup and without stdout', (t) => {
  const root = makeWorkspace(t, { ticketIds: ['mrr-2836', 'cd-001'] });
  const transcript = makeTranscript(t, root);

  const result = runHook(projectRoot, {
    session_id: 'multi-ticket-session',
    transcript_path: transcript,
    cwd: root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'compare MRR-2836 with cd-001 please'
  }, { logRoot: root });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
  assert.equal(fs.readFileSync(sessionsPath(root, 'mrr-2836'), 'utf-8'), 'multi-ticket-session\n');
  assert.equal(fs.readFileSync(sessionsPath(root, 'cd-001'), 'utf-8'), 'multi-ticket-session\n');
});

test('repeated mentions and repeated events never duplicate a session line', (t) => {
  const root = makeWorkspace(t, { ticketIds: ['mrr-2836'] });
  const transcript = makeTranscript(t, root);
  const payload = {
    session_id: 'idempotent-session',
    transcript_path: transcript,
    cwd: root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'mrr-2836 and MRR-2836 again'
  };

  assert.equal(runHook(projectRoot, payload, { logRoot: root }).status, 0);
  assert.equal(runHook(projectRoot, payload, { logRoot: root }).status, 0);
  assert.equal(fs.readFileSync(sessionsPath(root, 'mrr-2836'), 'utf-8'), 'idempotent-session\n');
});

test('a later prompt adds another association instead of blocking a rebind', (t) => {
  const root = makeWorkspace(t, { ticketIds: ['mrr-2836', 'mrr-9999'] });
  const transcript = makeTranscript(t, root);
  fs.writeFileSync(sessionsPath(root, 'mrr-2836'), 'bound-session\n', 'utf-8');

  const result = runHook(projectRoot, {
    session_id: 'bound-session',
    transcript_path: transcript,
    cwd: root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'now look at mrr-9999'
  }, { logRoot: root });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
  assert.equal(fs.readFileSync(sessionsPath(root, 'mrr-2836'), 'utf-8'), 'bound-session\n');
  assert.equal(fs.readFileSync(sessionsPath(root, 'mrr-9999'), 'utf-8'), 'bound-session\n');
  assert.ok(trackerEntries(root).some((entry) =>
    entry.status === 'ok' && entry.ticketId === 'mrr-9999' && entry.source === 'prompt-mention'
  ));
});

test('a mention without a spec folder is logged while valid mentions still record', (t) => {
  const root = makeWorkspace(t, { ticketIds: ['mrr-2836'] });
  const transcript = makeTranscript(t, root);

  const result = runHook(projectRoot, {
    session_id: 'partial-session',
    transcript_path: transcript,
    cwd: root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'mrr-2836 and mrr-9999'
  }, { logRoot: root });

  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(sessionsPath(root, 'mrr-2836'), 'utf-8'), 'partial-session\n');
  assert.equal(fs.existsSync(sessionsPath(root, 'mrr-9999')), false);
  assert.ok(trackerEntries(root).some((entry) =>
    entry.status === 'skip' && entry.note === 'no-task-folder' && entry.ticketId === 'mrr-9999'
  ));
});

test('a failing write target never blocks the other ticket or the injected context', (t) => {
  const root = makeWorkspace(t, { ticketIds: ['cd-001', 'mrr-2836'] });
  // Occupying the first target's session path with a directory makes the real
  // writer throw EISDIR instead of appending.
  fs.mkdirSync(sessionsPath(root, 'cd-001'), { recursive: true });

  const result = runHook(projectRoot, {
    session_id: 'partial-failure-session',
    transcript_path: '',
    cwd: root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'cd-001 and mrr-2836'
  }, { logRoot: root });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /## Session/);
  assert.equal(fs.readFileSync(sessionsPath(root, 'mrr-2836'), 'utf-8'), 'partial-failure-session\n');
  assert.ok(trackerEntries(root).some((entry) =>
    entry.status === 'skip' && entry.note === 'record-error' && entry.ticketId === 'cd-001'
  ));
});

test('Claude payload and serialized OMP envelope record equivalent canonical associations', (t) => {
  const root = makeWorkspace(t, { ticketIds: ['cd-001'] });
  const transcript = makeTranscript(t, root);
  const claudeSessionId = 'claude-harness-session';
  const ompSessionId = 'omp-harness-session';

  const claudeResult = runHook(projectRoot, {
    session_id: claudeSessionId,
    transcript_path: transcript,
    cwd: root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'status of CD-001'
  }, { harness: 'claude', logRoot: root });
  const afterClaude = fs.readFileSync(sessionsPath(root, 'cd-001'), 'utf-8');

  const ompResult = runHook(projectRoot, {
    eventName: 'before_agent_start',
    event: {
      type: 'before_agent_start',
      prompt: 'status of cd-001'
    },
    context: {
      cwd: root,
      sessionId: ompSessionId,
      sessionFile: transcript
    }
  }, { harness: 'omp', logRoot: root });

  assert.equal(claudeResult.status, 0);
  assert.equal(ompResult.status, 0);
  assert.equal(claudeResult.stdout.trim(), '');
  assert.equal(ompResult.stdout.trim(), '');
  assert.equal(afterClaude, `${claudeSessionId}\n`);
  assert.equal(
    fs.readFileSync(sessionsPath(root, 'cd-001'), 'utf-8'),
    `${claudeSessionId}\n${ompSessionId}\n`
  );
});

test('without a prompt ticket the branch of the CWD repository is used', (t) => {
  const root = makeWorkspace(t, {
    ticketIds: ['cd-001'],
    rootBranch: 'feature/CD-001',
    subWorkspaces: []
  });

  const result = runHook(projectRoot, {
    session_id: 'root-branch-session',
    transcript_path: '',
    cwd: root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'continue'
  }, { logRoot: root });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /## Session/);
  assert.equal(fs.readFileSync(sessionsPath(root, 'cd-001'), 'utf-8'), 'root-branch-session\n');
});

test('a root session on main never inherits a child repository feature branch', (t) => {
  const root = makeWorkspace(t, {
    ticketIds: ['mrr-2836'],
    rootBranch: 'main',
    subWorkspaces: [{ name: 'service', path: 'service' }]
  });
  const service = path.join(root, 'service');
  fs.mkdirSync(service, { recursive: true });
  initializeGitRepository(service, 'feature/MRR-2836');

  const rootResult = runHook(projectRoot, {
    session_id: 'root-main-session',
    transcript_path: '',
    cwd: root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'continue'
  }, { logRoot: root });

  assert.equal(rootResult.status, 0);
  assert.equal(fs.existsSync(sessionsPath(root, 'mrr-2836')), false);

  const serviceResult = runHook(projectRoot, {
    session_id: 'service-session',
    transcript_path: '',
    cwd: service,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'continue'
  }, { logRoot: root });

  assert.equal(serviceResult.status, 0);
  assert.equal(fs.readFileSync(sessionsPath(root, 'mrr-2836'), 'utf-8'), 'service-session\n');
});

test('a nested activity CWD with its own config cannot override the trusted root', (t) => {
  const root = makeWorkspace(t, { ticketIds: ['mrr-2836'] });
  const nested = path.join(root, 'nested');
  fs.mkdirSync(path.join(nested, '.specify', 'specs', 'cd-001'), { recursive: true });
  fs.writeFileSync(
    path.join(nested, '.specify', '.specify.json'),
    JSON.stringify({
      version: '1.0',
      name: 'nested-fixture',
      subWorkspaces: [],
      git: { mainBranch: 'main', prefixList: 'cd' },
      specs: { root: '.specify', defaultFolder: 'specs', ticketFormat: '^([a-zA-Z]+)-([0-9]+)$' }
    })
  );

  const result = runHook(projectRoot, {
    session_id: 'nested-session',
    transcript_path: '',
    cwd: nested,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'compare cd-001 with mrr-2836'
  }, { logRoot: root });

  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(sessionsPath(root, 'mrr-2836'), 'utf-8'), 'nested-session\n');
  assert.equal(fs.existsSync(sessionsPath(nested, 'cd-001')), false);
  assert.ok(trackerEntries(root).some((entry) =>
    entry.status === 'skip' && entry.note === 'no-task-folder' && entry.ticketId === 'cd-001'
  ));
});

test('an untrustworthy project root skips tracking but keeps context injection', (t) => {
  const root = makeWorkspace(t, { ticketIds: ['mrr-2836'] });
  const bareRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-context-injector-bare-'));
  t.after(() => fs.rmSync(bareRoot, { recursive: true, force: true }));

  const result = runHook(projectRoot, {
    session_id: 'no-root-session',
    transcript_path: '',
    cwd: root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'status of mrr-2836'
  }, { logRoot: bareRoot });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /## Session/);
  assert.equal(fs.existsSync(sessionsPath(root, 'mrr-2836')), false);
});

test('an absent project-root variable falls back to the process project root', (t) => {
  const root = makeWorkspace(t, { ticketIds: ['mrr-2836'] });

  const result = captureMain({
    session_id: 'process-root-session',
    transcript_path: '',
    cwd: root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'status of mrr-2836'
  }, undefined, { projectRoot: null, cwd: root });

  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(sessionsPath(root, 'mrr-2836'), 'utf-8'), 'process-root-session\n');
});

test('resolver failure is fail-open and context injection still runs once', (t) => {
  const root = makeWorkspace(t);
  const result = captureMain({
    session_id: 'resolver-failure-session',
    transcript_path: '',
    cwd: root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'status of mrr-2836'
  }, {
    resolveSessionTickets() {
      throw new Error('injected resolver failure');
    }
  }, { projectRoot: root });

  assert.equal(result.status, 0);
  assert.equal(result.output.length, 1);
  assert.match(result.output[0], /## Session/);
  assert.equal(fs.existsSync(sessionsPath(root, 'mrr-2836')), false);
});

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const gatewayPath = path.resolve(__dirname, '../hooks/hook-gateway.cjs');
const HOOK_NAME = 'destructive-command-block';

let tmpDir;

function setupWorkspace(specifyJson = {}) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'destructive-block-test-'));
  const specifyDir = path.join(tmpDir, '.specify');
  fs.mkdirSync(specifyDir, { recursive: true });

  const config = { version: '1.0', name: 'test', ...specifyJson };
  fs.writeFileSync(path.join(specifyDir, '.specify.json'), JSON.stringify(config));
}

function runBash(command) {
  return spawnSync(process.execPath, [gatewayPath, HOOK_NAME], {
    cwd: tmpDir,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir }
  });
}

function runRaw(payload) {
  return spawnSync(process.execPath, [gatewayPath, HOOK_NAME], {
    cwd: tmpDir,
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir }
  });
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('destructive-command-block via gateway', () => {
  // The gateway consumes stdin before requiring the hook module. A hook that reads
  // fd 0 itself would silently no-op here, so these cases pin the delegation contract.
  it('blocks an unrecoverable delete and explains why on stderr', () => {
    setupWorkspace();
    const result = runBash('rm -rf /');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /BLOCKED: Unrecoverable delete/);
  });

  it('blocks a destructive git command', () => {
    setupWorkspace();
    const result = runBash('git reset --hard HEAD~3');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /BLOCKED: Destructive command detected/);
  });

  it('blocks a dangerous delete hidden behind a shell separator', () => {
    setupWorkspace();
    const result = runBash('cd /tmp/work && rm -rf ~');
    assert.equal(result.status, 2);
  });

  it('allows ordinary cleanup', () => {
    setupWorkspace();
    const result = runBash('rm -rf node_modules dist .cache');
    assert.equal(result.status, 0);
    assert.equal(result.stderr.trim(), '');
  });

  it('allows non-delete commands', () => {
    setupWorkspace();
    assert.equal(runBash('git status').status, 0);
    assert.equal(runBash('npm run build').status, 0);
  });

  it('ignores non-Bash tool payloads', () => {
    setupWorkspace();
    const result = runRaw({ tool_name: 'Write', tool_input: { file_path: '/etc/passwd' } });
    assert.equal(result.status, 0);
  });

  it('fails open on malformed stdin', () => {
    setupWorkspace();
    assert.equal(runRaw('not json').status, 0);
    assert.equal(runRaw('').status, 0);
  });

  it('honors the gateway disable list', () => {
    setupWorkspace({ hooks: { disabled: [HOOK_NAME] } });
    const result = runBash('rm -rf /');
    assert.equal(result.status, 0);
  });
});

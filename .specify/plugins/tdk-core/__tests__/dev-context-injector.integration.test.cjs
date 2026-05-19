const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const hookPath = path.resolve(__dirname, '../hooks/dev-context-injector.cjs');

function runHook(cwd, payload) {
  return spawnSync(process.execPath, [hookPath], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf-8'
  });
}

test('hook can be required without MODULE_NOT_FOUND', () => {
  assert.doesNotThrow(() => require('../hooks/dev-context-injector.cjs'));
});

test('standalone execution injects expected sections in commondragon root', () => {
  const root = path.resolve(__dirname, '../../../../');
  const result = runHook(root, { prompt: 'test', transcript_path: '' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /## Session/);
  assert.match(result.stdout, /## Workspace/);
  assert.match(result.stdout, /commondragon/);
  assert.match(result.stdout, /## Paths/);
  assert.match(result.stdout, /\.specify\/specs\//);
});

test('workspace detection shows backend when running under backend path', () => {
  const backendPath = path.resolve(__dirname, '../../../../backend');
  const result = runHook(backendPath, { prompt: 'test', transcript_path: '' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Active workspace: backend/);
});

test('workspace detection shows frontend when running under frontend path', () => {
  const frontendPath = path.resolve(__dirname, '../../../../frontend');
  const result = runHook(frontendPath, { prompt: 'test', transcript_path: '' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Active workspace: frontend/);
});

test('dedup skips second injection when transcript has explicit marker', () => {
  const root = path.resolve(__dirname, '../../../../');
  const transcript = path.join(os.tmpdir(), `speckit-transcript-${Date.now()}.txt`);
  fs.writeFileSync(transcript, '...\n<!-- speckit-dev-context-injected -->\n...', 'utf-8');

  const result = runHook(root, { prompt: 'test', transcript_path: transcript });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});


test('dedup does not skip when transcript only has generic heading', () => {
  const root = path.resolve(__dirname, '../../../../');
  const transcript = path.join(os.tmpdir(), `speckit-transcript-${Date.now()}-heading.txt`);
  fs.writeFileSync(transcript, '...\n## Workspace\n...', 'utf-8');

  const result = runHook(root, { prompt: 'test', transcript_path: transcript });
  assert.equal(result.status, 0);
  assert.notEqual(result.stdout.trim(), '');
});

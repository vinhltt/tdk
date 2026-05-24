'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const gatewayPath = path.resolve(__dirname, '../hooks/hook-gateway.cjs');

let tmpDir;

function setupWorkspace(specifyJson = {}) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-gateway-test-'));
  const specifyDir = path.join(tmpDir, '.specify');
  fs.mkdirSync(specifyDir, { recursive: true });

  const config = { version: '1.0', name: 'test', ...specifyJson };
  fs.writeFileSync(path.join(specifyDir, '.specify.json'), JSON.stringify(config));
}

function runGateway(hookName, stdinPayload = '{}', env = {}) {
  const args = hookName ? [gatewayPath, hookName] : [gatewayPath];
  return spawnSync(process.execPath, args, {
    cwd: tmpDir,
    input: typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload),
    encoding: 'utf-8',
    env: { ...process.env, ...env }
  });
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('hook-gateway', () => {
  it('exits 0 with no argv[2]', () => {
    setupWorkspace();
    const result = runGateway(null);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('exits 0 when hook is in disabled list', () => {
    setupWorkspace({ hooks: { disabled: ['path-rule-injector'] } });
    const result = runGateway('path-rule-injector');
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('exits 0 when nonexistent hook name', () => {
    setupWorkspace();
    const result = runGateway('nonexistent-hook');
    assert.equal(result.status, 0);
  });

  it('delegates to hook when not in disabled list', () => {
    setupWorkspace({
      hooks: { disabled: ['some-other-hook'] },
      rules: { path: '.specify/rules' }
    });
    const rulesDir = path.join(tmpDir, '.specify', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, 'test-rule.md'), '---\npaths:\n  - "**"\n---\nTest rule body');

    const payload = JSON.stringify({
      tool_name: 'Read',
      tool_input: { file_path: path.join(tmpDir, 'src/app.ts') }
    });
    const result = runGateway('path-rule-injector', payload);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Test rule body'), 'should delegate and produce hook output');
  });

  it('delegates when hooks field is missing from config', () => {
    setupWorkspace({});
    const rulesDir = path.join(tmpDir, '.specify', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, 'always.md'), '---\npaths:\n  - "**"\n---\nAlways rule');

    const payload = JSON.stringify({
      tool_name: 'Read',
      tool_input: { file_path: path.join(tmpDir, 'src/app.ts') }
    });
    const result = runGateway('path-rule-injector', payload);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Always rule'), 'should delegate when hooks field missing');
  });

  it('delegates when hooks.disabled is non-array (fail-open)', () => {
    setupWorkspace({ hooks: { disabled: true } });
    const rulesDir = path.join(tmpDir, '.specify', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, 'always.md'), '---\npaths:\n  - "**"\n---\nFail-open rule');

    const payload = JSON.stringify({
      tool_name: 'Read',
      tool_input: { file_path: path.join(tmpDir, 'src/app.ts') }
    });
    const result = runGateway('path-rule-injector', payload);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Fail-open rule'), 'should treat non-array as empty (fail-open)');
  });

  it('disables one hook but not the other', () => {
    setupWorkspace({ hooks: { disabled: ['dev-context-injector'] } });
    const rulesDir = path.join(tmpDir, '.specify', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, 'always.md'), '---\npaths:\n  - "**"\n---\nSelective rule');

    const payload = JSON.stringify({
      tool_name: 'Read',
      tool_input: { file_path: path.join(tmpDir, 'src/app.ts') }
    });

    const disabledResult = runGateway('dev-context-injector', payload);
    assert.equal(disabledResult.status, 0);
    assert.ok(!disabledResult.stdout.includes('Selective rule'), 'disabled hook should not produce output');

    const enabledResult = runGateway('path-rule-injector', payload);
    assert.equal(enabledResult.status, 0);
    assert.ok(enabledResult.stdout.includes('Selective rule'), 'enabled hook should delegate');
  });
});

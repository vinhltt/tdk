'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const hookPath = path.resolve(__dirname, '../hooks/path-rule-injector.cjs');

let tmpDir;
let rulesDir;

function setupWorkspace(rules = [], specifyJson = {}) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-injector-test-'));
  const specifyDir = path.join(tmpDir, '.specify');
  rulesDir = path.join(specifyDir, 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });

  const config = { version: '1.0', name: 'test', rules: { path: '.specify/rules' }, ...specifyJson };
  fs.writeFileSync(path.join(specifyDir, '.specify.json'), JSON.stringify(config));

  for (const rule of rules) {
    const content = `---\n${rule.frontmatter}\n---\n${rule.body}`;
    fs.writeFileSync(path.join(rulesDir, rule.file), content);
  }
}

function runHook(payload, env = {}) {
  return spawnSync(process.execPath, [hookPath], {
    cwd: tmpDir,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env, ...env }
  });
}

function makePayload(toolName, filePath) {
  return { tool_name: toolName, tool_input: { file_path: path.join(tmpDir, filePath) } };
}

function parseOutput(stdout) {
  if (!stdout.trim()) return null;
  return JSON.parse(stdout.trim());
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  // Clean up session dedup temp files
  const files = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('specify-rules-'));
  for (const f of files) {
    try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch { /* ignore */ }
    try { fs.unlinkSync(path.join(os.tmpdir(), f + '.lock')); } catch { /* ignore */ }
  }
});

describe('path-matched rule injection', () => {
  it('injects matching rule via structured JSON', () => {
    setupWorkspace([{
      file: 'ts-rules.md',
      frontmatter: 'paths:\n  - "src/**/*.ts"\ndescription: "TS rules"',
      body: '- Use strict TypeScript'
    }]);

    const result = runHook(makePayload('Read', 'src/parser.ts'));
    assert.equal(result.status, 0);

    const output = parseOutput(result.stdout);
    assert.ok(output);
    assert.ok(output.hookSpecificOutput);
    assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
    assert.ok(output.hookSpecificOutput.additionalContext.includes('<!-- rule: ts-rules.md -->'));
    assert.ok(output.hookSpecificOutput.additionalContext.includes('Use strict TypeScript'));
  });
});

describe('non-matching path', () => {
  it('produces no output for non-matching file', () => {
    setupWorkspace([{
      file: 'ts-rules.md',
      frontmatter: 'paths:\n  - "src/**/*.ts"',
      body: 'body'
    }]);

    const result = runHook(makePayload('Read', 'README.md'));
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });
});

describe('always-apply rule', () => {
  it('injects always-apply rule on first call', () => {
    setupWorkspace([{
      file: 'global.md',
      frontmatter: 'paths:\n  - "**"\ndescription: "Global"',
      body: '- Follow conventions'
    }]);

    const sid = `test-session-${Date.now()}`;
    const result = runHook(makePayload('Read', 'any-file.txt'), { CLAUDE_SESSION_ID: sid });
    assert.equal(result.status, 0);

    const output = parseOutput(result.stdout);
    assert.ok(output);
    assert.ok(output.hookSpecificOutput.additionalContext.includes('Follow conventions'));
  });

  it('deduplicates always-apply rule on second call', () => {
    setupWorkspace([{
      file: 'global.md',
      frontmatter: 'paths:\n  - "**"\ndescription: "Global"',
      body: '- Follow conventions'
    }]);

    const sid = `test-dedup-${Date.now()}`;
    runHook(makePayload('Read', 'file1.txt'), { CLAUDE_SESSION_ID: sid });
    const result2 = runHook(makePayload('Read', 'file2.txt'), { CLAUDE_SESSION_ID: sid });
    assert.equal(result2.status, 0);
    assert.equal(result2.stdout.trim(), '');
  });
});

describe('negation patterns', () => {
  it('excludes files matching negation', () => {
    setupWorkspace([{
      file: 'ts-rules.md',
      frontmatter: 'paths:\n  - "src/**/*.ts"\n  - "!src/**/*.test.ts"',
      body: 'body'
    }]);

    const match = runHook(makePayload('Read', 'src/parser.ts'));
    assert.ok(parseOutput(match.stdout));

    const excluded = runHook(makePayload('Read', 'src/parser.test.ts'));
    assert.equal(excluded.stdout.trim(), '');
  });
});

describe('Write and Edit tools', () => {
  it('injects rule on Write tool call', () => {
    setupWorkspace([{
      file: 'ts-rules.md',
      frontmatter: 'paths:\n  - "src/**/*.ts"',
      body: '- strict ts'
    }]);

    const result = runHook(makePayload('Write', 'src/new-file.ts'));
    assert.ok(parseOutput(result.stdout));
  });

  it('injects rule on Edit tool call', () => {
    setupWorkspace([{
      file: 'ts-rules.md',
      frontmatter: 'paths:\n  - "src/**/*.ts"',
      body: '- strict ts'
    }]);

    const result = runHook(makePayload('Edit', 'src/parser.ts'));
    assert.ok(parseOutput(result.stdout));
  });
});

describe('inject reference mode', () => {
  it('injects path and description only for reference mode', () => {
    setupWorkspace([{
      file: 'api-guide.md',
      frontmatter: 'paths:\n  - "src/api/**"\ninject: reference\ndescription: "API patterns"',
      body: 'Long detailed content that should not appear'
    }]);

    const result = runHook(makePayload('Read', 'src/api/users.ts'));
    const output = parseOutput(result.stdout);
    assert.ok(output);

    const ctx = output.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('<!-- rule-ref: api-guide.md -->'));
    assert.ok(ctx.includes('API patterns'));
    assert.ok(!ctx.includes('Long detailed content'));
  });

  it('injects full body for default inject mode', () => {
    setupWorkspace([{
      file: 'full-rule.md',
      frontmatter: 'paths:\n  - "src/**"',
      body: 'Full rule content here'
    }]);

    const result = runHook(makePayload('Read', 'src/index.ts'));
    const output = parseOutput(result.stdout);
    assert.ok(output.hookSpecificOutput.additionalContext.includes('Full rule content here'));
  });
});

describe('error handling', () => {
  it('exits 0 on empty stdin', () => {
    setupWorkspace([]);
    const result = spawnSync(process.execPath, [hookPath], {
      cwd: tmpDir, input: '', encoding: 'utf-8'
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('exits 0 on invalid JSON', () => {
    setupWorkspace([]);
    const result = spawnSync(process.execPath, [hookPath], {
      cwd: tmpDir, input: 'not json', encoding: 'utf-8'
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('exits 0 on missing tool_input', () => {
    setupWorkspace([]);
    const result = spawnSync(process.execPath, [hookPath], {
      cwd: tmpDir, input: JSON.stringify({ tool_name: 'Read' }), encoding: 'utf-8'
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('exits 0 when rules directory does not exist', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-injector-norules-'));
    const specifyDir = path.join(tmpDir, '.specify');
    fs.mkdirSync(specifyDir, { recursive: true });
    fs.writeFileSync(path.join(specifyDir, '.specify.json'), JSON.stringify({
      version: '1.0', name: 'test', rules: { path: '.specify/rules' }
    }));

    const result = runHook(makePayload('Read', 'src/file.ts'));
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });
});

describe('workspace root relativization', () => {
  it('matches absolute path relativized to workspace root', () => {
    setupWorkspace([{
      file: 'ts-rules.md',
      frontmatter: 'paths:\n  - "src/**/*.ts"',
      body: '- strict ts'
    }]);

    const absPath = path.join(tmpDir, 'src', 'parser.ts');
    const result = runHook({ tool_name: 'Read', tool_input: { file_path: absPath } });
    assert.ok(parseOutput(result.stdout));
  });
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadPayloadHarness,
  loadPayloadClaudeCodeHarness,
  loadPayloadOmpHarness,
} = require('../lib/harness-payload.cjs');

test('Claude Code payload maps snake_case fields to the canonical shape', () => {
  const raw = JSON.stringify({
    session_id: 'claude-session-1',
    transcript_path: '/tmp/claude-session.jsonl',
    cwd: '/workspace/project',
    hook_event_name: 'PreToolUse',
    prompt: 'Run the command',
    tool_name: 'Bash',
    tool_input: { command: 'git status' },
  });

  const payload = loadPayloadClaudeCodeHarness(raw);

  assert.deepEqual(payload, {
    harness: 'claude',
    sessionId: 'claude-session-1',
    transcriptPath: '/tmp/claude-session.jsonl',
    cwd: '/workspace/project',
    eventName: 'PreToolUse',
    prompt: 'Run the command',
    toolName: 'bash',
    toolInput: { command: 'git status' },
    raw: JSON.parse(raw),
  });
});

test('Claude Code loader preserves camelCase fixture compatibility', () => {
  const payload = loadPayloadHarness({
    sessionId: 'legacy-session',
    transcriptPath: '/tmp/legacy.jsonl',
    eventName: 'UserPromptSubmit',
    toolName: 'Read',
    toolInput: { file_path: '/workspace/README.md' },
  }, 'claude');

  assert.equal(payload.sessionId, 'legacy-session');
  assert.equal(payload.transcriptPath, '/tmp/legacy.jsonl');
  assert.equal(payload.eventName, 'UserPromptSubmit');
  assert.equal(payload.toolName, 'read');
  assert.deepEqual(payload.toolInput, { file_path: '/workspace/README.md' });
});

test('OMP loader maps native event and hook context fields', () => {
  const event = {
    type: 'tool_call',
    toolName: 'bash',
    input: { command: 'git status' },
    sessionId: 'event-specific-session',
    session_id: 'claude-session-alias',
    sessionFile: '/tmp/event-specific.jsonl',
  };
  const context = {
    cwd: '/workspace/project',
    sessionId: 'serialized-context-session',
    sessionFile: '/tmp/serialized-context.jsonl',
    sessionManager: {
      getSessionId: () => 'omp-session-1',
      getSessionFile: () => '/tmp/omp-session.jsonl',
    },
  };

  assert.deepEqual(loadPayloadOmpHarness(event, context), {
    harness: 'omp',
    sessionId: 'omp-session-1',
    transcriptPath: '/tmp/omp-session.jsonl',
    cwd: '/workspace/project',
    eventName: 'tool_call',
    prompt: null,
    toolName: 'bash',
    toolInput: { command: 'git status' },
    raw: { event, context },
  });
});

test('OMP loader accepts a serializable bridge envelope', () => {
  const envelope = {
    session_id: 'claude-top-level-session',
    transcript_path: '/tmp/claude-top-level.jsonl',
    cwd: '/workspace/claude-top-level',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Continue the task',
    eventName: 'before_agent_start',
    event: { type: 'before_agent_start', prompt: 'Continue the task' },
    context: {
      cwd: '/workspace/project',
      sessionId: 'omp-session-2',
      sessionFile: '/tmp/omp-session-2.jsonl',
    },
  };

  assert.deepEqual(loadPayloadHarness(envelope, 'omp'), {
    harness: 'omp',
    sessionId: 'omp-session-2',
    transcriptPath: '/tmp/omp-session-2.jsonl',
    cwd: '/workspace/project',
    eventName: 'before_agent_start',
    prompt: 'Continue the task',
    toolName: null,
    toolInput: null,
    raw: envelope,
  });
});

test('OMP bridge requires its materialized event name', () => {
  const envelope = {
    event: { type: 'tool_call', toolName: 'Read', input: { file_path: '/tmp/file' } },
    context: { cwd: '/workspace/project', sessionId: 'omp-session-bridge' },
  };

  assert.equal(loadPayloadOmpHarness(envelope).eventName, null);
  assert.equal(loadPayloadOmpHarness({ ...envelope, eventName: 42 }).eventName, null);
  assert.equal(loadPayloadOmpHarness({ ...envelope, eventName: '' }).eventName, null);
});

test('generic loader dispatches by env, lets an explicit harness win, and forwards native context', () => {
  const previousHarness = process.env.TDK_HARNESS;
  try {
    process.env.TDK_HARNESS = 'omp';
    const envPayload = loadPayloadHarness({
      event: { type: 'tool_call', toolName: 'Read', input: { file_path: '/tmp/file' } },
      context: { sessionId: 'omp-session-3' },
    });
    assert.equal(envPayload.harness, 'omp');
    assert.equal(envPayload.toolName, 'read');

    const explicitClaude = loadPayloadHarness({ tool_name: 'Bash' }, 'claude');
    assert.equal(explicitClaude.harness, 'claude');
    assert.equal(explicitClaude.toolName, 'bash');

    process.env.TDK_HARNESS = 'claude';
    const explicitOmp = loadPayloadHarness({
      event: { type: 'tool_call', toolName: 'Read', input: { file_path: '/tmp/explicit' } },
      context: { sessionId: 'omp-explicit' },
    }, 'omp');
    assert.equal(explicitOmp.harness, 'omp');
    assert.equal(explicitOmp.sessionId, 'omp-explicit');

    delete process.env.TDK_HARNESS;
    const defaultClaude = loadPayloadHarness({
      cwd: '/workspace/default',
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/default' },
    });
    assert.equal(defaultClaude.harness, 'claude');
    assert.equal(defaultClaude.toolName, 'write');

    const nativeOmp = loadPayloadHarness(
      { type: 'tool_call', toolName: 'Bash', input: { command: 'pwd' } },
      'omp',
      { cwd: '/workspace/native', sessionManager: { getSessionId: () => 'omp-native' } },
    );
    assert.equal(nativeOmp.sessionId, 'omp-native');
    assert.equal(nativeOmp.cwd, '/workspace/native');

    assert.throws(
      () => loadPayloadHarness({}, 'unknown'),
      /Unsupported harness "unknown"/,
    );
  } finally {
    if (previousHarness === undefined) delete process.env.TDK_HARNESS;
    else process.env.TDK_HARNESS = previousHarness;
  }
});

test('OMP loader degrades safely when session-manager accessors throw', () => {
  const payload = loadPayloadOmpHarness(
    { type: 'session_start' },
    {
      cwd: '/workspace/project',
      sessionManager: {
        getSessionId: () => { throw new Error('session unavailable'); },
        getSessionFile: () => { throw new Error('session unavailable'); },
      },
    },
  );

  assert.equal(payload.sessionId, null);
  assert.equal(payload.transcriptPath, null);
  assert.equal(payload.cwd, '/workspace/project');
});

test('loaders reject malformed payloads', () => {
  assert.throws(() => loadPayloadClaudeCodeHarness('not json'), SyntaxError);
  assert.throws(() => loadPayloadOmpHarness([]), /Harness payload must be a JSON object/);
});

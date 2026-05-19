const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { recordSession } = require('../lib/session-tracker.cjs');

function makeFixture({ withTaskFolder = true, ticketId = 'CD-001' } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'session-tracker-'));
  const specsRoot = path.join('.specify', 'specs');
  if (withTaskFolder) {
    fs.mkdirSync(path.join(cwd, specsRoot, ticketId), { recursive: true });
  }
  return { cwd, specsRoot, ticketId };
}

test('skip when ticketId is null', () => {
  const { cwd, specsRoot } = makeFixture();
  const result = recordSession({ specsRoot, ticketId: null, sessionId: 'abc', cwd });
  assert.deepEqual(result, { skipped: 'missing-id' });
});

test('skip when sessionId is empty', () => {
  const { cwd, specsRoot, ticketId } = makeFixture();
  const result = recordSession({ specsRoot, ticketId, sessionId: '', cwd });
  assert.deepEqual(result, { skipped: 'missing-id' });
});

test('skip when task folder missing', () => {
  const { cwd, specsRoot, ticketId } = makeFixture({ withTaskFolder: false });
  const result = recordSession({ specsRoot, ticketId, sessionId: 'abc', cwd });
  assert.deepEqual(result, { skipped: 'no-task-folder' });
});

test('first append creates file with single line', () => {
  const { cwd, specsRoot, ticketId } = makeFixture();
  const result = recordSession({ specsRoot, ticketId, sessionId: 'session-001', cwd });
  assert.deepEqual(result, { recorded: true, isNew: true });

  const file = path.join(cwd, specsRoot, ticketId, 'sessions.txt');
  const content = fs.readFileSync(file, 'utf-8');
  assert.equal(content, 'session-001\n');
});

test('append new id when file already has entries', () => {
  const { cwd, specsRoot, ticketId } = makeFixture();
  const file = path.join(cwd, specsRoot, ticketId, 'sessions.txt');
  fs.writeFileSync(file, 'session-existing\n');

  const result = recordSession({ specsRoot, ticketId, sessionId: 'session-new', cwd });
  assert.deepEqual(result, { recorded: true, isNew: true });

  const content = fs.readFileSync(file, 'utf-8');
  assert.equal(content, 'session-existing\nsession-new\n');
});

test('idempotent skip when session id already recorded', () => {
  const { cwd, specsRoot, ticketId } = makeFixture();
  const file = path.join(cwd, specsRoot, ticketId, 'sessions.txt');
  fs.writeFileSync(file, 'session-001\n');

  const result = recordSession({ specsRoot, ticketId, sessionId: 'session-001', cwd });
  assert.deepEqual(result, { recorded: false, isNew: false });

  const content = fs.readFileSync(file, 'utf-8');
  assert.equal(content, 'session-001\n');
});

test('lock cleanup on happy path', () => {
  const { cwd, specsRoot, ticketId } = makeFixture();
  recordSession({ specsRoot, ticketId, sessionId: 'session-001', cwd });

  const lockPath = path.join(cwd, specsRoot, ticketId, 'sessions.txt.lock');
  assert.equal(fs.existsSync(lockPath), false);
});

test('lock cleanup on exception', () => {
  const { cwd, specsRoot, ticketId } = makeFixture();
  const lockPath = path.join(cwd, specsRoot, ticketId, 'sessions.txt.lock');

  const original = fs.appendFileSync;
  fs.appendFileSync = () => { throw new Error('disk-full'); };

  try {
    assert.throws(
      () => recordSession({ specsRoot, ticketId, sessionId: 'session-001', cwd }),
      /disk-full/
    );
  } finally {
    fs.appendFileSync = original;
  }

  assert.equal(fs.existsSync(lockPath), false);
});

test('lock contention returns lock-timeout', () => {
  const { cwd, specsRoot, ticketId } = makeFixture();
  const lockPath = path.join(cwd, specsRoot, ticketId, 'sessions.txt.lock');
  fs.writeFileSync(lockPath, '');

  const start = Date.now();
  const result = recordSession({ specsRoot, ticketId, sessionId: 'session-001', cwd });
  const elapsed = Date.now() - start;

  assert.deepEqual(result, { skipped: 'lock-timeout' });
  assert.ok(elapsed >= 100, `expected ≥100ms backoff, got ${elapsed}ms`);

  fs.unlinkSync(lockPath);
});

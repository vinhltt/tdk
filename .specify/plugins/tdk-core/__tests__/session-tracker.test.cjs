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
  const folder = path.join(cwd, specsRoot, ticketId);
  return {
    cwd,
    specsRoot,
    ticketId,
    folder,
    file: path.join(folder, 'sessions.jsonl'),
    legacyFile: path.join(folder, 'sessions.txt'),
    lockPath: path.join(folder, 'sessions.jsonl.lock')
  };
}

/** Provenance factory plus an invocation counter, so callers can assert laziness. */
function spyProvenance(sessionId, extra = {}) {
  const spy = () => {
    spy.calls += 1;
    return {
      v: 1,
      session: sessionId,
      harness: 'claude',
      harnessSource: 'default',
      firstSeen: '2026-09-09T00:00:00.000Z',
      machineId: 'abcdef012345',
      os: 'linux-x64',
      source: 'prompt-mention',
      ...extra
    };
  };
  spy.calls = 0;
  return spy;
}

function readLines(file) {
  return fs.readFileSync(file, 'utf-8').split('\n').filter((line) => line.length > 0);
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

test('T1 first association writes one provenance record', () => {
  const { cwd, specsRoot, ticketId, file, legacyFile } = makeFixture();
  const provenance = spyProvenance('session-001');

  const result = recordSession({ specsRoot, ticketId, sessionId: 'session-001', cwd, provenance });
  assert.deepEqual(result, { recorded: true, isNew: true });

  const lines = readLines(file);
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.v, 1);
  assert.equal(record.session, 'session-001');
  assert.equal(record.harness, 'claude');
  assert.equal(record.harnessSource, 'default');
  assert.equal(record.firstSeen, '2026-09-09T00:00:00.000Z');
  assert.equal(record.machineId, 'abcdef012345');
  assert.equal(record.os, 'linux-x64');
  assert.equal(record.source, 'prompt-mention');
  assert.equal(provenance.calls, 1);
  assert.equal(fs.existsSync(legacyFile), false, 'legacy file must never be created');
});

test('appends a second association to an existing record file', () => {
  const { cwd, specsRoot, ticketId, file } = makeFixture();
  recordSession({ specsRoot, ticketId, sessionId: 'session-a', cwd, provenance: spyProvenance('session-a') });
  recordSession({ specsRoot, ticketId, sessionId: 'session-b', cwd, provenance: spyProvenance('session-b') });

  const sessions = readLines(file).map((line) => JSON.parse(line).session);
  assert.deepEqual(sessions, ['session-a', 'session-b']);
});

test('T2 same session twice leaves the file byte-identical and skips provenance', () => {
  const { cwd, specsRoot, ticketId, file } = makeFixture();
  const provenance = spyProvenance('session-001');

  recordSession({ specsRoot, ticketId, sessionId: 'session-001', cwd, provenance });
  const before = fs.readFileSync(file);

  const result = recordSession({ specsRoot, ticketId, sessionId: 'session-001', cwd, provenance });
  assert.deepEqual(result, { recorded: false, isNew: false });
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(provenance.calls, 1, 'no provenance collection on a dedup hit');
});

test('T3 legacy sessions.txt entry suppresses the append and stays untouched', () => {
  const { cwd, specsRoot, ticketId, file, legacyFile } = makeFixture();
  fs.writeFileSync(legacyFile, 'session-legacy\n');
  const provenance = spyProvenance('session-legacy');

  const result = recordSession({ specsRoot, ticketId, sessionId: 'session-legacy', cwd, provenance });

  assert.deepEqual(result, { recorded: false, isNew: false });
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(legacyFile, 'utf-8'), 'session-legacy\n');
  assert.equal(provenance.calls, 0);
});

test('T4 corrupt line mid-file is preserved and does not block the append', () => {
  const { cwd, specsRoot, ticketId, file } = makeFixture();
  const corrupt = '{"v":1,"session":"session-trunc"';
  fs.writeFileSync(file, `${JSON.stringify({ v: 1, session: 'session-old' })}\n${corrupt}\n`);

  const result = recordSession({
    specsRoot, ticketId, sessionId: 'session-new', cwd, provenance: spyProvenance('session-new')
  });

  assert.deepEqual(result, { recorded: true, isNew: true });
  const lines = readLines(file);
  assert.equal(lines.length, 3);
  assert.equal(lines[1], corrupt, 'corrupt line preserved verbatim');
  assert.equal(JSON.parse(lines[0]).session, 'session-old');
  assert.equal(JSON.parse(lines[2]).session, 'session-new');
});

test('T5 truncated final line does not fuse with the new record', () => {
  const { cwd, specsRoot, ticketId, file } = makeFixture();
  fs.writeFileSync(file, '{"v":1,"session":"session-cut"');

  recordSession({
    specsRoot, ticketId, sessionId: 'session-new', cwd, provenance: spyProvenance('session-new')
  });

  const lines = readLines(file);
  assert.equal(lines.length, 2);
  assert.equal(lines[0], '{"v":1,"session":"session-cut"');
  assert.equal(JSON.parse(lines[1]).session, 'session-new');
});

test('T6 null, array, session-less and unknown-version lines are skipped for dedup', () => {
  const { cwd, specsRoot, ticketId, file } = makeFixture();
  fs.writeFileSync(file, [
    'null',
    '["session-001"]',
    '{"v":1,"harness":"claude"}',
    '{"v":99,"session":"session-001"}',
    '',
    '   '
  ].join('\n') + '\n');

  const result = recordSession({
    specsRoot, ticketId, sessionId: 'session-001', cwd, provenance: spyProvenance('session-001')
  });

  assert.deepEqual(result, { recorded: true, isNew: true }, 'none of those lines claims session-001');
  const appended = JSON.parse(readLines(file).at(-1));
  assert.equal(appended.session, 'session-001');
});

test('T7 lock contention returns lock-timeout without appending', () => {
  const { cwd, specsRoot, ticketId, file, lockPath } = makeFixture();
  fs.writeFileSync(lockPath, '');
  const provenance = spyProvenance('session-001');

  const start = Date.now();
  const result = recordSession({ specsRoot, ticketId, sessionId: 'session-001', cwd, provenance });
  const elapsed = Date.now() - start;

  assert.deepEqual(result, { skipped: 'lock-timeout' });
  assert.ok(elapsed >= 100, `expected ≥100ms backoff, got ${elapsed}ms`);
  assert.equal(fs.existsSync(file), false, 'no unlocked-append fallback');

  fs.unlinkSync(lockPath);
});

test('T8 append failure throws to the caller and still unlinks the lock', () => {
  const { cwd, specsRoot, ticketId, lockPath } = makeFixture();

  const original = fs.appendFileSync;
  fs.appendFileSync = () => { throw new Error('disk-full'); };

  try {
    assert.throws(
      () => recordSession({
        specsRoot, ticketId, sessionId: 'session-001', cwd, provenance: spyProvenance('session-001')
      }),
      /disk-full/
    );
  } finally {
    fs.appendFileSync = original;
  }

  assert.equal(fs.existsSync(lockPath), false);
});

test('lock cleanup on happy path', () => {
  const { cwd, specsRoot, ticketId, lockPath } = makeFixture();
  recordSession({
    specsRoot, ticketId, sessionId: 'session-001', cwd, provenance: spyProvenance('session-001')
  });

  assert.equal(fs.existsSync(lockPath), false);
});

test('records a minimal valid line when no provenance factory is supplied', () => {
  const { cwd, specsRoot, ticketId, file } = makeFixture();

  const result = recordSession({ specsRoot, ticketId, sessionId: 'session-bare', cwd });

  assert.deepEqual(result, { recorded: true, isNew: true });
  assert.deepEqual(JSON.parse(readLines(file)[0]), { v: 1, session: 'session-bare' });
});

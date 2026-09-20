const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  buildSessionProvenance,
  classifySessionLine,
  identityMode,
  machineFingerprint,
  osDescriptor,
  pathLocator,
  relativeLocator
} = require('../lib/session-provenance.cjs');

function fakeOs(overrides = {}) {
  return {
    hostname: () => 'build-box',
    userInfo: () => ({ username: 'alice' }),
    platform: () => 'linux',
    arch: () => 'x64',
    release: () => '5.15.0-generic',
    homedir: () => '/synthetic-home/alice',
    ...overrides
  };
}

function build(input = {}, deps = {}) {
  return buildSessionProvenance(
    {
      sessionId: 'session-001',
      harness: 'claude',
      cwd: '/synthetic-home/alice/project',
      transcriptPath: null,
      workspaceRoot: '/synthetic-home/alice/project',
      source: 'prompt-mention',
      ...input
    },
    {
      now: () => new Date('2026-09-09T10:00:00.000Z'),
      os: fakeOs(),
      crypto,
      getGitBranch: () => 'main',
      env: {},
      ...deps
    }
  );
}

test('T10 harnessSource is env when TDK_HARNESS is set, default otherwise', () => {
  const fromEnv = build({ harness: 'omp' }, { env: { TDK_HARNESS: 'omp' } });
  assert.equal(fromEnv.harness, 'omp');
  assert.equal(fromEnv.harnessSource, 'env');

  const fallback = build({ harness: 'claude' }, { env: {} });
  assert.equal(fallback.harness, 'claude');
  assert.equal(fallback.harnessSource, 'default');

  const blank = build({ harness: 'claude' }, { env: { TDK_HARNESS: '' } });
  assert.equal(blank.harnessSource, 'default', 'an empty env var is not a declaration');
});

test('T11 os descriptor distinguishes WSL from native Windows', () => {
  assert.equal(osDescriptor(fakeOs({ release: () => '5.15.167.4-microsoft-standard-WSL2' })), 'linux-x64+wsl');
  assert.equal(osDescriptor(fakeOs({ platform: () => 'win32', release: () => '10.0.26100' })), 'win32-x64');
  assert.equal(osDescriptor(fakeOs()), 'linux-x64');
});

test('T12 hashed identity mode omits host and user keys', () => {
  assert.equal(identityMode({}), 'full');
  assert.equal(identityMode({ TDK_SESSION_IDENTITY: 'hashed' }), 'hashed');

  const full = build({}, { env: {} });
  assert.equal(full.host, 'build-box');
  assert.equal(full.user, 'alice');
  assert.ok(full.machineId);

  const hashed = build({}, { env: { TDK_SESSION_IDENTITY: 'hashed' } });
  assert.equal(Object.prototype.hasOwnProperty.call(hashed, 'host'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(hashed, 'user'), false);
  assert.ok(hashed.machineId);
});

test('T13 machineId is stable for identical inputs and changes with the hostname', () => {
  const a = machineFingerprint(fakeOs(), crypto);
  const b = machineFingerprint(fakeOs(), crypto);
  const renamed = machineFingerprint(fakeOs({ hostname: () => 'laptop' }), crypto);

  assert.equal(a, b);
  assert.equal(a.length, 12);
  assert.notEqual(a, renamed, 'a rename produces a different id — the fingerprint is not rename-stable');
});

test('T14 path policy relativizes inside the root and nulls everything else', () => {
  assert.equal(relativeLocator('/synthetic-home/alice/project', '/synthetic-home/alice/project'), '.');
  assert.equal(relativeLocator('/synthetic-home/alice/project/src/app', '/synthetic-home/alice/project'), 'src/app');
  assert.equal(relativeLocator('/var/tmp/other', '/synthetic-home/alice/project'), null);
  assert.equal(relativeLocator('C:\\proj\\src', 'D:\\other'), null, 'drive/UNC mismatch is not representable');
  assert.equal(relativeLocator('relative/path', '/synthetic-home/alice/project'), null);

  const home = '/synthetic-home/alice';
  const root = '/synthetic-home/alice/project';
  assert.equal(pathLocator('/synthetic-home/alice/project/docs', root, home), 'docs');
  assert.equal(pathLocator('/synthetic-home/alice/notes/x.md', root, home), '~/notes/x.md');
  assert.equal(pathLocator('/etc/hosts', root, home), null);
  assert.equal(
    pathLocator('/synthetic-home/alice/.claude/projects/-synthetic-home-alice-project/abc.jsonl', root, home),
    null,
    'an encoded-home transcript name would republish the home path'
  );
});

test('T15 no git probe outside workspace containment', () => {
  let calls = 0;
  const spy = () => { calls += 1; return 'feature/x'; };

  const outside = build({ cwd: '/var/tmp/elsewhere' }, { getGitBranch: spy });
  assert.equal(outside.branch, null);
  assert.equal(outside.cwd, null);
  assert.equal(calls, 0);

  const inside = build({ cwd: '/synthetic-home/alice/project/src' }, { getGitBranch: spy });
  assert.equal(inside.branch, 'feature/x');
  assert.equal(inside.cwd, 'src');
  assert.equal(calls, 1);
});

test('T16 a failing identity lookup yields null fields, not a thrown build', () => {
  const broken = fakeOs({
    hostname: () => { throw new Error('ENOSYS'); },
    userInfo: () => { throw new Error('ENOSYS'); }
  });

  const record = build({}, { os: broken });
  assert.equal(record.host, null);
  assert.equal(record.user, null);
  assert.equal(record.machineId, null);
  assert.equal(record.session, 'session-001');
});

test('record carries the v1 contract in a fixed key order', () => {
  const record = build({ transcriptPath: '/synthetic-home/alice/project/.transcript.jsonl' });

  assert.deepEqual(Object.keys(record), [
    'v', 'session', 'harness', 'harnessSource', 'firstSeen', 'machineId',
    'host', 'user', 'os', 'osRelease', 'repo', 'branch', 'cwd', 'transcript', 'source'
  ]);
  assert.equal(record.v, 1);
  assert.equal(record.firstSeen, '2026-09-09T10:00:00.000Z');
  assert.equal(record.repo, 'project');
  assert.equal(record.cwd, '.');
  assert.equal(record.transcript, '.transcript.jsonl');
  assert.equal(record.source, 'prompt-mention');
});

test('a git failure degrades branch to null instead of failing the record', () => {
  const record = build({}, { getGitBranch: () => { throw new Error('timeout'); } });
  assert.equal(record.branch, null);
  assert.equal(record.session, 'session-001');
});

test('classifySessionLine is the single shared line rule', () => {
  assert.deepEqual(
    classifySessionLine('{"v":1,"session":"s1"}'),
    { kind: 'record', session: 's1', record: { v: 1, session: 's1' } }
  );
  assert.deepEqual(classifySessionLine('session-legacy'), { kind: 'legacy', session: 'session-legacy' });
  assert.deepEqual(classifySessionLine('  '), { kind: 'skip' });
  assert.deepEqual(classifySessionLine('null'), { kind: 'skip' });
  assert.deepEqual(classifySessionLine('["s1"]'), { kind: 'skip' });
  assert.deepEqual(classifySessionLine('{"v":1}'), { kind: 'skip' });
  assert.deepEqual(classifySessionLine('{"v":99,"session":"s1"}'), { kind: 'skip' });
  assert.deepEqual(classifySessionLine('{"v":1,"session":"s1"'), { kind: 'skip' }, 'truncated JSON is not an ID');
  assert.deepEqual(classifySessionLine(undefined), { kind: 'skip' });
});

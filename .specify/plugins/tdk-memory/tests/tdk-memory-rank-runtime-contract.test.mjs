import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const RUNTIME_BUNDLE = resolve(TESTS_DIR, '..', 'skills/tdk-memory-checksum/scripts/memory-manifest.cjs');
const POSIX_ONLY = { skip: process.platform === 'win32' ? 'needs POSIX file names and shell' : false };
// spawnSync blocks the event loop, so the test runner's own timeout cannot stop a runtime
// that never exits. This bound turns such a hang into a failed test.
const SUBPROCESS_TIMEOUT_MS = 30_000;

function writeNote(root, relativePath, contents) {
  const target = join(root, ...relativePath.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function withMemory(notes, run) {
  const sandbox = mkdtempSync(join(tmpdir(), 'tdk-memory-rank-'));
  const workspace = join(sandbox, 'workspace');
  const memoryRoot = join(workspace, 'memory');
  mkdirSync(join(workspace, '.git'), { recursive: true });
  mkdirSync(memoryRoot, { recursive: true });

  try {
    for (const [path, contents] of Object.entries(notes)) writeNote(memoryRoot, path, contents);
    run({ sandbox, workspace, memoryRoot });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function runRank({ workspace }, args, request) {
  return spawnSync('node', [RUNTIME_BUNDLE, 'rank', ...args], {
    cwd: workspace,
    encoding: 'utf8',
    input: typeof request === 'string' ? request : JSON.stringify(request),
    timeout: SUBPROCESS_TIMEOUT_MS,
  });
}

function rank(context, request, ...options) {
  const result = runRank(context, [context.memoryRoot, ...options], request);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function selectedPaths(ranking) {
  return ranking.selected.map((note) => note.path);
}

function scoreOf(ranking, path) {
  return ranking.selected.find((note) => note.path === path)?.score;
}

function expectFatal(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
}

function printTerm(request) {
  const sandbox = mkdtempSync(join(tmpdir(), 'tdk-memory-print-term-'));
  try {
    return spawnSync('node', [RUNTIME_BUNDLE, 'rank', '--print-term'], {
      cwd: sandbox,
      encoding: 'utf8',
      input: JSON.stringify(request),
      timeout: SUBPROCESS_TIMEOUT_MS,
    });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

describe('rank term handling', () => {
  const notes = {
    'domains/foo-bar/services.md': 'Foo Bar calls FooBar and foo-bar.\n',
    'notes/about-foo.md': 'foo appears, and later bar appears too.\n',
    'notes/unrelated.md': 'nothing relevant here\n',
  };

  test('three spellings of one term rank identically over the whole inventory and over candidates', () => {
    withMemory(notes, (context) => {
      const candidates = ['domains/foo-bar/services.md', 'notes/about-foo.md'];
      const spellings = ['Foo Bar', 'FooBar', 'foo-bar'];

      const [baseline, ...others] = spellings.map((term) => rank(context, { terms: [term] }));
      assert.deepEqual(selectedPaths(baseline), ['domains/foo-bar/services.md', 'notes/about-foo.md']);
      for (const other of others) assert.deepEqual(other, baseline);

      for (const term of spellings) {
        assert.deepEqual(rank(context, { terms: [term], candidates }), baseline);
      }
    });
  });

  test('an external root needs the per-invocation flag', () => {
    withMemory({}, ({ sandbox, workspace }) => {
      const external = join(sandbox, 'external-memory');
      writeNote(external, 'notes/a.md', 'alpha\n');
      const request = { terms: ['alpha'] };

      expectFatal(runRank({ workspace }, [external], request));

      const allowed = runRank({ workspace }, [external, '--allow-external-root'], request);
      assert.equal(allowed.status, 0, allowed.stderr);
      assert.deepEqual(selectedPaths(JSON.parse(allowed.stdout)), ['notes/a.md']);
    });
  });

  test('a term full of shell syntax stays inert inside a quoted heredoc', POSIX_ONLY, () => {
    withMemory({}, ({ workspace, memoryRoot }) => {
      const marker = join(workspace, 'marker');
      const term = '$(touch marker) `touch marker` "quoted"';
      writeNote(memoryRoot, 'notes/a.md', `${term}\n`);
      const script = [
        `node "${RUNTIME_BUNDLE}" rank "${memoryRoot}" <<'TDK_RANK_INPUT'`,
        JSON.stringify({ terms: [term] }),
        'TDK_RANK_INPUT',
        '',
      ].join('\n');

      const result = spawnSync('sh', ['-c', script], { cwd: workspace, encoding: 'utf8', timeout: SUBPROCESS_TIMEOUT_MS });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(marker), false);
      assert.deepEqual(selectedPaths(JSON.parse(result.stdout)), ['notes/a.md']);
    });
  });

  test('command line shapes other than the contract are usage errors', () => {
    withMemory({ 'notes/a.md': 'alpha\n' }, (context) => {
      const request = { terms: ['alpha'] };
      const root = context.memoryRoot;

      expectFatal(runRank(context, [root, 'alpha'], request));
      expectFatal(runRank(context, [], request));
      expectFatal(runRank(context, ['--scope', 'notes'], request));
      expectFatal(runRank(context, [root, '--scope'], request));
      expectFatal(runRank(context, [root, '--scope', '--allow-external-root'], request));
      expectFatal(runRank(context, [root, '--allow-external-root', '--allow-external-root'], request));
      expectFatal(runRank(context, [root, '--unknown'], request));
      expectFatal(runRank(context, ['--print-term', root], request));
    });
  });

  test('a term without tokens matches nothing instead of everything', () => {
    withMemory({ 'notes/a.md': 'alpha\n' }, (context) => {
      assert.equal(rank(context, { terms: ['---'] }).total, 0);
      assert.equal(rank(context, { terms: ['   '] }).total, 0);
      assert.deepEqual(selectedPaths(rank(context, { terms: ['---', 'alpha'] })), ['notes/a.md']);
    });
  });

  test('regular expression syntax in a term is matched literally', () => {
    withMemory({ 'notes/cpp.md': 'written in c++\n', 'notes/other.md': 'plain words\n' }, (context) => {
      assert.deepEqual(selectedPaths(rank(context, { terms: ['c++'] })), ['notes/cpp.md']);
      for (const term of ['(x', '[z', 'a|b', '\\d', '.*', '^', '$', 'x{2}']) {
        assert.equal(rank(context, { terms: [term] }).total, 0, term);
      }
    });
  });
});

describe('rank scoring', () => {
  test('identity outranks the path and the path outranks the body', () => {
    withMemory(
      {
        'notes/one.md': '---\nid: foo-bar\n---\nbody\n',
        'notes/foo-bar.md': 'body\n',
        'notes/two.md': '---\ntitle: Foo Bar\n---\nbody\n',
        'notes/three.md': '---\naliases:\n  - other\n  - FooBar\n---\nbody\n',
        'domains/foo-bar/four.md': 'body\n',
        'notes/five.md': 'foo and bar\n',
        'notes/six.md': 'foo alone\n',
      },
      (context) => {
        const ranking = rank(context, { terms: ['Foo Bar'] });

        assert.deepEqual(
          ranking.selected.map((note) => [note.path, note.score]),
          [
            ['notes/one.md', 5],
            ['notes/foo-bar.md', 4],
            ['notes/two.md', 3],
            ['notes/three.md', 2],
            ['domains/foo-bar/four.md', 1],
          ],
        );
        assert.equal(ranking.total, 6);
        assert.equal(ranking.omitted, 1);
      },
    );
  });

  test('a scalar alias counts, and a title that only contains the term does not', () => {
    withMemory(
      {
        'notes/scalar-alias.md': '---\naliases: FooBar\n---\nbody\n',
        'notes/long-title.md': '---\ntitle: Foo Bar Baz\n---\nbody\n',
      },
      (context) => {
        const ranking = rank(context, { terms: ['foo bar'] });
        assert.equal(scoreOf(ranking, 'notes/scalar-alias.md'), 2);
        assert.equal(scoreOf(ranking, 'notes/long-title.md'), 0);
      },
    );
  });

  test('a short token only matches as a whole word, in the body and in the path', () => {
    withMemory(
      {
        'notes/email.md': 'send an email\n',
        'domains/email-gateway/overview.md': 'plain\n',
        'domains/ai-tools/overview.md': 'plain\n',
        'domains/openAiTools/overview.md': 'plain\n',
        'notes/uses.md': 'Uses AI here.\n',
      },
      (context) => {
        const ranking = rank(context, { terms: ['ai'] });

        assert.deepEqual(new Set(selectedPaths(ranking)), new Set([
          'domains/ai-tools/overview.md',
          'domains/openAiTools/overview.md',
          'notes/uses.md',
        ]));
        assert.equal(scoreOf(ranking, 'domains/ai-tools/overview.md'), 1);
        assert.equal(scoreOf(ranking, 'notes/uses.md'), 0);
      },
    );
  });

  test('camelCase splits only at a lower or digit to upper boundary', () => {
    withMemory({ 'notes/github.md': 'plain\n', 'notes/git-hub.md': 'plain\n' }, (context) => {
      const ranking = rank(context, { terms: ['GitHub'] });
      assert.equal(scoreOf(ranking, 'notes/github.md'), 4);
      assert.equal(scoreOf(ranking, 'notes/git-hub.md'), 4);
    });
  });

  test('a term with a short camelCase part finds its own spelling in a note body', () => {
    withMemory(
      {
        'notes/mobile.md': 'Runs on iOS only.\n',
        'notes/assistant.md': 'Built around fooAi and fooAi.\n',
        'notes/lookalike.md': 'An aioli recipe from Ohio, with foo.\n',
      },
      (context) => {
        assert.deepEqual(selectedPaths(rank(context, { terms: ['iOS'] })), ['notes/mobile.md']);

        const assistant = rank(context, { terms: ['fooAi'] });
        assert.deepEqual(selectedPaths(assistant), ['notes/assistant.md']);
        assert.equal(assistant.selected[0].occurrences, 2);
      },
    );
  });

  test('a camelCase term finds every spelling of itself and no lookalike', () => {
    withMemory(
      {
        'notes/lower.md': 'runs on ios, macos, iphone, grpc, ekyc, b2b\n',
        'notes/upper.md': 'RUNS ON IOS, MACOS, IPHONE, GRPC, EKYC, B2B\n',
        'notes/own.md': 'runs on iOS, macOS, iPhone, gRPC, eKYC, B2B\n',
        'notes/lookalike.md': 'aioli Ohio machinos tiphone agrpc2 ekycs ab2b\n',
      },
      (context) => {
        for (const term of ['iOS', 'macOS', 'iPhone', 'gRPC', 'eKYC', 'B2B']) {
          const found = selectedPaths(rank(context, { terms: [term] })).sort();
          assert.deepEqual(found, ['notes/lower.md', 'notes/own.md', 'notes/upper.md'], term);
        }
      },
    );
  });

  test('each spelling of a camelCase word counts once, and every other word stays required', () => {
    withMemory({ 'notes/both.md': 'iOS and ios app\n', 'notes/alone.md': 'ios only\n' }, (context) => {
      const single = rank(context, { terms: ['iOS'] });
      assert.equal(single.selected.find((note) => note.path === 'notes/both.md').occurrences, 2);

      assert.deepEqual(selectedPaths(rank(context, { terms: ['iOS app'] })), ['notes/both.md']);
    });
  });

  test('a query naming a file finds the note the way its name does', () => {
    withMemory(
      {
        'README.md': 'plain\n',
        'constitution.md': 'plain\n',
        'domains/foo-bar/services.md': 'plain\n',
        'notes/other.md': 'nothing here\n',
      },
      (context) => {
        assert.equal(scoreOf(rank(context, { terms: ['README.md'] }), 'README.md'), 4);
        assert.equal(scoreOf(rank(context, { terms: ['readme.MD'] }), 'README.md'), 4);
        assert.equal(scoreOf(rank(context, { terms: ['services.md'] }), 'domains/foo-bar/services.md'), 4);
        assert.equal(scoreOf(rank(context, { terms: ['domains/foo-bar/services.md'] }), 'domains/foo-bar/services.md'), 1);
        assert.deepEqual(rank(context, { terms: ['constitution.md'] }), rank(context, { terms: ['constitution'] }));
      },
    );
  });

  test('only a final .md after a name is an extension', () => {
    withMemory({ 'notes/a.md': 'the md format\n', 'notes/b.md': 'the format\n' }, (context) => {
      assert.deepEqual(selectedPaths(rank(context, { terms: ['.md'] })), ['notes/a.md']);
      assert.deepEqual(selectedPaths(rank(context, { terms: ['md.format'] })), ['notes/a.md']);
    });
  });

  test('a long token still finds a camelCase spelling across its boundary', () => {
    withMemory({ 'notes/a.md': 'hosted on GitHub\n' }, (context) => {
      assert.deepEqual(selectedPaths(rank(context, { terms: ['github'] })), ['notes/a.md']);
    });
  });

  test('occurrences take the minimum across tokens, without overlap', () => {
    withMemory({ 'notes/a.md': 'foo foo foo bar\n', 'notes/b.md': 'aaaa\n' }, (context) => {
      assert.equal(rank(context, { terms: ['foo bar'] }).selected[0].occurrences, 1);
      assert.equal(rank(context, { terms: ['aaa'] }).selected[0].occurrences, 1);
    });
  });

  test('every token must appear, though not next to each other', () => {
    withMemory({ 'notes/both.md': 'foo\n\nother text\n\nbar\n', 'notes/half.md': 'only foo\n' }, (context) => {
      assert.deepEqual(selectedPaths(rank(context, { terms: ['foo bar'] })), ['notes/both.md']);
    });
  });

  test('normalization forms of a term and a note compare equal', () => {
    withMemory({ 'notes/nfc.md': 'café\n', 'notes/nfd.md': 'café\n' }, (context) => {
      const expected = new Set(['notes/nfc.md', 'notes/nfd.md']);
      assert.deepEqual(new Set(selectedPaths(rank(context, { terms: ['café'] }))), expected);
      assert.deepEqual(new Set(selectedPaths(rank(context, { terms: ['café'] }))), expected);
    });
  });

  test('a term written as a path matches by path', () => {
    withMemory({ 'domains/foo-bar/services.md': 'plain\n', 'domains/other/services.md': 'plain\n' }, (context) => {
      const ranking = rank(context, { terms: ['domains/foo-bar'] });
      assert.deepEqual(selectedPaths(ranking), ['domains/foo-bar/services.md']);
      assert.equal(ranking.selected[0].score, 1);
      assert.equal(ranking.selected[0].occurrences, 0);
    });
  });

  test('several terms rank as a union, each note keeping its best match', () => {
    withMemory(
      {
        'notes/first.md': 'alpha\n',
        'notes/second.md': 'beta\n',
        'notes/beta.md': 'alpha alpha alpha\n',
        'notes/neither.md': 'gamma\n',
      },
      (context) => {
        const ranking = rank(context, { terms: ['alpha', 'beta'] });

        assert.equal(ranking.total, 3);
        assert.deepEqual(selectedPaths(ranking), ['notes/beta.md', 'notes/first.md', 'notes/second.md']);
        assert.equal(ranking.selected[0].score, 4);
        assert.equal(ranking.selected[0].occurrences, 0);
      },
    );
  });

  test('between terms of equal score a note keeps the higher occurrence count', () => {
    withMemory({ 'notes/a.md': 'alpha alpha alpha beta\n' }, (context) => {
      for (const terms of [['alpha', 'beta'], ['beta', 'alpha']]) {
        assert.equal(rank(context, { terms }).selected[0].occurrences, 3);
      }
    });
  });
});

describe('rank ordering and selection', () => {
  test('file groups order equal scores before occurrences do', () => {
    withMemory(
      {
        'notes/plain.md': 'alpha\n',
        'constitution.md': 'alpha\n',
        'arc42/section.md': 'alpha alpha\n',
        'README.md': 'alpha alpha alpha\n',
        'CHANGELOG.md': 'alpha alpha alpha\n',
        'memory-index.md': 'alpha alpha alpha\n',
        'arc42/README.md': 'alpha alpha alpha alpha\n',
      },
      (context) => {
        const ranking = rank(context, { terms: ['alpha'] });

        assert.deepEqual(
          ranking.selected.map((note) => [note.path, note.tier]),
          [
            ['constitution.md', 0],
            ['notes/plain.md', 0],
            ['arc42/section.md', 1],
            ['CHANGELOG.md', 2],
            ['README.md', 2],
          ],
        );
        assert.equal(ranking.total, 7);
        assert.equal(ranking.omitted, 2);
      },
    );
  });

  test('the root README leads a README query, ahead of the arc42 one', () => {
    withMemory({ 'arc42/README.md': 'plain\n', 'README.md': 'plain\n' }, (context) => {
      const ranking = rank(context, { terms: ['README'] });
      assert.deepEqual(selectedPaths(ranking), ['README.md', 'arc42/README.md']);
      assert.equal(ranking.selected[0].score, 4);
    });
  });

  test('more occurrences lead within a group, then UTF-8 path bytes decide', POSIX_ONLY, () => {
    const body = 'alpha\n';
    withMemory(
      {
        'é.md': body,
        'a.md': body,
        'Z.md': body,
        '～.md': body,
        '\u{1f600}.md': body,
      },
      (context) => {
        assert.deepEqual(selectedPaths(rank(context, { terms: ['alpha'] })), [
          'Z.md',
          'a.md',
          'é.md',
          '～.md',
          '\u{1f600}.md',
        ]);

        writeNote(context.memoryRoot, 'é.md', 'alpha alpha\n');
        assert.equal(selectedPaths(rank(context, { terms: ['alpha'] }))[0], 'é.md');
      },
    );
  });

  test('body-only matches stop at five notes and report the rest as omitted', () => {
    const notes = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`notes/n${index}.md`, 'alpha\n']),
    );
    withMemory(notes, (context) => {
      const ranking = rank(context, { terms: ['alpha'] });
      assert.equal(ranking.total, 9);
      assert.equal(ranking.selected.length, 5);
      assert.equal(ranking.omitted, 4);
    });
  });

  test('ties at the top score survive the cut while lower scores do not', () => {
    const notes = Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [`domains/d${index}/alpha.md`, 'plain\n']),
    );
    withMemory({ ...notes, 'domains/alpha-group/other.md': 'plain\n' }, (context) => {
      const ranking = rank(context, { terms: ['alpha'] });
      assert.equal(ranking.total, 8);
      assert.equal(ranking.selected.length, 7);
      assert.ok(ranking.selected.every((note) => note.score === 4));
      assert.equal(ranking.omitted, 1);
    });
  });

  test('a pinned note outside the first five stays, and the pattern is exact', () => {
    withMemory(
      {
        'notes/n1.md': 'alpha alpha\n',
        'notes/n2.md': 'alpha alpha\n',
        'notes/n3.md': 'alpha alpha\n',
        'notes/n4.md': 'alpha alpha\n',
        'notes/n5.md': 'alpha alpha\n',
        'notes/n6.md': 'alpha alpha\n',
        'constitution.md': 'alpha\n',
        'domains/x/domain-overview.md': 'alpha\n',
        'domains/x/sub/domain-overview.md': 'alpha\n',
        'domain-overview.md': 'alpha\n',
      },
      (context) => {
        const ranking = rank(context, { terms: ['alpha'] });
        const pinned = ranking.selected.filter((note) => note.pinned).map((note) => note.path);

        assert.deepEqual(pinned, ['constitution.md', 'domains/x/domain-overview.md']);
        assert.equal(ranking.selected.length, 7);
        assert.equal(ranking.total, 10);
        assert.equal(ranking.omitted, 3);
      },
    );
  });

  test('five strong matches in one domain leave another domain overview in place', () => {
    withMemory(
      {
        'domains/foo-bar/a.md': 'plain\n',
        'domains/foo-bar/b.md': 'plain\n',
        'domains/foo-bar/c.md': 'plain\n',
        'domains/foo-bar/d.md': 'plain\n',
        'domains/foo-bar/e.md': 'plain\n',
        'domains/other/domain-overview.md': 'mentions foo bar\n',
      },
      (context) => {
        const ranking = rank(context, { terms: ['foo-bar'] });
        assert.equal(ranking.selected.length, 6);
        assert.equal(ranking.selected[5].path, 'domains/other/domain-overview.md');
        assert.equal(ranking.selected[5].score, 0);
        assert.equal(ranking.selected[5].pinned, true);
      },
    );
  });
});

describe('rank scope', () => {
  const notes = {
    'constitution.md': 'alpha\n',
    'domains/foo.md': 'alpha\n',
    'domains/foo/domain-overview.md': 'alpha\n',
    'domains/foobar/x.md': 'alpha\n',
    'other/y.md': 'alpha\n',
  };

  test('a scope holding a pattern is refused rather than matching nothing', () => {
    withMemory({ 'domains/a/flows/x.md': 'alpha\n' }, (context) => {
      for (const scope of ['domains/*/flows', 'domains/{domain}/flows', 'domains/a?', 'domains/[a]']) {
        const result = runRank(context, [context.memoryRoot, '--scope', scope], { terms: ['alpha'] });
        expectFatal(result);
        assert.match(result.stderr, /not a pattern/, scope);
      }
    });
  });

  test('a scope matches whole segments and is repeatable', () => {
    withMemory(notes, (context) => {
      assert.deepEqual(selectedPaths(rank(context, { terms: ['alpha'] }, '--scope', 'domains/foo')), [
        'domains/foo/domain-overview.md',
      ]);

      assert.deepEqual(
        new Set(selectedPaths(rank(context, { terms: ['alpha'] }, '--scope', 'domains/foo', '--scope', 'other'))),
        new Set(['domains/foo/domain-overview.md', 'other/y.md']),
      );

      assert.deepEqual(selectedPaths(rank(context, { terms: ['alpha'] }, '--scope', 'domains/foo.md')), ['domains/foo.md']);
    });
  });

  test('a pin only applies inside the scope', () => {
    withMemory(notes, (context) => {
      const ranking = rank(context, { terms: ['alpha'] }, '--scope', 'domains/foo');
      assert.deepEqual(selectedPaths(ranking), ['domains/foo/domain-overview.md']);
      assert.equal(ranking.selected[0].pinned, true);
    });
  });

  test('a scope that is not a portable relative prefix is rejected', () => {
    withMemory(notes, (context) => {
      const request = { terms: ['alpha'] };
      for (const scope of ['../outside', 'domains/../other', '/domains', 'domains/foo/', 'domains\\foo', '']) {
        expectFatal(runRank(context, [context.memoryRoot, '--scope', scope], request));
      }
    });
  });

  test('a scope also narrows candidates', () => {
    withMemory(notes, (context) => {
      const ranking = rank(context, { terms: ['alpha'], candidates: ['other/y.md', 'constitution.md'] }, '--scope', 'other');
      assert.deepEqual(selectedPaths(ranking), ['other/y.md']);
      assert.equal(ranking.rejected_candidates, 0);
    });
  });
});

describe('rank candidates', () => {
  test('candidates outside the inventory are counted and never read', () => {
    withMemory(
      {
        'notes/a.md': 'alpha\n',
        'notes/b.md': 'alpha\n',
        '.obsidian/state.md': 'alpha\n',
      },
      (context) => {
        writeNote(dirname(context.memoryRoot), 'outside.md', 'alpha\n');
        const ranking = rank(context, {
          terms: ['alpha'],
          candidates: [
            'notes/a.md',
            join(context.memoryRoot, 'notes/b.md'),
            '../outside.md',
            '.obsidian/state.md',
            'notes/missing.md',
          ],
        });

        assert.deepEqual(selectedPaths(ranking), ['notes/a.md']);
        assert.equal(ranking.total, 1);
        assert.equal(ranking.rejected_candidates, 4);
      },
    );
  });

  test('candidates only narrow the full scan', () => {
    withMemory(
      {
        'notes/a.md': 'alpha\n',
        'notes/b.md': 'alpha alpha\n',
        'notes/c.md': 'unrelated\n',
      },
      (context) => {
        const full = selectedPaths(rank(context, { terms: ['alpha'] }));
        const narrowed = rank(context, { terms: ['alpha'], candidates: ['notes/a.md', 'notes/a.md', 'notes/c.md'] });

        assert.deepEqual(selectedPaths(narrowed), ['notes/a.md']);
        assert.ok(selectedPaths(narrowed).every((path) => full.includes(path)));
        assert.equal(narrowed.total, 1);
        assert.equal(narrowed.rejected_candidates, 0);
        assert.equal(rank(context, { terms: ['alpha'], candidates: [] }).total, 0);
      },
    );
  });

  test('a candidate in another normalization form reports the path on disk', POSIX_ONLY, () => {
    withMemory({ 'notes/café.md': 'alpha\n' }, (context) => {
      const ranking = rank(context, { terms: ['alpha'], candidates: ['notes/café.md'] });
      assert.deepEqual(selectedPaths(ranking), ['notes/café.md']);
      assert.equal(ranking.rejected_candidates, 0);
    });
  });
});

describe('rank inventory', () => {
  test(
    'an unreadable note stops ranking, naming the note and never the term',
    { skip: process.platform === 'win32' || process.getuid?.() === 0 },
    () => {
      withMemory({ 'notes/locked.md': 'alpha\n', 'notes/open.md': 'termsentinel\n' }, (context) => {
        chmodSync(join(context.memoryRoot, 'notes/locked.md'), 0o000);

        const result = runRank(context, [context.memoryRoot], { terms: ['termsentinel'] });

        expectFatal(result);
        assert.match(result.stderr, /notes\/locked\.md/);
        assert.ok(!result.stderr.includes('termsentinel'));
      });
    },
  );

  test('a symlink in the scanned tree is fatal and does not reveal note contents', POSIX_ONLY, () => {
    withMemory({ 'notes/a.md': 'alpha BODY_SENTINEL_VALUE\n' }, (context) => {
      symlinkSync(join(context.memoryRoot, 'notes/a.md'), join(context.memoryRoot, 'notes/link.md'));

      const result = runRank(context, [context.memoryRoot], { terms: ['alpha'] });

      expectFatal(result);
      assert.ok(!result.stderr.includes('BODY_SENTINEL_VALUE'));
    });
  });

  test('a name with active shell characters is masked and left out of the results', POSIX_ONLY, () => {
    withMemory({ 'notes/a$b.md': 'alpha\n', 'notes/ok.md': 'alpha\n' }, (context) => {
      const ranking = rank(context, { terms: ['alpha'], candidates: ['notes/a$b.md', 'notes/ok.md'] });

      assert.deepEqual(selectedPaths(ranking), ['notes/ok.md']);
      assert.deepEqual(ranking.unsafe_paths, ['notes/a?b.md']);
      assert.equal(ranking.rejected_candidates, 1);
    });
  });

  test('a name the manifest path check would refuse stays rankable', POSIX_ONLY, () => {
    withMemory({ 'notes/a:b.md': 'alpha\n' }, (context) => {
      assert.deepEqual(selectedPaths(rank(context, { terms: ['alpha'] })), ['notes/a:b.md']);
    });
  });

  test('assets and vault state directories are not part of the inventory', () => {
    const excluded = ['_templates', '_deprecated', 'memory-architect', 'assets', '.obsidian', '.trash'];
    const notes = Object.fromEntries(excluded.map((directory) => [`${directory}/note.md`, 'alpha\n']));
    withMemory({ ...notes, 'domains/x/assets/nested.md': 'alpha\n', 'notes/a.md': 'alpha\n' }, (context) => {
      const ranking = rank(context, { terms: ['alpha'], candidates: [...Object.keys(notes), 'notes/a.md'] });
      assert.deepEqual(selectedPaths(ranking), ['notes/a.md']);
      assert.equal(ranking.rejected_candidates, excluded.length);
      assert.deepEqual(selectedPaths(rank(context, { terms: ['alpha'] })), ['notes/a.md']);
    });
  });
});

describe('rank output and input safety', () => {
  test('output carries only paths and integers, never note contents', () => {
    withMemory({ 'notes/a.md': '---\ntitle: BODY_SENTINEL_VALUE\n---\nalpha BODY_SENTINEL_VALUE\n' }, (context) => {
      const result = runRank(context, [context.memoryRoot], { terms: ['alpha'] });

      assert.equal(result.status, 0, result.stderr);
      assert.ok(!result.stdout.includes('BODY_SENTINEL_VALUE'));
      assert.deepEqual(JSON.parse(result.stdout), {
        total: 1,
        selected: [{ path: 'notes/a.md', score: 0, tier: 0, occurrences: 1, pinned: false }],
        omitted: 0,
        rejected_candidates: 0,
        unsafe_paths: [],
      });
    });
  });

  test('CRLF frontmatter reads the same as LF', () => {
    withMemory({ 'notes/crlf.md': '---\r\nid: foo-id\r\ntitle: Some Title\r\n---\r\nalpha\r\nalpha\r\n' }, (context) => {
      assert.equal(scoreOf(rank(context, { terms: ['foo-id'] }), 'notes/crlf.md'), 5);
      assert.equal(scoreOf(rank(context, { terms: ['Some Title'] }), 'notes/crlf.md'), 3);
      assert.equal(rank(context, { terms: ['alpha'] }).selected[0].occurrences, 2);
    });
  });

  test('broken or unusual frontmatter falls back to the path and body', () => {
    withMemory(
      {
        'notes/broken.md': '---\nid: [unclosed\n---\nalpha\n',
        'notes/duplicate.md': '---\nid: alpha\nid: alpha\n---\nalpha\n',
        'notes/alias.md': '---\nbase: &anchor alpha\ntitle: *anchor\n---\nbody\n',
        'notes/unclosed.md': '---\nid: alpha\nbody without a closing marker\n',
        'notes/list-id.md': '---\nid:\n  - alpha\n---\nalpha\n',
      },
      (context) => {
        const ranking = rank(context, { terms: ['alpha'] });
        assert.equal(ranking.total, 5);
        assert.ok(ranking.selected.every((note) => note.score === 0));
      },
    );
  });

  test('a malformed request fails without repeating its input', () => {
    withMemory({ 'notes/a.md': 'alpha\n' }, (context) => {
      const secret = 'INPUT_SENTINEL_VALUE';
      const malformed = [
        `not json ${secret}`,
        `["${secret}"]`,
        JSON.stringify({ terms: [] }),
        JSON.stringify({ terms: [1] }),
        JSON.stringify({ terms: secret }),
        JSON.stringify({ terms: ['alpha'], candidates: secret }),
        JSON.stringify({ terms: ['alpha'], [secret]: true }),
        '',
      ];

      for (const request of malformed) {
        const result = runRank(context, [context.memoryRoot], request);
        expectFatal(result);
        assert.ok(!result.stderr.includes(secret));
      }
    });
  });

  test('short invalid JSON, which the parser would quote whole, is not repeated', () => {
    withMemory({ 'notes/a.md': 'alpha\n' }, (context) => {
      const result = runRank(context, [context.memoryRoot], 'SENT1NEL');
      expectFatal(result);
      assert.ok(!result.stderr.includes('SENT1NEL'));
    });
  });

  test('a request over the size limit is refused without repeating it', () => {
    withMemory({ 'notes/a.md': 'alpha\n' }, (context) => {
      const secret = 'INPUT_SENTINEL_VALUE';
      const result = runRank(context, [context.memoryRoot], JSON.stringify({ terms: [`${secret} `.repeat(60_000)] }));

      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.ok(!result.stderr.includes(secret));
    });
  });

  test('a very long term inside the size limit still ranks', () => {
    withMemory({ 'notes/a.md': 'alpha\n' }, (context) => {
      const singleToken = 'inputsentinel'.repeat(75_000);
      const manyTokens = Array.from({ length: 300_000 }, () => 'ab').join(' ');
      const pastTheRegularExpressionLimit = 'q'.repeat(975_000);
      const longCamelCaseWord = 'aB'.repeat(480_000);

      for (const term of [singleToken, manyTokens, pastTheRegularExpressionLimit, longCamelCaseWord]) {
        assert.equal(rank(context, { terms: [term] }).total, 0);
      }
    });
  });
});

describe('rank --print-term', () => {
  test('three spellings print one normal form without any root', () => {
    for (const term of ['Foo Bar', 'FooBar', 'foo-bar']) {
      const result = printTerm({ terms: [term] });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), '{"term":"foo bar"}');
    }
  });

  test('a file name prints the term of its note', () => {
    const result = printTerm({ terms: ['README.md'] });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '{"term":"readme"}');
  });

  test('a term outside the inert character set prints null', () => {
    for (const term of ['what?', '$(touch x)', '"quoted"', '   ', 'x'.repeat(65), 'a/b']) {
      const result = printTerm({ terms: [term] });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), '{"term":null}', term);
    }
  });

  test('real queries stay printable and nothing a shell would interpret gets through', () => {
    const printed = (term) => JSON.parse(printTerm({ terms: [term] }).stdout).term;

    assert.equal(printed('Tiếng Việt'), 'tiếng việt');
    assert.equal(printed('business rules'), 'business rules');
    assert.equal(printed('order-state_v1.2'), 'order state v1 2');
    assert.equal(printed('a\nb'), 'a b');
    for (const refused of ['', 'x'.repeat(65), 'a"b', '$(id)', 'a`b', 'a;b', 'a|b', 'a\\b', "a'b"]) {
      assert.equal(printed(refused), null, JSON.stringify(refused));
    }
  });

  test('it takes exactly one term and no candidates', () => {
    expectFatal(printTerm({ terms: ['a', 'b'] }));
    expectFatal(printTerm({ terms: ['a'], candidates: [] }));
  });
});

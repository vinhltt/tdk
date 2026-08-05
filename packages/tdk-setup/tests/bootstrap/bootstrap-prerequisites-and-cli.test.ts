import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BOOTSTRAP_PATH,
  cleanup,
  curlCalls,
  DEFAULT_TOOLS,
  forbiddenToolCalls,
  type BootstrapRepo,
  type GatedTool,
  makeBootstrapRepo,
  preinstallFakeBun,
  runBootstrap,
  snapshotRealHome,
} from './helpers/bootstrap-test-harness';

const repos: BootstrapRepo[] = [];

function newRepo(...args: Parameters<typeof makeBootstrapRepo>): BootstrapRepo {
  const repo = makeBootstrapRepo(...args);
  repos.push(repo);
  return repo;
}

afterEach(() => {
  while (repos.length > 0) cleanup(repos.pop()!);
});

function expectNothingMutated(repo: BootstrapRepo): void {
  expect(curlCalls(repo)).toHaveLength(0);
  expect(fs.existsSync(path.join(repo.root, '.tdk'))).toBe(false);
}

describe('bootstrap CLI surface', () => {
  test('--help exits 0 listing exactly the three supported invocations', () => {
    const repo = newRepo();
    const before = snapshotRealHome();

    const result = runBootstrap(repo, { args: ['--help'] });

    expect(result.code).toBe(0);
    const invocations = result.output.match(/bootstrap\.sh/g) ?? [];
    expect(invocations).toHaveLength(3);
    expect(result.output).toContain('bash bootstrap.sh --yes');
    expect(result.output).toContain('bash bootstrap.sh --help');
    expectNothingMutated(repo);
    expect(snapshotRealHome()).toEqual(before);
  });

  test('unknown flag exits non-zero with usage on stderr and mutates nothing', () => {
    const repo = newRepo();

    const result = runBootstrap(repo, { args: ['--force'] });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('--force');
    expect(result.stderr).toContain('Usage');
    expectNothingMutated(repo);
  });
});

describe('bash version floor (K3/K4 static contract)', () => {
  const source = fs.readFileSync(BOOTSTRAP_PATH, 'utf-8');
  const lines = source.split('\n');
  const firstIndexMatching = (pattern: RegExp): number => lines.findIndex((line) => pattern.test(line));

  test('the BASH_VERSINFO gate precedes every write and network-capable statement', () => {
    const gate = firstIndexMatching(/BASH_VERSINFO/);
    expect(gate).toBeGreaterThan(-1);

    // Command substitutions in the header resolve paths only; the gate must
    // precede anything that downloads, creates, or deletes.
    for (const pattern of [/\bcurl\b/, /\bmkdir\b/, /\brm -rf\b/, /bun install/]) {
      const first = firstIndexMatching(pattern);
      if (first === -1) continue;
      expect(first).toBeGreaterThan(gate);
    }
  });

  test('the failure message names both blocking constructs and an upgrade hint', () => {
    const gateBlock = source.slice(source.indexOf('BASH_VERSINFO'));
    expect(gateBlock).toContain('local -n');
    expect(gateBlock).toContain('uppercase parameter expansion');
    expect(gateBlock).toMatch(/4\.3/);
    expect(gateBlock.toLowerCase()).toMatch(/upgrade|install|brew|package manager/);
  });

  test('no Bash 4+ construct appears, so the gate itself can parse under Bash 3.2', () => {
    // Executing this contract is impossible here: BASH_VERSINFO is readonly and
    // only bash 5.2 and dash exist on this host, so an "oldest shell" run would
    // reuse the same interpreter as the rest of the suite and prove nothing.
    // Comments are stripped: the header documents the banned list, and a
    // comment cannot be parsed as a construct. Declarations are additionally
    // anchored to statement position so the version-gate message stays free to
    // name `local -n` as the reason Bash 4.3 is required.
    const code = source
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');

    const banned: Array<[string, RegExp]> = [
      ['declare -A', /^\s*declare\s+-A/m],
      ['uppercase expansion', /\$\{[A-Za-z_][A-Za-z0-9_]*\^\^/],
      ['lowercase expansion', /\$\{[A-Za-z_][A-Za-z0-9_]*,,/],
      ['mapfile', /\bmapfile\b/],
      ['readarray', /\breadarray\b/],
      ['append-both-streams', /&>>/],
      ['[[ -v ]]', /\[\[\s+-v\s/],
      ['nameref', /^\s*local\s+-n\b/m],
      ['negative array index', /\$\{[A-Za-z_][A-Za-z0-9_]*\[-[0-9]/],
      ['fallthrough case', /;;&/],
    ];
    for (const [label, pattern] of banned) {
      expect([label, pattern.test(code)]).toEqual([label, false]);
    }
  });
});

describe('pin validation runs before any network access', () => {
  const invalidPins: Array<[string, string | null]> = [
    ['missing file', null],
    ['empty', ''],
    ['whitespace only', '   \n'],
    ['v-prefixed', 'v1.3.14\n'],
    ['two-component', '1.3\n'],
    ['latest', 'latest\n'],
    ['trailing garbage', '1.3.14 extra\n'],
    ['multi-line', '1.3.14\n2.0.0\n'],
  ];

  for (const [label, pinFile] of invalidPins) {
    test(`rejects ${label} with the installer provably uninvoked`, () => {
      const repo = newRepo({ pinFile });

      const result = runBootstrap(repo, { args: ['--yes'] });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toMatch(/\.bun-version/);
      expectNothingMutated(repo);
    });
  }

  test('accepts a valid pin and reaches the acquisition step', () => {
    const repo = newRepo({ pinFile: '1.3.14\n' });

    const result = runBootstrap(repo, { args: ['--yes'] });

    expect(result.code).toBe(0);
    expect(curlCalls(repo).length).toBeGreaterThan(0);
  });
});

describe('non-interactive consent', () => {
  test('non-TTY stdin without --yes fails fast when Bun is absent', () => {
    const repo = newRepo();

    const result = runBootstrap(repo);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('--yes');
    expectNothingMutated(repo);
  });

  test('non-TTY stdin without --yes fails even when the repo-local Bun is reusable', () => {
    const repo = newRepo();
    preinstallFakeBun(repo);

    const result = runBootstrap(repo);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('--yes');
    expect(curlCalls(repo)).toHaveLength(0);
  });
});

describe('unsupported platforms', () => {
  for (const ostype of ['msys', 'mingw64']) {
    test(`OSTYPE ${ostype} exits early with a manual-install pointer and no download`, () => {
      const repo = newRepo();

      const result = runBootstrap(repo, { args: ['--yes'], env: { OSTYPE: ostype } });

      expect(result.code).not.toBe(0);
      expect(result.stderr.toLowerCase()).toContain('manual');
      expect(result.stderr).toContain('bun.sh');
      expectNothingMutated(repo);
    });
  }
});

describe('prerequisite gate', () => {
  const without = (tool: GatedTool | GatedTool[]): GatedTool[] => {
    const removed = Array.isArray(tool) ? tool : [tool];
    return DEFAULT_TOOLS.filter((candidate) => !removed.includes(candidate));
  };

  const missingCases: Array<[string, GatedTool[], RegExp]> = [
    ['curl', without('curl'), /curl/],
    ['unzip', without('unzip'), /unzip/],
    ['timeout and gtimeout', without('timeout'), /timeout/],
    ['sha256sum and shasum', without('sha256sum'), /sha256|shasum/i],
  ];

  for (const [label, tools, expected] of missingCases) {
    test(`missing ${label} fails before consent and before any network access`, () => {
      const repo = newRepo({ tools });

      const result = runBootstrap(repo, { args: ['--yes'] });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toMatch(expected);
      expectNothingMutated(repo);
      expect(forbiddenToolCalls(repo)).toHaveLength(0);
    });
  }

  const alternativeCases: Array<[string, GatedTool[]]> = [
    ['gtimeout instead of timeout', ['curl', 'unzip', 'gtimeout', 'sha256sum']],
    ['shasum instead of sha256sum', ['curl', 'unzip', 'timeout', 'shasum']],
  ];

  for (const [label, tools] of alternativeCases) {
    test(`accepts ${label}`, () => {
      const repo = newRepo({ tools });

      const result = runBootstrap(repo, { args: ['--yes'] });

      expect(result.code).toBe(0);
      expect(forbiddenToolCalls(repo)).toHaveLength(0);
    });
  }

  test('never invokes a package manager to satisfy a missing prerequisite', () => {
    const repo = newRepo({ tools: without(['curl', 'unzip']) });

    runBootstrap(repo, { args: ['--yes'] });

    expect(forbiddenToolCalls(repo)).toHaveLength(0);
  });
});

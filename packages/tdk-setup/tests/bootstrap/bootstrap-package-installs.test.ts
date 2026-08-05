import { afterEach, describe, expect, test } from 'bun:test';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  artifactDigest,
  cleanup,
  failInstallIn,
  installInvocations,
  type BootstrapRepo,
  makeBootstrapRepo,
  runBootstrap,
} from './helpers/bootstrap-test-harness';

const repos: BootstrapRepo[] = [];

function newRepo(): BootstrapRepo {
  const repo = makeBootstrapRepo();
  repos.push(repo);
  return repo;
}

afterEach(() => {
  while (repos.length > 0) cleanup(repos.pop()!);
});

const PACKAGE_ORDER = ['.specify/scripts/ts', 'packages/tdk-setup'];

describe('frozen dependency installs', () => {
  test('runs both packages in order with the absolute repo-local Bun', () => {
    const repo = newRepo();

    const result = runBootstrap(repo, { args: ['--yes'] });

    expect(result.code).toBe(0);
    const installs = installInvocations(repo);
    expect(installs).toHaveLength(2);
    expect(installs.map((invocation) => path.relative(repo.root, invocation.cwd))).toEqual(PACKAGE_ORDER);

    for (const invocation of installs) {
      expect(invocation.argv).toEqual(['install', '--frozen-lockfile']);
      expect(invocation.bunInstall).toBe(repo.bunDir);
      expect(invocation.home).not.toBe(os.homedir());
    }
  });

  test('never loosens the lockfile contract', () => {
    const repo = newRepo();

    runBootstrap(repo, { args: ['--yes'] });

    const argv = installInvocations(repo).flatMap((invocation) => invocation.argv);
    for (const loosening of ['--no-save', '--frozen-lockfile=false', '--force', '--no-frozen-lockfile']) {
      expect(argv).not.toContain(loosening);
    }
  });

  test('the second package is not attempted when the first fails', () => {
    const repo = newRepo();
    failInstallIn(repo, 'ts');

    const result = runBootstrap(repo, { args: ['--yes'] });

    expect(result.code).not.toBe(0);
    const installs = installInvocations(repo);
    expect(installs).toHaveLength(1);
    expect(path.relative(repo.root, installs[0]!.cwd)).toBe('.specify/scripts/ts');
    expect(result.output).toContain('not attempted');
    expect(result.output).not.toMatch(/packages\/tdk-setup\s*:?\s*(ok|success|skipped)/i);
  });

  test('artifact files are byte-identical after a successful run', () => {
    const repo = newRepo();
    const before = artifactDigest(repo);

    expect(runBootstrap(repo, { args: ['--yes'] }).code).toBe(0);

    expect(artifactDigest(repo)).toEqual(before);
  });

  test('artifact files are byte-identical after a failed run', () => {
    const repo = newRepo();
    const before = artifactDigest(repo);
    failInstallIn(repo, 'ts');

    expect(runBootstrap(repo, { args: ['--yes'] }).code).not.toBe(0);

    expect(artifactDigest(repo)).toEqual(before);
  });
});

describe('handoff summary', () => {
  test('a successful run prints the runtime export and the next distribute command', () => {
    const repo = newRepo();

    const result = runBootstrap(repo, { args: ['--yes'] });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('BUN_INSTALL');
    expect(result.stdout).toContain('.tdk/bun');
    expect(result.stdout).toContain('PATH');
    expect(result.stdout).toContain('distribute.sh');
  });

  test('a failed run omits the next command and names remediation instead', () => {
    const repo = newRepo();
    failInstallIn(repo, 'tdk-setup');

    const result = runBootstrap(repo, { args: ['--yes'] });

    expect(result.code).not.toBe(0);
    expect(result.output).not.toContain('distribute.sh');
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

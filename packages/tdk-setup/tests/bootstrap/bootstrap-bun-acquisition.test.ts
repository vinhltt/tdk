import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  cleanup,
  curlCalls,
  DEFAULT_PIN,
  forceReportedBunVersion,
  installerEnv,
  installerRuns,
  type BootstrapRepo,
  makeBootstrapRepo,
  preinstallFakeBun,
  runBootstrap,
  snapshotRealHome,
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

describe('repo-local Bun acquisition', () => {
  test('installs to $REPO_ROOT/.tdk/bun with an isolated installer environment', () => {
    const repo = newRepo();
    const homeBefore = snapshotRealHome();

    const result = runBootstrap(repo, { args: ['--yes'] });

    expect(result.code).toBe(0);
    expect(installerRuns(repo)).toBe(1);

    const env = installerEnv(repo);
    expect(env.tag).toBe(`bun-v${DEFAULT_PIN}`);
    expect(env.BUN_INSTALL).toBe(repo.bunDir);

    // The installer writes shell profiles based on $HOME, $SHELL and
    // $XDG_CONFIG_HOME. All three must point away from the developer's machine.
    expect(env.HOME).not.toBe(os.homedir());
    expect(env.HOME).not.toBe(repo.fakeHome);
    expect(env.HOME.startsWith(repo.root)).toBe(true);
    expect(path.basename(env.SHELL)).not.toMatch(/^(bash|zsh|fish)$/);
    expect(env.XDG_CONFIG_HOME.startsWith(repo.root)).toBe(true);

    expect(fs.existsSync(repo.bunBin)).toBe(true);
    expect(snapshotRealHome()).toEqual(homeBefore);
  });

  test('declined consent never invokes the installer and writes nothing', () => {
    const repo = newRepo();

    const result = runBootstrap(repo, { tty: true, consent: 'n' });

    expect(result.code).not.toBe(0);
    expect(curlCalls(repo)).toHaveLength(0);
    expect(installerRuns(repo)).toBe(0);
    expect(fs.existsSync(repo.bunBin)).toBe(false);
  });

  test('approved interactive consent proceeds through acquisition', () => {
    const repo = newRepo();

    const result = runBootstrap(repo, { tty: true, consent: 'y' });

    expect(result.code).toBe(0);
    expect(installerRuns(repo)).toBe(1);
  });

  test('consent discloses the source, destination, and absence of verification', () => {
    const repo = newRepo();

    const result = runBootstrap(repo, { tty: true, consent: 'n' });

    expect(result.output).toContain('https://bun.sh/install');
    expect(result.output).toContain('.tdk/bun');
    expect(result.output.toLowerCase()).toMatch(/no checksum or signature is verified/);
    expect(result.output.toLowerCase()).toContain('registry');
    expect(result.output.toLowerCase()).toMatch(/lifecycle/);
    // K11: never claim integrity the script does not provide. Every mention of
    // verification must be the disclaimer above, never a standalone assurance.
    expect(result.output.toLowerCase()).not.toContain('pinned installer');
    expect(result.output.toLowerCase().match(/verif/g) ?? []).toHaveLength(1);
  });

  test('a repo-local Bun already at the pin is reused with zero downloads', () => {
    const repo = newRepo();
    preinstallFakeBun(repo);

    const result = runBootstrap(repo, { args: ['--yes'] });

    expect(result.code).toBe(0);
    expect(curlCalls(repo)).toHaveLength(0);
    expect(installerRuns(repo)).toBe(0);
  });

  test('a second consented run is idempotent and downloads nothing', () => {
    const repo = newRepo();

    expect(runBootstrap(repo, { args: ['--yes'] }).code).toBe(0);
    expect(installerRuns(repo)).toBe(1);

    expect(runBootstrap(repo, { args: ['--yes'] }).code).toBe(0);
    expect(installerRuns(repo)).toBe(1);
  });

  test('a version-mismatched repo-local Bun is reacquired without a second prompt', () => {
    const repo = newRepo();
    preinstallFakeBun(repo, { version: '1.2.0' });

    const result = runBootstrap(repo, { args: ['--yes'] });

    expect(result.code).toBe(0);
    expect(installerRuns(repo)).toBe(1);
  });

  test('an unprobeable repo-local Bun is reacquired without a second prompt', () => {
    const repo = newRepo();
    // The stale binary itself refuses to report a version; the reinstall
    // replaces it, so only the discarded copy was ever broken.
    preinstallFakeBun(repo, { unprobeable: true });

    const result = runBootstrap(repo, { args: ['--yes'] });

    expect(result.code).toBe(0);
    expect(installerRuns(repo)).toBe(1);
  });

  test('post-install verification failure reports destination, versions, and the remedy', () => {
    const repo = newRepo();
    forceReportedBunVersion(repo, '9.9.9');

    const result = runBootstrap(repo, { args: ['--yes'] });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(repo.bunDir);
    expect(result.stderr).toContain(DEFAULT_PIN);
    expect(result.stderr).toContain('9.9.9');
    expect(result.stderr).toContain('rm -rf .tdk/bun');
    // K8: report and stop. No snapshot, no rollback, no restore attempt.
    expect(result.output.toLowerCase()).not.toMatch(/rollback|restor(e|ing)|snapshot/);
  });
});

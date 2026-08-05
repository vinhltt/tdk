import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Harness for spawning the real bootstrap.sh against a throwaway repo fixture.
 *
 * Two isolation properties are load-bearing and must never be relaxed:
 * the spawned environment is built from scratch (so an ambient BUN_INSTALL
 * exported by .specify/setup.sh cannot redirect a test into a real directory),
 * and PATH contains only the harness bin directory (so every external tool the
 * script can reach is one this harness decided to provide).
 */

export const REPO_ROOT = path.resolve(import.meta.dir, '..', '..', '..', '..', '..');
export const BOOTSTRAP_PATH = path.join(REPO_ROOT, 'bootstrap.sh');
export const DEFAULT_PIN = '1.3.14';

const REAL_BASH = '/usr/bin/bash';

/** Tools whose presence the bootstrap prerequisite gate is allowed to check. */
export type GatedTool = 'curl' | 'unzip' | 'timeout' | 'gtimeout' | 'sha256sum' | 'shasum';

export const DEFAULT_TOOLS: GatedTool[] = ['curl', 'unzip', 'timeout', 'sha256sum'];

export interface BootstrapRepo {
  root: string;
  bunDir: string;
  bunBin: string;
  recordDir: string;
  binDir: string;
  fakeHome: string;
}

export interface BunInvocation {
  cwd: string;
  argv: string[];
  bunInstall: string;
  home: string;
  shell: string;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  output: string;
}

export interface MakeRepoOptions {
  /** Raw .bun-version content. Omit for a valid pinned file; null skips the file. */
  pinFile?: string | null;
  tools?: GatedTool[];
}

export function makeBootstrapRepo(options: MakeRepoOptions = {}): BootstrapRepo {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdk-bootstrap-'));
  const recordDir = path.join(root, '__record');
  const binDir = path.join(root, '__bin');
  const fakeHome = path.join(root, '__home');
  fs.mkdirSync(recordDir);
  fs.mkdirSync(binDir);
  fs.mkdirSync(fakeHome);

  fs.copyFileSync(BOOTSTRAP_PATH, path.join(root, 'bootstrap.sh'));

  const pinFile = options.pinFile === undefined ? `${DEFAULT_PIN}\n` : options.pinFile;
  if (pinFile !== null) fs.writeFileSync(path.join(root, '.bun-version'), pinFile, 'utf-8');

  for (const pkg of ['.specify/scripts/ts', 'packages/tdk-setup']) {
    const dir = path.join(root, pkg);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), `{"name":"${path.basename(pkg)}","private":true}\n`, 'utf-8');
    fs.writeFileSync(path.join(dir, 'bun.lock'), '{"lockfileVersion":1}\n', 'utf-8');
  }

  writeHarnessBin(binDir, recordDir, options.tools ?? DEFAULT_TOOLS);

  return { root, recordDir, binDir, fakeHome, bunDir: path.join(root, '.tdk', 'bun'), bunBin: path.join(root, '.tdk', 'bun', 'bin', 'bun') };
}

/** Core utilities the script needs regardless of the prerequisite gate under test. */
const CORE_TOOLS = ['bash', 'cat', 'rm', 'mkdir', 'dirname', 'basename', 'chmod'];

/** Package managers that must never be invoked — bootstrap installs no OS packages. */
const FORBIDDEN_TOOLS = ['sudo', 'apt', 'apt-get', 'brew', 'yum'];

function writeScript(file: string, body: string): void {
  fs.writeFileSync(file, body, 'utf-8');
  fs.chmodSync(file, 0o755);
}

function writeHarnessBin(binDir: string, recordDir: string, tools: GatedTool[]): void {
  for (const tool of CORE_TOOLS) {
    const real = `/usr/bin/${tool}`;
    if (fs.existsSync(real)) fs.symlinkSync(real, path.join(binDir, tool));
  }

  for (const tool of FORBIDDEN_TOOLS) {
    writeScript(path.join(binDir, tool), `#!${REAL_BASH}\necho "${tool} $*" >> "${recordDir}/forbidden.log"\nexit 1\n`);
  }

  const has = (tool: GatedTool) => tools.includes(tool);

  if (has('curl')) writeScript(path.join(binDir, 'curl'), fakeCurl(recordDir));
  if (has('unzip')) writeScript(path.join(binDir, 'unzip'), `#!${REAL_BASH}\nexit 0\n`);
  if (has('timeout')) fs.symlinkSync('/usr/bin/timeout', path.join(binDir, 'timeout'));
  // gtimeout/shasum do not exist on Linux; stub them onto the GNU tools so the
  // "accepted alternative" half of the prerequisite gate is exercised for real.
  if (has('gtimeout')) writeScript(path.join(binDir, 'gtimeout'), `#!${REAL_BASH}\nexec /usr/bin/timeout "$@"\n`);
  if (has('sha256sum')) fs.symlinkSync('/usr/bin/sha256sum', path.join(binDir, 'sha256sum'));
  if (has('shasum')) writeScript(path.join(binDir, 'shasum'), `#!${REAL_BASH}\nexec /usr/bin/sha256sum "$@"\n`);
}

/**
 * Fake curl. Serves the fake Bun installer for the official installer URL and
 * records every invocation so tests can prove the network was never reached.
 */
function fakeCurl(recordDir: string): string {
  return `#!${REAL_BASH}
echo "curl $*" >> "${recordDir}/curl.log"
for arg in "$@"; do
  case "$arg" in
    *bun.sh/install*) cat <<'INSTALLER'
${fakeInstaller(recordDir)}
INSTALLER
      exit 0 ;;
  esac
done
exit 1
`;
}

/**
 * Fake Bun installer, piped into bash by bootstrap exactly like the real one.
 * Records the environment it was handed, then materializes the fake binary.
 */
function fakeInstaller(recordDir: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail
{
  echo "tag=\${1:-}"
  echo "BUN_INSTALL=\${BUN_INSTALL:-}"
  echo "HOME=\${HOME:-}"
  echo "SHELL=\${SHELL:-}"
  echo "XDG_CONFIG_HOME=\${XDG_CONFIG_HOME:-}"
  echo "PWD=$PWD"
} >> "${recordDir}/installer.env"
echo "install" >> "${recordDir}/installer.log"
printf '%s\\n' "\${1#bun-v}" > "${recordDir}/bun-version"
mkdir -p "\${BUN_INSTALL}/bin"
cat > "\${BUN_INSTALL}/bin/bun" <<'FAKEBUN'
${fakeBun(recordDir)}
FAKEBUN
chmod +x "\${BUN_INSTALL}/bin/bun"`;
}

/**
 * Fake Bun binary. Reports a version the test controls and records the full
 * (cwd, argv, BUN_INSTALL, HOME, SHELL) tuple for every invocation.
 */
function fakeBun(recordDir: string): string {
  return `#!${REAL_BASH}
RECORD="${recordDir}"
printf '{"cwd":"%s","argv":"%s","bunInstall":"%s","home":"%s","shell":"%s"}\\n' \\
  "$PWD" "$*" "\${BUN_INSTALL:-}" "\${HOME:-}" "\${SHELL:-}" >> "$RECORD/bun-invocations.jsonl"
if [[ "\${1:-}" == "--version" ]]; then
  cat "$RECORD/bun-version-override" 2>/dev/null \\
    || cat "$RECORD/bun-version" 2>/dev/null \\
    || echo "${DEFAULT_PIN}"
  exit 0
fi
if [[ "\${1:-}" == "install" ]]; then
  if [[ -f "$RECORD/fail-$(basename "$PWD")" ]]; then exit 1; fi
  exit 0
fi
exit 0`;
}

export interface RunOptions {
  args?: string[];
  /** Reply fed to the interactive consent prompt. Requires a pty. */
  consent?: string;
  /** Allocate a pty so the script sees an interactive stdin. */
  tty?: boolean;
  env?: Record<string, string>;
}

export function runBootstrap(repo: BootstrapRepo, options: RunOptions = {}): RunResult {
  const env: Record<string, string> = {
    PATH: repo.binDir,
    HOME: repo.fakeHome,
    ...options.env,
  };
  const args = options.args ?? [];

  if (options.tty) {
    // util-linux script(1) is the only pty allocator available here; the
    // consent gate's [ -t 0 ] branch cannot be exercised through a pipe.
    const command = ['bash', 'bootstrap.sh', ...args].map(shellQuote).join(' ');
    const result = Bun.spawnSync(['/usr/bin/script', '-qec', command, '/dev/null'], {
      cwd: repo.root,
      env,
      stdin: new TextEncoder().encode(`${options.consent ?? ''}\n`),
    });
    const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    return { code: result.exitCode, stdout: output, stderr: output, output };
  }

  const result = Bun.spawnSync(['bash', 'bootstrap.sh', ...args], {
    cwd: repo.root,
    env,
    stdin: 'ignore',
  });
  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);
  return { code: result.exitCode, stdout, stderr, output: stdout + stderr };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function curlCalls(repo: BootstrapRepo): string[] {
  return readLines(path.join(repo.recordDir, 'curl.log'));
}

export function installerRuns(repo: BootstrapRepo): number {
  return readLines(path.join(repo.recordDir, 'installer.log')).length;
}

export function installerEnv(repo: BootstrapRepo): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readLines(path.join(repo.recordDir, 'installer.env'))) {
    const index = line.indexOf('=');
    if (index > 0) env[line.slice(0, index)] = line.slice(index + 1);
  }
  return env;
}

export function bunInvocations(repo: BootstrapRepo): BunInvocation[] {
  return readLines(path.join(repo.recordDir, 'bun-invocations.jsonl')).map((line) => {
    const raw = JSON.parse(line) as { cwd: string; argv: string; bunInstall: string; home: string; shell: string };
    return { cwd: raw.cwd, argv: raw.argv.split(' ').filter(Boolean), bunInstall: raw.bunInstall, home: raw.home, shell: raw.shell };
  });
}

export function installInvocations(repo: BootstrapRepo): BunInvocation[] {
  return bunInvocations(repo).filter((invocation) => invocation.argv[0] === 'install');
}

export function forbiddenToolCalls(repo: BootstrapRepo): string[] {
  return readLines(path.join(repo.recordDir, 'forbidden.log'));
}

/** Pin what the binary reports regardless of what was installed. */
export function forceReportedBunVersion(repo: BootstrapRepo, version: string): void {
  fs.writeFileSync(path.join(repo.recordDir, 'bun-version-override'), `${version}\n`, 'utf-8');
}

export function failInstallIn(repo: BootstrapRepo, directoryName: string): void {
  fs.writeFileSync(path.join(repo.recordDir, `fail-${directoryName}`), '', 'utf-8');
}

/** Pre-place a repo-local Bun as if a previous run had installed it. */
export function preinstallFakeBun(repo: BootstrapRepo, options: { version?: string; unprobeable?: boolean } = {}): void {
  fs.mkdirSync(path.dirname(repo.bunBin), { recursive: true });
  if (options.unprobeable) {
    writeScript(repo.bunBin, `#!${REAL_BASH}\nexit 1\n`);
    return;
  }
  writeScript(repo.bunBin, fakeBun(repo.recordDir));
  fs.writeFileSync(path.join(repo.recordDir, 'bun-version'), `${options.version ?? DEFAULT_PIN}\n`, 'utf-8');
}

export interface PathDigest {
  [relativePath: string]: string;
}

/** Digest of the artifact files that must survive both success and failure runs. */
export function artifactDigest(repo: BootstrapRepo): PathDigest {
  const digest: PathDigest = {};
  for (const pkg of ['.specify/scripts/ts', 'packages/tdk-setup']) {
    for (const file of ['package.json', 'bun.lock']) {
      const relative = `${pkg}/${file}`;
      digest[relative] = Bun.hash(fs.readFileSync(path.join(repo.root, relative))).toString(16);
    }
  }
  return digest;
}

/** Snapshot of the developer's real home entries the installer could plausibly touch. */
export interface HomeSnapshot {
  [entry: string]: string;
}

const REAL_HOME_ENTRIES = ['.bun', '.bashrc', '.zshrc', '.bash_profile', '.profile', '.config/fish/config.fish'];

export function snapshotRealHome(): HomeSnapshot {
  const home = os.homedir();
  const snapshot: HomeSnapshot = {};
  for (const entry of REAL_HOME_ENTRIES) {
    const target = path.join(home, entry);
    snapshot[entry] = fs.existsSync(target) ? `${fs.statSync(target).mtimeMs}:${fs.statSync(target).size}` : 'absent';
  }
  return snapshot;
}

function readLines(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8').split('\n').filter((line) => line.length > 0);
}

export function cleanup(repo: BootstrapRepo): void {
  fs.rmSync(repo.root, { recursive: true, force: true });
}

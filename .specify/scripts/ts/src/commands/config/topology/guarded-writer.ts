import {
  chmodSync,
  chownSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';
import { basename, join, relative, sep } from 'node:path';
import { CliExitError, EXIT_FAIL_CLOSED, EXIT_STALE_PLAN } from '../../../utils/exit-codes';
import { syncParentDirectory } from '../../util/parent-directory-sync';
import { hashBytes, type ApplyPlan } from './apply-plan';
import { redactConfigForOutput, type SafeWriterPaths } from './apply-security';
import { formatTopologyDiff } from './patch';

const BACKUP_RETENTION_COUNT = 10;
const BACKUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface LockHandle {
  lockDir: string;
  release: () => void;
}

export type Recoverability =
  | { kind: 'git-tracked-clean'; repoRoot: string; relativeTarget: string; gitDiff: string }
  | { kind: 'git-tracked-dirty'; repoRoot: string; relativeTarget: string }
  | { kind: 'git-untracked-present'; repoRoot?: string; relativeTarget?: string }
  | { kind: 'non-git' };

export interface ChangedFile {
  path: string;
  action: 'write';
  beforeHash: string;
  afterHash: string;
}

export interface WriteResult {
  mode: 'apply';
  runId: string;
  status: 'applied';
  changedFiles: ChangedFile[];
  backupPath?: string;
  reportPath?: string;
  recoverability: Recoverability['kind'];
  warnings: string[];
  exitCode: 0;
}

function toPosixPath(path: string): string {
  return path.split(sep).join('/');
}

function runGit(workspaceRootRealPath: string, args: string[]): string {
  return execFileSync('git', ['-C', workspaceRootRealPath, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function readTargetHashNoFollow(targetPath: string): string {
  const stat = lstatSync(targetPath);
  if (stat.isSymbolicLink()) {
    throw new CliExitError(`Config target became a symlink: ${targetPath}`, EXIT_STALE_PLAN, 'final-stale-check');
  }
  const fd = openSync(targetPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return hashBytes(readFileSync(fd));
  } finally {
    closeSync(fd);
  }
}

function tryBreakDeadLock(lockDir: string, expectedRawBeforeHash: string, targetPath: string): boolean {
  const metadata = readJson(join(lockDir, 'metadata.json'));
  if (!metadata) {
    return false;
  }
  const pid = typeof metadata.pid === 'number' ? metadata.pid : undefined;
  const lockHost = typeof metadata.hostname === 'string' ? metadata.hostname : undefined;
  if (pid === undefined || lockHost !== hostname() || isProcessAlive(pid)) {
    return false;
  }
  if (readTargetHashNoFollow(targetPath) !== expectedRawBeforeHash) {
    return false;
  }
  rmSync(lockDir, { recursive: true, force: true });
  return true;
}

export function acquireApplyLock(paths: SafeWriterPaths, metadata: Record<string, unknown>): LockHandle {
  try {
    mkdirSync(paths.lockDir, { mode: 0o700 });
  } catch (error) {
    const expectedHash = typeof metadata.expectedRawBeforeHash === 'string' ? metadata.expectedRawBeforeHash : '';
    if (expectedHash && existsSync(paths.lockDir) && tryBreakDeadLock(paths.lockDir, expectedHash, paths.configPath)) {
      mkdirSync(paths.lockDir, { mode: 0o700 });
    } else {
      const existingMetadata = existsSync(paths.lockDir)
        ? readFileSync(join(paths.lockDir, 'metadata.json'), 'utf-8')
        : 'metadata unavailable';
      throw new CliExitError(
        `Topology apply lock exists at ${paths.lockDir}. Metadata: ${existingMetadata}. Manual cleanup after verifying no apply is running: rm -rf "${paths.lockDir}"`,
        EXIT_FAIL_CLOSED,
        'apply-lock',
      );
    }
  }

  writeFileSync(join(paths.lockDir, 'metadata.json'), JSON.stringify({
    ...metadata,
    pid: process.pid,
    hostname: hostname(),
    startedAt: new Date().toISOString(),
  }, null, 2), { mode: 0o600 });

  return {
    lockDir: paths.lockDir,
    release: () => rmSync(paths.lockDir, { recursive: true, force: true }),
  };
}

export function assessRecoverability(workspaceRootRealPath: string, targetRealPath: string): Recoverability {
  let repoRoot: string;
  try {
    repoRoot = realpathSync.native(runGit(workspaceRootRealPath, ['rev-parse', '--show-toplevel']));
  } catch {
    return { kind: 'non-git' };
  }

  const targetRelative = relative(repoRoot, targetRealPath);
  if (targetRelative.startsWith('..') || targetRelative === '' || targetRelative.startsWith(`..${sep}`)) {
    return { kind: 'non-git' };
  }
  const relativeTarget = toPosixPath(targetRelative);

  try {
    runGit(workspaceRootRealPath, ['ls-files', '--error-unmatch', '--', relativeTarget]);
  } catch {
    return { kind: 'git-untracked-present', repoRoot, relativeTarget };
  }

  try {
    runGit(workspaceRootRealPath, ['rev-parse', '--verify', 'HEAD']);
  } catch {
    return { kind: 'git-untracked-present', repoRoot, relativeTarget };
  }

  const status = runGit(workspaceRootRealPath, ['status', '--porcelain', '--', relativeTarget]);
  if (status.length > 0) {
    return { kind: 'git-tracked-dirty', repoRoot, relativeTarget };
  }

  const gitDiff = runGit(workspaceRootRealPath, ['diff', '--no-color', 'HEAD', '--', relativeTarget]);
  return { kind: 'git-tracked-clean', repoRoot, relativeTarget, gitDiff };
}

function atomicWriteJson(plan: ApplyPlan, paths: SafeWriterPaths): string {
  const serialized = `${JSON.stringify(plan.writeConfig, null, 2)}\n`;
  const afterHash = hashBytes(serialized);
  const targetMode = plan.targetStat.mode & 0o777 || 0o600;
  let fd: number | undefined;
  try {
    fd = openSync(
      paths.tempPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      targetMode,
    );
    writeFileSync(fd, serialized, 'utf-8');
    fchmodSync(fd, targetMode);
    try {
      chownSync(paths.tempPath, plan.targetStat.uid, plan.targetStat.gid);
    } catch {
      // Ownership preservation is best-effort; mode preservation is mandatory.
    }
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) {
      closeSync(fd);
    }
  }

  const currentHash = readTargetHashNoFollow(paths.configPath);
  const currentStat = lstatSync(paths.configPath);
  if (
    currentHash !== plan.rawBeforeHash
    || currentStat.dev !== plan.targetStat.dev
    || currentStat.ino !== plan.targetStat.ino
  ) {
    rmSync(paths.tempPath, { force: true });
    throw new CliExitError('Config changed after dry-run preview; rerun dry-run and apply with the new planHash.', EXIT_STALE_PLAN, 'final-stale-check');
  }

  renameSync(paths.tempPath, paths.configPath);
  chmodSync(paths.configPath, targetMode);
  syncParentDirectory(paths.configPath);
  return afterHash;
}

function ensureSelfIgnoringBackupsDir(backupsDir: string): void {
  mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
  const gitignore = join(backupsDir, '.gitignore');
  if (!existsSync(gitignore)) {
    writeFileSync(gitignore, '*\n', { mode: 0o600 });
  }
}

function writeRawBackup(paths: SafeWriterPaths, rawBeforeText: string): string {
  try {
    ensureSelfIgnoringBackupsDir(paths.backupsDir);
    writeFileSync(paths.backupPath, rawBeforeText, { mode: 0o600 });
    return paths.backupPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliExitError(`Could not create rollback backup before writing config: ${message}`, EXIT_FAIL_CLOSED, 'backup');
  }
}

function pruneBackups(backupsDir: string, currentBackupPath?: string, now = new Date()): void {
  if (!existsSync(backupsDir)) {
    return;
  }
  const currentName = currentBackupPath ? basename(currentBackupPath) : undefined;
  const backups = readdirSync(backupsDir)
    .filter((name) => name.endsWith('-specify.json.bak'))
    .map((name) => {
      const path = join(backupsDir, name);
      return { name, path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  backups.forEach((backup, index) => {
    if (backup.name === currentName) {
      return;
    }
    const tooMany = index >= BACKUP_RETENTION_COUNT;
    const tooOld = now.getTime() - backup.mtimeMs > BACKUP_RETENTION_MS;
    if (tooMany || tooOld) {
      rmSync(backup.path, { force: true });
    }
  });
}

function manualRevertCommand(recoverability: Recoverability, configPath: string, backupPath?: string): string {
  if (backupPath) {
    return `cp "${backupPath}" "${configPath}"`;
  }
  if (recoverability.kind === 'git-tracked-clean') {
    return `git -C "${recoverability.repoRoot}" checkout -- "${recoverability.relativeTarget}"`;
  }
  return 'No automatic rollback command available';
}

function renderReport(input: {
  plan: ApplyPlan;
  recoverability: Recoverability;
  backupPath?: string;
  afterHash: string;
  now: Date;
}): string {
  const redactedBefore = redactConfigForOutput(input.plan.before);
  const redactedAfter = redactConfigForOutput(input.plan.schemaAfter);
  return [
    '# Topology Apply Report',
    '',
    `- runId: ${input.plan.runId}`,
    `- timestamp: ${input.now.toISOString()}`,
    `- topology: ${input.plan.topologyPath}`,
    `- config: ${input.plan.configPath}`,
    `- beforeHash: ${input.plan.rawBeforeHash}`,
    `- afterHash: ${input.afterHash}`,
    `- recoverability: ${input.recoverability.kind}`,
    `- backupPath: ${input.backupPath ?? 'none'}`,
    `- manualRevert: ${manualRevertCommand(input.recoverability, input.plan.configPath, input.backupPath)}`,
    '',
    '## Redacted Diff',
    '',
    '```diff',
    formatTopologyDiff(redactedBefore as never, redactedAfter as never),
    '```',
    '',
  ].join('\n');
}

function writeReport(paths: SafeWriterPaths, report: string): string {
  writeFileSync(paths.reportPath, report, { mode: 0o600 });
  return paths.reportPath;
}

export function applyPlan(plan: ApplyPlan, paths: SafeWriterPaths, opts: { now?: () => Date } = {}): WriteResult {
  const warnings: string[] = [];
  const now = opts.now?.() ?? new Date();
  const recoverability = assessRecoverability(plan.workspaceRootRealPath, plan.configRealPath);
  const backupPath = recoverability.kind === 'git-tracked-clean'
    ? undefined
    : writeRawBackup(paths, plan.rawBeforeText);
  const afterHash = atomicWriteJson(plan, paths);

  let reportPath: string | undefined;
  try {
    reportPath = writeReport(paths, renderReport({ plan, recoverability, backupPath, afterHash, now }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`topology-apply-report.md could not be written after config apply: ${message}`);
  }

  try {
    pruneBackups(paths.backupsDir, backupPath, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`backup retention pruning failed: ${message}`);
  }

  return {
    mode: 'apply',
    runId: plan.runId,
    status: 'applied',
    changedFiles: [{
      path: plan.configPath,
      action: 'write',
      beforeHash: plan.rawBeforeHash,
      afterHash,
    }],
    backupPath,
    reportPath,
    recoverability: recoverability.kind,
    warnings,
    exitCode: 0,
  };
}

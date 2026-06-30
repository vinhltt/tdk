import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { hostname } from 'node:os';
import { CliExitError, type CliExitCode, EXIT_VALIDATION } from '../../../utils/exit-codes';
import { hashBytes } from './apply-plan';

const MAX_SEARCH_DEPTH = 20;
const WORKSPACE_LAYOUT_DIR = ['.specify', 'configurations', 'workspace-layout'];
const WORKSPACE_LAYOUT_FILE = 'workspace-layout-proposal.json';
const LEGACY_TOPOLOGY_DIR = ['.specify', 'configurations', 'workspace-topology'];
const LEGACY_TOPOLOGY_FILE = 'workspace-topology.json';
const SENSITIVE_KEY_PATTERN = /(token|secret|password|credential|auth|private[_-]?key|api[_-]?key|access[_-]?key)/i;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\bBasic\s+[A-Za-z0-9+/=-]+/i,
  /_authToken\s*=/i,
  /:\/\/[^/\s:@]+:[^/\s@]+@/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\b[A-Z0-9_]*SECRET\s*=/i,
];

export interface JsonConfigTarget {
  workspaceRoot: string;
  workspaceRootRealPath: string;
  configPath: string;
}

export interface SafeConfigRead {
  configPath: string;
  configRealPath: string;
  rawBytes: Buffer;
  rawText: string;
  rawHash: string;
  stat: Pick<Stats, 'dev' | 'ino' | 'mode' | 'uid' | 'gid'>;
}

export interface SafeTopologyRead {
  topologyPath: string;
  topologyRealPath: string;
  rawBytes: Buffer;
  rawText: string;
  contentHash: string;
  applyEligible: boolean;
}

export interface SafeWriterPaths {
  workspaceRoot: string;
  workspaceRootRealPath: string;
  topologyDir: string;
  topologyDirRealPath: string;
  configPath: string;
  tempPath: string;
  backupsDir: string;
  backupPath: string;
  reportPath: string;
  lockDir: string;
}

export interface AuditRecord {
  runId?: string;
  action: 'apply';
  status: 'success' | 'failure';
  exitCode: CliExitCode;
  changedFiles: unknown[];
  timestamp: string;
  failureGate?: string;
  message?: string;
  host: string;
}

interface EligibleTopologyDir {
  dir: string;
  realPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInside(rootRealPath: string, candidateRealPath: string): boolean {
  const rel = relative(rootRealPath, candidateRealPath);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function assertInside(rootRealPath: string, candidateRealPath: string, label: string): void {
  if (!isInside(rootRealPath, candidateRealPath)) {
    throw new CliExitError(`${label} escapes workspace: ${candidateRealPath}`, EXIT_VALIDATION, 'path-containment');
  }
}

function assertNoSymlink(path: string, label: string): Stats {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new CliExitError(`${label} must not be a symlink: ${path}`, EXIT_VALIDATION, 'symlink-gate');
  }
  return stat;
}

function nearestExistingAncestor(path: string): string {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
  return current;
}

function assertExistingParentsNoSymlink(root: string, candidate: string, label: string): void {
  const rootResolved = resolve(root);
  const candidateResolved = resolve(candidate);
  const rel = relative(rootResolved, candidateResolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new CliExitError(`${label} escapes workspace: ${candidate}`, EXIT_VALIDATION, 'path-containment');
  }

  const segments = rel.split(/[\\/]/).filter(Boolean);
  let current = rootResolved;
  assertNoSymlink(current, 'workspace root');
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    if (existsSync(current)) {
      assertNoSymlink(current, `${label} parent`);
    }
  }
}

function readNoFollow(path: string, label: string): { bytes: Buffer; stat: Stats; realPath: string } {
  assertExistingParentsNoSymlink(dirname(dirname(path)), path, label);
  const beforeOpenStat = assertNoSymlink(path, label);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const fdStat = fstatSync(fd);
    if (fdStat.dev !== beforeOpenStat.dev || fdStat.ino !== beforeOpenStat.ino) {
      throw new CliExitError(`${label} changed while being opened: ${path}`, EXIT_VALIDATION, 'safe-read');
    }
    return {
      bytes: readFileSync(fd),
      stat: fdStat,
      realPath: realpathSync.native(path),
    };
  } finally {
    closeSync(fd);
  }
}

export function resolveJsonConfigTarget(startDir: string): JsonConfigTarget {
  let current = resolve(startDir);
  for (let i = 0; i < MAX_SEARCH_DEPTH; i++) {
    const specifyDir = join(current, '.specify');
    const configJson = join(specifyDir, '.specify.json');
    const configYaml = join(specifyDir, '.specify.yaml');
    if (existsSync(configJson)) {
      return {
        workspaceRoot: current,
        workspaceRootRealPath: realpathSync.native(current),
        configPath: configJson,
      };
    }
    if (existsSync(configYaml)) {
      throw new CliExitError(
        'YAML config is not applyable. Migrate .specify/.specify.yaml to .specify/.specify.json before topology apply.',
        EXIT_VALIDATION,
        'json-config-required',
      );
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new CliExitError(
    'Missing .specify/.specify.json. First-time config creation is deferred; create or migrate JSON config before topology apply.',
    EXIT_VALIDATION,
    'json-config-required',
  );
}

export function validateConfigTargetBeforeRead(target: JsonConfigTarget): SafeConfigRead {
  assertExistingParentsNoSymlink(target.workspaceRoot, target.configPath, 'config target');
  const read = readNoFollow(target.configPath, 'config target');
  assertInside(target.workspaceRootRealPath, read.realPath, 'config target');

  return {
    configPath: target.configPath,
    configRealPath: read.realPath,
    rawBytes: read.bytes,
    rawText: read.bytes.toString('utf-8'),
    rawHash: hashBytes(read.bytes),
    stat: read.stat,
  };
}

function workspaceLayoutDir(target: JsonConfigTarget): string {
  return join(target.workspaceRoot, ...WORKSPACE_LAYOUT_DIR);
}

function legacyTopologyDir(target: JsonConfigTarget): string {
  return join(target.workspaceRoot, ...LEGACY_TOPOLOGY_DIR);
}

function defaultTopologyPath(target: JsonConfigTarget): string {
  const layoutPath = join(workspaceLayoutDir(target), WORKSPACE_LAYOUT_FILE);
  if (existsSync(layoutPath)) {
    return layoutPath;
  }

  const legacyPath = join(legacyTopologyDir(target), LEGACY_TOPOLOGY_FILE);
  if (existsSync(legacyPath)) {
    return legacyPath;
  }

  return layoutPath;
}

function findEligibleTopologyDir(
  target: JsonConfigTarget,
  topologyRealPath: string,
): EligibleTopologyDir | undefined {
  for (const dir of [workspaceLayoutDir(target), legacyTopologyDir(target)]) {
    if (!existsSync(dir)) {
      continue;
    }
    const realPath = realpathSync.native(dir);
    if (isInside(realPath, topologyRealPath)) {
      return { dir, realPath };
    }
  }
  return undefined;
}

export function resolveTopologyForApply(target: JsonConfigTarget, topologyPath?: string): SafeTopologyRead {
  const resolvedTopologyPath = resolve(target.workspaceRoot, topologyPath ?? defaultTopologyPath(target));

  if (!existsSync(resolvedTopologyPath)) {
    throw new CliExitError(`Workspace layout/topology file not found: ${resolvedTopologyPath}`, EXIT_VALIDATION, 'topology-read');
  }

  const topologyRead = readNoFollow(resolvedTopologyPath, 'topology file');
  const applyEligible = findEligibleTopologyDir(target, topologyRead.realPath) !== undefined;

  return {
    topologyPath: resolvedTopologyPath,
    topologyRealPath: topologyRead.realPath,
    rawBytes: topologyRead.bytes,
    rawText: topologyRead.bytes.toString('utf-8'),
    contentHash: hashBytes(topologyRead.bytes),
    applyEligible,
  };
}

export function buildSafeTopologyApplyPaths(
  target: JsonConfigTarget,
  runId: string,
  topologyRealPath: string,
): SafeWriterPaths {
  const eligibleDir = findEligibleTopologyDir(target, topologyRealPath);
  if (eligibleDir === undefined) {
    throw new CliExitError(
      'Selected layout/topology file is not under an apply-eligible configuration directory.',
      EXIT_VALIDATION,
      'topology-eligibility',
    );
  }

  const topologyDir = eligibleDir.dir;
  const topologyDirRealPath = eligibleDir.realPath;
  assertInside(target.workspaceRootRealPath, topologyDirRealPath, 'topology apply directory');
  assertExistingParentsNoSymlink(target.workspaceRoot, topologyDir, 'topology apply directory');
  assertNoSymlink(topologyDir, 'topology apply directory');

  const backupsDir = join(topologyDir, 'backups');
  const paths = {
    workspaceRoot: target.workspaceRoot,
    workspaceRootRealPath: target.workspaceRootRealPath,
    topologyDir,
    topologyDirRealPath,
    configPath: target.configPath,
    tempPath: `${target.configPath}.${runId}.tmp`,
    backupsDir,
    backupPath: join(backupsDir, `${runId}-specify.json.bak`),
    reportPath: join(topologyDir, 'topology-apply-report.md'),
    lockDir: join(topologyDir, '.topology-apply.lock'),
  };

  for (const [label, candidate] of Object.entries(paths)) {
    if (typeof candidate !== 'string' || label.endsWith('RealPath') || label === 'workspaceRoot') {
      continue;
    }
    assertExistingParentsNoSymlink(target.workspaceRoot, candidate, label);
    const existingPath = existsSync(candidate)
      ? realpathSync.native(candidate)
      : realpathSync.native(nearestExistingAncestor(dirname(candidate)));
    assertInside(target.workspaceRootRealPath, existingPath, label);
  }

  return paths;
}

function shouldRedactValue(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export function redactConfigForOutput(value: unknown, keyHint = ''): unknown {
  if (typeof value === 'string') {
    return shouldRedactValue(value) ? '[REDACTED]' : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactConfigForOutput(entry, keyHint));
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, entry]) => {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      acc[key] = '[REDACTED]';
      return acc;
    }
    acc[key] = redactConfigForOutput(entry, key);
    return acc;
  }, {});
}

export function buildAuditRecord(input: {
  runId?: string;
  status: 'success' | 'failure';
  exitCode: CliExitCode;
  changedFiles?: unknown[];
  failureGate?: string;
  message?: string;
  now?: Date;
}): AuditRecord {
  return {
    runId: input.runId,
    action: 'apply',
    status: input.status,
    exitCode: input.exitCode,
    changedFiles: input.changedFiles ?? [],
    timestamp: (input.now ?? new Date()).toISOString(),
    failureGate: input.failureGate,
    message: input.message,
    host: hostname(),
  };
}

export function writeFailureAudit(record: AuditRecord): void {
  process.stderr.write(`AUDIT_JSON ${JSON.stringify(redactConfigForOutput(record))}\n`);
}

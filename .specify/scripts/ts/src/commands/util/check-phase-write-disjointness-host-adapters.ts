/**
 * check-phase-write-disjointness-host-adapters.ts
 *
 * Host-coupled probes for `check-phase-write-disjointness.ts`'s scheduling
 * mode: case-sensitivity probing and same-mount/same-device filesystem
 * capability. Split out of the main file purely to hold its LOC ceiling —
 * both are re-exported from the main file, which stays the one public entry
 * point. Ported verbatim (behavior unchanged) from
 * `parallel-phase-case-probe.ts` and `parallel-phase-mount-capability.ts`.
 *
 * Both entry points are injectable so `--validate-only` tests can prove they
 * are never called (spies) without touching the real filesystem/host.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

export interface CaseProbeResult {
  ok: boolean;
  reason?: string;
}

export interface CaseProbeOptions {
  /** Defaults to `existsSync(swappedPath)`. */
  detectAlias?: (swappedPath: string) => boolean;
  /** Defaults to `rmSync(path, { recursive: true, force: true })`. */
  removeDir?: (path: string) => void;
}

const SENTINEL_NAME = 'CaseProbeSentinel.tmp';

function swapCase(value: string): string {
  return [...value].map((ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join('');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Through one unique temp directory under the real `projectRoot`: create a
 * mixed-case sentinel, test whether a case-swapped name aliases it, and
 * remove the directory in `finally`. A detected alias, a probe error, or a
 * cleanup failure all report `ok: false`.
 */
export function probeProjectCaseSensitivity(projectRoot: string, options: CaseProbeOptions = {}): CaseProbeResult {
  const detectAlias = options.detectAlias ?? existsSync;
  const removeDir = options.removeDir ?? ((p: string) => rmSync(p, { recursive: true, force: true }));

  const probeDirName = `.tdk-write-disjointness-case-probe-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const probeDir = join(projectRoot, probeDirName);
  const sentinelPath = join(probeDir, SENTINEL_NAME);
  const swappedPath = join(probeDir, swapCase(SENTINEL_NAME));

  let result: CaseProbeResult;
  try {
    mkdirSync(probeDir);
    writeFileSync(sentinelPath, '');
    result = detectAlias(swappedPath) ? { ok: false, reason: 'case-insensitive-root' } : { ok: true };
  } catch (error) {
    result = { ok: false, reason: `case-probe-error: ${errorMessage(error)}` };
  } finally {
    try {
      removeDir(probeDir);
    } catch {
      result = { ok: false, reason: `case-probe-cleanup-failed: ${probeDir}` };
    }
  }
  return result;
}

export interface FilesystemCapabilityResult {
  ok: boolean;
  reason?: string;
}

export interface FilesystemCapabilityOptions {
  /** Defaults to the real running platform (`process.platform`). */
  platform?: NodeJS.Platform;
  /** Defaults to reading the real `/proc/self/mountinfo` (Linux only). */
  readMountInfoText?: () => string;
  /** Defaults to `lstatSync(path).dev` (non-Linux POSIX only). */
  lstatDev?: (absolutePath: string) => number;
}

export interface MountRecord {
  mountId: number;
  mountPoint: string;
  fsType: string;
}

/** Decode mountinfo's octal escapes (e.g. `\040` for a literal space). */
function decodeMountInfoEscapes(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (_match, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

function parseMountInfoLine(line: string): MountRecord | null {
  const fields = line.trim().split(' ');
  if (fields.length < 7) return null;
  const mountId = parseInt(fields[0]!, 10);
  const mountPointRaw = fields[4];
  if (Number.isNaN(mountId) || mountPointRaw === undefined) return null;

  // The optional per-mount tag fields end at a lone "-" token; scan starting
  // at index 6 so a mount point legitimately named "-" at field index 4 is
  // never mistaken for it.
  let separatorIndex = -1;
  for (let i = 6; i < fields.length; i++) {
    if (fields[i] === '-') {
      separatorIndex = i;
      break;
    }
  }
  if (separatorIndex === -1) return null;
  const fsType = fields[separatorIndex + 1];
  if (!fsType) return null;

  return { mountId, mountPoint: decodeMountInfoEscapes(mountPointRaw), fsType };
}

/**
 * Pure `/proc/self/mountinfo` parser. Blank lines are skippable, but any
 * other unparsable line makes the whole mountinfo unknown (`null`) — a
 * silently dropped malformed record would let a shorter, parsable ancestor
 * record stand in for it, resolving the wrong filesystem boundary.
 */
export function parseMountInfo(text: string): MountRecord[] | null {
  const records: MountRecord[] = [];
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    const record = parseMountInfoLine(line);
    if (!record) return null;
    records.push(record);
  }
  return records;
}

function isBoundaryMatch(absolutePath: string, mountPoint: string): boolean {
  if (mountPoint === '/') return true;
  return absolutePath === mountPoint || absolutePath.startsWith(`${mountPoint}/`);
}

/**
 * Longest (most specific) boundary-matching record for an absolute path.
 * Ties (equal mount-point length) go to the LAST matching record: real
 * mountinfo lists mounts in mount order, and a later mount at the same
 * mount point shadows an earlier one, matching what the kernel resolves.
 */
function selectLongestMatch(records: MountRecord[], absolutePath: string): MountRecord | undefined {
  let best: MountRecord | undefined;
  for (const record of records) {
    if (!isBoundaryMatch(absolutePath, record.mountPoint)) continue;
    if (!best || record.mountPoint.length >= best.mountPoint.length) best = record;
  }
  return best;
}

function isDrvfs(fsType: string): boolean {
  return fsType.toLowerCase() === 'drvfs';
}

/**
 * Resolve whether `realProjectRoot` and every path in `accessPaths` share one
 * same-mount (Linux) or same-device (non-Linux POSIX) filesystem boundary,
 * with no DrvFS (case-insensitive) filesystem in the chain. `accessPaths`
 * must already be resolved to an existing absolute path — for an absent
 * `Create` target, the caller passes its nearest existing ancestor.
 */
export function resolveProjectFilesystemCapability(
  realProjectRoot: string,
  accessPaths: readonly string[],
  options: FilesystemCapabilityOptions = {}
): FilesystemCapabilityResult {
  const platform = options.platform ?? process.platform;
  if (platform === 'win32') return { ok: false, reason: 'native-windows-unsupported' };

  if (platform === 'linux') {
    const readMountInfoText = options.readMountInfoText ?? (() => readFileSync('/proc/self/mountinfo', 'utf-8'));
    let text: string;
    try {
      text = readMountInfoText();
    } catch {
      return { ok: false, reason: 'mountinfo-unreadable' };
    }
    const records = parseMountInfo(text);
    if (records === null) return { ok: false, reason: 'mountinfo-malformed' };
    const rootRecord = selectLongestMatch(records, realProjectRoot);
    if (!rootRecord) return { ok: false, reason: 'unknown-root' };
    if (isDrvfs(rootRecord.fsType)) return { ok: false, reason: 'drvfs-root' };

    for (const accessPath of accessPaths) {
      const record = selectLongestMatch(records, accessPath);
      if (!record) return { ok: false, reason: 'unknown-access-path' };
      if (isDrvfs(record.fsType)) return { ok: false, reason: 'drvfs-access-path' };
      if (record.mountId !== rootRecord.mountId) return { ok: false, reason: 'nested-mount' };
    }
    return { ok: true };
  }

  // Non-Linux POSIX: compare device numbers via lstat.
  const lstatDev = options.lstatDev ?? ((p: string) => lstatSync(p).dev);
  let rootDev: number;
  try {
    rootDev = lstatDev(realProjectRoot);
  } catch {
    return { ok: false, reason: 'root-stat-failed' };
  }
  for (const accessPath of accessPaths) {
    let dev: number;
    try {
      dev = lstatDev(accessPath);
    } catch {
      return { ok: false, reason: 'access-path-stat-failed' };
    }
    if (dev !== rootDev) return { ok: false, reason: 'device-boundary' };
  }
  return { ok: true };
}

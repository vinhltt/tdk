/**
 * parallel-phase-mount-capability.ts (C-B5)
 *
 * Same-mount/same-device filesystem capability check: prevents a
 * case-sensitive project root from authorizing a nested case-insensitive
 * (or otherwise foreign) mount. Native Windows is unsupported outright.
 *
 * CRITICAL for testability: mountinfo text and the device-stat function are
 * both injectable — tests must never read the host `/proc/self/mountinfo`.
 */

import { readFileSync, lstatSync } from 'node:fs';

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
  // at index 6 (the first possible optional-field slot) so a mount point
  // legitimately named "-" at field index 4 is never mistaken for it.
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
 * other unparsable line makes the whole mountinfo unknown (`null`) — C-B5:
 * "Missing/malformed mountinfo or no matching record is unknown and rejects
 * parallel mode." Silently dropping a malformed record would let a shorter,
 * parsable ancestor record stand in for it, resolving the wrong filesystem
 * boundary.
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
 * `/proc/self/mountinfo` lists mounts in mount order, and a later mount at
 * the same mount point shadows an earlier one, which is what the kernel
 * actually resolves. Strict `>` would let the first-parsed record win,
 * missing a shadowing over-mount at that exact boundary.
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

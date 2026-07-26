import { describe, expect, it } from 'bun:test';
import { parseMountInfo, resolveProjectFilesystemCapability } from '../src/commands/util/parallel-phase-mount-capability';

// Synthetic /proc/self/mountinfo-shaped fixtures. Real format:
// <mountId> <parentId> <major:minor> <root> <mountPoint> <options> [tag:value ...] - <fsType> <source> <superOptions>

describe('parseMountInfo', () => {
  it('parses fields and decodes octal mount-point escapes', () => {
    const text = '100 1 0:1 / /mnt/wsl/My\\040Project rw,relatime shared:1 - ext4 /dev/sdb rw\n';
    const records = parseMountInfo(text);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({ mountId: 100, mountPoint: '/mnt/wsl/My Project', fsType: 'ext4' });
  });

  it('skips blank lines without rejecting', () => {
    const text = '\n\n100 1 0:1 / / rw - ext4 /dev/sda rw\n\n';
    const records = parseMountInfo(text);
    expect(records).not.toBeNull();
    expect(records).toHaveLength(1);
    expect(records![0]!.mountPoint).toBe('/');
  });

  // C-B5: "Missing/malformed mountinfo ... is unknown and rejects parallel
  // mode." A non-blank line that fails to parse must not be silently
  // dropped — that would let a shorter, parsable ancestor record stand in
  // for the unparsable one (Finding B).
  it('rejects (returns null) when any non-blank line is unparsable, even alongside a parsable record', () => {
    const text = '100 1 0:1 / / rw - ext4 /dev/sda rw\nnot a valid mountinfo line\n';
    const records = parseMountInfo(text);
    expect(records).toBeNull();
  });
});

describe('resolveProjectFilesystemCapability', () => {
  it('rejects native Windows before any check', () => {
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/src'], { platform: 'win32' });
    expect(result.ok).toBe(false);
  });

  it('Linux: longest boundary match accepts a same-mount access path', () => {
    const text = '100 1 0:1 / /proj rw shared:1 - ext4 /dev/sda rw\n';
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/src/file.ts'], {
      platform: 'linux',
      readMountInfoText: () => text,
    });
    expect(result.ok).toBe(true);
  });

  it('Linux: decodes escaped mount points and still matches', () => {
    const text = '100 1 0:1 / /mnt/wsl/My\\040Project rw shared:1 - ext4 /dev/sdb rw\n';
    const result = resolveProjectFilesystemCapability('/mnt/wsl/My Project', ['/mnt/wsl/My Project/src'], {
      platform: 'linux',
      readMountInfoText: () => text,
    });
    expect(result.ok).toBe(true);
  });

  it('Linux: picks the LONGEST boundary match for distinct-length mount points', () => {
    const text = [
      '100 1 0:1 / / rw shared:1 - ext4 /dev/sda rw',
      '200 100 0:2 / /proj rw shared:2 - ext4 /dev/sdb rw',
    ].join('\n');
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/src'], {
      platform: 'linux',
      readMountInfoText: () => text,
    });
    expect(result.ok).toBe(true);
  });

  // Finding A: a later record at the SAME mount point (a genuine tie —
  // equal-length mount points, not the distinct-length case above) must
  // shadow an earlier one, matching kernel mount-order semantics. Records
  // differ by mountId only (not fsType) so this pins `record.mountId !==
  // rootRecord.mountId`, not the `isDrvfs` path exercised elsewhere. Reusing
  // mountId 200 for both the winning root record and the nested-path record
  // is a unit-test fixture for the selection logic only — real mountinfo
  // never repeats a mountId across unrelated mounts.
  it('Linux: a later record at the same mount point wins the tie-break, not the first', () => {
    const text = [
      '100 1 0:1 / /proj rw shared:1 - ext4 /dev/sda rw',
      '200 1 0:2 / /proj rw shared:2 - ext4 /dev/sdb rw',
      '200 200 0:3 / /proj/sub rw shared:3 - ext4 /dev/sdb rw',
    ].join('\n');
    // Under strict '>', the FIRST tied record (mountId 100) wins, so the
    // access path's own record (mountId 200) mismatches -> 'nested-mount' ->
    // ok:false. Under the fixed '>=' (last wins on tie), the root resolves to
    // mountId 200, which matches -> ok:true.
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/sub/file.ts'], {
      platform: 'linux',
      readMountInfoText: () => text,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  // Finding A regression: exact reproduction from the review report. Root and
  // a nested access path both sit at the SAME mount point; an ext4 record
  // parses first, a live drvfs over-mount shadows it. Pins the `isDrvfs`
  // branch specifically (the tie-break test above pins mountId comparison).
  it('Linux: regression — an ext4 record followed by a drvfs record at the same mount point rejects (Finding A)', () => {
    const text = [
      '100 1 0:1 / /proj rw shared:1 - ext4  /dev/sda rw',
      '200 1 0:2 / /proj rw shared:2 - drvfs C:\\      rw',
    ].join('\n');
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/src/x.ts'], {
      platform: 'linux',
      readMountInfoText: () => text,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('drvfs-root');
  });

  it('Linux: rejects a nested mount with a different mount ID under the project root', () => {
    const text = [
      '100 1 0:1 / /proj rw shared:1 - ext4 /dev/sda rw',
      '200 100 0:2 / /proj/nested rw shared:2 - ext4 /dev/sdb rw',
    ].join('\n');
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/nested/file.ts'], {
      platform: 'linux',
      readMountInfoText: () => text,
    });
    expect(result.ok).toBe(false);
  });

  it('Linux: rejects when the project root itself is drvfs', () => {
    const text = '100 1 0:1 / /proj rw shared:1 - drvfs C:\\ rw\n';
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/file.ts'], {
      platform: 'linux',
      readMountInfoText: () => text,
    });
    expect(result.ok).toBe(false);
  });

  it('Linux: rejects (case-insensitive) when an access path resolves under a DrvFS mount', () => {
    const text = [
      '100 1 0:1 / /proj rw shared:1 - ext4 /dev/sda rw',
      '200 100 0:2 / /proj/win rw shared:2 - DrvFs C:\\ rw',
    ].join('\n');
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/win/file.ts'], {
      platform: 'linux',
      readMountInfoText: () => text,
    });
    expect(result.ok).toBe(false);
  });

  it('Linux: accepts a case-sensitive WSL distro root (ext4, not drvfs)', () => {
    const text = '100 1 0:1 / /home/user/project rw shared:1 - ext4 /dev/sdb rw\n';
    const result = resolveProjectFilesystemCapability('/home/user/project', ['/home/user/project/src/x.ts'], {
      platform: 'linux',
      readMountInfoText: () => text,
    });
    expect(result.ok).toBe(true);
  });

  it('Linux: unknown root (no matching record) rejects', () => {
    const text = '100 1 0:1 / /somewhere-else rw shared:1 - ext4 /dev/sda rw\n';
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/file.ts'], {
      platform: 'linux',
      readMountInfoText: () => text,
    });
    expect(result.ok).toBe(false);
  });

  it('Linux: missing/malformed mountinfo rejects (unknown)', () => {
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/file.ts'], {
      platform: 'linux',
      readMountInfoText: () => {
        throw new Error('ENOENT');
      },
    });
    expect(result.ok).toBe(false);
  });

  it('non-Linux: same device for root and access paths accepts', () => {
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/a.ts', '/proj/b.ts'], {
      platform: 'darwin',
      lstatDev: () => 42,
    });
    expect(result.ok).toBe(true);
  });

  it('non-Linux: a device change on an access path rejects', () => {
    const devByPath: Record<string, number> = { '/proj': 1, '/proj/a.ts': 1, '/proj/other-volume/b.ts': 2 };
    const result = resolveProjectFilesystemCapability('/proj', ['/proj/a.ts', '/proj/other-volume/b.ts'], {
      platform: 'darwin',
      lstatDev: (p) => devByPath[p] ?? -1,
    });
    expect(result.ok).toBe(false);
  });
});

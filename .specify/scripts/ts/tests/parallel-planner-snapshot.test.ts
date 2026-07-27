import { afterEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PLANNER_SNAPSHOT_MAX_ENTRIES, PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES,
  assertPlannerSnapshotSerializedBound, normalizePlannerWireSnapshot, plannerSnapshotSha256,
  serializeCanonicalPlannerSnapshot, type CanonicalPlannerSnapshot, type PlannerWireSnapshot,
} from '../src/commands/util/parallel-planner-snapshot-schema';
import { capturePlannerSnapshot, readPlannerSnapshot, restorePlannerSnapshot } from '../src/commands/util/parallel-planner-snapshot';

const roots: string[] = [];
function repoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'tdk-planner-snapshot-')); roots.push(root);
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=TDK', '-c', 'user.email=tdk@example.invalid', 'commit', '--allow-empty', '-qm', 'base'], { cwd: root });
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('planner snapshot wire normalization', () => {
  it('normalizes a v1 wire snapshot to canonical', () => {
    const bytes = Buffer.from('hello world'); const sha = plannerSnapshotSha256(bytes);
    const wire: PlannerWireSnapshot = {
      schemaVersion: 1, controllerId: 'c1', featureMode: 0o755,
      entries: [
        { kind: 'directory', path: 'phases', mode: 0o755 },
        { kind: 'file', path: 'phases/a.md', mode: 0o644, sha256: sha, contentBase64: bytes.toString('base64') },
      ],
      external: [], gitEntries: [],
    };
    const canonical = normalizePlannerWireSnapshot(wire);
    expect(canonical.entries).toEqual([
      { kind: 'directory', path: 'phases', mode: 0o755 },
      { kind: 'file', path: 'phases/a.md', mode: 0o644, sha256: sha },
    ]);
    expect(canonical.blobs.size).toBe(1);
    expect(canonical.blobs.get(sha)?.equals(bytes)).toBe(true);
  });

  it('parses a v2 wire snapshot to canonical', () => {
    const bytes = Buffer.from('hello v2'); const sha = plannerSnapshotSha256(bytes);
    const wire: PlannerWireSnapshot = {
      schemaVersion: 2, controllerId: 'c1', featureMode: 0o755,
      entries: [{ kind: 'file', path: 'a.md', mode: 0o644, sha256: sha }],
      blobs: [{ sha256: sha, contentBase64: bytes.toString('base64') }], external: [], gitEntries: [],
    };
    const canonical = normalizePlannerWireSnapshot(wire);
    expect(canonical.entries).toEqual([{ kind: 'file', path: 'a.md', mode: 0o644, sha256: sha }]);
    expect(canonical.blobs.get(sha)?.equals(bytes)).toBe(true);
  });

  it('produces the same canonical ordering regardless of input order', () => {
    const bytesA = Buffer.from('AAA'); const bytesB = Buffer.from('BBBBB');
    const shaA = plannerSnapshotSha256(bytesA); const shaB = plannerSnapshotSha256(bytesB);
    const common = { controllerId: 'c1', featureMode: 0o755, external: [], gitEntries: [] } as const;
    const forwardWire: PlannerWireSnapshot = {
      schemaVersion: 2, ...common,
      entries: [
        { kind: 'file', path: 'a.md', mode: 0o644, sha256: shaA },
        { kind: 'file', path: 'b.md', mode: 0o644, sha256: shaB },
      ],
      blobs: [
        { sha256: shaA, contentBase64: bytesA.toString('base64') },
        { sha256: shaB, contentBase64: bytesB.toString('base64') },
      ],
    };
    const reversedWire: PlannerWireSnapshot = {
      schemaVersion: 2, ...common,
      entries: [
        { kind: 'file', path: 'b.md', mode: 0o644, sha256: shaB },
        { kind: 'file', path: 'a.md', mode: 0o644, sha256: shaA },
      ],
      blobs: [
        { sha256: shaB, contentBase64: bytesB.toString('base64') },
        { sha256: shaA, contentBase64: bytesA.toString('base64') },
      ],
    };
    const forward = serializeCanonicalPlannerSnapshot(normalizePlannerWireSnapshot(forwardWire));
    const reversed = serializeCanonicalPlannerSnapshot(normalizePlannerWireSnapshot(reversedWire));
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
  });
});

describe('planner snapshot capture, dedup, and restore (incident fixture)', () => {
  it('dedupes three identical 17 MiB paths into one blob and restores them exactly', () => {
    const root = repoRoot(); const feature = join(root, 'feature'); mkdirSync(feature);
    // ONE shared buffer reused for all three writes — do not allocate three 17 MiB buffers.
    const shared = Buffer.alloc(17 * 1024 * 1024, 7);
    mkdirSync(join(feature, 'nested'));
    // Capture the mode each chmodSync call actually produced on this host right after applying it —
    // on NTFS, chmodSync only toggles the read-only bit, so the readback differs from the POSIX
    // literal even when everything is working correctly. Asserting against these captured values
    // (below) states the preservation invariant instead of a POSIX-only numeric literal.
    writeFileSync(join(feature, 'a.bin'), shared); chmodSync(join(feature, 'a.bin'), 0o644);
    const aMode = statSync(join(feature, 'a.bin')).mode & 0o7777;
    writeFileSync(join(feature, 'b.bin'), shared); chmodSync(join(feature, 'b.bin'), 0o640);
    const bMode = statSync(join(feature, 'b.bin')).mode & 0o7777;
    writeFileSync(join(feature, 'nested/c.bin'), shared); chmodSync(join(feature, 'nested/c.bin'), 0o644);
    const cMode = statSync(join(feature, 'nested/c.bin')).mode & 0o7777;

    const wire = capturePlannerSnapshot({ projectRoot: root, featureDir: feature, controllerId: 'c1', externalPaths: [] });
    expect(wire.schemaVersion).toBe(2);
    expect(wire.blobs).toHaveLength(1);
    expect(wire.entries.some((entry) => 'contentBase64' in entry)).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(wire))).toBeLessThan(PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES);

    const canonical = normalizePlannerWireSnapshot(wire);
    expect(canonical.blobs.size).toBe(1);

    // Simulate crash/corruption before recovery.
    rmSync(join(feature, 'a.bin')); chmodSync(join(feature, 'b.bin'), 0o600);
    restorePlannerSnapshot({ projectRoot: root, featureDir: feature, snapshot: canonical });

    expect(readFileSync(join(feature, 'a.bin')).equals(shared)).toBe(true);
    expect(readFileSync(join(feature, 'b.bin')).equals(shared)).toBe(true);
    expect(readFileSync(join(feature, 'nested/c.bin')).equals(shared)).toBe(true);
    expect(statSync(join(feature, 'a.bin')).mode & 0o7777).toBe(aMode);
    expect(statSync(join(feature, 'b.bin')).mode & 0o7777).toBe(bMode);
    expect(statSync(join(feature, 'nested/c.bin')).mode & 0o7777).toBe(cMode);
  });

  it('dedupes by content hash, not by length', () => {
    const root = repoRoot(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'x.bin'), Buffer.alloc(1024, 1));
    writeFileSync(join(feature, 'y.bin'), Buffer.alloc(1024, 2));
    const wire = capturePlannerSnapshot({ projectRoot: root, featureDir: feature, controllerId: 'c1', externalPaths: [] });
    expect(wire.blobs).toHaveLength(2);
  });

  it('restores correctly when path-sort order disagrees with directory-walk order', () => {
    // '-' (0x2D) sorts before '/' (0x2F), so 'sub-x.md' sorts before 'sub/b.md' in path order even
    // though a depth-first directory walk visits 'sub' and its children before the sibling file.
    const root = repoRoot(); const feature = join(root, 'feature'); mkdirSync(feature);
    mkdirSync(join(feature, 'sub'));
    writeFileSync(join(feature, 'sub/b.md'), 'inside sub\n');
    writeFileSync(join(feature, 'sub-x.md'), 'sibling of sub\n');
    const wire = capturePlannerSnapshot({ projectRoot: root, featureDir: feature, controllerId: 'c1', externalPaths: [] });
    const canonical = normalizePlannerWireSnapshot(wire);
    rmSync(join(feature, 'sub-x.md'));
    expect(() => restorePlannerSnapshot({ projectRoot: root, featureDir: feature, snapshot: canonical })).not.toThrow();
    expect(readFileSync(join(feature, 'sub/b.md'), 'utf8')).toBe('inside sub\n');
    expect(readFileSync(join(feature, 'sub-x.md'), 'utf8')).toBe('sibling of sub\n');
  });

  it('restores a v1 snapshot through normalization with correct bytes and modes', () => {
    const root = repoRoot(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'placeholder.md'), 'placeholder\n');
    // Derive the real modes this host's chmodSync produces for these calls (POSIX preserves them
    // exactly; NTFS only toggles the read-only bit), rather than hard-coding the POSIX literals in
    // the wire fixture. `restorePlannerSnapshot` self-verifies the restored mode matches the
    // snapshot's declared mode exactly, so the fixture must declare whatever this host actually
    // produces for the restore to succeed on either platform.
    chmodSync(join(feature, 'placeholder.md'), 0o640);
    const fileMode = statSync(join(feature, 'placeholder.md')).mode & 0o7777;
    chmodSync(feature, 0o750);
    const dirMode = statSync(feature).mode & 0o7777;

    const content = Buffer.from('legacy recovery payload'); const sha = plannerSnapshotSha256(content);
    const wire: PlannerWireSnapshot = {
      schemaVersion: 1, controllerId: 'c1', featureMode: dirMode,
      entries: [{ kind: 'file', path: 'legacy.md', mode: fileMode, sha256: sha, contentBase64: content.toString('base64') }],
      external: [], gitEntries: [],
    };
    const canonical = normalizePlannerWireSnapshot(wire);
    restorePlannerSnapshot({ projectRoot: root, featureDir: feature, snapshot: canonical });
    expect(readFileSync(join(feature, 'legacy.md')).equals(content)).toBe(true);
    expect(statSync(join(feature, 'legacy.md')).mode & 0o7777).toBe(fileMode);
    expect(statSync(feature).mode & 0o7777).toBe(dirMode);
    expect(existsSync(join(feature, 'placeholder.md'))).toBe(false);
  });

  it('rejects restore for a bad blob reference without touching feature contents', () => {
    const root = repoRoot(); const feature = join(root, 'feature'); mkdirSync(feature);
    writeFileSync(join(feature, 'keep.md'), 'keep me\n');
    const before = readdirSync(feature).sort();
    const badSnapshot: CanonicalPlannerSnapshot = {
      controllerId: 'c1', featureMode: statSync(feature).mode & 0o7777,
      entries: [{ kind: 'file', path: 'missing.md', mode: 0o644, sha256: '0'.repeat(64) }],
      blobs: new Map(), external: [], gitEntries: [],
    };
    expect(() => restorePlannerSnapshot({ projectRoot: root, featureDir: feature, snapshot: badSnapshot })).toThrow();
    expect(readdirSync(feature).sort()).toEqual(before);
    expect(readFileSync(join(feature, 'keep.md'), 'utf8')).toBe('keep me\n');
  });
});

describe('planner snapshot fail-closed validation', () => {
  it('rejects a file entry referencing a missing blob', () => {
    const wire: PlannerWireSnapshot = {
      schemaVersion: 2, controllerId: 'c1', featureMode: 0o755,
      entries: [{ kind: 'file', path: 'a.md', mode: 0o644, sha256: '1'.repeat(64) }],
      blobs: [], external: [], gitEntries: [],
    };
    expect(() => normalizePlannerWireSnapshot(wire)).toThrow(/missing a blob reference/);
  });

  it('rejects an unused blob', () => {
    const bytes = Buffer.from('unused'); const sha = plannerSnapshotSha256(bytes);
    const wire: PlannerWireSnapshot = {
      schemaVersion: 2, controllerId: 'c1', featureMode: 0o755,
      entries: [], blobs: [{ sha256: sha, contentBase64: bytes.toString('base64') }], external: [], gitEntries: [],
    };
    expect(() => normalizePlannerWireSnapshot(wire)).toThrow(/unused blob/);
  });

  it('rejects a duplicate blob hash', () => {
    const bytes = Buffer.from('same content'); const sha = plannerSnapshotSha256(bytes);
    const wire: PlannerWireSnapshot = {
      schemaVersion: 2, controllerId: 'c1', featureMode: 0o755,
      entries: [{ kind: 'file', path: 'a.md', mode: 0o644, sha256: sha }],
      blobs: [
        { sha256: sha, contentBase64: bytes.toString('base64') },
        { sha256: sha, contentBase64: bytes.toString('base64') },
      ],
      external: [], gitEntries: [],
    };
    expect(() => normalizePlannerWireSnapshot(wire)).toThrow(/duplicate blob hash/);
  });

  it('rejects a duplicate path', () => {
    const wire: PlannerWireSnapshot = {
      schemaVersion: 2, controllerId: 'c1', featureMode: 0o755,
      entries: [
        { kind: 'directory', path: 'dup', mode: 0o755 },
        { kind: 'directory', path: 'dup', mode: 0o755 },
      ],
      blobs: [], external: [], gitEntries: [],
    };
    expect(() => normalizePlannerWireSnapshot(wire)).toThrow(/canonical and unique/);
  });

  it('rejects a non-canonical path', () => {
    const wire: PlannerWireSnapshot = {
      schemaVersion: 2, controllerId: 'c1', featureMode: 0o755,
      entries: [{ kind: 'directory', path: '../escape', mode: 0o755 }],
      blobs: [], external: [], gitEntries: [],
    };
    expect(() => normalizePlannerWireSnapshot(wire)).toThrow(/canonical and unique/);
  });

  it('rejects invalid Base64 content', () => {
    const wire: PlannerWireSnapshot = {
      schemaVersion: 1, controllerId: 'c1', featureMode: 0o755,
      entries: [{ kind: 'file', path: 'a.md', mode: 0o644, sha256: '0'.repeat(64), contentBase64: '!!!!' }],
      external: [], gitEntries: [],
    };
    expect(() => normalizePlannerWireSnapshot(wire)).toThrow(/not valid Base64/);
  });

  it('rejects non-canonical Base64 content that decodes but does not round-trip', () => {
    // 'AB==' decodes to a single 0x00 byte whose canonical encoding is 'AA==', not 'AB=='.
    const wire: PlannerWireSnapshot = {
      schemaVersion: 1, controllerId: 'c1', featureMode: 0o755,
      entries: [{ kind: 'file', path: 'a.md', mode: 0o644, sha256: '0'.repeat(64), contentBase64: 'AB==' }],
      external: [], gitEntries: [],
    };
    expect(() => normalizePlannerWireSnapshot(wire)).toThrow(/not canonical Base64/);
  });

  it('rejects decoded bytes that do not match the declared sha256 (v2)', () => {
    const bytes = Buffer.from('actual content'); const wrongSha = plannerSnapshotSha256(Buffer.from('different content'));
    const wire: PlannerWireSnapshot = {
      schemaVersion: 2, controllerId: 'c1', featureMode: 0o755,
      entries: [{ kind: 'file', path: 'a.md', mode: 0o644, sha256: wrongSha }],
      blobs: [{ sha256: wrongSha, contentBase64: bytes.toString('base64') }], external: [], gitEntries: [],
    };
    expect(() => normalizePlannerWireSnapshot(wire)).toThrow(/does not match declared sha256/);
  });

  it('recomputes and verifies v1 inline payload hashes', () => {
    const bytes = Buffer.from('legacy content'); const wrongSha = plannerSnapshotSha256(Buffer.from('tampered'));
    const wire: PlannerWireSnapshot = {
      schemaVersion: 1, controllerId: 'c1', featureMode: 0o755,
      entries: [{ kind: 'file', path: 'a.md', mode: 0o644, sha256: wrongSha, contentBase64: bytes.toString('base64') }],
      external: [], gitEntries: [],
    };
    expect(() => normalizePlannerWireSnapshot(wire)).toThrow(/does not match declared sha256/);
  });

  it('rejects 4,097 entries', () => {
    const entries = Array.from({ length: PLANNER_SNAPSHOT_MAX_ENTRIES + 1 },
      (_, index) => ({ kind: 'directory' as const, path: `dir-${index}`, mode: 0o755 }));
    const wire: PlannerWireSnapshot = {
      schemaVersion: 2, controllerId: 'c1', featureMode: 0o755, entries, blobs: [], external: [], gitEntries: [],
    };
    expect(() => normalizePlannerWireSnapshot(wire)).toThrow(/exceeds limit/);
  });

  it('rejects unique decoded bytes over the 32 MiB bound', () => {
    const a = Buffer.alloc(17 * 1024 * 1024, 1); const b = Buffer.alloc(17 * 1024 * 1024, 2);
    const shaA = plannerSnapshotSha256(a); const shaB = plannerSnapshotSha256(b);
    const wire: PlannerWireSnapshot = {
      schemaVersion: 2, controllerId: 'c1', featureMode: 0o755,
      entries: [
        { kind: 'file', path: 'a.bin', mode: 0o644, sha256: shaA },
        { kind: 'file', path: 'b.bin', mode: 0o644, sha256: shaB },
      ],
      blobs: [
        { sha256: shaA, contentBase64: a.toString('base64') },
        { sha256: shaB, contentBase64: b.toString('base64') },
      ],
      external: [], gitEntries: [],
    };
    expect(() => normalizePlannerWireSnapshot(wire)).toThrow(/unique blob bytes/);
  });

  it('rejects a serialized size over the 48 MiB bound', () => {
    expect(() => assertPlannerSnapshotSerializedBound(PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES + 1)).toThrow(/exceeds limit/);
    expect(() => assertPlannerSnapshotSerializedBound(PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES)).not.toThrow();
  });

  it('rejects an oversized v1-labeled snapshot file before attempting to parse it', () => {
    const root = repoRoot(); const feature = join(root, 'feature'); mkdirSync(feature);
    const lockDir = mkdtempSync(join(tmpdir(), 'tdk-planner-lock-')); roots.push(lockDir);
    const path = join(lockDir, 'planner-snapshot.json');
    writeFileSync(path, `{"schemaVersion":1,"filler":"${'a'.repeat(PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES)}"}`);
    expect(() => readPlannerSnapshot({ path, controllerId: 'c1', projectRoot: root, featureDir: feature }))
      .toThrow(/bounded regular file/);
  });

  it('rejects an oversized v2-labeled snapshot file before attempting to parse it', () => {
    const root = repoRoot(); const feature = join(root, 'feature'); mkdirSync(feature);
    const lockDir = mkdtempSync(join(tmpdir(), 'tdk-planner-lock-')); roots.push(lockDir);
    const path = join(lockDir, 'planner-snapshot.json');
    writeFileSync(path, `{"schemaVersion":2,"filler":"${'a'.repeat(PLANNER_SNAPSHOT_MAX_SERIALIZED_BYTES)}"}`);
    expect(() => readPlannerSnapshot({ path, controllerId: 'c1', projectRoot: root, featureDir: feature }))
      .toThrow(/bounded regular file/);
  });
});

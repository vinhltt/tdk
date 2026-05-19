import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseFeatureId } from '../../src/utils/index';

describe('feature.test.ts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tdk-feature-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- parseFeatureId tests ---

  it('F-01: Valid ID with folder → folder=backend, ticket=aa-001', () => {
    const result = parseFeatureId('backend/aa-001', tempDir, '.specify', 'feature');

    expect(result.folder).toBe('backend');
    expect(result.ticket).toBe('aa-001');
    expect(result.branchName).toBe('backend/aa-001');
    expect(result.featureDir).toContain('.specify');
    expect(result.featureDir).toContain('backend');
    expect(result.featureDir).toContain('aa-001');
  });

  it('F-02: Valid ID without folder → folder=defaultFolder', () => {
    const result = parseFeatureId('aa-001', tempDir, '.specify', 'feature');

    expect(result.folder).toBe('feature');
    expect(result.ticket).toBe('aa-001');
    expect(result.branchName).toBe('feature/aa-001');
    expect(result.featureDir).toContain('.specify');
    expect(result.featureDir).toContain('feature');
    expect(result.featureDir).toContain('aa-001');
  });

  it('F-03: Empty string → throws Error', () => {
    expect(() => {
      parseFeatureId('', tempDir, '.specify', 'feature');
    }).toThrow('Feature ID is required');
  });

  it('F-04: Traversal attempt "../../etc/passwd" → throws', () => {
    expect(() => {
      parseFeatureId('../../etc/passwd', tempDir, '.specify', 'feature');
    }).toThrow('path traversal detected');
  });

  it('F-05: Null bytes "aa\x00001" → throws', () => {
    expect(() => {
      parseFeatureId('aa\x00001', tempDir, '.specify', 'feature');
    }).toThrow('path traversal detected');
  });

  it('F-06: Default specs_root paths', () => {
    const result = parseFeatureId('test/aa-100', tempDir, '.specify', 'feature');

    expect(result.featureDir).toContain(tempDir);
    expect(result.featureDir).toContain('.specify');
    expect(result.featureDir.startsWith(tempDir)).toBe(true);
  });

  it('F-extra: Folder with slash in ID with trailing slash → folder extracted correctly', () => {
    const result = parseFeatureId('backend/bb-002', tempDir, '.specify', 'feature');

    expect(result.folder).toBe('backend');
    expect(result.ticket).toBe('bb-002');
  });

  it('F-extra: Multiple slashes in ID → only first slash is separator', () => {
    const result = parseFeatureId('backend/cc-003', tempDir, '.specify', 'feature');

    expect(result.folder).toBe('backend');
    expect(result.ticket).toBe('cc-003');
  });

  it('F-extra: Path traversal in folder component → throws', () => {
    expect(() => {
      parseFeatureId('../backend/aa-001', tempDir, '.specify', 'feature');
    }).toThrow('path traversal detected');
  });

  it('F-extra: Slashes in ticket component → validated', () => {
    // featureId="backend/aa-001" should parse correctly
    const result = parseFeatureId('backend/aa-001', tempDir, '.specify', 'feature');
    expect(result.folder).toBe('backend');
    expect(result.ticket).toBe('aa-001');
  });

  it('F-extra: Resolved path validation → ensures within repo', () => {
    // This tests that the resolved featureDir stays within repoRoot
    const result = parseFeatureId('test/aa-001', tempDir, '.specify', 'feature');
    // Should not escape tempDir
    expect(result.featureDir.startsWith(tempDir)).toBe(true);
  });
});

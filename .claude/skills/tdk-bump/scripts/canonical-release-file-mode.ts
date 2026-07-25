export const CANONICAL_REGULAR_FILE_MODE = "0644" as const;

export type CanonicalRegularFileMode = typeof CANONICAL_REGULAR_FILE_MODE;

/**
 * Release manifests record stable regular-file metadata, not filesystem permissions.
 */
export function canonicalReleaseFileMode(_physicalMode: number): CanonicalRegularFileMode {
  return CANONICAL_REGULAR_FILE_MODE;
}

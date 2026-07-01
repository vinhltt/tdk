// Shared plugin-source manifest types, copied from the sibling changelog checks module
// (.specify/scripts/ts/src/commands/changelog/checks/types.ts) since harness code only
// needs the Manifest/ManifestEntry shapes, not the changelog verify command itself.

export interface ManifestEntry {
  version: string;
  components?: {
    skills?: Record<string, { version: string }>;
    agents?: Record<string, { version: string }>;
    hooks?: Record<string, { version: string }>;
    commands?: Record<string, { version: string }>;
  };
  files?: Record<string, string>;
}

export interface Manifest {
  algorithm?: string;
  generated_at?: string;
  plugins: Record<string, ManifestEntry>;
}

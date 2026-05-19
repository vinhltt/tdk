// Shared types for changelog verify checks.
// Each check is a pure function: read files, compare, return result.
// No process.exit(), no stdout — aggregation + printing lives in verify.ts.

export interface CheckResult {
  ok: boolean;
  index: number;        // 1..5 (display index in failure output)
  name: string;         // short human label, e.g. "CHANGELOG header"
  expected?: string;
  actual?: string;
  fixHint?: string;
  path?: string;        // primary file the check inspected (for debugging)
}

export interface CheckOpts {
  root: string;                     // absolute path containing `.specify/` and `.claude-plugin/`
  expectedVersion: string;          // X.Y.Z — top-level marketplace target version
  plugins: string[];                // plugin names to inspect (may be empty → auto-inferred)
  skills: string[];                 // skill names to inspect (may be empty → auto-inferred)
}

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

// JSON envelope contract between TS resolver (this command) and SKILL.md orchestrator.
// Stdout-stable shape — DO NOT change without bumping skill version.

export type DocsMode = 'init' | 'update' | 'force';

export type DocsTarget = {
  name: string;
  wsPath: string;       // relative to workspace root
  outputDir: string;    // absolute path: <docsPath>/sub-workspaces/<name>/
  packedFile: string;   // absolute path to repomix output
  tokenCount: number;   // -1 if parse failed
  mode: DocsMode;
  existingFiles: string[]; // names found among the 4 expected docs
};

export type DocsErrorCode =
  | 'EMPTY_CONFIG'
  | 'MISSING_BIN'
  | 'NO_ARGS'
  | 'INVALID_ARGS'
  | 'UNKNOWN_SW'
  | 'MISSING_PATH'
  | 'CONFIG_NOT_FOUND';

export type DocsEnvelope =
  | {
      ok: true;
      targets: DocsTarget[];
      cleanupCandidates: string[];
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      code: DocsErrorCode;
    };

export const EXPECTED_DOC_FILES = [
  'codebase-summary.md',
  'code-standards.md',
  'system-architecture.md',
  'README.md',
] as const;

export class DocsError extends Error {
  constructor(
    public readonly code: DocsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DocsError';
  }
}

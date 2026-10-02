// Shared types for tdk-scout Tier 1 parser.

export const TIER1_VERSION = 2;
// Preserve full per-file coverage through the existing 800-file boundary.
// Larger scopes need a byte-bounded directory view; the count alone is not a size guarantee.
export const MAX_SCOUT_FILES = 800;
export const MAX_AGGREGATED_BYTES = 50_000;

export interface FileBlock {
  path: string;
  body: string;
}

export interface FileEntry {
  path: string;
  loc: number;
  tokens: number;
  imports: string[];
  exports: string[];
  symbols: string[];
}

export type TreeNode = {
  [key: string]: TreeNode | string[];
};

export interface DirSummary {
  path: string;
  fileCount: number;
  totalLoc: number;
  totalTokens: number;
  entryPoints: string[];
  imports: { path: string; fileCount: number }[];
}

export interface Tier1Result {
  tier1Version: number;
  scope: string;
  totalFiles: number;
  totalLoc: number;
  totalTokens: number;
  tier1GeneratedAt: string;
  files: FileEntry[];
  tree: TreeNode;
  unparsed: string[];
  aggregated?: DirSummary[];
  aggregationDepth?: number;
  unparsedCount?: number;
}

export interface LanguageParser {
  extractImports: (body: string) => string[];
  extractExports: (body: string) => string[];
  extractSymbols: (body: string) => string[];
}

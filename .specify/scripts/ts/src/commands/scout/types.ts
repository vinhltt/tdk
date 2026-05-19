// Shared types for tdk-scout Tier 1 parser.

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

export interface Tier1Result {
  scope: string;
  totalFiles: number;
  totalLoc: number;
  totalTokens: number;
  tier1GeneratedAt: string;
  files: FileEntry[];
  tree: TreeNode;
  unparsed: string[];
}

export interface LanguageParser {
  extractImports: (body: string) => string[];
  extractExports: (body: string) => string[];
  extractSymbols: (body: string) => string[];
}

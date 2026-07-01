import type { CodexHooksJsonFragment } from './lib/harness-transform/hooks-json-fragment';

export type FlatClaudeRecord =
  | FlatClaudeAgentRecord
  | FlatClaudeSkillRecord
  | FlatClaudeCommandRecord
  | FlatClaudeHooksRecord
  | FlatClaudeSettingsRecord
  | FlatClaudeMdRecord;

export interface FlatClaudeFrontmatterFile {
  sourcePath: string;
  sourceRelativePath: string;
  name: string;
  description?: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface FlatClaudeAgentRecord extends FlatClaudeFrontmatterFile {
  kind: 'agent';
}

export interface FlatClaudeCommandRecord extends FlatClaudeFrontmatterFile {
  kind: 'command';
  segments: string[];
}

export interface FlatClaudeSkillFile {
  sourcePath: string;
  sourceRelativePath: string;
  skillRelativePath: string;
}

export interface FlatClaudeSkillRecord extends FlatClaudeFrontmatterFile {
  kind: 'skill';
  skillName: string;
  rootRelativePath: string;
  files: FlatClaudeSkillFile[];
}

export interface FlatClaudeHookCommand {
  command: string;
  timeout?: number;
  matcher?: string;
  sourceRelativePath?: string;
}

export interface FlatClaudeHooksRecord {
  kind: 'hooks';
  sourcePath: string;
  sourceRelativePath: string;
  hooksByEvent: Record<string, FlatClaudeHookCommand[]>;
  files: FlatClaudeSkillFile[];
}

export interface FlatClaudeSettingsRecord {
  kind: 'settings';
  sourcePath: string;
  sourceRelativePath: string;
  value: unknown;
}

export interface FlatClaudeMdRecord {
  kind: 'claude-md';
  sourcePath: string;
  sourceRelativePath: string;
}

export interface UnrecognizedEntry {
  path: string;
  reason: string;
}

export interface FlatClaudeInventory {
  consumerRoot: string;
  records: FlatClaudeRecord[];
  unrecognized: UnrecognizedEntry[];
  warnings: string[];
}

export interface UnknownArtifact {
  path: string;
  reason: string;
}

export interface MigrationReport {
  recognized: string[];
  reported: UnknownArtifact[];
  skipped: UnknownArtifact[];
  warnings: string[];
}

export interface CodexTargetFile {
  sourcePath: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  sourceChecksum: string;
  installedChecksum: string;
  content: Buffer;
}

export interface CodexWritePlan {
  files: CodexTargetFile[];
  warnings: string[];
  hooksFragment?: CodexHooksJsonFragment;
}

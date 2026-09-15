import type { CodexHooksJsonFragment } from './lib/harness-transform/hooks-json-fragment';
import type { ConvertPart } from './convert-parts';

export type FlatClaudeRecord =
  | FlatClaudeAgentRecord
  | FlatClaudeRuleRecord
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
  frontmatterParseError?: string;
  body: string;
}

export interface FlatClaudeAgentRecord extends FlatClaudeFrontmatterFile {
  kind: 'agent';
}

export interface FlatClaudeRuleRecord extends FlatClaudeFrontmatterFile {
  kind: 'rule';
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
  args?: unknown;
  shell?: unknown;
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

export interface FlatClaudeSettingsParseError {
  sourcePath: string;
  sourceRelativePath: '.claude/settings.json';
  message: string;
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
  settingsParseError?: FlatClaudeSettingsParseError;
  skillSymlinks?: string[];
}

export interface UnknownArtifact {
  path: string;
  reason: string;
}

export interface MigrationFact {
  layer: 1 | 2 | 3;
  status: 'converted' | 'dropped' | 'local-not-converted' | 'signal' | 'note';
  message: string;
  source?: string;
  key?: string;
}

export interface MigrationReport {
  recognized: string[];
  reported: UnknownArtifact[];
  skipped: UnknownArtifact[];
  warnings: string[];
  facts?: MigrationFact[];
}

export interface CodexTargetFile {
  sourcePath: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  sourceChecksum: string;
  installedChecksum: string;
  content: Buffer;
}

export interface ConvertTargetFile extends CodexTargetFile {
  part?: ConvertPart;
  managedRegionChecksum?: string;
  currentManagedRegionChecksum?: string;
  unmanageAfterWrite?: boolean;
}

export interface CodexWritePlan {
  files: CodexTargetFile[];
  warnings: string[];
  hooksFragment?: CodexHooksJsonFragment;
}

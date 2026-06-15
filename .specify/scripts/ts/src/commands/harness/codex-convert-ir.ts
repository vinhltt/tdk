export interface CodexConvertFile {
  sourcePath: string;
  sourceRelativePath: string;
  content: Buffer;
  checksum: string;
}

export interface CodexConvertFrontmatterFile extends CodexConvertFile {
  name: string;
  description?: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface CodexConvertSkill {
  name: string;
  files: CodexConvertFile[];
}

export interface CodexConvertHookCommand {
  event: string;
  matcher?: string;
  command: string;
  timeout?: number;
}

export interface CodexConvertPlugin {
  name: string;
  version: string;
  description: string;
  root: string;
  claudePlugin: Record<string, unknown>;
  interfaceSource?: Record<string, unknown>;
  legacyInterface?: Record<string, unknown>;
  agents: CodexConvertFrontmatterFile[];
  commands: CodexConvertFrontmatterFile[];
  skills: CodexConvertSkill[];
  hooks: {
    commands: CodexConvertHookCommand[];
    files: CodexConvertFile[];
  };
  lib: CodexConvertFile[];
  warnings: string[];
}

export interface CodexPluginArtifact {
  sourcePath: string;
  sourceRelativePath: string;
  artifactRelativePath: string;
  content: Buffer;
}

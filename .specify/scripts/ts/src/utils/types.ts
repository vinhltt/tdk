// Zod schemas + TypeScript types for .specify.json configuration
// Source of truth: all config types derived from Zod schemas via z.infer<>

import { z } from 'zod';

// --- Test strategy enum source of truth ---

export const TEST_STRATEGIES = ['co-location', 'mirror', 'separate-project'] as const;
export type TestStrategy = typeof TEST_STRATEGIES[number];

// --- Sub-schemas ---

export const ModuleSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9._-]+$/, 'alphanumeric, dots, hyphens only').describe('Module identifier used by TDK commands.'),
  path: z.string().min(1).refine(p => !p.includes('..'), 'path traversal (..) not allowed').describe('Module path relative to its sub-workspace.'),
  testPath: z.string().optional().describe('Optional test path for this module.'),
});

// ExcludeSchema: NO outer .default — validator handles nullish via `?? []`.
// Inner .default([]) keeps parsed shape stable when `exclude` IS provided.
export const ExcludeSchema = z.object({
  source: z.array(z.string()).default([]),
  test: z.array(z.string()).default([]),
}).optional();

export const TestMappingSchema = z.object({
  strategy: z.enum(TEST_STRATEGIES, {
    errorMap: (issue, ctx) => {
      if (issue.code === 'invalid_enum_value') {
        const received = String((issue as { received?: unknown }).received ?? '');
        if (received === 'separate-folder') {
          return {
            message: `Strategy 'separate-folder' has been removed. Migrate to 'mirror' — see docs/en/tdk-ut-backfill-skills-usage.md section 6.`,
          };
        }
        return {
          message: `Unknown testMapping.strategy: '${received}'. Allowed: ${TEST_STRATEGIES.join(', ')}`,
        };
      }
      return { message: ctx.defaultError };
    },
  }).optional().describe('How tests are mapped for this sub-workspace.'),
  exclude: ExcludeSchema.describe('Source and test globs excluded from test mapping.'),
});

export const SubWorkspaceSchema = z.object({
  name: z.string().min(1).describe('Sub-workspace identifier.'),
  path: z.string().min(1).describe('Sub-workspace path relative to the workspace root.'),
  modules: z.array(ModuleSchema).optional().describe('Optional modules inside this sub-workspace.'),
  hasModules: z.boolean().optional().describe('Whether this sub-workspace should be treated as modular.'),
  testMapping: TestMappingSchema.optional().describe('Optional test mapping behavior for this sub-workspace.'),
  docs: z.object({
    path: z.string().optional().describe('Documentation path override for this sub-workspace.'),
  }).optional().describe('Sub-workspace documentation settings.'),
});

export const ArchitectureSchema = z.object({
  type: z.enum(['monolith', 'modular-monolith', 'microservices', 'layered-application']).describe('Workspace architecture pattern.'),
  description: z.string().optional().describe('Optional human-readable architecture summary.'),
  stack: z.record(z.unknown()).optional().describe('Technology stack metadata.'),
  layers: z.array(z.record(z.unknown())).optional().describe('Architecture layer metadata.'),
  communication: z.record(z.unknown()).optional().describe('Service communication metadata.'),
  deployment: z.record(z.unknown()).optional().describe('Deployment metadata.'),
});

export const RulesPathSchema = z.object({
  path: z.string().default('.specify/rules').describe('Directory containing Markdown rule files, relative to the workspace root.'),
}).describe('Rules directory configuration.');

export const RulesConfigSchema = z.union([
  RulesPathSchema,
  z.array(z.unknown()).describe('Legacy inline rule definitions. Prefer rules.path for file-backed rules.'),
]).describe('Workspace rules configuration.');

// --- Main config schema ---
// [V4-1, V4-6] Use .parse() (strict). Unknown keys stripped.
// Plugins must define fields in this schema.

export const SpecifyConfigSchema = z.object({
  version: z.string().default('1.0').describe('TDK config schema version.'),
  name: z.string().min(1).describe('Workspace name shown in config detection output.'),
  architecture: ArchitectureSchema.optional().describe('Optional architecture metadata.'),
  docs: z.object({
    path: z.string().default('.specify/configurations').describe('Project documentation path relative to the workspace root.'),
    sync: z.object({
      backup: z.boolean().default(true).describe('Create backups before docs sync writes.'),
      exclude: z.array(z.string()).optional().describe('Docs sync exclusion globs.'),
    }).optional().describe('Documentation sync settings.'),
    rules: z.array(z.string()).optional().describe('Documentation rule file references.'),
  }).optional().describe('Documentation settings.'),
  memory: z.object({
    path: z.string().default('.specify/memory').describe('Memory storage path relative to the workspace root.'),
  }).default({ path: '.specify/memory' }).describe('TDK memory settings.'),
  git: z.object({
    mainBranch: z.string().default('master').describe('Main branch name used by TDK workflows.'),
    prefixList: z.string().default('feat').describe('Default ticket or branch prefix list.'),
  }).optional().describe('Git workflow settings.'),
  specs: z.object({
    root: z.string().default('.specify').describe('Root folder for generated specs.'),
    defaultFolder: z.string().default('feature').describe('Default folder for generated feature specs.'),
    ticketFormat: z.string().default('^([a-zA-Z]+/)?([a-zA-Z]+)-([0-9]+)$').describe('Regular expression used to parse ticket identifiers.'),
  }).optional().describe('Specification generation settings.'),
  changelog: z.object({
    exclude: z.array(z.string()).optional().describe('Changelog exclusion globs.'),
  }).optional().describe('Changelog settings.'),
  subWorkspaces: z.array(SubWorkspaceSchema).optional().describe('Child workspaces managed by this TDK config.'),
  rules: RulesConfigSchema.optional(),
  metadata: z.record(z.unknown()).optional().describe('Plugin-specific metadata.'),
  commands: z.record(z.unknown()).optional().describe('Plugin-specific command metadata.'),
  validation: z.object({
    hook: z.string().optional().describe('Optional validation hook command.'),
    timeout: z.number().default(30).describe('Validation hook timeout in seconds.'),
    failBehavior: z.enum(['exit', 'warn']).default('exit').describe('Behavior when validation fails.'),
  }).optional().describe('Validation hook settings.'),
  // [RT3-10] test config for tdk-test-api plugin
  test: z.record(z.unknown()).optional().describe('tdk-test-api plugin settings.'),
  logLevel: z.enum([
    'Trace', 'Debug', 'Information', 'Warning', 'Error', 'Critical',
  ]).default('Information').describe('TDK logging level.'),
});

// --- Inferred TypeScript types ---

export type SpecifyConfig = z.infer<typeof SpecifyConfigSchema>;
export type SubWorkspace = z.infer<typeof SubWorkspaceSchema>;
export type Module = z.infer<typeof ModuleSchema>;
export type TestMapping = z.infer<typeof TestMappingSchema>;
export type Architecture = z.infer<typeof ArchitectureSchema>;

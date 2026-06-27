// Zod schemas + TypeScript types for .specify.json configuration
// Source of truth: all config types derived from Zod schemas via z.infer<>

import { z } from 'zod';

// --- Test strategy enum source of truth ---

export const TEST_STRATEGIES = ['co-location', 'mirror', 'separate-project'] as const;
export type TestStrategy = typeof TEST_STRATEGIES[number];

// --- Sub-schemas ---

export const ModuleSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9._-]+$/, 'alphanumeric, dots, hyphens only'),
  path: z.string().min(1).refine(p => !p.includes('..'), 'path traversal (..) not allowed'),
  testPath: z.string().optional(),
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
  }).optional(),
  exclude: ExcludeSchema,
});

export const SubWorkspaceSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  modules: z.array(ModuleSchema).optional(),
  hasModules: z.boolean().optional(),
  testMapping: TestMappingSchema.optional(),
  docs: z.object({
    path: z.string().optional(),
  }).optional(),
});

export const ArchitectureSchema = z.object({
  type: z.enum(['monolith', 'modular-monolith', 'microservices', 'layered-application']),
  description: z.string().optional(),
  stack: z.record(z.unknown()).optional(),
  layers: z.array(z.record(z.unknown())).optional(),
  communication: z.record(z.unknown()).optional(),
  deployment: z.record(z.unknown()).optional(),
});

// --- Main config schema ---
// [V4-1, V4-6] Use .parse() (strict). Unknown keys stripped.
// Plugins must define fields in this schema.

export const SpecifyConfigSchema = z.object({
  version: z.string().default('1.0'),
  name: z.string().min(1),
  architecture: ArchitectureSchema.optional(),
  docs: z.object({
    path: z.string().default('.specify/configurations'),
    sync: z.object({
      backup: z.boolean().default(true),
      exclude: z.array(z.string()).optional(),
    }).optional(),
    rules: z.array(z.string()).optional(),
  }).optional(),
  memory: z.object({
    path: z.string().default('.specify/memory'),
  }).default({ path: '.specify/memory' }),
  git: z.object({
    mainBranch: z.string().default('master'),
    prefixList: z.string().default('feat'),
  }).optional(),
  specs: z.object({
    root: z.string().default('.specify'),
    defaultFolder: z.string().default('feature'),
    ticketFormat: z.string().default('^([a-zA-Z]+/)?([a-zA-Z]+)-([0-9]+)$'),
  }).optional(),
  changelog: z.object({
    exclude: z.array(z.string()).optional(),
  }).optional(),
  subWorkspaces: z.array(SubWorkspaceSchema).optional(),
  rules: z.array(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  commands: z.record(z.unknown()).optional(),
  validation: z.object({
    hook: z.string().optional(),
    timeout: z.number().default(30),
    failBehavior: z.enum(['exit', 'warn']).default('exit'),
  }).optional(),
  // [RT3-10] test config for tdk-test-api plugin
  test: z.record(z.unknown()).optional(),
  logLevel: z.enum([
    'Trace', 'Debug', 'Information', 'Warning', 'Error', 'Critical',
  ]).default('Information'),
});

// --- Inferred TypeScript types ---

export type SpecifyConfig = z.infer<typeof SpecifyConfigSchema>;
export type SubWorkspace = z.infer<typeof SubWorkspaceSchema>;
export type Module = z.infer<typeof ModuleSchema>;
export type TestMapping = z.infer<typeof TestMappingSchema>;
export type Architecture = z.infer<typeof ArchitectureSchema>;

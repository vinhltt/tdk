import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { validateContainedNoFollowPath, validateSafeSegment } from './install-settings-paths';
import type { HarnessInstallManifest, HarnessName } from './types';

export interface RewriteSettings {
  paths: boolean;
  textFiles: boolean;
  hooks: boolean;
}

export interface InstallSettings {
  version: 1;
  defaults: {
    sourcePrefix: string;
    targetPrefix: string;
    selectedPlugins: string[];
    rewrite: RewriteSettings;
  };
  harnesses: {
    claude: {
      enabled: boolean;
      targetDir: '.claude';
      settingsPath: '.claude/settings.json';
    };
    codex?: {
      enabled: boolean;
      targetDir: '.codex';
    };
  };
}

export interface ResolvedClaudeSettings {
  harness: 'claude';
  sourcePrefix: string;
  targetPrefix: string;
  selectedPlugins: string[];
  targetDir: '.claude';
  settingsPath: '.claude/settings.json';
  rewrite: RewriteSettings;
  existingInstall: boolean;
}

const RewriteSchema = z.object({
  paths: z.boolean().default(true),
  textFiles: z.boolean().default(true),
  hooks: z.boolean().default(true),
}).strict();

const HarnessSchema = z.object({
  enabled: z.boolean().optional(),
  targetDir: z.string(),
  settingsPath: z.string().optional(),
}).passthrough();

const SettingsSchema = z.object({
  version: z.literal(1),
  defaults: z.object({
    sourcePrefix: z.string().default('tdk-'),
    targetPrefix: z.string().default('tdk-'),
    selectedPlugins: z.array(z.string()).default([]),
    rewrite: RewriteSchema.default({ paths: true, textFiles: true, hooks: true }),
  }).strict(),
  harnesses: z.object({
    claude: HarnessSchema.optional(),
    codex: HarnessSchema.optional(),
  }).passthrough().default({}),
}).strict();

export function settingsPathFor(root: string): string {
  return path.join(root, '.specify', 'install-settings.json');
}

export function normalizePrefix(input: string): string {
  const value = input.trim();
  if (value === '') throw new Error('Prefix cannot be empty.');
  const prefixed = value.endsWith('-') ? value : `${value}-`;
  if (!/^[a-z0-9][a-z0-9-]*-$/.test(prefixed)) {
    throw new Error(`Unsafe prefix: ${input}`);
  }
  return prefixed;
}

export function assertAllowedHarnessTargetDir(root: string, targetDir: string): '.claude' {
  validateContainedNoFollowPath(root, targetDir, 'Claude target dir');
  if (targetDir !== '.claude') throw new Error('Only .claude targetDir is supported in install settings v1.');
  return '.claude';
}

export function defaultInstallSettings(selectedPlugins: string[] = []): InstallSettings {
  return {
    version: 1,
    defaults: {
      sourcePrefix: 'tdk-',
      targetPrefix: 'tdk-',
      selectedPlugins,
      rewrite: { paths: true, textFiles: true, hooks: true },
    },
    harnesses: {
      claude: { enabled: true, targetDir: '.claude', settingsPath: '.claude/settings.json' },
      codex: { enabled: false, targetDir: '.codex' },
    },
  };
}

function validateSettings(root: string, input: unknown): InstallSettings {
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid install-settings.json: ${parsed.error.message}`);
  const raw = parsed.data as z.infer<typeof SettingsSchema> & {
    harnesses: Record<string, Record<string, unknown> | undefined>;
  };
  for (const [name, harness] of Object.entries(raw.harnesses)) {
    validateSafeSegment(name, 'harness name');
    if (!harness) continue;
    if ('targetPrefix' in harness || 'selectedPlugins' in harness) {
      throw new Error('Per-harness targetPrefix and selectedPlugins are not supported in install settings v1.');
    }
  }

  const sourcePrefix = normalizePrefix(raw.defaults.sourcePrefix);
  const targetPrefix = normalizePrefix(raw.defaults.targetPrefix);
  const selectedPlugins = raw.defaults.selectedPlugins.map((plugin) => validateSafeSegment(plugin, 'plugin id'));
  const claude = raw.harnesses.claude ?? { enabled: true, targetDir: '.claude', settingsPath: '.claude/settings.json' };
  const targetDir = assertAllowedHarnessTargetDir(root, claude.targetDir);
  if (claude.settingsPath !== undefined && claude.settingsPath !== '.claude/settings.json') {
    throw new Error('Only .claude/settings.json settingsPath is supported in install settings v1.');
  }
  validateContainedNoFollowPath(root, '.claude/settings.json', 'Claude settings path');

  const codex = raw.harnesses.codex;
  if (codex?.targetDir && codex.targetDir !== '.codex') {
    throw new Error('Only .codex targetDir is accepted for disabled Codex settings.');
  }

  return {
    version: 1,
    defaults: { sourcePrefix, targetPrefix, selectedPlugins, rewrite: raw.defaults.rewrite },
    harnesses: {
      claude: { enabled: claude.enabled ?? true, targetDir, settingsPath: '.claude/settings.json' },
      ...(codex ? { codex: { enabled: Boolean(codex.enabled), targetDir: '.codex' as const } } : {}),
    },
  };
}

export function loadInstallSettings(root: string): InstallSettings | undefined {
  const filePath = settingsPathFor(root);
  if (!fs.existsSync(filePath)) return undefined;
  return validateSettings(root, JSON.parse(fs.readFileSync(filePath, 'utf-8')));
}

export function synthesizeLegacyClaudeSettings(root: string, oldManifest: HarnessInstallManifest): InstallSettings | undefined {
  if (oldManifest.managedFiles.length === 0 && oldManifest.managedHooks.length === 0 && oldManifest.selectedPlugins.length === 0) {
    return undefined;
  }
  return validateSettings(root, defaultInstallSettings(oldManifest.selectedPlugins));
}

export function resolveClaudeSettings(params: {
  root: string;
  settings?: InstallSettings;
  oldManifest?: HarnessInstallManifest;
  cliPrefix?: string;
  cliPlugins?: string[];
}): ResolvedClaudeSettings {
  const legacy = !params.settings && params.oldManifest
    ? synthesizeLegacyClaudeSettings(params.root, params.oldManifest)
    : undefined;
  const settings = params.settings ?? legacy ?? defaultInstallSettings();
  if (!settings.harnesses.claude.enabled) throw new Error('Claude harness is disabled in install settings.');
  const targetPrefix = params.cliPrefix ? normalizePrefix(params.cliPrefix) : settings.defaults.targetPrefix;
  const selectedPlugins = params.cliPlugins && params.cliPlugins.length > 0
    ? params.cliPlugins.map((plugin) => validateSafeSegment(plugin, 'plugin id'))
    : settings.defaults.selectedPlugins;
  return {
    harness: 'claude',
    sourcePrefix: settings.defaults.sourcePrefix,
    targetPrefix,
    selectedPlugins,
    targetDir: settings.harnesses.claude.targetDir,
    settingsPath: settings.harnesses.claude.settingsPath,
    rewrite: settings.defaults.rewrite,
    existingInstall: Boolean(params.settings || legacy),
  };
}

export function parseHarnessList(value: string): HarnessName[] {
  const harnesses = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (harnesses.length === 0) throw new Error('--harness requires at least one harness name');
  return [...new Set(harnesses)].map((harness) => {
    if (harness !== 'claude' && harness !== 'codex') throw new Error(`Unsupported harness "${harness}".`);
    return harness;
  });
}

export function saveInstallSettings(root: string, settings: InstallSettings): void {
  const filePath = settingsPathFor(root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(validateSettings(root, settings), null, 2)}\n`, 'utf-8');
}

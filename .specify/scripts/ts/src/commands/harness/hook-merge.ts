import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { sha256Text } from './checksum';
import type { Collision, ManagedHook, PlannedHookMutation } from './types';

const CommandHookSchema = z.object({
  type: z.literal('command'),
  command: z.string(),
});

const HookEntrySchema = z.object({
  matcher: z.string().default(''),
  hooks: z.array(CommandHookSchema),
});

const SourceHooksSchema = z.object({
  hooks: z.record(z.array(HookEntrySchema)),
});

const SettingsSchema = z.object({
  hooks: z.record(z.array(HookEntrySchema)).optional(),
}).passthrough();

type Settings = z.infer<typeof SettingsSchema>;

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

export function rewriteHookCommand(command: string): string {
  const match = command.match(/^node\s+"?\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([A-Za-z0-9_.-]+\.cjs)"?\s+([A-Za-z0-9_.-]+)$/);
  if (!match) {
    throw new Error(`Unsupported hook command template: ${command}`);
  }
  return `cd "$CLAUDE_PROJECT_DIR" && node "$CLAUDE_PROJECT_DIR/.claude/hooks/${match[1]}" ${match[2]}`;
}

function hookId(plugin: string, event: string, matcher: string, command: string): string {
  return `tdk:${plugin}:${event}:${matcher}:${sha256Text(normalizeCommand(command)).slice(0, 16)}`;
}

function hookKey(event: string, matcher: string, command: string): string {
  return `${event}\0${matcher}\0${normalizeCommand(command)}`;
}

export function readSettings(consumerRoot: string): unknown {
  const settingsPath = path.join(consumerRoot, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
}

export function buildHookMerge(params: {
  consumerRoot: string;
  selectedPlugins: string[];
  pluginRoots: Map<string, string>;
  previousHooks: ManagedHook[];
  settings: unknown;
}): { nextSettings: unknown; managedHooks: ManagedHook[]; mutations: PlannedHookMutation[]; collisions: Collision[] } {
  const parsedSettings = SettingsSchema.safeParse(params.settings ?? {});
  if (!parsedSettings.success) {
    return {
      nextSettings: params.settings ?? {},
      managedHooks: params.previousHooks,
      mutations: [],
      collisions: [{ kind: 'invalid-hook-config', message: 'Existing .claude/settings.json hooks shape is invalid.' }],
    };
  }

  const settings: Settings = { ...parsedSettings.data, hooks: { ...(parsedSettings.data.hooks ?? {}) } };
  const settingsHooks = settings.hooks!;
  const previousIds = new Set(params.previousHooks.map((hook) => hook.id));
  const selected = new Set(params.selectedPlugins);
  const desiredHooks: ManagedHook[] = [];
  const collisions: Collision[] = [];

  for (const plugin of params.selectedPlugins) {
    const pluginRoot = params.pluginRoots.get(plugin);
    if (!pluginRoot) continue;
    const hooksPath = path.join(pluginRoot, 'hooks', 'hooks.json');
    if (!fs.existsSync(hooksPath)) continue;

    const source = SourceHooksSchema.safeParse(JSON.parse(fs.readFileSync(hooksPath, 'utf-8')));
    if (!source.success) {
      collisions.push({ kind: 'invalid-hook-config', plugin, path: hooksPath, message: `Invalid hook config for plugin "${plugin}".` });
      continue;
    }

    for (const [event, entries] of Object.entries(source.data.hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          try {
            const command = rewriteHookCommand(hook.command);
            desiredHooks.push({
              id: hookId(plugin, event, entry.matcher, command),
              plugin,
              event,
              matcher: entry.matcher,
              type: 'command',
              command,
            });
          } catch (err) {
            collisions.push({ kind: 'unknown-hook-command', plugin, path: hooksPath, message: (err as Error).message });
          }
        }
      }
    }
  }

  const desiredByKey = new Map(desiredHooks.map((hook) => [hookKey(hook.event, hook.matcher, hook.command), hook]));
  const existingManagedById = new Set(params.previousHooks.filter((hook) => selected.has(hook.plugin)).map((hook) => hook.id));
  const mutations: PlannedHookMutation[] = [];

  for (const hook of params.previousHooks) {
    if (!selected.has(hook.plugin)) {
      mutations.push({ action: 'remove', hook });
    }
  }

  for (const hook of desiredHooks) {
    if (!existingManagedById.has(hook.id)) {
      mutations.push({ action: 'add', hook });
    }
  }

  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        const key = hookKey(event, entry.matcher, hook.command);
        if (desiredByKey.has(key) && !previousIds.has(desiredByKey.get(key)!.id)) {
          collisions.push({
            kind: 'unmanaged-duplicate-hook',
            message: `Unmanaged duplicate hook exists for ${event}:${entry.matcher}.`,
          });
        }
      }
    }
  }

  if (collisions.length > 0) {
    return { nextSettings: settings, managedHooks: params.previousHooks, mutations, collisions };
  }

  for (const mutation of mutations.filter((m) => m.action === 'remove')) {
    const entries = settingsHooks[mutation.hook.event] ?? [];
    settingsHooks[mutation.hook.event] = entries
      .map((entry) => ({
        ...entry,
        hooks: entry.matcher === mutation.hook.matcher
          ? entry.hooks.filter((hook) => normalizeCommand(hook.command) !== normalizeCommand(mutation.hook.command))
          : entry.hooks,
      }))
      .filter((entry) => entry.hooks.length > 0);
    if (settingsHooks[mutation.hook.event]?.length === 0) delete settingsHooks[mutation.hook.event];
  }

  for (const hook of desiredHooks) {
    const entries = settingsHooks[hook.event] ?? [];
    const existingEntry = entries.find((entry) => entry.matcher === hook.matcher);
    if (existingEntry) {
      if (!existingEntry.hooks.some((entryHook) => normalizeCommand(entryHook.command) === normalizeCommand(hook.command))) {
        existingEntry.hooks.push({ type: 'command', command: hook.command });
      }
    } else {
      entries.push({ matcher: hook.matcher, hooks: [{ type: 'command', command: hook.command }] });
    }
    settingsHooks[hook.event] = entries;
  }

  const sortedHooks: Record<string, unknown> = {};
  for (const event of Object.keys(settingsHooks).sort()) {
    sortedHooks[event] = (settingsHooks[event] ?? []).sort((a, b) => a.matcher.localeCompare(b.matcher));
  }
  settings.hooks = sortedHooks as Settings['hooks'];

  return { nextSettings: settings, managedHooks: desiredHooks, mutations, collisions };
}

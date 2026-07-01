import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { sha256File, sha256Text } from './checksum';
import { normalizeHookHandler, rewriteHookHandler } from './hook-path-rewrite';
import { actualHookKeys, addHook, managedHookKey, removeHook, type HookEntry } from './hook-reconcile';
import { transformHookHandler } from './prefix-transform';
import type { PrefixTransformSettings } from './prefix-transform';
import type { Collision, HookHandler, ManagedHook, PlannedHookMutation } from './types';

const HookHandlerSchema = z.object({
  type: z.string(),
}).passthrough();

const HookEntrySchema = z.object({
  matcher: z.string().default(''),
  hooks: z.array(HookHandlerSchema),
}).passthrough();

const SourceHooksSchema = z.object({
  hooks: z.record(z.array(HookEntrySchema)),
}).passthrough();

const SettingsSchema = z.object({
  hooks: z.record(z.array(HookEntrySchema)).optional(),
}).passthrough();

type Settings = z.infer<typeof SettingsSchema>;

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

export function rewriteHookCommand(command: string): string {
  const handler = rewriteHookHandler('tdk-core', { type: 'command', command });
  if (typeof handler.command !== 'string') throw new Error(`Unsupported hook command template: ${command}`);
  return handler.command;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hookOwnershipKey(plugin: string, event: string, matcher: string, handler: HookHandler): string {
  return sha256Text(['claude', plugin, event, matcher, normalizeHookHandler(handler)].join('\0'));
}

function hookId(plugin: string, event: string, matcher: string, handler: HookHandler): string {
  return `hook:${hookOwnershipKey(plugin, event, matcher, handler).slice(0, 24)}`;
}

export function readSettings(consumerRoot: string, settingsRelativePath = '.claude/settings.json'): unknown {
  const settingsPath = path.join(consumerRoot, settingsRelativePath);
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
}

export function buildHookMerge(params: {
  consumerRoot: string;
  selectedPlugins: string[];
  pluginRoots: Map<string, string>;
  previousHooks: ManagedHook[];
  settings: unknown;
  rewriteMap?: Map<string, string>;
  prefixSettings: PrefixTransformSettings;
  hookChecksums?: Map<string, string>;
}): { nextSettings: unknown; managedHooks: ManagedHook[]; mutations: PlannedHookMutation[]; collisions: Collision[]; settingsChanged: boolean } {
  const parsedSettings = SettingsSchema.safeParse(params.settings ?? {});
  if (!parsedSettings.success) {
    return {
      nextSettings: params.settings ?? {},
      managedHooks: params.previousHooks,
      mutations: [],
      collisions: [{ kind: 'invalid-hook-config', message: 'Existing .claude/settings.json hooks shape is invalid.' }],
      settingsChanged: false,
    };
  }

  const beforeSettings = cloneJson(parsedSettings.data);
  const settings = cloneJson(parsedSettings.data) as Settings;
  const settingsHooks: Record<string, HookEntry[]> = settings.hooks ?? {};
  const desiredHooks: ManagedHook[] = [];
  const collisions: Collision[] = [];

  for (const plugin of [...params.selectedPlugins].sort()) {
    const pluginRoot = params.pluginRoots.get(plugin);
    if (!pluginRoot) continue;
    const hooksPath = path.join(pluginRoot, 'hooks', 'hooks.json');
    if (!fs.existsSync(hooksPath)) continue;
    const sourceStat = fs.lstatSync(hooksPath);
    if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
      collisions.push({ kind: 'invalid-hook-config', plugin, path: hooksPath, message: `Unsafe hook config for plugin "${plugin}".` });
      continue;
    }
    const sourceChecksum = sha256File(hooksPath);
    if (params.hookChecksums?.get(plugin) && params.hookChecksums.get(plugin) !== sourceChecksum) {
      collisions.push({ kind: 'invalid-hook-config', plugin, path: hooksPath, message: `Hook config checksum mismatch for plugin "${plugin}".` });
      continue;
    }

    const source = SourceHooksSchema.safeParse(JSON.parse(fs.readFileSync(hooksPath, 'utf-8')));
    if (!source.success) {
      collisions.push({ kind: 'invalid-hook-config', plugin, path: hooksPath, message: `Invalid hook config for plugin "${plugin}".` });
      continue;
    }

    for (const [event, entries] of Object.entries(source.data.hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          try {
            const rewriteMap = params.rewriteMap ?? new Map();
            const transformedHook = transformHookHandler(hook as HookHandler, params.prefixSettings);
            const handler = rewriteHookHandler(rewriteMap.get(plugin) ?? plugin, transformedHook);
            const handlerChecksum = sha256Text(normalizeHookHandler(handler));
            const ownershipKey = hookOwnershipKey(plugin, event, entry.matcher, handler);
            desiredHooks.push({
              id: hookId(plugin, event, entry.matcher, handler),
              plugin,
              event,
              matcher: entry.matcher,
              type: handler.type,
              handler,
              command: typeof handler.command === 'string' ? normalizeCommand(handler.command) : undefined,
              sourceRelativePath: 'hooks/hooks.json',
              sourceChecksum,
              handlerChecksum,
              ownershipKey,
            });
          } catch (err) {
            collisions.push({ kind: 'unknown-hook-command', plugin, path: hooksPath, message: (err as Error).message });
          }
        }
      }
    }
  }

  const desiredByKey = new Map<string, ManagedHook>();
  for (const hook of desiredHooks) {
    const key = managedHookKey(hook);
    if (!desiredByKey.has(key)) desiredByKey.set(key, hook);
  }
  const desiredKeys = new Set(desiredByKey.keys());
  const previousKeys = new Set(params.previousHooks.map(managedHookKey));
  const mutations: PlannedHookMutation[] = [];

  for (const hook of params.previousHooks) {
    if (!desiredKeys.has(managedHookKey(hook))) {
      mutations.push({ action: 'remove', hook });
    }
  }

  for (const hook of desiredHooks) {
    if (!previousKeys.has(managedHookKey(hook))) {
      mutations.push({ action: 'add', hook });
    }
  }

  for (const [event, entries] of Object.entries(settingsHooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        const key = `${event}\0${entry.matcher}\0${normalizeHookHandler(hook as HookHandler)}`;
        if (desiredKeys.has(key) && !previousKeys.has(key)) {
          collisions.push({
            kind: 'unmanaged-duplicate-hook',
            message: `Unmanaged duplicate hook exists for ${event}:${entry.matcher}.`,
          });
        }
      }
    }
  }

  if (collisions.length > 0) {
    return { nextSettings: beforeSettings, managedHooks: params.previousHooks, mutations, collisions, settingsChanged: false };
  }

  for (const hook of params.previousHooks) {
    if (!desiredKeys.has(managedHookKey(hook))) removeHook(settingsHooks, hook);
  }

  let keysAfterRemoval = actualHookKeys(settingsHooks);
  for (const hook of desiredByKey.values()) {
    if (!keysAfterRemoval.has(managedHookKey(hook))) {
      addHook(settingsHooks, hook);
      keysAfterRemoval = actualHookKeys(settingsHooks);
    }
  }

  if (Object.keys(settingsHooks).length > 0) settings.hooks = settingsHooks as Settings['hooks'];
  else delete settings.hooks;

  const settingsChanged = JSON.stringify(beforeSettings) !== JSON.stringify(settings);

  return { nextSettings: settings, managedHooks: desiredHooks, mutations, collisions, settingsChanged };
}

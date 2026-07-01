import { normalizeHookHandler } from './hook-path-rewrite';
import type { HookHandler, ManagedHook } from './types';

export interface HookEntry {
  matcher: string;
  hooks: HookHandler[];
  [key: string]: unknown;
}

export function handlerFromManaged(hook: ManagedHook): HookHandler {
  if (hook.handler) return hook.handler;
  if (hook.type === 'command' && typeof hook.command === 'string') {
    return { type: 'command', command: hook.command };
  }
  return { type: hook.type };
}

export function hookKey(event: string, matcher: string, handler: HookHandler): string {
  return `${event}\0${matcher}\0${normalizeHookHandler(handler)}`;
}

export function managedHookKey(hook: ManagedHook): string {
  return hookKey(hook.event, hook.matcher, handlerFromManaged(hook));
}

export function actualHookKeys(settingsHooks: Record<string, HookEntry[]>): Set<string> {
  const keys = new Set<string>();
  for (const [event, entries] of Object.entries(settingsHooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks) keys.add(hookKey(event, entry.matcher, hook));
    }
  }
  return keys;
}

export function removeHook(settingsHooks: Record<string, HookEntry[]>, hook: ManagedHook): void {
  const key = managedHookKey(hook);
  const entries = settingsHooks[hook.event] ?? [];
  settingsHooks[hook.event] = entries
    .map((entry) => ({
      ...entry,
      hooks: entry.matcher === hook.matcher
        ? entry.hooks.filter((entryHook) => hookKey(hook.event, entry.matcher, entryHook) !== key)
        : entry.hooks,
    }))
    .filter((entry) => entry.hooks.length > 0);
  if (settingsHooks[hook.event]?.length === 0) delete settingsHooks[hook.event];
}

export function addHook(settingsHooks: Record<string, HookEntry[]>, hook: ManagedHook): void {
  const handler = handlerFromManaged(hook);
  const key = managedHookKey(hook);
  const entries = settingsHooks[hook.event] ?? [];
  const existingEntry = entries.find((entry) => entry.matcher === hook.matcher);
  if (existingEntry) {
    if (!existingEntry.hooks.some((entryHook) => hookKey(hook.event, hook.matcher, entryHook) === key)) {
      existingEntry.hooks.push(handler);
    }
  } else {
    entries.push({ matcher: hook.matcher, hooks: [handler] });
  }
  settingsHooks[hook.event] = entries;
}

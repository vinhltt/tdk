export function mergeCodexHooksJson(existing: string, fragment: Record<string, unknown[]>, managedOrigins: Set<string>): string {
  let parsed: Record<string, unknown> = {};
  if (existing.trim()) parsed = JSON.parse(existing) as Record<string, unknown>;

  for (const [event, hooks] of Object.entries(parsed)) {
    if (!Array.isArray(hooks)) continue;
    const unmanaged = hooks.filter((item) => {
      const origin = item && typeof item === 'object' ? (item as { _origin?: unknown })._origin : undefined;
      return typeof origin !== 'string' || !managedOrigins.has(origin);
    });
    if (unmanaged.length > 0) parsed[event] = unmanaged;
    else delete parsed[event];
  }

  for (const [event, hooks] of Object.entries(fragment)) {
    const current = Array.isArray(parsed[event]) ? parsed[event] as unknown[] : [];
    parsed[event] = [...current, ...hooks];
  }

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

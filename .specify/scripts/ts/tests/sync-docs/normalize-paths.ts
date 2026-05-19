// normalize-paths.ts
// Path normalization for snapshot comparison
// Replaces absolute fixture root with <FIXTURE_ROOT> placeholder
// to ensure snapshots are portable across machines/runs

export function normalizePaths(obj: unknown, fixtureRoot: string): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => normalizePaths(item, fixtureRoot));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === 'string') {
      // Replace absolute fixture root with placeholder
      result[key] = value.includes(fixtureRoot)
        ? value.replaceAll(fixtureRoot, '<FIXTURE_ROOT>')
        : value;
    } else {
      result[key] = normalizePaths(value, fixtureRoot);
    }
  }

  return result;
}

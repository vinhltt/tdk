// Validate the OSV 2.7 scan-source fields that drive security decisions.
export interface OsvGroup {
  ids: string[];
  aliases: string[];
  max_severity: string;
}
export interface OsvAffected {
  package: { name: string; ecosystem: string };
  ranges: { events: Record<string, string>[] }[];
}
export interface OsvAdvisory {
  id: string;
  aliases: string[];
  databaseSeverity: string;
  affected: OsvAffected[];
}
export interface OsvPackageResult {
  package: { name: string; version: string; ecosystem: string };
  groups: OsvGroup[];
  vulnerabilities: OsvAdvisory[];
}
export interface OsvResult {
  source: { path: string; type: string };
  packages: OsvPackageResult[];
}

function fail(at: string, expected: string): never {
  throw new Error(`Invalid OSV scan at ${at}: expected ${expected}`);
}
function object(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(at, 'object');
  return value as Record<string, unknown>;
}
function array(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) fail(at, 'array');
  return value;
}
function text(value: unknown, at: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) fail(at, 'string');
  return value;
}
function strings(value: unknown, at: string, optional = false): string[] {
  if (value === undefined && optional) return [];
  return array(value, at).map((entry, i) => text(entry, `${at}[${i}]`));
}
function packageIdentity(value: unknown, at: string): OsvAffected['package'] {
  const pkg = object(value, at);
  return { name: text(pkg.name, `${at}.name`), ecosystem: text(pkg.ecosystem, `${at}.ecosystem`) };
}
function affected(value: unknown, at: string): OsvAffected {
  const entry = object(value, at);
  const ranges = entry.ranges === undefined ? [] : array(entry.ranges, `${at}.ranges`);
  if (entry.versions !== undefined) strings(entry.versions, `${at}.versions`);
  return {
    package: packageIdentity(entry.package, `${at}.package`),
    ranges: ranges.map((value, i) => {
      const rangeAt = `${at}.ranges[${i}]`;
      const range = object(value, rangeAt);
      text(range.type, `${rangeAt}.type`);
      const events = array(range.events, `${rangeAt}.events`);
      if (!events.length) fail(`${rangeAt}.events`, 'non-empty array');
      return { events: events.map((value, j) => {
        const eventAt = `${rangeAt}.events[${j}]`;
        const event = object(value, eventAt);
        const fields = Object.keys(event);
        if (fields.length !== 1 || !['introduced', 'fixed', 'last_affected', 'limit'].includes(fields[0]!)) {
          fail(eventAt, 'one OSV range event');
        }
        const key = fields[0]!;
        return { [key]: text(event[key], `${eventAt}.${key}`) };
      }) };
    }),
  };
}
function advisory(value: unknown, at: string): OsvAdvisory {
  const entry = object(value, at);
  const db = entry.database_specific === undefined ? {} : object(entry.database_specific, `${at}.database_specific`);
  const entries = array(entry.affected, `${at}.affected`);
  if (!entries.length) fail(`${at}.affected`, 'non-empty array');
  return {
    id: text(entry.id, `${at}.id`),
    aliases: strings(entry.aliases, `${at}.aliases`, true),
    databaseSeverity: db.severity === undefined ? '' : text(db.severity, `${at}.database_specific.severity`, true),
    affected: entries.map((value, i) => affected(value, `${at}.affected[${i}]`)),
  };
}
function packageResult(value: unknown, at: string): OsvPackageResult {
  const entry = object(value, at);
  const pkg = object(entry.package, `${at}.package`);
  // --all-packages omits both fields for clean packages, rather than emitting [].
  const groups = entry.groups === undefined ? [] : array(entry.groups, `${at}.groups`);
  const vulnerabilities = entry.vulnerabilities === undefined ? [] : array(entry.vulnerabilities, `${at}.vulnerabilities`);
  if (Boolean(groups.length) !== Boolean(vulnerabilities.length)) fail(at, 'groups and vulnerabilities together');
  return {
    package: { ...packageIdentity(pkg, `${at}.package`), version: text(pkg.version, `${at}.package.version`) },
    groups: groups.map((value, i) => {
      const groupAt = `${at}.groups[${i}]`;
      const group = object(value, groupAt);
      const ids = strings(group.ids, `${groupAt}.ids`);
      if (!ids.length) fail(`${groupAt}.ids`, 'non-empty array');
      return {
        ids,
        aliases: strings(group.aliases, `${groupAt}.aliases`, true),
        max_severity: text(group.max_severity, `${groupAt}.max_severity`, true),
      };
    }),
    vulnerabilities: vulnerabilities.map((value, i) => advisory(value, `${at}.vulnerabilities[${i}]`)),
  };
}

export function readOsvResults(json: unknown): OsvResult[] {
  const scan = object(json, '$');
  const results = array(scan.results, '$.results');
  if (!results.length) fail('$.results', 'non-empty array with package evidence (--all-packages)');
  return results.map((value, i) => {
    const at = `$.results[${i}]`;
    const result = object(value, at);
    const source = object(result.source, `${at}.source`);
    const packages = array(result.packages, `${at}.packages`);
    if (!packages.length) fail(`${at}.packages`, 'non-empty array');
    return {
      source: { path: text(source.path, `${at}.source.path`), type: text(source.type, `${at}.source.type`) },
      packages: packages.map((value, j) => packageResult(value, `${at}.packages[${j}]`)),
    };
  });
}

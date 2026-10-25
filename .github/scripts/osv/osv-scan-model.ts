import { normalizeLockfile } from './osv-scan-path';
import { readOsvResults, type OsvAdvisory, type OsvPackageResult } from './osv-scan-schema';

export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low' | 'unrated';
export interface OsvFinding {
  lockfile: string;
  ecosystem: string;
  packageName: string;
  version: string;
  groupId: string;
  advisoryIds: string[];
  score: number | null;
  level: SeverityLevel;
  blocking: boolean;
  fixedVersions: string[];
}

function severityScore(maxSeverity: string): number | null {
  const score = Number.parseFloat(maxSeverity);
  return Number.isFinite(score) ? score : null;
}

export function classifySeverity(maxSeverity: string, dbSeverities: string[]): SeverityLevel {
  const score = severityScore(maxSeverity);
  if (score !== null) {
    if (score >= 9) return 'critical';
    if (score >= 7) return 'high';
    if (score >= 4) return 'moderate';
    return score > 0 ? 'low' : 'unrated';
  }
  const levels = dbSeverities.map(value => value.trim().toUpperCase());
  if (levels.includes('CRITICAL')) return 'critical';
  if (levels.includes('HIGH')) return 'high';
  if (levels.includes('MODERATE') || levels.includes('MEDIUM')) return 'moderate';
  return levels.includes('LOW') ? 'low' : 'unrated';
}

export function findingKey(finding: OsvFinding): string {
  return `${finding.lockfile}|${finding.ecosystem}|${finding.packageName}|${finding.groupId}`;
}

function packageFindings(result: OsvPackageResult, lockfile: string): OsvFinding[] {
  const { package: pkg, groups, vulnerabilities } = result;
  const identities = new Map(vulnerabilities.map(advisory => [advisory, new Set([advisory.id, ...advisory.aliases])]));
  const affectedByAdvisory = new Map(vulnerabilities.map(advisory => [advisory, advisory.affected.filter(entry =>
    entry.package.name === pkg.name && entry.package.ecosystem.toLowerCase() === pkg.ecosystem.toLowerCase())]));
  const grouped = new Set<OsvAdvisory>();
  const findings = groups.map(group => {
    const ids = [...new Set(group.ids)].sort();
    const groupIds = new Set([...ids, ...group.aliases]);
    const matching = vulnerabilities.filter(advisory => [...identities.get(advisory)!].some(id => groupIds.has(id)));
    if (ids.some(id => !matching.some(advisory => identities.get(advisory)!.has(id)))) {
      throw new Error(`Invalid OSV scan: group lacks advisory records (${lockfile}, ${pkg.name}, ${ids.join(', ')})`);
    }
    for (const advisory of matching) {
      if (!affectedByAdvisory.get(advisory)!.length) {
        throw new Error(`Invalid OSV scan: advisory ${advisory.id} does not affect ${pkg.ecosystem}/${pkg.name}`);
      }
      grouped.add(advisory);
    }
    const advisoryIds = [...new Set([...groupIds, ...matching.flatMap(advisory => [advisory.id, ...advisory.aliases])])].sort();
    const dbSeverities = matching
      .filter(advisory => [...identities.get(advisory)!].some(id => id.startsWith('GHSA-')))
      .map(advisory => advisory.databaseSeverity);
    const level = classifySeverity(group.max_severity, dbSeverities);
    const fixedVersions = [...new Set(matching.flatMap(advisory => affectedByAdvisory.get(advisory)!
      .flatMap(entry => entry.ranges.flatMap(range => range.events.flatMap(event => event.fixed ? [event.fixed] : [])))))].sort();
    return {
      lockfile, ecosystem: pkg.ecosystem.toLowerCase(), packageName: pkg.name, version: pkg.version,
      groupId: ids[0]!, advisoryIds, score: severityScore(group.max_severity), level,
      blocking: level === 'critical' || level === 'high', fixedVersions,
    };
  });
  if (grouped.size !== vulnerabilities.length) {
    throw new Error(`Invalid OSV scan: ungrouped advisory (${lockfile}, ${pkg.name})`);
  }
  return findings;
}

export function parseOsvScan(json: unknown, scanRoot: string): OsvFinding[] {
  return readOsvResults(json).flatMap(result => {
    const lockfile = normalizeLockfile(result.source.path, scanRoot);
    return result.packages.flatMap(pkg => packageFindings(pkg, lockfile));
  });
}

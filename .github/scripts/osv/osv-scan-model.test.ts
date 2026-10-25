import { describe, expect, test } from 'bun:test';
import cleanScan from './fixtures/osv-scan-clean.json';
import vulnerableScan from './fixtures/osv-scan-vulnerable.json';
import unscoredScan from './fixtures/osv-scan-unscored-ghsa-high.json';
import dispatchScan from './fixtures/osv-scan-dispatch-sample.json';
import { classifySeverity, findingKey, parseOsvScan } from './osv-scan-model';

const root = '/workspace/repo';

describe('OSV scan findings', () => {
  test('parses every public field from observed OSV 2.7 data', () => {
    const findings = parseOsvScan(vulnerableScan, root);
    expect(findings).toHaveLength(6);
    expect(findings[0]).toEqual({
      lockfile: 'bun.lock', ecosystem: 'npm', packageName: 'lodash', version: '4.17.20',
      groupId: 'GHSA-29mw-wpgm-hmr9', advisoryIds: ['CVE-2020-28500', 'GHSA-29mw-wpgm-hmr9'],
      score: 5.3, level: 'moderate', blocking: false, fixedVersions: ['4.17.21'],
    });
    expect(findings.find(finding => finding.packageName === 'minimist')).toMatchObject({
      score: 9.8, level: 'critical', blocking: true, fixedVersions: ['0.2.4', '1.2.6'],
    });
  });

  test('accepts clean package evidence with empty or omitted advisory arrays', () => {
    expect(parseOsvScan(cleanScan, root)).toEqual([]);
    const scan = structuredClone(cleanScan);
    Reflect.deleteProperty(scan.results[0]!.packages[0]!, 'groups');
    Reflect.deleteProperty(scan.results[0]!.packages[0]!, 'vulnerabilities');
    expect(parseOsvScan(scan, root)).toEqual([]);
  });

  test('normalizes absolute paths under different scan roots to identical keys', () => {
    const oldScan = structuredClone(vulnerableScan);
    const newScan = structuredClone(vulnerableScan);
    oldScan.results[0]!.source.path = '/work/base/.specify/scripts/ts/bun.lock';
    newScan.results[0]!.source.path = '/work/head/.specify/scripts/ts/bun.lock';
    const oldFindings = parseOsvScan(oldScan, '/work/base');
    const newFindings = parseOsvScan(newScan, '/work/head');
    expect(oldFindings).toEqual(newFindings);
    expect(oldFindings[0]!.lockfile).toBe('.specify/scripts/ts/bun.lock');
    expect(oldFindings.map(findingKey)).toEqual(newFindings.map(findingKey));
  });

  test('normalizes root-relative dot segments and Windows separators', () => {
    const scan = structuredClone(vulnerableScan);
    scan.results[0]!.source.path = './.specify\\scripts\\ts/bun.lock';
    expect(parseOsvScan(scan, root)[0]!.lockfile).toBe('.specify/scripts/ts/bun.lock');
    scan.results[0]!.source.path = 'C:\\work\\repo\\packages\\setup\\bun.lock';
    expect(parseOsvScan(scan, 'C:\\work\\repo')[0]!.lockfile).toBe('packages/setup/bun.lock');
  });

  test('unscored GHSA HIGH blocks, without a fabricated numeric score', () => {
    expect(parseOsvScan(unscoredScan, root)[0]).toMatchObject({ score: null, level: 'high', blocking: true });
    const scan = structuredClone(unscoredScan);
    Reflect.deleteProperty(scan.results[0]!.packages[0]!.vulnerabilities[0]!, 'database_specific');
    expect(parseOsvScan(scan, root)[0]).toMatchObject({ score: null, level: 'unrated', blocking: false });
  });

  test('fixes and fallback severity belong to the matching group and affected package', () => {
    const scan = structuredClone(unscoredScan);
    const pkg = scan.results[0]!.packages[0]!;
    const first = pkg.vulnerabilities[0]!;
    const unrelated = structuredClone(first);
    unrelated.id = 'GHSA-synthetic-other';
    unrelated.aliases = [];
    unrelated.database_specific.severity = 'CRITICAL';
    unrelated.affected[0]!.ranges[0]!.events[1] = { fixed: '9.0.0' };
    pkg.vulnerabilities.push(unrelated);
    pkg.groups.push({ ids: [unrelated.id], aliases: [], max_severity: '' });
    const wrongName = structuredClone(first.affected[0]!);
    wrongName.package.name = 'another-package';
    wrongName.ranges[0]!.events[1] = { fixed: '88.0.0' };
    first.affected.push(wrongName);
    const wrongEcosystem = structuredClone(first.affected[0]!);
    wrongEcosystem.package.ecosystem = 'RubyGems';
    wrongEcosystem.ranges[0]!.events[1] = { fixed: '99.0.0' };
    first.affected.push(wrongEcosystem);
    const [finding, other] = parseOsvScan(scan, root);
    expect(finding).toMatchObject({ level: 'high', fixedVersions: ['1.0.1'] });
    expect(finding!.advisoryIds).not.toContain(unrelated.id);
    expect(other).toMatchObject({ level: 'critical', fixedVersions: ['9.0.0'] });
  });

  test('sorts group ids, unions aliases, and lowercases ecosystem without mutating input', () => {
    const scan = structuredClone(unscoredScan);
    const pkg = scan.results[0]!.packages[0]!;
    pkg.package.ecosystem = 'NPM';
    pkg.groups[0]!.ids.push('CVE-2099-10001');
    pkg.groups[0]!.aliases.push('GHSA-synthetic-unscored-high');
    const snapshot = structuredClone(scan);
    expect(parseOsvScan(scan, root)[0]).toMatchObject({
      ecosystem: 'npm', groupId: 'CVE-2099-10001',
      advisoryIds: ['CVE-2099-10001', 'GHSA-synthetic-unscored-high'],
    });
    expect(scan).toEqual(snapshot);
  });

  test('does not treat non-GHSA database severity as the GHSA fallback', () => {
    const scan = structuredClone(unscoredScan);
    const pkg = scan.results[0]!.packages[0]!;
    pkg.groups[0]!.ids = ['CVE-2099-10001'];
    pkg.vulnerabilities[0]!.id = 'CVE-2099-10001';
    expect(parseOsvScan(scan, root)[0]).toMatchObject({ level: 'unrated', blocking: false });
  });

  test('dispatch fixture contains only the synthetic issue-sync package', () => {
    expect(parseOsvScan(dispatchScan, '/fixture')).toHaveLength(1);
    expect(parseOsvScan(dispatchScan, '/fixture')[0]).toMatchObject({
      lockfile: 'bun.lock', ecosystem: 'npm', packageName: 'tdk-osv-sync-fixture', level: 'high',
    });
  });
});

describe('severity policy', () => {
  test.each([
    ['9.8', [], 'critical'], ['9.0', [], 'critical'], ['7.0', [], 'high'], ['6.9', [], 'moderate'],
    ['4.0', [], 'moderate'], ['3.9', [], 'low'], ['0.1', [], 'low'], ['0', ['HIGH'], 'unrated'],
    ['', ['HIGH'], 'high'], ['', ['CRITICAL', 'LOW'], 'critical'], ['', ['MODERATE'], 'moderate'],
    ['', ['MEDIUM'], 'moderate'], ['', ['LOW'], 'low'], ['', [], 'unrated'], ['NaN', ['HIGH'], 'high'],
    ['7.1', ['CRITICAL'], 'high'], ['', ['unknown'], 'unrated'], ['', [' low ', ' high '], 'high'],
  ] as const)('classifies %s with %j as %s', (score, fallback, expected) => {
    expect(classifySeverity(score, [...fallback])).toBe(expected);
  });
});

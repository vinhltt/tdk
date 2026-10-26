import { describe, expect, test } from 'bun:test';
import scanFixture from './fixtures/osv-scan-unscored-ghsa-high.json';
import { parseOsvScan } from './osv-scan-model';

function corruptedScan(path: string, value: unknown): unknown {
  const scan = structuredClone(scanFixture);
  const parts = path.split('.');
  let object = scan as unknown as Record<string, unknown>;
  for (const key of parts.slice(0, -1)) object = object[key] as Record<string, unknown>;
  object[parts.at(-1)!] = value;
  return scan;
}

const pkg = 'results.0.packages.0';
const group = `${pkg}.groups.0`;
const advisory = `${pkg}.vulnerabilities.0`;
const affected = `${advisory}.affected.0`;

describe('fail-closed OSV scan schema', () => {
  [null, false, [], {}, { results: [] }, { results: 'not-an-array' }].forEach((json) => {
    test(`rejects unknown top-level input: ${typeof json}`, () => {
      expect(() => parseOsvScan(json, '/repo')).toThrow('Invalid OSV scan');
    });
  });

  test.each([
    ['results.0', null], ['results.0.source', undefined], ['results.0.source.path', 7],
    ['results.0.source.path', ''], ['results.0.source.type', null], ['results.0.packages', undefined],
    ['results.0.packages', []], [`${pkg}.package`, null], [`${pkg}.package.name`, ''],
    [`${pkg}.package.version`, undefined], [`${pkg}.package.ecosystem`, 1],
    [`${pkg}.groups`, {}], [`${pkg}.groups`, null], [`${pkg}.groups`, []],
    [`${pkg}.vulnerabilities`, null], [`${pkg}.vulnerabilities`, []],
    [`${group}.ids`, []], [`${group}.ids`, [7]], [`${group}.ids`, ['']],
    [`${group}.ids`, undefined], [`${group}.aliases`, null], [`${group}.aliases`, [7]],
    [`${group}.max_severity`, undefined], [`${group}.max_severity`, 7],
    [`${pkg}.vulnerabilities.0`, null], [`${advisory}.id`, undefined], [`${advisory}.aliases`, [7]],
    [`${advisory}.database_specific`, []], [`${advisory}.database_specific.severity`, 7],
    [`${advisory}.affected`, undefined], [`${advisory}.affected`, []],
    [`${affected}.package`, null], [`${affected}.package.name`, false],
    [`${affected}.package.ecosystem`, ''], [`${affected}.ranges`, {}],
    [`${affected}.ranges.0.type`, undefined], [`${affected}.ranges.0.events`, []],
    [`${affected}.ranges.0.events`, null], [`${affected}.ranges.0.events.0`, { unknown_event: '0' }],
    [`${affected}.ranges.0.events.1.fixed`, 7], [`${affected}.versions`, [7]],
  ] as [string, unknown][])('rejects malformed %s = %j', (path, value) => {
    expect(() => parseOsvScan(corruptedScan(path, value), '/repo')).toThrow('Invalid OSV scan');
  });

  test('cannot erase high findings by leaving advisories without groups', () => {
    expect(() => parseOsvScan(corruptedScan(`${pkg}.groups`, undefined), '/repo')).toThrow('together');
    expect(() => parseOsvScan(corruptedScan(`${pkg}.vulnerabilities`, undefined), '/repo')).toThrow('together');
  });

  test('cannot drop an advisory record while leaving its group behind', () => {
    const scan = structuredClone(scanFixture);
    scan.results[0]!.packages[0]!.groups[0]!.ids.push('GHSA-missing-record');
    expect(() => parseOsvScan(scan, '/repo')).toThrow('group lacks advisory records');
  });

  test('cannot leave an advisory outside all groups', () => {
    const scan = structuredClone(scanFixture);
    const result = scan.results[0]!.packages[0]!;
    const other = structuredClone(result.vulnerabilities[0]!);
    other.id = 'GHSA-ungrouped';
    other.aliases = [];
    result.vulnerabilities.push(other);
    expect(() => parseOsvScan(scan, '/repo')).toThrow('ungrouped advisory');
  });

  test('rejects advisory records for a different package', () => {
    expect(() => parseOsvScan(corruptedScan(`${affected}.package.name`, 'another-package'), '/repo')).toThrow('does not affect');
  });

  test('accepts version-only affected records without pretending there is a fix', () => {
    const scan = corruptedScan(`${affected}.ranges`, undefined);
    expect(parseOsvScan(scan, '/repo')[0]!.fixedVersions).toEqual([]);
    expect(parseOsvScan(scan, '/repo')[0]!.blocking).toBe(true);
  });
});

describe('scan path containment', () => {
  test.each([
    '../bun.lock', 'packages/../bun.lock', '..\\bun.lock', '/outside/bun.lock',
    '/repo-neighbor/bun.lock', 'C:\\outside\\bun.lock', 'C:relative/bun.lock',
    '//another-server/share/bun.lock', '/repo', 'bun.lock\u0000', 'bun.lock\n::warning::injected',
  ])('rejects traversal, outside, or invalid path %j', path => {
    expect(() => parseOsvScan(corruptedScan('results.0.source.path', path), '/repo')).toThrow();
  });

  test('requires an explicit nonempty scan root even for a clean-shaped result', () => {
    expect(() => parseOsvScan(scanFixture, '')).toThrow('scan root');
    expect(() => parseOsvScan(scanFixture, '   ')).toThrow('scan root');
  });
});

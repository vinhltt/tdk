import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import cleanScan from './fixtures/osv-scan-clean.json';
import vulnerableScan from './fixtures/osv-scan-vulnerable.json';
import dispatchScan from './fixtures/osv-scan-dispatch-sample.json';
import unscoredScan from './fixtures/osv-scan-unscored-ghsa-high.json';
import { parseOsvScan } from './osv-scan-model';
import { diffIntroduced, renderGateSummary } from './osv-pr-gate';

const root = '/scan';
const findings = parseOsvScan(vulnerableScan, root);

function runGate(head: unknown, base: unknown = cleanScan, extraArgs: string[] = [], omitFlag?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'tdk-osv-gate-test-'));
  try {
    const oldPath = join(dir, 'old.json');
    const newPath = join(dir, 'new.json');
    const summaryPath = join(dir, 'summary.md');
    writeFileSync(oldPath, typeof base === 'string' ? base : JSON.stringify(base));
    writeFileSync(newPath, typeof head === 'string' ? head : JSON.stringify(head));
    const pairs = [['--old', oldPath], ['--old-root', '/base'], ['--new', newPath], ['--new-root', '/head']];
    const args = pairs.filter(pair => pair[0] !== omitFlag).flat();
    const child = Bun.spawnSync([process.execPath, join(import.meta.dir, 'osv-pr-gate.ts'), ...args, ...extraArgs], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
    });
    return {
      code: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString(),
      summary: existsSync(summaryPath) ? readFileSync(summaryPath, 'utf8') : '',
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('introduced advisory identity', () => {
  test('same findings in base and head never block an unrelated change', () => {
    expect(diffIntroduced(findings, findings)).toEqual([]);
  });

  test('a vulnerable package in a second lockfile is introduced', () => {
    const additional = findings.map(finding => ({ ...finding, lockfile: 'packages/setup/bun.lock' }));
    expect(diffIntroduced(findings, [...findings, ...additional])).toEqual(additional);
  });

  test('version bumps retaining the group do not introduce findings', () => {
    const bumped = findings.map(finding => ({ ...finding, version: '9.9.9', fixedVersions: ['10.0.0'] }));
    expect(diffIntroduced(findings, bumped)).toEqual([]);
  });

  test('ecosystem, package, and advisory group independently participate in the key', () => {
    const finding = findings[0]!;
    for (const change of [{ ecosystem: 'other' }, { packageName: 'other' }, { groupId: 'GHSA-other' }]) {
      const added = { ...finding, ...change };
      expect(diffIntroduced([finding], [added])).toEqual([added]);
    }
  });

  test('summary lists introduced advisories, fixes, and pre-existing count', () => {
    const summary = renderGateSummary([findings[0]!], 5);
    expect(summary).toContain('Introduced findings: **1**');
    expect(summary).toContain('Pre-existing findings: **5**');
    expect(summary).toContain('lodash @ 4.17.20');
    expect(summary).toContain('CVE-2020-28500');
    expect(summary).toContain('moderate (5.3)');
    expect(summary).toContain('4.17.21');
    expect(summary).toContain('Passed:');
    expect(renderGateSummary([findings.at(-1)!], 0)).toContain('Blocked:');
  });

  test('summary handles no new findings and escapes Markdown table payloads', () => {
    expect(renderGateSummary([], 6)).toContain('No newly introduced vulnerabilities.');
    const summary = renderGateSummary([{ ...findings[0]!, packageName: '<pkg>|name\nnext', fixedVersions: [] }], 0);
    expect(summary).toContain('&lt;pkg&gt;\\|name next');
    expect(summary).toContain('not published');
  });
});

describe('PR gate CLI', () => {
  test('moderate introduced is a warning and exit 0, with a step summary', () => {
    const scan = structuredClone(vulnerableScan);
    const pkg = scan.results[0]!.packages[0]!;
    pkg.groups = [pkg.groups[0]!];
    pkg.vulnerabilities = [pkg.vulnerabilities[0]!];
    scan.results[0]!.packages = [pkg];
    const result = runGate(scan);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('::warning file=bun.lock::lodash@4.17.20');
    expect(result.stdout).not.toContain('::error');
    expect(result.summary).toContain('moderate (5.3)');
  });

  test('high introduced is an error and exit 1', () => {
    const result = runGate(dispatchScan);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('::error file=bun.lock::tdk-osv-sync-fixture');
    expect(result.summary).toContain('Blocked:');
  });

  test('unscored GHSA high is blocking rather than a false green', () => {
    const result = runGate(unscoredScan);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('high, unscored');
  });

  test('pre-existing critical advisories are not errors', () => {
    const result = runGate(vulnerableScan, vulnerableScan);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('::error');
    expect(result.summary).toContain('Pre-existing findings: **6**');
  });

  test.each([{}, { results: [] }, '{', ''])('malformed or empty head fails explicitly: %j', head => {
    const result = runGate(head);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('::error::OSV PR gate failed:');
  });

  test('invalid base scan cannot silently make head findings pre-existing', () => {
    const result = runGate(cleanScan, {});
    expect(result.code).not.toBe(0);
    expect(result.summary).toContain('Scan comparison failed:');
  });

  test('missing roots, unknown flags, and duplicate flags fail usage', () => {
    expect(runGate(cleanScan, cleanScan, [], '--old-root').stderr).toContain('Usage:');
    expect(runGate(cleanScan, cleanScan, ['--unknown', 'x']).code).not.toBe(0);
    expect(runGate(cleanScan, cleanScan, ['--new-root', '/duplicate']).code).not.toBe(0);
  });

  test('annotation data cannot inject an extra workflow command', () => {
    const scan = structuredClone(dispatchScan);
    const pkg = scan.results[0]!.packages[0]!;
    pkg.package.name = 'fixture\n::notice::injected';
    pkg.vulnerabilities[0]!.affected[0]!.package.name = pkg.package.name;
    const result = runGate(scan);
    expect(result.stdout).toContain('fixture%0A::notice::injected');
    expect(result.stdout).not.toContain('\n::notice::injected');
  });
});

import { appendFileSync, readFileSync } from 'node:fs';
import { findingKey, parseOsvScan, type OsvFinding } from './osv-scan-model';

export function diffIntroduced(oldFindings: OsvFinding[], newFindings: OsvFinding[]): OsvFinding[] {
  const oldKeys = new Set(oldFindings.map(findingKey));
  return newFindings.filter(finding => !oldKeys.has(findingKey(finding)));
}

function markdown(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('`', '\\`').replace(/\r?\n/g, ' ');
}

export function renderGateSummary(introduced: OsvFinding[], preexistingCount: number): string {
  const lines = ['## Dependency security (OSV)', '',
    `Introduced findings: **${introduced.length}**. Pre-existing findings: **${preexistingCount}**.`, ''];
  if (!introduced.length) lines.push('No newly introduced vulnerabilities.');
  else {
    lines.push('| Lockfile | Package @ version | Advisory | Severity | Fixed in |',
      '| --- | --- | --- | --- | --- |');
    for (const finding of introduced) {
      const score = finding.score === null ? 'unscored' : String(finding.score);
      lines.push(`| ${[
        finding.lockfile, `${finding.packageName} @ ${finding.version}`, finding.advisoryIds.join(', '),
        `${finding.level} (${score})`, finding.fixedVersions.join(', ') || 'not published',
      ].map(markdown).join(' | ')} |`);
    }
  }
  lines.push('', introduced.some(finding => finding.blocking)
    ? 'Blocked: a newly introduced high or critical vulnerability must be fixed.'
    : 'Passed: no newly introduced high or critical vulnerabilities.');
  return `${lines.join('\n')}\n`;
}

function annotationText(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function main(args: string[]): void {
  const flags = ['--old', '--old-root', '--new', '--new-root'];
  const values = new Map<string, string>();
  const usage = 'Usage: bun osv-pr-gate.ts --old old.json --old-root <dir> --new new.json --new-root <dir>';
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]!;
    const value = args[i + 1];
    if (!flags.includes(flag) || values.has(flag) || !value?.trim() || value.startsWith('--')) throw new Error(usage);
    values.set(flag, value);
  }
  if (values.size !== flags.length) throw new Error(usage);
  const oldFindings = parseOsvScan(JSON.parse(readFileSync(values.get('--old')!, 'utf8')), values.get('--old-root')!);
  const newFindings = parseOsvScan(JSON.parse(readFileSync(values.get('--new')!, 'utf8')), values.get('--new-root')!);
  const introduced = diffIntroduced(oldFindings, newFindings);
  const summary = renderGateSummary(introduced, newFindings.length - introduced.length);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  process.stdout.write(summary);
  for (const finding of introduced) {
    const file = annotationText(finding.lockfile).replaceAll(':', '%3A').replaceAll(',', '%2C');
    const message = `${finding.packageName}@${finding.version}: ${finding.groupId} (${finding.level}, ${finding.score ?? 'unscored'}); fixed in ${finding.fixedVersions.join(', ') || 'not published'}`;
    console.log(`::${finding.blocking ? 'error' : 'warning'} file=${file}::${annotationText(message)}`);
  }
  process.exitCode = introduced.some(finding => finding.blocking) ? 1 : 0;
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::OSV PR gate failed: ${annotationText(message)}`);
    process.exitCode = 2;
    const summary = `## Dependency security (OSV)\n\nScan comparison failed: ${markdown(message)}\n`;
    process.stdout.write(summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
      } catch (summaryError) {
        console.error(`::error::Could not write OSV summary: ${annotationText(String(summaryError))}`);
      }
    }
  }
}

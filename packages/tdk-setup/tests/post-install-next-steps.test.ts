import { beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defaultInstallSettings, type InstallSettings } from '../src/install-settings';
import { emptyHarnessManifest, saveHarnessManifest } from '../src/manifest-store';
import { renderNextSteps, type NextStepsInput } from '../src/post-install-next-steps';
import type { ConvertPart } from '../src/convert-parts';
import type { HarnessName, ManagedFile } from '../src/types';
import {
  makeConsumer,
  sha256,
  treeHash,
  writeManifest,
  writePluginDependencyPolicy,
  writePluginFile,
  type FixtureConsumer,
} from './fixtures';

const ALL_PARTS = 'agents,rules,settings,hooks,skills,context';
const cliPath = path.resolve(import.meta.dir, '../src/index.ts');

function render(consumer: FixtureConsumer, overrides: Partial<NextStepsInput> = {}): string | undefined {
  return renderNextSteps({ consumerRoot: consumer.root, mode: 'applied', claudeChanges: 2, settings: undefined, ...overrides });
}

function managedFile(plugin: string, target: string): ManagedFile {
  return { plugin, sourceRelativePath: 'src', targetRelativePath: target, sourceChecksum: 'a', installedChecksum: 'b' };
}

function saveManifest(
  consumer: FixtureConsumer,
  harness: HarnessName,
  extra: { convertedParts?: ConvertPart[]; managedFiles?: ManagedFile[] } = {},
): void {
  saveHarnessManifest(consumer.root, { ...emptyHarnessManifest(harness), ...extra });
}

function mkdir(consumer: FixtureConsumer, relative: string): void {
  fs.mkdirSync(path.join(consumer.root, relative), { recursive: true });
}

function ompDisabled(): InstallSettings {
  const base = defaultInstallSettings();
  return { ...base, harnesses: { ...base.harnesses, omp: { ...base.harnesses.omp!, enabled: false } } };
}

function lineWith(text: string, needle: string): string {
  const line = text.split('\n').find((entry) => entry.includes(needle));
  if (!line) throw new Error(`no line containing ${needle}`);
  return line.trim();
}

describe('renderNextSteps', () => {
  test('returns undefined when no sibling harness is detected', () => {
    expect(render(makeConsumer())).toBeUndefined();
  });

  test('ignores harnesses that convert-flat does not project', () => {
    const consumer = makeConsumer();
    for (const dir of ['.agents/skills', '.cursor', '.github/workflows', '.opencode', '.windsurf']) mkdir(consumer, dir);
    fs.writeFileSync(path.join(consumer.root, '.cursorignore'), 'x\n');
    expect(render(consumer)).toBeUndefined();
  });

  test('managed OMP with changes prints dry-run, apply, saved parts, and the conflict note', () => {
    const consumer = makeConsumer();
    saveManifest(consumer, 'omp', { convertedParts: ['agents', 'skills'] });
    const text = render(consumer, { claudeChanges: 3 })!;
    expect(text).toContain('Next steps (other harnesses):');
    expect(text).toContain('Claude projection changed (3 items); OMP may be stale.');
    expect(lineWith(text, '--dry-run')).toEndWith(`--harness omp --parts agents,skills --dry-run`);
    expect(lineWith(text, '--yes')).toEndWith(`--harness omp --parts agents,skills --yes`);
    expect(text).toContain('--force overwrites your .omp edits');
    expect(text).not.toContain('current');
    expect(text).not.toContain('--target-platform');
  });

  test('managed OMP without changes prints only the check line', () => {
    const consumer = makeConsumer();
    saveManifest(consumer, 'omp', { convertedParts: ['agents'] });
    const text = render(consumer, { claudeChanges: 0 })!;
    expect(text).toContain('Claude projection unchanged; verify OMP drift with:');
    expect(text).toContain('--harness omp --check');
    expect(text).not.toContain('--yes');
    expect(text).not.toContain('--dry-run');
    expect(text).not.toContain('current');
  });

  test('OMP parts default to all parts when unset and the line disappears when empty', () => {
    const unset = makeConsumer();
    saveManifest(unset, 'omp');
    expect(lineWith(render(unset)!, '--dry-run')).toContain(`--parts ${ALL_PARTS} --dry-run`);

    const empty = makeConsumer();
    saveManifest(empty, 'omp', { convertedParts: [] });
    mkdir(empty, '.omp');
    expect(render(empty)).toBeUndefined();
  });

  test('disabled OMP in settings produces no OMP lines', () => {
    const consumer = makeConsumer();
    saveManifest(consumer, 'omp');
    mkdir(consumer, '.omp');
    expect(render(consumer, { settings: ompDisabled() })).toBeUndefined();
  });

  test('unmanaged .omp prints a dry-run with all parts and the takeover warning only', () => {
    const consumer = makeConsumer();
    mkdir(consumer, '.omp');
    const text = render(consumer)!;
    expect(text).toContain(`--harness omp --parts ${ALL_PARTS} --dry-run`);
    expect(text).toContain('first apply takes ownership');
    expect(text).not.toContain('--yes');
    expect(text).not.toContain('--check');
  });

  test('flat-owned and mixed-owner Codex manifests print dry-run and apply without parts', () => {
    const flat = makeConsumer();
    saveManifest(flat, 'codex', { managedFiles: [managedFile('convert-flat', '.codex/config.toml')] });
    const mixed = makeConsumer();
    saveManifest(mixed, 'codex', {
      managedFiles: [managedFile('tdk-core', '.agents/skills/a/SKILL.md'), managedFile('convert-flat', '.codex/config.toml')],
    });
    for (const consumer of [flat, mixed]) {
      const text = render(consumer)!;
      expect(lineWith(text, '--dry-run')).toEndWith('--harness codex --dry-run');
      expect(lineWith(text, '--yes')).toEndWith('--harness codex --yes');
      expect(text).not.toContain('--parts');
    }
  });

  test('flat Codex stays silent when Claude did not change', () => {
    const consumer = makeConsumer();
    saveManifest(consumer, 'codex', { managedFiles: [managedFile('convert-flat', '.codex/config.toml')] });
    expect(render(consumer, { claudeChanges: 0 })).toBeUndefined();
  });

  test('package-only Codex manifest prints nothing, even with a .codex directory', () => {
    const consumer = makeConsumer();
    saveManifest(consumer, 'codex', { managedFiles: [managedFile('tdk-core', '.agents/skills/a/SKILL.md')] });
    mkdir(consumer, '.codex');
    expect(render(consumer)).toBeUndefined();
  });

  test('unmanaged .codex prints a dry-run only', () => {
    const consumer = makeConsumer();
    mkdir(consumer, '.codex');
    const text = render(consumer)!;
    expect(text).toContain('--harness codex --dry-run');
    expect(text).not.toContain('--yes');
    expect(text).not.toContain('--parts');
  });

  test('dry-run and applied modes use different headers', () => {
    const consumer = makeConsumer();
    mkdir(consumer, '.omp');
    expect(render(consumer, { mode: 'dry-run' })).toContain('After applying this install:');
    expect(render(consumer, { mode: 'dry-run' })).not.toContain('Next steps');
    expect(render(consumer, { mode: 'applied' })).toContain('Next steps (other harnesses):');
  });

  test('OMP lines precede Codex lines when both apply', () => {
    const consumer = makeConsumer();
    mkdir(consumer, '.omp');
    mkdir(consumer, '.codex');
    const text = render(consumer)!;
    expect(text.indexOf('--harness omp')).toBeLessThan(text.indexOf('--harness codex'));
  });

  test('a malformed OMP manifest throws for the caller to report', () => {
    const consumer = makeConsumer();
    const file = path.join(consumer.root, '.specify/state/harness-install/omp.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{');
    expect(() => render(consumer)).toThrow('Invalid ownership manifest');
  });

  test('roots with spaces and quotes round-trip through a POSIX shell', () => {
    const consumer = makeConsumer("tdk it's here ");
    mkdir(consumer, '.omp');
    const line = lineWith(render(consumer)!, '--dry-run');
    // Stub `bun` so the shell echoes its third argument (the consumer root) back verbatim.
    const result = spawnSync('bash', ['-c', `bun() { printf %s "$3"; }; ${line}`], { encoding: 'utf-8' });
    expect(result.stdout).toBe(consumer.root);
    const entry = spawnSync('bash', ['-c', `bun() { printf %s "$1"; }; ${line}`], { encoding: 'utf-8' });
    expect(entry.stdout).toBe(cliPath);
  });
});

const skillBody = (text: string): string => `---\nname: demo\ndescription: Demo skill\n---\n${text}\n`;
const agentBody = '---\nname: demo\ndescription: Demo agent\n---\nHelp.\n';

function makeOmpConsumer(): FixtureConsumer {
  const consumer = makeConsumer('tdk harness ');
  const skill = skillBody('# Demo');
  writePluginFile(consumer, 'skills/demo/SKILL.md', skill);
  writePluginFile(consumer, 'agents/demo.md', agentBody);
  writeManifest(consumer, { 'skills/demo/SKILL.md': sha256(skill), 'agents/demo.md': sha256(agentBody) });
  writePluginDependencyPolicy(consumer, { requiredPlugins: ['tdk-core'], dependencies: {} });
  return consumer;
}

function runCli(consumer: FixtureConsumer, args: string[]) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: consumer.scriptsDir, encoding: 'utf-8', input: '', timeout: 30000,
  });
  if (result.error) throw result.error;
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}` };
}

const install = (consumer: FixtureConsumer, extra: string[] = []) =>
  runCli(consumer, ['install', consumer.root, '--harness', 'claude', '--plugins', 'tdk-core', ...extra]);

describe('install next steps through the CLI', () => {
  let consumer: FixtureConsumer;
  const ompLine = (stdout: string, flag: string): string => lineWith(stdout, `--harness omp --parts agents,skills ${flag}`);

  // Leaves a managed OMP projection whose Claude source payload has changed since the last install.
  beforeAll(() => {
    consumer = makeOmpConsumer();
    expect(install(consumer, ['--yes']).exitCode).toBe(0);
    const converted = runCli(consumer, ['convert-flat', consumer.root, '--harness', 'omp', '--parts', 'agents,skills', '--yes']);
    expect(converted.exitCode, converted.output).toBe(0);

    const changed = skillBody('# Updated demo');
    writePluginFile(consumer, 'skills/demo/SKILL.md', changed);
    const manifestPath = path.join(consumer.root, '.specify/plugins/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.plugins['tdk-core'].files['skills/demo/SKILL.md'] = sha256(changed);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  });

  test('dry-run prints the section under its own header', () => {
    const before = treeHash(consumer.root);
    const result = install(consumer, ['--dry-run']);
    expect(result.exitCode, result.output).toBe(0);
    expect(result.stdout).toContain('After applying this install:');
    expect(result.stdout).not.toContain('Next steps (other harnesses):');
    expect(treeHash(consumer.root)).toBe(before);
  });

  test('a changed payload prints runnable OMP commands that reuse the saved parts', () => {
    const result = install(consumer, ['--yes']);
    expect(result.exitCode, result.output).toBe(0);
    expect(result.stdout).toContain('Next steps (other harnesses):');
    expect(result.stdout).toContain('Claude projection changed (');
    const dryRun = ompLine(result.stdout, '--dry-run');
    expect(ompLine(result.stdout, '--yes')).toStartWith('bun ');
    expect(result.stdout).toContain('--force overwrites your .omp edits');

    const before = treeHash(consumer.root);
    const run = spawnSync('bash', ['-c', dryRun], {
      cwd: consumer.scriptsDir,
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}` },
      timeout: 30000,
    });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(treeHash(consumer.root)).toBe(before);
  });

  test('an unchanged payload prints only the OMP check line', () => {
    expect(install(consumer, ['--yes']).exitCode).toBe(0);
    const result = install(consumer, ['--yes']);
    expect(result.exitCode, result.output).toBe(0);
    expect(result.stdout).toContain('Next steps (other harnesses):');
    expect(result.stdout).toContain('--harness omp --check');
    expect(result.stdout).not.toContain('--harness omp --parts');
    expect(result.stdout).not.toContain('current');
  });

  test('install --check stays free of next steps and writes nothing', () => {
    expect(install(consumer, ['--yes']).exitCode).toBe(0);
    const before = treeHash(consumer.root);
    const result = runCli(consumer, ['install', consumer.root, '--harness', 'claude', '--check']);
    expect(result.exitCode, result.output).toBe(0);
    expect(result.stdout).not.toContain('Next steps');
    expect(result.stdout).not.toContain('After applying this install');
    expect(treeHash(consumer.root)).toBe(before);
  });

  test('a dry-run with a blocking collision prints no section and exits 1', () => {
    const blocked = makeOmpConsumer();
    mkdir(blocked, '.omp');
    // A directory where a managed file belongs is never promptable, so it blocks the dry-run.
    mkdir(blocked, '.claude/skills/demo/SKILL.md');
    const result = install(blocked, ['--dry-run']);
    expect(result.exitCode, result.output).toBe(1);
    expect(result.stdout).toContain('Target is a directory');
    expect(result.stdout).not.toContain('After applying this install');
  });

  test('a malformed OMP manifest is reported without failing the install', () => {
    const manifestFile = path.join(consumer.root, '.specify/state/harness-install/omp.json');
    expect(fs.existsSync(manifestFile)).toBe(true);
    fs.writeFileSync(manifestFile, '{');
    const result = install(consumer, ['--yes']);
    expect(result.exitCode, result.output).toBe(0);
    expect(result.stdout).toContain('Harness install applied.');
    expect(result.stdout).toContain('Next steps unavailable:');
  });
});

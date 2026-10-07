import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HarnessInstallManifest } from '../src/types';
import {
  makeConsumer,
  sha256,
  writeBasicPlugin,
  writeMultiPluginManifest,
  writePluginDependencyPolicy,
  writePluginFile,
  type FixtureConsumer,
} from './fixtures';

const cliPath = path.resolve(import.meta.dir, '../src/index.ts');
const skillTarget = '.claude/skills/demo/SKILL.md';

function runInstall(consumer: FixtureConsumer, args: string[], tty = false) {
  const command = [process.execPath, cliPath, 'install', consumer.root, ...args];
  const result = tty
    ? spawnSync('/usr/bin/script', ['-qec', command.map(shellQuote).join(' '), '/dev/null'], {
      cwd: consumer.scriptsDir, encoding: 'utf-8', input: '', timeout: 10000,
    })
    : spawnSync(command[0]!, command.slice(1), {
      cwd: consumer.scriptsDir, encoding: 'utf-8', input: '', timeout: 10000,
    });
  if (result.error) throw result.error;
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Includes directories, file bytes/metadata, and links without following them. */
function treeHash(root: string): string {
  const hash = createHash('sha256');
  const visit = (relative: string): void => {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    hash.update(JSON.stringify([relative, stat.mode, stat.mtimeMs]));
    if (stat.isSymbolicLink()) hash.update(JSON.stringify(fs.readlinkSync(absolute)));
    else if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else hash.update(fs.readFileSync(absolute));
  };
  visit('');
  return hash.digest('hex');
}

function checkConsumer(consumer: FixtureConsumer, exitCode: number, args: string[] = [], tty = false) {
  const before = treeHash(consumer.root);
  const result = runInstall(consumer, ['--harness', 'claude', '--check', ...args], tty);
  expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(exitCode);
  expect(treeHash(consumer.root)).toBe(before);
  expect(result.stdout).not.toContain('Apply this harness install?');
  expect(result.stdout).not.toContain('Target prefix (');
  expect(result.stdout).not.toContain('Select optional plugins');
  expect(result.stdout).not.toContain('Type yes to continue:');
  return result;
}

function makeFixture(): FixtureConsumer {
  const consumer = makeConsumer('tdk-install-check-');
  writeBasicPlugin(consumer);
  writePluginDependencyPolicy(consumer, { requiredPlugins: ['tdk-core'], dependencies: {} });
  return consumer;
}

function installFixture(consumer = makeFixture(), args: string[] = []): FixtureConsumer {
  const result = runInstall(consumer, ['--harness', 'claude', '--plugins', 'tdk-core', '--yes', ...args]);
  expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
  return consumer;
}

function updateSourceFile(consumer: FixtureConsumer, relative: string, content: string): void {
  writePluginFile(consumer, relative, content);
  const manifestPath = path.join(consumer.root, '.specify/plugins/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  manifest.plugins['tdk-core'].files[relative] = sha256(content);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function editOwnership(consumer: FixtureConsumer, edit: (manifest: HarnessInstallManifest) => void): void {
  const file = path.join(consumer.root, '.specify/state/harness-install/claude.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf-8'));
  edit(manifest);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
}

function makeSelectionFixture(): FixtureConsumer {
  const consumer = makeConsumer('tdk-install-check-selection-');
  const plugins: Record<string, { version: string; files: Record<string, string> }> = {};
  for (const plugin of ['tdk-core', 'tdk-epic', 'tdk-utils', 'tdk-retro']) {
    const content = `# ${plugin}\n`;
    const relative = `skills/${plugin}/SKILL.md`;
    writePluginFile(consumer, relative, content, plugin);
    plugins[plugin] = { version: '1.0.0', files: { [relative]: sha256(content) } };
  }
  writeMultiPluginManifest(consumer, plugins);
  writePluginDependencyPolicy(consumer, {
    requiredPlugins: ['tdk-core'], dependencies: { 'tdk-epic': ['tdk-utils'] },
  });
  return consumer;
}

function installSelectionFixture(selected = 'tdk-epic'): FixtureConsumer {
  const consumer = makeSelectionFixture();
  const result = runInstall(consumer, ['--harness', 'claude', '--plugins', selected, '--yes']);
  expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
  return consumer;
}

describe('Claude install --check', () => {
  test('fresh managed update writes and persisted install settings stay current without any writes', () => {
    const consumer = installFixture();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = checkConsumer(consumer, 0);
      expect(result.stdout).toContain('Claude projection is current. No files changed.');
      expect(result.stdout).not.toContain('stale:');
      expect(result.stdout).not.toContain('modified (informational)');
    }
  });

  test('a first-install check reports missing targets and creates neither settings nor ownership', () => {
    const consumer = makeFixture();
    const result = checkConsumer(consumer, 1, ['--plugins', 'tdk-core']);
    expect(result.stdout).toContain(`stale: ${skillTarget} (missing target)`);
    expect(fs.existsSync(path.join(consumer.root, '.specify/install-settings.json'))).toBe(false);
    expect(fs.existsSync(path.join(consumer.root, '.specify/state'))).toBe(false);
  });

  test('source bytes changed without a version bump are stale', () => {
    const consumer = installFixture();
    updateSourceFile(consumer, 'skills/demo/SKILL.md', '# Updated payload\n');
    const result = checkConsumer(consumer, 1);
    expect(result.stdout).toContain(`stale: ${skillTarget} (payload changed)`);
    const manifest = JSON.parse(fs.readFileSync(path.join(consumer.root, '.specify/plugins/manifest.json'), 'utf-8'));
    expect(manifest.plugins['tdk-core'].version).toBe('1.0.0');
  });

  test('a prefix-transformed install reuses saved prefix, text rewrites, and hook paths', () => {
    const consumer = makeFixture();
    updateSourceFile(consumer, 'skills/tdk-demo/SKILL.md', '# tdk-demo\nUse tdk-demo.\n');
    installFixture(consumer, ['--prefix', 'sample']);
    expect(fs.readFileSync(path.join(consumer.root, '.claude/skills/sample-demo/SKILL.md'), 'utf-8'))
      .toBe('# sample-demo\nUse sample-demo.\n');
    expect(fs.readFileSync(path.join(consumer.root, '.claude/settings.json'), 'utf-8')).toContain('sample-core');
    checkConsumer(consumer, 0);
    checkConsumer(consumer, 0, ['--prefix', 'sample']);
  });

  test('a missing managed target is stale and is not restored', () => {
    const consumer = installFixture();
    fs.unlinkSync(path.join(consumer.root, skillTarget));
    const result = checkConsumer(consumer, 1);
    expect(result.stdout).toContain(`stale: ${skillTarget} (missing target)`);
    expect(fs.existsSync(path.join(consumer.root, skillTarget))).toBe(false);
  });

  test('a file dropped from the payload reports the pending removal without deleting the target', () => {
    const consumer = installFixture();
    const manifestPath = path.join(consumer.root, '.specify/plugins/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    delete manifest.plugins['tdk-core'].files['skills/demo/SKILL.md'];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.unlinkSync(path.join(consumer.pluginRoot, 'skills/demo/SKILL.md'));
    const result = checkConsumer(consumer, 1);
    expect(result.stdout).toContain(`stale: ${skillTarget} (no longer in selected payload; removal required)`);
    expect(fs.readFileSync(path.join(consumer.root, skillTarget), 'utf-8')).toBe('# Skill\n');
  });

  test('a locally edited retired target remains stale without deleting the user edit', () => {
    const consumer = installFixture();
    fs.writeFileSync(path.join(consumer.root, skillTarget), '# Keep my local content\n');
    const manifestPath = path.join(consumer.root, '.specify/plugins/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    delete manifest.plugins['tdk-core'].files['skills/demo/SKILL.md'];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.unlinkSync(path.join(consumer.pluginRoot, 'skills/demo/SKILL.md'));

    const result = checkConsumer(consumer, 1);
    expect(result.stdout).toContain('Deselected managed file drifted');
    expect(result.stdout).toContain('stale:');
    expect(fs.readFileSync(path.join(consumer.root, skillTarget), 'utf-8')).toBe('# Keep my local content\n');
  });

  test('duplicate projected targets are stale even when the retained target is current', () => {
    const consumer = installSelectionFixture();
    const relative = 'skills/tdk-core/SKILL.md';
    writePluginFile(consumer, relative, '# Conflicting epic skill\n', 'tdk-epic');
    const manifestPath = path.join(consumer.root, '.specify/plugins/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.plugins['tdk-epic'].files[relative] = sha256('# Conflicting epic skill\n');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = checkConsumer(consumer, 1);
    expect(result.stdout).toContain('Duplicate transformed target path');
    expect(fs.readFileSync(path.join(consumer.root, '.claude/skills/tdk-core/SKILL.md'), 'utf-8')).toBe('# tdk-core\n');
  });

  test('hook-only consumer settings drift is stale even when payload and ownership are unchanged', () => {
    const consumer = installFixture();
    fs.writeFileSync(path.join(consumer.root, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['Read'] } }));
    const result = checkConsumer(consumer, 1);
    expect(result.stdout).toContain('stale: .claude/settings.json (hook settings differ from payload)');
    expect(result.stdout).not.toContain('(payload changed)');
  });

  test('hook-only payload changes report hook mutations without copying hooks.json', () => {
    const consumer = installFixture();
    const hooks = JSON.parse(fs.readFileSync(path.join(consumer.pluginRoot, 'hooks/hooks.json'), 'utf-8'));
    hooks.hooks.SessionStart = hooks.hooks.UserPromptSubmit;
    delete hooks.hooks.UserPromptSubmit;
    updateSourceFile(consumer, 'hooks/hooks.json', JSON.stringify(hooks));
    const result = checkConsumer(consumer, 1);
    expect(result.stdout).toContain('hook remove: tdk-core UserPromptSubmit:*');
    expect(result.stdout).toContain('hook add: tdk-core SessionStart:*');
    expect(result.stdout).not.toContain('(payload changed)');
  });

  test('an unmanaged target with different bytes is stale, but identical unmanaged bytes are current', () => {
    const consumer = installFixture();
    editOwnership(consumer, (manifest) => {
      manifest.managedFiles = manifest.managedFiles.filter((file: { targetRelativePath: string }) => file.targetRelativePath !== skillTarget);
    });
    checkConsumer(consumer, 0);
    fs.writeFileSync(path.join(consumer.root, skillTarget), '# User-owned file\n');
    const result = checkConsumer(consumer, 1);
    expect(result.stdout).toContain(`stale: ${skillTarget} (unmanaged target differs from payload)`);
  });

  test('symlink and directory target collisions are stale without following or replacing them', () => {
    for (const kind of ['unsafe-symlink', 'directory-file-conflict']) {
      const consumer = installFixture();
      const target = path.join(consumer.root, skillTarget);
      fs.unlinkSync(target);
      if (kind === 'unsafe-symlink') {
        const userFile = path.join(consumer.root, 'user-file');
        fs.writeFileSync(userFile, 'User bytes\n');
        fs.symlinkSync(userFile, target);
      } else fs.mkdirSync(target);
      const result = checkConsumer(consumer, 1);
      expect(result.stdout).toContain(kind);
    }
  });

  test('invalid hook settings and unmanaged duplicate hooks are structural stale collisions', () => {
    const invalid = installFixture();
    fs.writeFileSync(path.join(invalid.root, '.claude/settings.json'), JSON.stringify({ hooks: [] }));
    expect(checkConsumer(invalid, 1).stdout).toContain('invalid-hook-config');

    const duplicate = installFixture();
    editOwnership(duplicate, (manifest) => { manifest.managedHooks = []; });
    expect(checkConsumer(duplicate, 1).stdout).toContain('unmanaged-duplicate-hook');
  });

  test('a managed local edit with unchanged payload is informational, not stale', () => {
    const consumer = installFixture();
    fs.writeFileSync(path.join(consumer.root, skillTarget), '# My local edit\n');
    const result = checkConsumer(consumer, 0);
    expect(result.stdout).toContain(`modified (informational): ${skillTarget}`);
    expect(result.stdout).not.toContain('stale:');
  });

  test('a managed local edit plus a payload change is stale, not merely informational', () => {
    const consumer = installFixture();
    fs.writeFileSync(path.join(consumer.root, skillTarget), '# My local edit\n');
    updateSourceFile(consumer, 'skills/demo/SKILL.md', '# New payload\n');
    const result = checkConsumer(consumer, 1);
    expect(result.stdout).toContain(`stale: ${skillTarget} (payload changed)`);
    expect(result.stdout).not.toContain(`modified (informational): ${skillTarget}`);
  });

  test('non-TTY fallback prefers Claude ownership and recomputes required base and dependency closure', () => {
    const consumer = installSelectionFixture();
    const settingsPath = path.join(consumer.root, '.specify/install-settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.defaults.selectedPlugins).toEqual(['tdk-epic']);
    settings.defaults.selectedPlugins = ['tdk-retro'];
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    const result = checkConsumer(consumer, 0);
    expect(result.stdout).toContain('tdk-epic');
    expect(result.stdout).toContain('tdk-utils');
    expect(fs.existsSync(path.join(consumer.root, '.claude/skills/tdk-retro'))).toBe(false);
  });

  test('check falls back to optional install settings only when ownership is absent, including an empty selection', () => {
    for (const selected of ['tdk-epic', 'tdk-core']) {
      const consumer = installSelectionFixture(selected);
      fs.unlinkSync(path.join(consumer.root, '.specify/state/harness-install/claude.json'));
      checkConsumer(consumer, 0);
    }
  });

  test('legacy ownership selection is reused without migrating the ownership file', () => {
    const consumer = installSelectionFixture();
    const manifestPath = path.join(consumer.root, '.specify/state/harness-install/claude.json');
    const legacyPath = path.join(consumer.root, '.specify/state/harness-install.json');
    fs.renameSync(manifestPath, legacyPath);
    fs.unlinkSync(path.join(consumer.root, '.specify/install-settings.json'));
    checkConsumer(consumer, 0);
    expect(fs.existsSync(manifestPath)).toBe(false);
    expect(fs.existsSync(legacyPath)).toBe(true);
  });

  test('explicit --plugins and --all-plugins override the saved selection', () => {
    const consumer = installSelectionFixture();
    expect(checkConsumer(consumer, 1, ['--plugins', 'tdk-retro']).stdout)
      .toContain('stale: .claude/skills/tdk-retro/SKILL.md (missing target)');
    expect(checkConsumer(consumer, 1, ['--all-plugins']).stdout)
      .toContain('stale: .claude/skills/tdk-retro/SKILL.md (missing target)');
  });

  test('TTY checks do not prompt for a prefix, install confirmation, selection, or overwrites', () => {
    const first = makeFixture();
    checkConsumer(first, 1, ['--plugins', 'tdk-core'], true);
    const fresh = installFixture();
    checkConsumer(fresh, 0, [], true);
    fs.writeFileSync(path.join(fresh.root, skillTarget), '# Local edit\n');
    expect(checkConsumer(fresh, 0, [], true).stdout).toContain('modified (informational)');
  });

  test('missing saved selection is an error rather than a TTY prompt or confirmed stale result', () => {
    for (const tty of [false, true]) {
      const consumer = makeFixture();
      const result = checkConsumer(consumer, 2, [], tty);
      expect(result.stdout + result.stderr).toContain('No plugin selector provided');
    }
  });

  test('rejects --check with --yes, --dry-run, Codex, or mixed harnesses before writes', () => {
    for (const args of [
      ['--yes'], ['--dry-run'], ['--harness', 'codex'], ['--harness', 'claude,codex'],
    ]) {
      const consumer = installFixture();
      const result = checkConsumer(consumer, 2, args);
      expect(result.stderr).toContain('[tdk-setup install] error:');
      expect(result.stdout).not.toContain('stale:');
    }
  });

  test('a missing harness in check mode is an error even on a TTY', () => {
    const consumer = makeFixture();
    const before = treeHash(consumer.root);
    const result = runInstall(consumer, ['--check'], true);
    expect(result.exitCode, result.stdout + result.stderr).toBe(2);
    expect(result.stdout + result.stderr).toContain('--check requires --harness claude');
    expect(result.stdout).not.toContain('Select harness');
    expect(treeHash(consumer.root)).toBe(before);
  });

  test('unsafe, conflicting, and unauthorized existing prefix changes are operational errors', () => {
    const consumer = installFixture();
    for (const args of [
      ['--prefix', '../unsafe'], ['--prefix', 'sample'], ['--prefix', 'tdk', '--migrate-prefix', 'sample'],
    ]) {
      const result = checkConsumer(consumer, 2, args);
      expect(result.stderr).toContain('[tdk-setup install] error:');
      expect(result.stdout).not.toContain('stale:');
    }
  });

  test('selector validation and Commander parse failures use the operational error exit', () => {
    const consumer = installFixture();
    for (const args of [
      ['--plugins', 'tdk-core', '--all-plugins'],
      ['--plugins', 'unknown-plugin'],
      ['--plugins', ','],
      ['--unknown-check-option'],
      ['--prefix'],
    ]) {
      const result = checkConsumer(consumer, 2, args);
      expect(result.stdout).not.toContain('stale:');
    }
    // The parse error can precede --check in argv, before its option is set.
    const before = treeHash(consumer.root);
    const result = runInstall(consumer, ['--prefix', '--check', '--harness', 'claude']);
    expect(result.exitCode, result.stdout + result.stderr).toBe(2);
    expect(treeHash(consumer.root)).toBe(before);
  });

  test('malformed saved settings and missing payload integrity data are operational errors', () => {
    const invalid = installFixture();
    fs.writeFileSync(path.join(invalid.root, '.specify/install-settings.json'), '{invalid json');
    expect(checkConsumer(invalid, 2).stderr).toContain('[tdk-setup install] error:');
    const missing = installFixture();
    fs.unlinkSync(path.join(missing.root, '.specify/release-manifest.json'));
    expect(checkConsumer(missing, 2).stderr).toContain('Missing plugin dependency policy integrity data');
  });

  test('invalid ownership and corrupt source integrity fail distinctly from confirmed stale', () => {
    const invalid = installFixture();
    fs.writeFileSync(path.join(invalid.root, '.specify/state/harness-install/claude.json'), '{invalid json');
    expect(checkConsumer(invalid, 2).stderr).toContain('Invalid ownership manifest');

    const corrupt = installFixture();
    writePluginFile(corrupt, 'skills/demo/SKILL.md', '# Changed without manifest refresh\n');
    expect(checkConsumer(corrupt, 2).stderr).toContain('Source checksum mismatch');
  });

  test('normal non-TTY install still requires an explicit selector despite saved state', () => {
    const consumer = installFixture();
    const before = treeHash(consumer.root);
    const result = runInstall(consumer, ['--harness', 'claude', '--yes']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No plugin selector provided');
    expect(treeHash(consumer.root)).toBe(before);
  });
});

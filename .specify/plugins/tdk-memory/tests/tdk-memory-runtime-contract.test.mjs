import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const require = createRequire(import.meta.url);
const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(TESTS_DIR, '..');
const RUNTIME_BUNDLE = resolve(
  PLUGIN_ROOT,
  'skills/tdk-memory-checksum/scripts/memory-manifest.cjs',
);
const RUNTIME_NOTICE = resolve(
  PLUGIN_ROOT,
  'skills/tdk-memory-checksum/scripts/RUNTIME-LICENSE.txt',
);
const GENERATED_AT = '2026-09-22T08:15:00Z';

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function yamlString(value) {
  return JSON.stringify(value);
}

function fileReceiptYaml(receipt) {
  return [
    `  - path: ${yamlString(receipt.path)}`,
    `    sha256: ${yamlString(receipt.sha256)}`,
    `    updated_at: ${yamlString(receipt.updatedAt)}`,
    `    updated_by: ${yamlString(receipt.updatedBy)}`,
  ].join('\n');
}

function templateReceiptYaml(receipt) {
  return [
    `  - path: ${yamlString(receipt.path)}`,
    `    sha256: ${yamlString(receipt.sha256)}`,
    `    source_version: ${yamlString(receipt.sourceVersion)}`,
  ].join('\n');
}

function manifestYaml({ indexSha256, files = [], templates }) {
  const lines = [
    'version: "2"',
    `generated_at: ${yamlString(GENERATED_AT)}`,
    `memory_index_sha256: ${yamlString(indexSha256)}`,
    files.length === 0 ? 'files: []' : `files:\n${files.map(fileReceiptYaml).join('\n')}`,
  ];

  if (templates !== undefined) {
    lines.push(templates.length === 0 ? 'templates: []' : `templates:\n${templates.map(templateReceiptYaml).join('\n')}`);
  }

  return `${lines.join('\n')}\n`;
}

function writeRelative(root, relativePath, contents) {
  const target = join(root, ...relativePath.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function makeMemoryRoot(workspace, name = 'memory') {
  const memoryRoot = join(workspace, name);
  mkdirSync(memoryRoot, { recursive: true });
  return memoryRoot;
}

function withWorkspace(run) {
  const sandbox = mkdtempSync(join(tmpdir(), 'tdk-memory-runtime-'));
  const workspace = join(sandbox, 'workspace');
  mkdirSync(join(workspace, '.git'), { recursive: true });

  try {
    run(workspace);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function runRuntime(workspace, args, bundle = RUNTIME_BUNDLE, env = process.env) {
  const result = spawnSync('node', [bundle, ...args], {
    cwd: workspace,
    encoding: 'utf8',
    env,
  });

  return {
    error: result.error,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function expectFatal(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
}

function report(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  return JSON.parse(result.stdout);
}

function fileReceipt(path, contents) {
  return {
    path,
    sha256: sha256(contents),
    updatedAt: GENERATED_AT,
    updatedBy: 'runtime-contract-test',
  };
}

describe('tdk memory manifest runtime contract', () => {
  test('runs from a copied bundle and notice without a consumer-side parser installation, accepting legacy v2 manifests', () => {
    withWorkspace((workspace) => {
      const flatScripts = join(workspace, 'flat-install', 'skills', 'tdk-memory-checksum', 'scripts');
      mkdirSync(flatScripts, { recursive: true });
      const flatBundle = join(flatScripts, 'memory-manifest.cjs');
      const flatNotice = join(flatScripts, 'RUNTIME-LICENSE.txt');
      copyFileSync(RUNTIME_BUNDLE, flatBundle);
      copyFileSync(RUNTIME_NOTICE, flatNotice);

      const memoryRoot = makeMemoryRoot(join(workspace, 'flat-install'));
      const index = '# Legacy memory index\n';
      writeRelative(memoryRoot, 'memory-index.md', index);
      writeRelative(memoryRoot, 'notes/legacy.md', '# Legacy note\n');
      writeRelative(
        memoryRoot,
        'memory.yaml',
        manifestYaml({
          indexSha256: sha256(index),
          files: [fileReceipt('notes/legacy.md', '# Legacy note\n')],
        }),
      );

      const result = report(runRuntime(
        join(workspace, 'flat-install'),
        ['validate', 'flat-install/memory'],
        flatBundle,
        { ...process.env, HOME: join(workspace, 'flat-install', 'empty-home'), NODE_PATH: '' },
      ));
      assert.deepEqual(readFileSync(flatNotice), readFileSync(RUNTIME_NOTICE));
      assert.deepEqual(result, {
        mismatches: [],
        missing_from_manifest: [],
        missing_from_disk: [],
        verified_count: 1,
        index_mismatch: false,
        templates_mismatches: [],
      });
    });
  });

  test('checks legacy control and deprecated receipts only when explicitly recorded', () => {
    withWorkspace((workspace) => {
      const memoryRoot = makeMemoryRoot(workspace);
      const index = '# Index\n';
      const changelog = '# History\n';
      const canvas = '{"nodes":[],"edges":[]}\n';
      const archived = '# Archived note\n';
      writeRelative(memoryRoot, 'memory-index.md', index);
      writeRelative(memoryRoot, 'CHANGELOG.md', changelog);
      writeRelative(memoryRoot, 'memory-map.canvas', canvas);
      writeRelative(memoryRoot, '_deprecated/old.md', archived);
      writeRelative(memoryRoot, 'memory.yaml', manifestYaml({ indexSha256: sha256(index) }));
      assert.deepEqual(report(runRuntime(workspace, ['validate', 'memory'])).missing_from_manifest, []);
      writeRelative(memoryRoot, 'memory.yaml', manifestYaml({
        indexSha256: sha256(index),
        files: [fileReceipt('CHANGELOG.md', changelog), fileReceipt('memory-map.canvas', canvas), fileReceipt('_deprecated/old.md', archived)],
      }));
      assert.equal(report(runRuntime(workspace, ['validate', 'memory'])).verified_count, 3);
      writeRelative(memoryRoot, 'CHANGELOG.md', `${changelog}changed`);
      writeRelative(memoryRoot, 'memory-map.canvas', '{}');
      writeRelative(memoryRoot, '_deprecated/old.md', `${archived}changed`);
      const result = report(runRuntime(workspace, ['validate', 'memory']));
      assert.deepEqual(result.mismatches.map((item) => item.path).sort(), ['CHANGELOG.md', '_deprecated/old.md', 'memory-map.canvas']);
      assert.deepEqual(result.missing_from_manifest, []);
    });
  });

  test('reports valid integrity differences for notes, index, and templates without treating them as CLI failures', () => {
    withWorkspace((workspace) => {
      const memoryRoot = makeMemoryRoot(workspace);
      const originalIndex = '# Initial index\n';
      const originalNote = '# Initial note\n';
      const originalTemplate = '# Initial template\n';
      writeRelative(memoryRoot, 'memory-index.md', '# Changed index\n');
      writeRelative(memoryRoot, 'notes/covered.md', '# Changed note\n');
      writeRelative(memoryRoot, 'notes/unlisted.md', '# Unlisted note\n');
      writeRelative(memoryRoot, '_templates/known.md.tpl', '# Changed template\n');
      writeRelative(memoryRoot, '_templates/unlisted.md.tpl', '# Unlisted template\n');
      writeRelative(
        memoryRoot,
        'memory.yaml',
        manifestYaml({
          indexSha256: sha256(originalIndex),
          files: [
            fileReceipt('notes/covered.md', originalNote),
            fileReceipt('notes/missing.md', '# Removed note\n'),
          ],
          templates: [
            {
              path: '_templates/known.md.tpl',
              sha256: sha256(originalTemplate),
              sourceVersion: '1.0.0',
            },
          ],
        }),
      );

      const result = report(runRuntime(workspace, ['validate', 'memory']));
      assert.deepEqual(result, {
        mismatches: [
          {
            path: 'notes/covered.md',
            expected: sha256(originalNote),
            actual: sha256('# Changed note\n'),
          },
        ],
        missing_from_manifest: ['notes/unlisted.md'],
        missing_from_disk: ['notes/missing.md'],
        verified_count: 0,
        index_mismatch: true,
        templates_mismatches: [
          {
            path: '_templates/known.md.tpl',
            expected: sha256(originalTemplate),
            actual: sha256('# Changed template\n'),
          },
          {
            path: '_templates/unlisted.md.tpl',
            expected: null,
            actual: sha256('# Unlisted template\n'),
          },
        ],
      });
    });
  });

  test('hashes a contained regular non-note file', () => {
    withWorkspace((workspace) => {
      const memoryRoot = makeMemoryRoot(workspace);
      const payload = Buffer.from([0, 255, 42, 17]);
      writeRelative(memoryRoot, 'assets/diagram.bin', payload);

      const result = runRuntime(workspace, ['hash', 'memory', 'assets/diagram.bin']);
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), sha256(payload));
    });
  });

  test('fatally rejects malformed YAML, duplicate YAML keys, duplicate receipts, and escaped receipt paths', () => {
    withWorkspace((workspace) => {
      const index = '# Index\n';
      const duplicateFile = fileReceipt('notes/duplicate.md', '# Note\n');
      const invalidManifests = [
        'version: [\n',
        [
          'version: "2"',
          'version: "2"',
          `generated_at: ${yamlString(GENERATED_AT)}`,
          `memory_index_sha256: ${yamlString(sha256(index))}`,
          'files: []',
          '',
        ].join('\n'),
        manifestYaml({
          indexSha256: sha256(index),
          files: [duplicateFile, duplicateFile],
        }),
        manifestYaml({
          indexSha256: sha256(index),
          files: [fileReceipt('../outside.md', '# Escape\n')],
        }),
      ];

      for (const [indexOfCase, manifest] of invalidManifests.entries()) {
        const memoryRoot = makeMemoryRoot(workspace, `invalid-${indexOfCase}`);
        writeRelative(memoryRoot, 'memory-index.md', index);
        writeRelative(memoryRoot, 'memory.yaml', manifest);
        expectFatal(runRuntime(workspace, ['validate', relative(workspace, memoryRoot)]));
      }
    });
  });

  test('enforces lexical and symlink containment for roots, targets, and manifests', () => {
    withWorkspace((workspace) => {
      const memoryRoot = makeMemoryRoot(workspace);
      writeRelative(memoryRoot, 'inside.bin', 'inside');
      const externalRoot = makeMemoryRoot(dirname(workspace), 'external-memory');
      writeRelative(externalRoot, 'outside.bin', 'outside');
      writeRelative(externalRoot, 'memory.yaml', 'version: "2"\n');

      const externalFromWorkspace = relative(workspace, externalRoot);
      expectFatal(runRuntime(workspace, ['hash', externalFromWorkspace, 'outside.bin']));

      const allowedExternal = runRuntime(workspace, [
        'hash',
        externalFromWorkspace,
        'outside.bin',
        '--allow-external-root',
      ]);
      assert.equal(allowedExternal.status, 0);
      assert.equal(allowedExternal.stdout.trim(), sha256('outside'));
      expectFatal(runRuntime(workspace, [
        'hash',
        externalFromWorkspace,
        '../workspace/memory/inside.bin',
        '--allow-external-root',
      ]));

      symlinkSync(externalRoot, join(workspace, 'root-link'));
      expectFatal(runRuntime(workspace, ['hash', 'root-link', 'outside.bin']));

      symlinkSync(join(externalRoot, 'outside.bin'), join(memoryRoot, 'target-link'));
      expectFatal(runRuntime(workspace, ['hash', 'memory', 'target-link']));
      expectFatal(runRuntime(workspace, ['hash', 'memory', '../external-memory/outside.bin']));

      symlinkSync(join(externalRoot, 'memory.yaml'), join(memoryRoot, 'manifest-link.yaml'));
      expectFatal(runRuntime(workspace, ['validate', 'memory', '--manifest', 'manifest-link.yaml']));
      expectFatal(runRuntime(workspace, ['validate', 'memory', '--manifest', '../external-memory/memory.yaml']));
    });
  });

  test('does not silently omit unreadable inventory entries', () => {
    withWorkspace((workspace) => {
      const memoryRoot = makeMemoryRoot(workspace);
      const index = '# Index\n';
      writeRelative(memoryRoot, 'memory-index.md', index);
      writeRelative(memoryRoot, 'locked/hidden.md', '# Hidden\n');
      writeRelative(memoryRoot, 'memory.yaml', manifestYaml({ indexSha256: sha256(index) }));

      const lockedDirectory = join(memoryRoot, 'locked');
      chmodSync(lockedDirectory, 0o000);
      let result;
      try {
        result = runRuntime(workspace, ['validate', 'memory']);
      } finally {
        chmodSync(lockedDirectory, 0o755);
      }

      if (result.status === 0) {
        assert.deepEqual(report(result).missing_from_manifest, ['locked/hidden.md']);
      } else {
        expectFatal(result);
        assert.match(result.stderr, /cannot read directory/);
      }
    });
  });

  test('exposes only the documented read-only command and flag surface', () => {
    withWorkspace((workspace) => {
      const memoryRoot = makeMemoryRoot(workspace);
      writeRelative(memoryRoot, 'payload.bin', 'payload');

      expectFatal(runRuntime(workspace, ['write', 'memory']));
      expectFatal(runRuntime(workspace, ['hash', 'memory', 'payload.bin', '--manifest', 'memory.yaml']));
      expectFatal(runRuntime(workspace, ['validate', 'memory', '--manifest', '/tmp/memory.yaml']));
    });
  });
});

const INDEX_WITH_COVERAGE = (coverage, domains = []) => [
  '# Memory Index',
  '',
  coverage,
  '',
  '## Domain Map',
  '',
  '| Domain | Folder | Scope |',
  '|--------|--------|-------|',
  ...domains.map((name) => `| ${name} | [[domains/${name}/domain-overview\\|${name}/]] | scope |`),
  '',
  '## Data Model',
  '',
  '| File | Title | Updated | Binding |',
  '|------|-------|---------|---------|',
  '| auth-domain | not a domain row | | |',
  '',
].join('\n');

function seedMemory(root, { coverage = 'Binding coverage: 0 of 0 typed files', domains = [], constitution = false } = {}) {
  const index = INDEX_WITH_COVERAGE(coverage, domains);
  writeRelative(root, 'memory-index.md', index);
  writeRelative(root, 'memory.yaml', manifestYaml({ indexSha256: sha256(index) }));
  if (constitution) writeRelative(root, 'constitution.md', '# Constitution\n');
}

function writeConfig(workspace, memory) {
  writeRelative(workspace, '.specify/.specify.json', JSON.stringify(memory === undefined ? {} : { memory }));
}

function resolveStatus(workspace, args = []) {
  const result = runRuntime(workspace, ['resolve', ...args]);
  const status = report(result);
  assert.equal(typeof status.memory_path, 'string', 'memory_path is present in every status');
  assert.equal(status.reader, 'file');
  assert.equal(status.reader_fallback, 'none');
  return status;
}

function git(cwd, args) {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=tester', '-c', 'user.email=tester@example.invalid', ...args],
    { cwd, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
}

describe('tdk memory manifest runtime resolve', () => {
  test('reports a ready default root with coverage, domains, and constitution', () => {
    withWorkspace((workspace) => {
      const root = join(workspace, '.specify', 'memory');
      mkdirSync(root, { recursive: true });
      seedMemory(root, {
        coverage: 'Binding coverage: 9/11 typed files',
        domains: ['billing', 'auth'],
        constitution: true,
      });

      const status = resolveStatus(workspace);
      assert.deepEqual(status, {
        status: 'ready',
        root: realpathSync(root),
        memory_path: '.specify/memory',
        external: false,
        reader: 'file',
        reader_fallback: 'none',
        binding_coverage: '9 of 11 typed files',
        domains: 'billing, auth',
        constitution: 'present',
        warnings: [],
        error: null,
        hint: null,
      });
    });
  });

  test('normalizes unknown coverage and domain shapes without inventing zero', () => {
    withWorkspace((workspace) => {
      const root = join(workspace, '.specify', 'memory');
      mkdirSync(root, { recursive: true });

      seedMemory(root, { coverage: 'Binding coverage: 12 of 11 typed files' });
      let status = resolveStatus(workspace);
      assert.equal(status.binding_coverage, 'unknown');
      assert.equal(status.domains, 'none');

      writeRelative(root, 'memory-index.md', '# Memory Index\n\nBinding coverage: many\n');
      status = resolveStatus(workspace);
      assert.equal(status.status, 'ready');
      assert.equal(status.binding_coverage, 'unknown');
      assert.equal(status.domains, 'unknown');
    });
  });

  test('is uninitialized with no root, and with an empty default candidate', () => {
    withWorkspace((workspace) => {
      let status = resolveStatus(workspace);
      assert.equal(status.status, 'uninitialized');
      assert.equal(status.binding_coverage, 'n/a');
      assert.equal(status.domains, 'n/a');
      assert.equal(status.external, false);

      mkdirSync(join(workspace, 'memory'));
      status = resolveStatus(workspace);
      assert.equal(status.status, 'uninitialized');
      assert.equal(status.root, join(realpathSync(workspace), 'memory'));
    });
  });

  test('treats a dot-dot-prefixed folder name as internal and keeps tilde literal', () => {
    withWorkspace((workspace) => {
      mkdirSync(join(workspace, '..mem'));
      writeConfig(workspace, { path: '..mem' });
      let status = resolveStatus(workspace);
      assert.equal(status.status, 'uninitialized');
      assert.equal(status.external, false);
      assert.equal(status.root, join(realpathSync(workspace), '..mem'));

      mkdirSync(join(workspace, '~', 'x'), { recursive: true });
      writeConfig(workspace, { path: '~/x' });
      status = resolveStatus(workspace);
      assert.equal(status.external, false);
      assert.equal(status.root, join(realpathSync(workspace), '~', 'x'));
    });
  });

  test('rejects non-boolean allowExternal and shell-significant path characters as config-invalid', () => {
    withWorkspace((workspace) => {
      writeConfig(workspace, { path: 'docs/brain', allowExternal: 'true' });
      let status = resolveStatus(workspace);
      assert.equal(status.status, 'error');
      assert.equal(status.error, 'config-invalid');
      assert.equal(status.root, null);
      assert.equal(status.memory_path, 'docs/brain');

      for (const path of ['a;b', 'a$(x)', 'a`x`', 'a"b', "a'b", 'a|b', 'a&b', 'a<b', 'a>b', 'a\nb']) {
        writeConfig(workspace, { path });
        status = resolveStatus(workspace);
        assert.equal(status.error, 'config-invalid', JSON.stringify(path));
        assert.doesNotMatch(status.memory_path, /[`$"';&|<>\n]/);
        assert.match(status.memory_path, /\?/);
      }

      writeRelative(workspace, '.specify/.specify.json', '{ not json');
      status = resolveStatus(workspace);
      assert.equal(status.error, 'config-invalid');
      assert.equal(status.memory_path, '.specify/memory');
    });
  });

  test('classifies a missing configured root, an incomplete root, and ambiguous defaults', () => {
    withWorkspace((workspace) => {
      writeConfig(workspace, { path: 'nope' });
      let status = resolveStatus(workspace);
      assert.equal(status.status, 'error');
      assert.equal(status.error, 'root-missing');
      assert.equal(status.memory_path, 'nope');
      assert.equal(status.root, join(realpathSync(workspace), 'nope'));

      const root = join(workspace, 'nope');
      mkdirSync(root);
      writeRelative(root, 'memory-index.md', INDEX_WITH_COVERAGE('Binding coverage: 0 of 0 typed files'));
      status = resolveStatus(workspace);
      assert.equal(status.error, 'memory-incomplete');
      assert.equal(status.status, 'error');
      assert.equal(status.root, join(realpathSync(workspace), 'nope'));

      rmSync(join(workspace, '.specify'), { recursive: true });
      mkdirSync(join(workspace, '.specify', 'memory'), { recursive: true });
      mkdirSync(join(workspace, 'memory'));
      status = resolveStatus(workspace);
      assert.equal(status.error, 'ambiguous-default');
      assert.equal(status.memory_path, '.specify/memory');
    });
  });

  test('requires permission for an external root and ties config permission to memory.path', () => {
    withWorkspace((workspace) => {
      const external = makeMemoryRoot(dirname(workspace), 'ext-memory');
      seedMemory(external);

      writeConfig(workspace, { path: '../ext-memory' });
      let status = resolveStatus(workspace);
      assert.equal(status.error, 'external-not-allowed');
      assert.equal(status.memory_path, '../ext-memory');
      assert.equal(status.root, null);
      assert.equal(status.external, true);
      assert.equal(status.hint, 'enable-allow-external');

      status = resolveStatus(workspace, ['--allow-external-root']);
      assert.equal(status.status, 'ready');
      assert.equal(status.external, true);
      assert.equal(status.root, realpathSync(external));

      writeConfig(workspace, { path: '../ext-memory', allowExternal: false });
      assert.equal(resolveStatus(workspace).error, 'external-not-allowed');

      writeConfig(workspace, { path: '../ext-memory', allowExternal: true });
      status = resolveStatus(workspace);
      assert.equal(status.status, 'ready');
      assert.equal(status.external, true);
      assert.equal(status.root, realpathSync(external));
      assert.deepEqual(status.warnings, []);

      // allowExternal without memory.path grants nothing to an explicit root.
      writeConfig(workspace, { allowExternal: true });
      assert.equal(resolveStatus(workspace, ['--memory-root', '../ext-memory']).error, 'external-not-allowed');
    });
  });

  test('denies an explicit external root that differs from memory.path unless the flag is given', () => {
    withWorkspace((workspace) => {
      const configured = makeMemoryRoot(dirname(workspace), 'configured-memory');
      const other = makeMemoryRoot(dirname(workspace), 'other-memory');
      seedMemory(configured);
      seedMemory(other);
      writeConfig(workspace, { path: '../configured-memory', allowExternal: true });

      let status = resolveStatus(workspace, ['--memory-root', '../other-memory']);
      assert.equal(status.error, 'external-not-allowed');
      assert.equal(status.memory_path, '../configured-memory');
      assert.equal(status.external, true);
      assert.equal(status.hint, 'explicit-root-differs');

      status = resolveStatus(workspace, ['--memory-root', '../other-memory', '--allow-external-root']);
      assert.equal(status.status, 'ready');
      assert.equal(status.root, realpathSync(other));

      status = resolveStatus(workspace, ['--memory-root', configured]);
      assert.equal(status.status, 'ready');
      assert.equal(status.root, realpathSync(configured));
    });
  });

  test('warns about an absolute memory.path and a legacy constitution left behind', () => {
    withWorkspace((workspace) => {
      const external = makeMemoryRoot(dirname(workspace), 'abs-memory');
      seedMemory(external);
      writeRelative(workspace, '.specify/memory/constitution.md', '# Legacy constitution\n');
      writeConfig(workspace, { path: realpathSync(external), allowExternal: true });

      const status = resolveStatus(workspace);
      assert.equal(status.status, 'ready');
      assert.deepEqual(status.warnings, ['absolute-path', 'legacy-constitution']);
      assert.equal(status.constitution, 'absent');
    });
  });

  test('blocks a symlinked root that escapes the workspace unless it is the permitted memory.path', () => {
    withWorkspace((workspace) => {
      const external = makeMemoryRoot(dirname(workspace), 'link-target');
      seedMemory(external);
      symlinkSync(external, join(workspace, 'root-link'));

      writeConfig(workspace, { path: 'root-link' });
      let status = resolveStatus(workspace);
      assert.equal(status.status, 'error');
      assert.equal(status.error, 'containment');

      writeConfig(workspace, { path: 'root-link', allowExternal: true });
      status = resolveStatus(workspace);
      assert.equal(status.status, 'ready');
      assert.equal(status.external, true);
      assert.equal(status.root, realpathSync(external));
    });
  });

  test('rejects an unsupported reader backend', () => {
    withWorkspace((workspace) => {
      writeConfig(workspace, { reader: { backend: 'obsidian-cli' } });
      const status = resolveStatus(workspace);
      assert.equal(status.status, 'error');
      assert.equal(status.error, 'unsupported-reader');

      writeConfig(workspace, { reader: { backend: 'file' } });
      assert.equal(resolveStatus(workspace).status, 'uninitialized');

      for (const reader of ['file', 5, null, ['file']]) {
        writeConfig(workspace, { reader });
        assert.equal(resolveStatus(workspace).error, 'config-invalid', JSON.stringify(reader));
      }
    });
  });

  test('resolves a relative memory.path that leaves the repository from the main worktree', (context) => {
    const probe = spawnSync('git', ['--version'], { encoding: 'utf8' });
    if (probe.status !== 0) {
      context.skip('git is not available');
      return;
    }

    const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'tdk-memory-worktree-')));
    try {
      const main = join(sandbox, 'main');
      mkdirSync(main);
      git(main, ['init', '-q']);
      git(main, ['commit', '-q', '--allow-empty', '-m', 'init']);
      const linked = join(sandbox, 'deep', 'er', 'linked');
      git(main, ['worktree', 'add', '-q', linked, '-b', 'feature']);

      const external = makeMemoryRoot(sandbox, 'team-memory');
      seedMemory(external);
      writeConfig(linked, { path: '../team-memory', allowExternal: true });
      const outside = resolveStatus(linked);
      assert.equal(outside.status, 'ready');
      assert.equal(outside.root, external);
      assert.equal(outside.external, true);

      // From the main worktree the same configuration reaches the same root.
      writeConfig(main, { path: '../team-memory', allowExternal: true });
      assert.equal(resolveStatus(main).root, external);

      // A relative path that stays inside the repository keeps using the linked worktree.
      const internal = join(linked, 'docs', 'brain');
      mkdirSync(internal, { recursive: true });
      seedMemory(internal);
      writeConfig(linked, { path: 'docs/brain' });
      const inside = resolveStatus(linked);
      assert.equal(inside.status, 'ready');
      assert.equal(inside.root, internal);
      assert.equal(inside.external, false);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test('rejects empty paths, a null memory block, and an empty explicit root', () => {
    withWorkspace((workspace) => {
      for (const path of ['', '   ', 5, null]) {
        writeConfig(workspace, { path });
        const status = resolveStatus(workspace);
        assert.equal(status.error, 'config-invalid', JSON.stringify(path));
        assert.equal(status.memory_path, '.specify/memory');
      }

      writeRelative(workspace, '.specify/.specify.json', JSON.stringify({ memory: null }));
      assert.equal(resolveStatus(workspace).error, 'config-invalid');

      writeConfig(workspace, undefined);
      assert.equal(resolveStatus(workspace, ['--memory-root', '']).error, 'config-invalid');
      assert.equal(resolveStatus(workspace, ['--memory-root', '  ']).error, 'config-invalid');
    });
  });

  test('rejects backslash, C1 controls, and line separators in memory.path', () => {
    withWorkspace((workspace) => {
      for (const path of ['a\\b', 'a\u0085b', 'a\u009fb', 'a b', 'a b']) {
        writeConfig(workspace, { path });
        const status = resolveStatus(workspace);
        assert.equal(status.error, 'config-invalid', JSON.stringify(path));
        assert.equal(status.memory_path, 'a?b');
      }
    });
  });

  test('blocks a canonical root whose real path carries shell-significant characters', () => {
    withWorkspace((workspace) => {
      for (const [index, name] of ['we$ird', 'new\nline', 'back\\slash'].entries()) {
        const target = makeMemoryRoot(dirname(workspace), name);
        seedMemory(target);
        symlinkSync(target, join(workspace, `link-${index}`));
        writeConfig(workspace, { path: `link-${index}`, allowExternal: true });
        const status = resolveStatus(workspace);
        assert.equal(status.status, 'error', JSON.stringify(name));
        assert.equal(status.error, 'containment', JSON.stringify(name));
        assert.equal(status.root, null);
        assert.equal(resolveStatus(workspace, ['--allow-external-root']).error, 'containment');
      }
    });
  });

  test('accepts workspace locations with shell-neutral punctuation such as ampersand and apostrophe', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tdk-memory-punct-'));
    try {
      for (const name of ['R&D', "Tom's projects", 'a;b (c)', 'x|y <z>']) {
        const workspace = join(sandbox, name, 'workspace');
        mkdirSync(join(workspace, '.git'), { recursive: true });
        assert.equal(resolveStatus(workspace).status, 'uninitialized', name);

        const root = join(workspace, '.specify', 'memory');
        mkdirSync(root, { recursive: true });
        seedMemory(root);
        const status = resolveStatus(workspace);
        assert.equal(status.status, 'ready', name);
        assert.equal(status.root, realpathSync(root));
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test('screens resolved locations with a narrower set than memory.path, treating backslash by platform', () => {
    const { hasForbiddenLocationCharacter } = require(RUNTIME_BUNDLE);
    const posix = (value) => hasForbiddenLocationCharacter(value, 'linux');
    const windows = (value) => hasForbiddenLocationCharacter(value, 'win32');

    for (const clean of ["/home/Tom's projects/R&D", '/srv/a;b|c<d>e', 'C:/Users/me/work']) {
      assert.equal(posix(clean), false, clean);
      assert.equal(windows(clean), false, clean);
    }
    for (const dirty of ['/srv/a$b', '/srv/a`b', '/srv/a"b', '/srv/a\nb', '/srv/a\u0085b', '/srv/a\u2028b']) {
      assert.equal(posix(dirty), true, JSON.stringify(dirty));
      assert.equal(windows(dirty), true, JSON.stringify(dirty));
    }

    assert.equal(windows("C:\\Users\\R&D\\Tom's projects\\workspace"), false);
    assert.equal(posix('C:\\Users\\me\\workspace'), true);
    assert.equal(posix('/srv/back\\slash'), true);
    assert.equal(windows('C:\\Users\\me\\$work'), true);
  });

  test('blocks a workspace location with shell-significant characters', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tdk-memory-weird-'));
    try {
      const workspace = join(sandbox, 'work$space');
      mkdirSync(join(workspace, '.git'), { recursive: true });
      assert.equal(resolveStatus(workspace).error, 'containment');
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test('refuses a root equal to or above the workspace even with permission', () => {
    withWorkspace((workspace) => {
      writeConfig(workspace, { path: '..', allowExternal: true });
      let status = resolveStatus(workspace);
      assert.equal(status.error, 'containment');
      assert.equal(status.root, null);
      assert.equal(status.external, true);

      status = resolveStatus(workspace, ['--memory-root', '/', '--allow-external-root']);
      assert.equal(status.error, 'containment');

      writeConfig(workspace, { path: '.' });
      assert.equal(resolveStatus(workspace).error, 'containment');
    });
  });

  test('reports the session root for a permitted root that does not exist yet', () => {
    withWorkspace((workspace) => {
      const future = join(dirname(workspace), 'future-memory');
      writeConfig(workspace, { path: '../future-memory', allowExternal: true });
      let status = resolveStatus(workspace);
      assert.equal(status.status, 'error');
      assert.equal(status.error, 'root-missing');
      assert.equal(status.external, true);
      assert.equal(status.root, join(realpathSync(dirname(workspace)), 'future-memory'));
      assert.equal(status.memory_path, '../future-memory');

      writeConfig(workspace, { path: '../future-memory' });
      status = resolveStatus(workspace);
      assert.equal(status.error, 'external-not-allowed');
      assert.equal(status.root, null);

      writeConfig(workspace, { path: 'inner-future' });
      status = resolveStatus(workspace);
      assert.equal(status.error, 'root-missing');
      assert.equal(status.external, false);
      assert.equal(status.root, join(realpathSync(workspace), 'inner-future'));
      assert.equal(existsSync(future), false, 'resolve never creates the root');
    });
  });

  test('treats a Domain Map whose rows name no domain as unknown, not none', () => {
    withWorkspace((workspace) => {
      const root = join(workspace, '.specify', 'memory');
      mkdirSync(root, { recursive: true });
      const index = [
        '# Memory Index',
        '',
        'Binding coverage: 0 of 0 typed files',
        '',
        '## Domain Map',
        '',
        '| Domain | Folder | Scope |',
        '|--------|--------|-------|',
        '| Not A Domain | x | y |',
        '',
      ].join('\n');
      writeRelative(root, 'memory-index.md', index);
      writeRelative(root, 'memory.yaml', manifestYaml({ indexSha256: sha256(index) }));
      assert.equal(resolveStatus(workspace).domains, 'unknown');

      const placeholder = index.replace('| Not A Domain | x | y |', '| _(none yet)_ | | |');
      writeRelative(root, 'memory-index.md', placeholder);
      writeRelative(root, 'memory.yaml', manifestYaml({ indexSha256: sha256(placeholder) }));
      assert.equal(resolveStatus(workspace).domains, 'none');
    });
  });

  test('keeps the documented resolve flag surface strict', () => {
    withWorkspace((workspace) => {
      expectFatal(runRuntime(workspace, ['resolve', '--allow-external-root', '--allow-external-root']));
      expectFatal(runRuntime(workspace, ['resolve', '--memory-root']));
      expectFatal(runRuntime(workspace, ['resolve', 'positional']));
      expectFatal(runRuntime(workspace, ['resolve', '--manifest', 'memory.yaml']));
    });
  });
});

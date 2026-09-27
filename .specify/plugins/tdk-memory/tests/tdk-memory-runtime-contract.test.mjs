import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

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

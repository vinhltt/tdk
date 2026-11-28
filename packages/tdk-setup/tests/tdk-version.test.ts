import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  pickPluginVersions,
  readClaudeStateTdkVersion,
  readPayloadTdkVersion,
  readSourceTdkVersion,
} from '../src/tdk-version';
import { makeConsumer } from './fixtures';

function writeMarketplace(root: string, content: string): void {
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), content, 'utf-8');
}

describe('readSourceTdkVersion', () => {
  test('returns unknown when the marketplace file is missing', () => {
    const consumer = makeConsumer('tdk-version-missing-');
    expect(readSourceTdkVersion(consumer.root)).toBe('unknown');
  });

  test('returns unknown for broken JSON, a missing field or a non-semver value', () => {
    const consumer = makeConsumer('tdk-version-invalid-');
    for (const [index, content] of ['{not json', '{}', '{"metadata":{"version":"latest"}}', '{"metadata":{"version":7}}', '{"metadata":{"version":"1.2.3+build"}}', '[]'].entries()) {
      const root = path.join(consumer.root, `case-${index}`);
      writeMarketplace(root, content);
      expect(readSourceTdkVersion(root)).toBe('unknown');
    }
  });

  test('reads metadata.version from a valid marketplace', () => {
    const consumer = makeConsumer('tdk-version-valid-');
    writeMarketplace(consumer.root, JSON.stringify({ metadata: { version: '2.3.4' } }));
    expect(readSourceTdkVersion(consumer.root)).toBe('2.3.4');
  });

  test('memoizes per root', () => {
    const consumer = makeConsumer('tdk-version-memo-');
    writeMarketplace(consumer.root, JSON.stringify({ metadata: { version: '1.0.0' } }));
    expect(readSourceTdkVersion(consumer.root)).toBe('1.0.0');
    writeMarketplace(consumer.root, JSON.stringify({ metadata: { version: '9.9.9' } }));
    expect(readSourceTdkVersion(consumer.root)).toBe('1.0.0');
  });

  test('the default root is the source checkout that contains this package', () => {
    const marketplace = path.resolve(import.meta.dir, '../../../.claude-plugin/marketplace.json');
    const expected = JSON.parse(fs.readFileSync(marketplace, 'utf-8')).metadata.version;
    expect(readSourceTdkVersion()).toBe(expected);
  });
});

describe('consumer version readers', () => {
  test('readPayloadTdkVersion is lenient about missing and malformed manifests', () => {
    const consumer = makeConsumer('tdk-version-payload-');
    expect(readPayloadTdkVersion(consumer.root)).toBeUndefined();
    const file = path.join(consumer.root, '.specify', 'release-manifest.json');
    fs.writeFileSync(file, '{broken', 'utf-8');
    expect(readPayloadTdkVersion(consumer.root)).toBeUndefined();
    fs.writeFileSync(file, JSON.stringify({ tdkVersion: 12 }), 'utf-8');
    expect(readPayloadTdkVersion(consumer.root)).toBeUndefined();
    fs.writeFileSync(file, JSON.stringify({ tdkVersion: '1.135.0' }), 'utf-8');
    expect(readPayloadTdkVersion(consumer.root)).toBe('1.135.0');
  });

  test('readClaudeStateTdkVersion ignores the legacy state file', () => {
    const consumer = makeConsumer('tdk-version-claude-state-');
    const stateDir = path.join(consumer.root, '.specify', 'state');
    fs.mkdirSync(path.join(stateDir, 'harness-install'), { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'harness-install.json'), JSON.stringify({ tdkVersion: '1.0.0' }), 'utf-8');
    expect(readClaudeStateTdkVersion(consumer.root)).toBeUndefined();
    fs.writeFileSync(path.join(stateDir, 'harness-install', 'claude.json'), JSON.stringify({ tdkVersion: '1.2.3' }), 'utf-8');
    expect(readClaudeStateTdkVersion(consumer.root)).toBe('1.2.3');
  });
});

describe('pickPluginVersions', () => {
  test('keeps string versions of selected plugins and never convert-flat', () => {
    const entries = {
      'tdk-core': { version: '1.0.0' },
      'tdk-epic': { version: '2.0.0' },
      'convert-flat': { version: '0.1.0' },
      broken: { version: 3 },
      empty: { version: '' },
    };
    expect(pickPluginVersions(entries, ['tdk-core', 'convert-flat', 'broken', 'empty', 'absent']))
      .toEqual({ 'tdk-core': '1.0.0' });
  });

  test('returns undefined when nothing remains', () => {
    expect(pickPluginVersions({ 'convert-flat': { version: '1.0.0' } }, ['convert-flat'])).toBeUndefined();
    expect(pickPluginVersions({}, [])).toBeUndefined();
  });
});

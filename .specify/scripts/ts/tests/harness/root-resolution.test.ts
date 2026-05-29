import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveConsumerRoot } from '../../src/commands/harness/root-resolution';
import { makeConsumer } from './fixtures';

describe('resolveConsumerRoot', () => {
  test('prefers nearest valid .specify substrate', () => {
    const outer = makeConsumer('tdk-outer-');
    const innerRoot = path.join(outer.root, 'nested', 'consumer');
    fs.mkdirSync(path.join(innerRoot, '.specify', 'scripts', 'ts'), { recursive: true });
    fs.mkdirSync(path.join(innerRoot, '.specify', 'plugins'), { recursive: true });

    const result = resolveConsumerRoot(path.join(innerRoot, '.specify', 'scripts', 'ts'));

    expect(result.consumerRoot).toBe(fs.realpathSync(innerRoot));
  });

  test('partial .specify substrate gives rerun distribute guidance', () => {
    const root = fs.mkdtempSync(path.join('/tmp', 'tdk-partial-'));
    fs.mkdirSync(path.join(root, '.specify', 'scripts', 'ts'), { recursive: true });

    expect(() => resolveConsumerRoot(path.join(root, '.specify', 'scripts', 'ts'))).toThrow(/Rerun distribute\.sh/);
  });
});

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const README_PATH = resolve(import.meta.dir, '../../../../README.md');

function localTargets(markdown: string): string[] {
  return [...markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1]!.trim().replace(/^<|>$/g, ''))
    .filter((target) => !target.startsWith('#') && !target.startsWith('//') && !/^[a-z][a-z\d+.-]*:/i.test(target))
    .map((target) => decodeURIComponent(target.split('#', 1)[0]!.split('?', 1)[0]!))
    .filter(Boolean);
}

describe('TDK README contract', () => {
  it('resolves every relative link and image target', () => {
    const markdown = readFileSync(README_PATH, 'utf8');
    const missing = localTargets(markdown).filter((target) => !existsSync(resolve(dirname(README_PATH), target)));
    expect(missing).toEqual([]);
  });

  it('documents serial, parallel, safety, recovery, and harness boundaries', () => {
    const markdown = readFileSync(README_PATH, 'utf8').replace(/\s+/g, ' ');
    for (const token of [
      '/tdk-implement <task-id>', '--phase NN', '--parallel', 'parallel_safe: auto',
      'parallel_safe: never', 'Modify', 'Create', 'Delete', 'case-sensitive',
      'DrvFS', 'nested mount', 'four workers', 'crash-atomic', 'mutation reservation',
      'synchronous', 'no worker timeout', 'Codex', 'default serial',
    ]) expect(markdown).toContain(token);
  });
});

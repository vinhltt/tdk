import { describe, expect, test } from 'bun:test';
import { parseConvertPartCsv, resolveConvertParts } from '../src/convert-parts';

describe('convert part selection', () => {
  test('parses known parts, removes duplicates, and rejects unknown values', () => {
    expect(parseConvertPartCsv('rules,agents,rules', '--parts')).toEqual(['agents', 'rules']);
    expect(() => parseConvertPartCsv('agents,commands', '--parts')).toThrow(/commands.*--parts/);
  });

  test('keeps --parts additive and computes active parts from manifest state', async () => {
    const selection = await resolveConvertParts({
      parts: 'rules',
      previousConvertedParts: ['agents'],
      manifestExists: true,
      interactive: false,
    });

    expect(selection).toEqual({
      selectedParts: ['rules'],
      removedParts: [],
      activeParts: ['agents', 'rules'],
    });
  });

  test('allows remove-only runs and rejects overlap between flags', async () => {
    const selection = await resolveConvertParts({
      removeParts: 'skills',
      previousConvertedParts: ['settings', 'skills'],
      manifestExists: true,
      interactive: false,
    });

    expect(selection).toEqual({
      selectedParts: [],
      removedParts: ['skills'],
      activeParts: ['settings'],
    });
    await expect(resolveConvertParts({
      parts: 'agents,rules',
      removeParts: 'rules',
      previousConvertedParts: [],
      manifestExists: true,
      interactive: false,
    })).rejects.toThrow(/rules.*both --parts and --remove-parts/);
  });

  test('requires explicit parts for the first non-interactive OMP run', async () => {
    await expect(resolveConvertParts({
      previousConvertedParts: [],
      manifestExists: false,
      interactive: false,
    })).rejects.toThrow(/Non-interactive.*--parts/);
  });

  test('reuses manifest convertedParts when a non-interactive rerun omits flags', async () => {
    const selection = await resolveConvertParts({
      previousConvertedParts: ['skills', 'agents'],
      manifestExists: true,
      interactive: false,
    });

    expect(selection).toEqual({
      selectedParts: ['agents', 'skills'],
      removedParts: [],
      activeParts: ['agents', 'skills'],
    });
  });
});

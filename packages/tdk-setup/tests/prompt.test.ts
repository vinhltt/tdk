import { describe, expect, test } from 'bun:test';
import { selectPluginsInteractively } from '../src/prompt';

describe('selectPluginsInteractively', () => {
  test('returns an empty optional request without opening a prompt when the catalog is empty', async () => {
    await expect(selectPluginsInteractively([])).resolves.toEqual([]);
  });
});

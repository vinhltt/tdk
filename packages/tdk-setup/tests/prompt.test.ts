import { describe, expect, test } from 'bun:test';
import { selectPluginsInteractively } from '../src/prompt';

describe('selectPluginsInteractively', () => {
  test('rejects with correct message when plugin list is empty', async () => {
    await expect(selectPluginsInteractively([])).rejects.toThrow(
      'No plugins are available in .specify/plugins/manifest.json.',
    );
  });
});

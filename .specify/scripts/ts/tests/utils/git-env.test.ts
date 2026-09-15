import { describe, expect, it } from 'bun:test';
import { sanitizedGitEnv } from '../../src/utils/index';

describe('git environment sanitization', () => {
  it('preserves no-lazy-fetch additions while removing repository overrides added by a caller', () => {
    const env = sanitizedGitEnv(
      { PATH: '/bin', GIT_DIR: '/ambient/repository' },
      { GIT_DIR: '/caller/repository', GIT_NO_LAZY_FETCH: '1' },
    );

    expect(env.GIT_NO_LAZY_FETCH).toBe('1');
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.PATH).toBe('/bin');
  });
});

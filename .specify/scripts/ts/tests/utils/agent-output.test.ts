import { describe, expect, it } from 'bun:test';
import { formatAgentJson } from '../../src/utils/agent-output';

describe('agent-output', () => {
  it('formats compact JSON with one trailing newline', () => {
    const output = formatAgentJson({ a: 1, b: [2] });

    expect(output).toBe('{"a":1,"b":[2]}\n');
  });

  it('preserves JSON.stringify semantics for empty and falsy values', () => {
    expect(formatAgentJson({ empty: '', nil: null, ok: false, list: [], obj: {} }))
      .toBe('{"empty":"","nil":null,"ok":false,"list":[],"obj":{}}\n');
  });
});

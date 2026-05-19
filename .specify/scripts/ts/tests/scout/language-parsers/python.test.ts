import { describe, it, expect } from 'bun:test';
import { pythonParser } from '../../../src/commands/scout/language-parsers/python';

describe('python parser', () => {
  it('extracts plain and from imports', () => {
    const body = 'import os, sys\nfrom pathlib import Path\nimport json as j';
    expect(pythonParser.extractImports(body).sort()).toEqual(
      ['json', 'os', 'pathlib', 'sys'].sort(),
    );
  });

  it('extracts top-level def + class as exports (excludes _private)', () => {
    const body = 'def foo():\n    pass\n\ndef _bar():\n    pass\n\nclass Baz:\n    pass';
    const exp = pythonParser.extractExports(body);
    expect(exp).toContain('foo');
    expect(exp).toContain('Baz');
    expect(exp).not.toContain('_bar');
  });

  it('extracts def + class symbols including private', () => {
    const body = 'def foo():\n    pass\n\ndef _bar():\n    pass\n\nclass Baz:\n    pass';
    const sym = pythonParser.extractSymbols(body);
    expect(sym).toContain('foo');
    expect(sym).toContain('_bar');
    expect(sym).toContain('Baz');
  });

  it('handles async def', () => {
    const body = 'async def fetch():\n    pass';
    expect(pythonParser.extractSymbols(body)).toEqual(['fetch']);
  });
});

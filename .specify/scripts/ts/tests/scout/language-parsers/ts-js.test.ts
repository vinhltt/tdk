import { describe, it, expect } from 'bun:test';
import { tsJsParser } from '../../../src/commands/scout/language-parsers/ts-js';

describe('ts-js parser', () => {
  it('extracts ESM imports', () => {
    const body = "import { a } from './a';\nimport b from 'pkg';\nimport 'side';";
    expect(tsJsParser.extractImports(body)).toEqual(['./a', 'pkg', 'side']);
  });

  it('extracts CJS requires', () => {
    const body = "const fs = require('node:fs');\nconst x = require('lib');";
    expect(tsJsParser.extractImports(body).sort()).toEqual(['lib', 'node:fs']);
  });

  it('extracts named + default exports', () => {
    const body = [
      'export const a = 1;',
      'export function b() {}',
      'export default class C {}',
      'export interface I {}',
      'export type T = string;',
    ].join('\n');
    const exp = tsJsParser.extractExports(body);
    expect(exp).toContain('a');
    expect(exp).toContain('b');
    expect(exp).toContain('C');
    expect(exp).toContain('I');
    expect(exp).toContain('T');
  });

  it('extracts re-export names', () => {
    const body = "export { foo, bar as baz } from './x';";
    const exp = tsJsParser.extractExports(body);
    expect(exp).toContain('foo');
    expect(exp).toContain('bar');
  });

  it('extracts symbols', () => {
    const body = 'const a = 1;\nfunction b() {}\nclass C {}';
    const sym = tsJsParser.extractSymbols(body);
    expect(sym.sort()).toEqual(['C', 'a', 'b']);
  });

  it('handles multiline import', () => {
    const body = "import {\n  a,\n  b,\n} from 'multi';";
    expect(tsJsParser.extractImports(body)).toEqual(['multi']);
  });
});

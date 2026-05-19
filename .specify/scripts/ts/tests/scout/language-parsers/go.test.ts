import { describe, it, expect } from 'bun:test';
import { goParser } from '../../../src/commands/scout/language-parsers/go';

describe('go parser', () => {
  it('extracts single-line import', () => {
    const body = 'import "fmt"';
    expect(goParser.extractImports(body)).toEqual(['fmt']);
  });

  it('extracts grouped imports', () => {
    const body = 'import (\n  "fmt"\n  "net/http"\n  alias "encoding/json"\n)';
    const imp = goParser.extractImports(body);
    expect(imp.sort()).toEqual(['encoding/json', 'fmt', 'net/http']);
  });

  it('uppercase func/type → exports; lowercase → not exports', () => {
    const body = 'func Run() {}\nfunc helper() {}\ntype Server struct{}\ntype priv struct{}';
    const exp = goParser.extractExports(body);
    expect(exp).toContain('Run');
    expect(exp).toContain('Server');
    expect(exp).not.toContain('helper');
    expect(exp).not.toContain('priv');
  });

  it('extracts method receivers', () => {
    const body = 'func (s *Server) Handle() {}\nfunc Plain() {}';
    expect(goParser.extractSymbols(body).sort()).toEqual(['Handle', 'Plain']);
  });
});

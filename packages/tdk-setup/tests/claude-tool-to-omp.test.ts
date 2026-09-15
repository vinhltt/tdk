import { describe, expect, test } from 'bun:test';
import { mapClaudeTools } from '../src/lib/harness-transform/claude-tool-to-omp';

describe('Claude to OMP tool mapping', () => {
  test('maps every supported Claude tool from CSV and appends yield once', () => {
    const result = mapClaudeTools('Read, Write, Edit, MultiEdit, Bash, Grep, Glob, Task, TodoWrite, WebSearch, NotebookEdit, AskUserQuestion, Read');

    expect(result).toEqual({
      tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'task', 'todo', 'web_search', 'notebook', 'ask', 'yield'],
      dropped: [],
      usesDefaultTools: false,
    });
  });

  test('drops unsupported, MCP, and unknown array entries without hiding them', () => {
    const result = mapClaudeTools(['WebFetch', 'Skill', 'mcp__github__search', 'BashOutput', 'KillShell', 'UnknownTool']);

    expect(result).toEqual({
      tools: ['yield'],
      dropped: ['WebFetch', 'Skill', 'mcp__github__search', 'BashOutput', 'KillShell', 'UnknownTool'],
      usesDefaultTools: false,
    });
  });

  test('drops prototype-sensitive names instead of inheriting object members', () => {
    expect(mapClaudeTools(['toString', 'constructor', '__proto__'])).toEqual({
      tools: ['yield'],
      dropped: ['toString', 'constructor', '__proto__'],
      usesDefaultTools: false,
    });
  });

  test('omits the tools field for wildcard semantics', () => {
    expect(mapClaudeTools('*')).toEqual({
      tools: undefined,
      dropped: [],
      usesDefaultTools: true,
    });
  });

  test('omits tools when the source field is absent or empty', () => {
    expect(mapClaudeTools(undefined)).toEqual({ tools: undefined, dropped: [], usesDefaultTools: false });
    expect(mapClaudeTools('')).toEqual({ tools: undefined, dropped: [], usesDefaultTools: false });
  });
});

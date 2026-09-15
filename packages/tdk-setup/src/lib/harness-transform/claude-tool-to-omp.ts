const OMP_TOOL_BY_CLAUDE_TOOL: Record<string, string> = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  MultiEdit: 'edit',
  Bash: 'bash',
  Grep: 'grep',
  Glob: 'glob',
  Task: 'task',
  TodoWrite: 'todo',
  WebSearch: 'web_search',
  NotebookEdit: 'notebook',
  AskUserQuestion: 'ask',
};

export function mapClaudeToolName(value: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(OMP_TOOL_BY_CLAUDE_TOOL, value)
    ? OMP_TOOL_BY_CLAUDE_TOOL[value]
    : undefined;
}

export interface ClaudeToolMapResult {
  tools?: string[];
  dropped: string[];
  usesDefaultTools: boolean;
}

export function mapClaudeTools(input: unknown): ClaudeToolMapResult {
  const values = typeof input === 'string'
    ? input.split(',').map((tool) => tool.trim()).filter(Boolean)
    : Array.isArray(input)
      ? input.map((tool) => typeof tool === 'string' ? tool.trim() : String(tool)).filter(Boolean)
      : [];
  if (values.length === 0) return { tools: undefined, dropped: [], usesDefaultTools: false };
  if (values.includes('*')) return { tools: undefined, dropped: [], usesDefaultTools: true };

  const tools: string[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const mapped = mapClaudeToolName(value);
    if (!mapped) {
      dropped.push(value);
      continue;
    }
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    tools.push(mapped);
  }
  tools.push('yield');
  return { tools, dropped, usesDefaultTools: false };
}

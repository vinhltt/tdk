# Research & Analysis Phase

**Skip if:** User provides researcher reports, technical context docs, or explicit architecture decisions.

## Core Activities

### Sequential Thinking
Use structured thinking for complex analysis:
- Break down problems step-by-step
- Multi-step reasoning with revision capability
- Hypothesis → Verification → Refinement cycle

### Documentation Research
Use available tools to research docs:
- Search library/framework documentation
- Find API docs and technical references
- Research plugins, packages, and frameworks
- Look up latest technical documentation

**Tools:**
- `@workspace` - Search codebase for patterns
- Web search for external documentation
- GitHub repository README and docs

### GitHub Analysis
Use `gh` CLI to analyze:
- GitHub Actions logs
- Pull requests and issues
- Discussions and wikis

**Commands:**
```bash
gh issue view <number>
gh pr view <number>
gh run view <run-id> --log
gh api repos/{owner}/{repo}/contents/{path}
```

### Remote Repository Analysis
When given GitHub repository URL:
```bash
# Clone and analyze
gh repo clone <owner>/<repo> -- --depth=1

# Or use repomix for AI-friendly summary
repomix --remote <github-repo-url>
```

### Project Knowledge Research

Load: `references/project-knowledge.md` for detailed workflow.

**1. Obsidian MCP** (Knowledge Search)
```
Use MCP tools for project knowledge:
- `obsidian_simple_search("feature-name")` - Semantic search across vault
- `obsidian_complex_search` - JsonLogic queries for advanced filtering
- `obsidian_batch_get_file_contents` - Batch read related files
```

**2. AI Docs Manager** ask `memory-guardian` agent to fetch and summarize relevant documentation based on project domain.
Read relevant docs from `.specify/memory/` based on feature domain.

**3. Obsidian Brain** (`obsidian-brain` skill) for knowledge synthesis and research modes (detective, writer, reviewer).

Use research modes:
- **Detective Mode:** Semantic search → grep exact match → infer relations
- **Writer Mode:** Search → read context → draft with project terminology
- **Reviewer Mode:** Verify terminology consistency, warn on conflicts

### Subagent Delegation Pattern

For complex research requiring isolated context:

1. **Delegate to subagent:**
   ```
   Research: [specific topic]
   Output: .specify/specs/{task-id}/research/researcher-01-{topic}.md
   ```

2. **User continues manually** when subagent completes

3. **Main agent reads** the output file and synthesizes

## Research Output Format

Create `research.md` with:

```markdown
# Research Report

## Topic: [research topic]

## Findings

### Decision
[What was chosen]

### Rationale
[Why chosen - pros/cons analysis]

### Alternatives Evaluated
- Option A: [description] - Rejected because [reason]
- Option B: [description] - Rejected because [reason]

### References
- [Link to documentation]
- [Link to examples]

## Open Questions
- [Any unresolved questions]
```

## Best Practices

- Research breadth before depth
- Document findings for synthesis phase
- Identify multiple approaches for comparison
- Consider edge cases during research
- Note security implications early
- Always cite sources and references

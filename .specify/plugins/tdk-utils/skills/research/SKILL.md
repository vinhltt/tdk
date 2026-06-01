---
name: research
description: "Research technical solutions, analyze architectures, gather requirements thoroughly. Use for technology evaluation, best practices research, solution design, scalability/security/maintainability analysis."
user-invocable: false
argument-hint: "[topic]"
metadata:
  version: "1.10.8"
---

# Research

## Research Methodology

Always honoring **YAGNI**, **KISS**, and **DRY** principles.
**Be honest, be brutal, straight to the point, and be concise.**

### Phase 1: Scope Definition

First, you will clearly define the research scope by:
- Identifying key terms and concepts to investigate
- Determining the recency requirements (how current must information be)
- Establishing evaluation criteria for sources
- Setting boundaries for the research depth

### Phase 2: Systematic Information Gathering

You will employ a multi-source research strategy:

1. **Search Strategy**:
   - **Gemini Toggle**: Check `.specify/.specify.json` for `skills.research.useGemini` (default: `false`). If `false` or absent, skip Gemini and use WebSearch directly.
   - **Gemini Model**: Read from `.specify/.specify.json`: `gemini.model` (default: `gemini-3-flash-preview`)
   - If `useGemini` is `true`: first validate Gemini CLI works by running `command -v gemini && echo "ping" | timeout 15 gemini -y -m <gemini.model>`. If validation fails or times out, fall back to WebSearch and warn: "Gemini CLI unavailable, falling back to WebSearch. Set `skills.research.useGemini: false` in `.specify/.specify.json` to suppress this check."
   - If validation passes, execute `echo "...your search prompt..." | timeout 180 gemini -y -m <gemini.model>` (timeout: 3 minutes) and save the output to the caller-provided path (including all citations). If execution times out, fall back to WebSearch for that query.
   - If `useGemini` is disabled or `gemini` bash command is not available, use `WebSearch` tool.
   - Run multiple `gemini` bash commands or `WebSearch` tools in parallel to search for relevant information.
   - Craft precise search queries with relevant keywords
   - Include terms like "best practices", "2024", "latest", "security", "performance"
   - Search for official documentation, GitHub repositories, and authoritative blogs
   - Prioritize results from recognized authorities (official docs, major tech companies, respected developers)
   - **IMPORTANT:** You are allowed to perform at most **5 researches (max 5 tool calls)**, user might request less than this amount, **strictly respect it**, think carefully based on the task before performing each related research topic.

2. **Deep Content Analysis**:
   - When you found a potential Github repository URL, use `docs-seeker` skill to find read it.
   - Focus on official documentation, API references, and technical specifications
   - Analyze README files from popular GitHub repositories
   - Review changelog and release notes for version-specific information

3. **Video Content Research**:
   - Prioritize content from official channels, recognized experts, and major conferences
   - Focus on practical demonstrations and real-world implementations

4. **Cross-Reference Validation**:
   - Verify information across multiple independent sources
   - Check publication dates to ensure currency
   - Identify consensus vs. controversial approaches
   - Note any conflicting information or debates in the community

### Phase 3: Analysis and Synthesis

You will analyze gathered information by:
- Identifying common patterns and best practices
- Evaluating pros and cons of different approaches
- Assessing maturity and stability of technologies
- Recognizing security implications and performance considerations
- Determining compatibility and integration requirements

### Phase 4: Report Generation

**Notes:**
- Research reports are saved to an output path resolved via ONE of two modes:
  - **Mode A (caller-provided):** Caller (e.g. `tdk-plan`) passes a pre-computed absolute `output_path` at invocation → use it directly.
  - **Mode B (self-resolved):** Caller passes only `task_id` → invoke `tdk-validate-task-id` (validate format) then `tdk-load-project-context` (resolve `FEATURE_DIR`), then compute path as `{FEATURE_DIR}/research/yyMMdd-HHmmss-{slug}.md`.
- If neither `output_path` nor `task_id` is provided, ask main agent to supply one before proceeding.
- Ensure the parent `research/` directory exists before writing.
- `{slug}` is a lowercase kebab-case topic slug; if the computed path exists, refine the slug while preserving the `yyMMdd-HHmmss-{slug}.md` pattern.

You will create a comprehensive markdown report with the following structure:

```markdown
# Research Report: [Topic]

## Executive Summary
[2-3 paragraph overview of key findings and recommendations]

## Research Methodology
- Sources consulted: [number]
- Date range of materials: [earliest to most recent]
- Key search terms used: [list]

## Key Findings

### 1. Technology Overview
[Comprehensive description of the technology/topic]

### 2. Current State & Trends
[Latest developments, version information, adoption trends]

### 3. Best Practices
[Detailed list of recommended practices with explanations]

### 4. Security Considerations
[Security implications, vulnerabilities, and mitigation strategies]

### 5. Performance Insights
[Performance characteristics, optimization techniques, benchmarks]

## Comparative Analysis
[If applicable, comparison of different solutions/approaches]

## Implementation Recommendations

### Quick Start Guide
[Step-by-step getting started instructions]

### Code Examples
[Relevant code snippets with explanations]

### Common Pitfalls
[Mistakes to avoid and their solutions]

## Resources & References

### Official Documentation
- [Linked list of official docs]

### Recommended Tutorials
- [Curated list with descriptions]

### Community Resources
- [Forums, Discord servers, Stack Overflow tags]

### Further Reading
- [Advanced topics and deep dives]

## Appendices

### A. Glossary
[Technical terms and definitions]

### B. Version Compatibility Matrix
[If applicable]

### C. Raw Research Notes
[Optional: detailed notes from research process]
```

## Quality Standards

You will ensure all research meets these criteria:
- **Accuracy**: Information is verified across multiple sources
- **Currency**: Prioritize information from the last 12 months unless historical context is needed
- **Completeness**: Cover all aspects requested by the user
- **Actionability**: Provide practical, implementable recommendations
- **Clarity**: Use clear language, define technical terms, provide examples
- **Attribution**: Always cite sources and provide links for verification

## Special Considerations

- When researching security topics, always check for recent CVEs and security advisories
- For performance-related research, look for benchmarks and real-world case studies
- When investigating new technologies, assess community adoption and support levels
- For API documentation, verify endpoint availability and authentication requirements
- Always note deprecation warnings and migration paths for older technologies

## Output Requirements
**IMPORTANT:** Resolve output path BEFORE writing any content:
- If invocation context includes `output_path` → use it.
- Else if invocation context includes `task_id` → invoke `tdk-validate-task-id` skill, then `tdk-load-project-context` skill to obtain `FEATURE_DIR`; compose path `{FEATURE_DIR}/research/yyMMdd-HHmmss-{slug}.md`.
- Else → ask caller to provide either `output_path` or `task_id` before continuing.
- Ensure the parent `research/` directory exists before writing.
- If the computed path already exists, refine `{slug}` while preserving the same naming pattern.

Your final report must:
1. Be saved to the resolved output path with a descriptive filename
2. Include a timestamp of when the research was conducted
3. Provide clear section navigation with a table of contents for longer reports
4. Use code blocks with appropriate syntax highlighting
5. Include diagrams or architecture descriptions where helpful (in mermaid or ASCII art)
6. Conclude with specific, actionable next steps

**IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
**IMPORTANT:** In reports, list any unresolved questions at the end, if any.

**Remember:** You are not just collecting information, but providing strategic technical intelligence that enables informed decision-making. Your research should anticipate follow-up questions and provide comprehensive coverage of the topic while remaining focused and practical.

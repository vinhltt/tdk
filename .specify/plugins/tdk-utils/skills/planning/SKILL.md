---
name: planning
description: Plan implementations, design architectures, create technical roadmaps with detailed phases
user-invocable: false
metadata:
  version: "1.10.6"
---

# Planning Skill

Create detailed technical implementation plans through research, codebase analysis, solution design, and comprehensive documentation.

## When to Use

- Planning new feature implementations
- Architecting system designs
- Evaluating technical approaches
- Creating implementation roadmaps
- Breaking down complex requirements

## Core Principles

Always honor **YAGNI**, **KISS**, and **DRY** principles.
**Be honest, brutal, straight to the point, and concise.**

## Boundary

This skill produces PLANS only. No code implementation.

## Workflow

### Phase 0: Research & Analysis
Load: `references/research-phase.md`

**Skip if:** User provides researcher reports or technical context

**Activities:**
- Read spec.md from `.specify/specs/{task-id}/spec.md`
- Identify NEEDS CLARIFICATION from Technical Context
- Research approaches using tools (@workspace, gh, web search)
- Delegate complex research to subagents (optional)
- Generate `research.md` with decisions, rationale, alternatives

### Phase 1: Design & Contracts
Load: `references/design-phase.md`

**Prerequisites:** research.md complete, all NEEDS CLARIFICATION resolved

**Activities:**
- Extract entities from spec → `data-model.md`
- Define API contracts → `contracts/*.yaml`
- Plan integration scenarios → `quickstart.md`

### Phase 2: Documentation
Load: `references/output-standards.md`

**Activities:**
- Create `plan.md` with YAML frontmatter
- Summarize research + design decisions
- Link to generated artifacts
- List dependencies and risks
- Guide user to `/tdk-plan` for plan.md ## Phases table

## Workflow Process

1. **Initial Analysis** → Read codebase docs, understand context, load spec.md
2. **Phase 0: Research** → Use tools to investigate approaches, resolve NEEDS CLARIFICATION (see research-phase.md)
3. **Synthesis** → Analyze findings, identify optimal solution
4. **Phase 1: Design** → Create architecture, data models, API contracts (see design-phase.md)
5. **Plan Documentation** → Write plan.md with summary, NOT implementation tasks
6. **Review & Refine** → Ensure completeness, clarity, actionability

**Note:** This skill creates plan.md with `## Phases` table as the primary SoT.

## Subagent Delegation (Copilot)

GitHub Copilot supports subagents in VS Code with manual continuation:

**Pattern:**
1. Delegate task to subagent → outputs to file
2. User manually continues in main thread
3. Main agent reads subagent output file

**Built-in agents:**
- `@workspace` - Codebase analysis (similar to Explore)
- `/delegate` - Background coding tasks

**Custom agents:** Define in `.claude/agents/` directory

## Output Requirements

**What this skill produces:**
- `plan.md` - Summary of research + design decisions (NOT task breakdown)
- `research.md` - Phase 0 output with decisions/rationale/alternatives
- `data-model.md` - Phase 1 output with entities/relationships
- `contracts/` - Phase 1 API specifications
- `quickstart.md` - Phase 1 integration scenarios

**What this skill does NOT produce:**
- `plan.md ## Phases` table — primary task/phase SoT
- Implementation code
- Test code
- Pull requests or commits

**Response format:**
- Report paths to generated files
- Summarize key decisions from research
- Note any remaining questions or risks
- Guide user to next step: `/tdk-implement {task-id}`

### Plan Directory Structure

**SpecKit Convention:**

```
.specify/specs/{task-id}/
├── spec.md                          # Feature specification (input)
├── research/
│   └── researcher-XX-report.md      # Subagent research outputs
├── plan.md                          # Phase 0 + Phase 1 summary (THIS command output)
├── research.md                      # Phase 0: Research findings (THIS command output)
├── data-model.md                    # Phase 1: Entities & relationships (THIS command output)
├── contracts/                       # Phase 1: API specs (THIS command output)
│   └── *.yaml or *.json
├── quickstart.md                    # Phase 1: Integration scenarios (THIS command output)
```

**Important:** This skill creates research & design artifacts and plan.md ## Phases table (primary SoT).

## Quality Standards

- Be thorough and specific
- Consider long-term maintainability
- Research thoroughly when uncertain
- Address security and performance concerns
- Make plans detailed enough for junior developers
- Validate against existing codebase patterns

## References

- `research-phase.md` - Information gathering with tools
- `project-knowledge.md` - Knowledge graph, AI docs, Obsidian brain
- `codebase-understanding.md` - Pattern recognition, docs review
- `solution-design.md` - Trade-offs, security, performance
- `output-standards.md` - Plan format, quality checklist
- `design-phase.md` - Architecture decisions framework

---
name: tdk-analyze
description: "Perform a non-destructive cross-artifact consistency and quality analysis across spec.md and plan.md. Reads the ## Phases table from plan.md as the single source of truth for phase definitions."
argument-hint: "[task-id] (optional if context allows inference)"
compatibility: "Requires successful completion of /tdk-plan with a valid plan.md. Should be run before /tdk-implement-from-plan."
user-invocable: true
license: MIT
metadata:
  version: "2.1.0"
  category: "Analysis & Review"
  requires:
    - tdk-plan (for prerequisite plan.md with ## Phases table)
    - Optional: tdk-memory-preload (for enhanced context during analysis)
  input_format: "[task-id]"
  output_format: "Markdown report with findings table, coverage summary, and next actions."
  examples:
    - input: "/tdk-analyze pref-001"
      output: "Specification Analysis Report with findings and next steps"

---

## ⛔ CRITICAL: Error Handling

**If ANY script returns an error, you MUST:**
1. **STOP immediately** - Do NOT attempt workarounds or auto-fixes
2. **Report the error** - Show the exact error message to the user
3. **Wait for user** - Ask user how to proceed before taking any action

**DO NOT:**
- Try alternative approaches when scripts fail
 - Create branches manually when script validation fails
- Guess or assume what the user wants after an error
- Continue with partial results

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Skill References

> Shared base instructions: `.specify/_shared/skills/embedded-brainstorm.md`

### Sequential Thinking (Systematic Analysis)

**Trigger:** During Detection Passes (Step 4).
**Technique:** For each detection pass, apply structured step-by-step analysis:
1. Define what to look for (detection target)
2. Scan each artifact systematically (spec -> plan)
3. For each finding, classify: what type of issue, where found, what it impacts
4. Cross-reference finding against other artifacts for consistency
5. Assign severity using the heuristic (Step 5)
6. If finding count >50, prioritize by severity and aggregate remainder

**Explicit pass ordering:**
- Run passes A-I in order (each pass may inform the next)
- Duplication detection (A) informs Inconsistency detection (F)
- Coverage gaps (E) cross-references with Underspecification (C)
- Phase artifact consistency (G) cross-references with Coverage gaps (E) and Inconsistency (F)
- Scope Boundary (H) and Impact Surface (I) run after G; skip both if legacy format detected

## Goal

Identify inconsistencies, duplications, ambiguities, and underspecified items across the two core artifacts (`spec.md`, `plan.md`) before implementation. This command MUST run only after `/tdk-plan` has successfully produced a `plan.md` with a `## Phases` table.

## Operating Constraints

**STRICTLY READ-ONLY**: Do **not** modify any files during analysis. Output a structured analysis report. Offer an optional remediation plan (user must explicitly approve before any follow-up editing commands would be invoked manually).

**Constitution Authority**: The project constitution (`.specify/memory/constitution.md`) is **non-negotiable** within this analysis scope. Constitution conflicts are automatically CRITICAL and require adjustment of the spec or plan—not dilution, reinterpretation, or silent ignoring of the principle. If a principle itself needs to change, that must occur in a separate, explicit constitution update outside `/tdk-analyze`.

## Execution Steps
### Step 0 — Validate Task ID
Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-analyze`.
If STOP → halt execution.
Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 — Load Project Context
Invoke `tdk-load-project-context` with validated `TASK_ID`.
Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 0.memory: Memory Context Pre-load

**Only if `.specify/memory/memory-index.md` exists** (check silently, non-blocking):

1. Invoke `tdk-memory-preload` skill with feature description from the loaded `spec.md`.
2. If Context Block returned: use it as an additional reference layer during cross-artifact analysis.
   - Flag any spec/plan claims that contradict CONSTRAINTS & WARNINGS in the Context Block.
   - Note in analysis report frontmatter: `memory_context_loaded: true`
3. If memory not initialized or no relevant context: proceed normally.
   - Note in analysis report frontmatter: `memory_context_loaded: false`

**This step MUST NOT block or error.** If `tdk-memory-preload` fails for any reason, skip and continue.

### 1. Initialize Analysis Context

Run `cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/check-prerequisites.ts {task_id} --json` from repo root (pass the validated task_id from Step 0). Parse JSON for taskId, featureDir, availableDocs.

Derive absolute paths:

- SPEC = FEATURE_DIR/spec.md
- PLAN = FEATURE_DIR/plan.md

Abort with an error message if any required file is missing (instruct the user to run missing prerequisite command).
For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

### 2. Load Artifacts (Progressive Disclosure)

Load only the minimal necessary context from each artifact:

**From spec.md:**

**Legacy format detection**: Check for ALL THREE headings: `## 1. Problem Statement`, `## 2. Scope Boundary`, `## 3. Impact Surface`. If ANY of the three is missing: skip Passes H and I (new passes depend on new sections), emit single advisory finding "Legacy spec format. Re-run /tdk-specify to upgrade.", continue with Passes A-G using best-effort semantic reading.

- ## 1. Problem Statement
- ## 2. Scope Boundary (in-scope / out-of-scope items)
- ## 3. Impact Surface table (subworkspace/module/impact rows)
- ## 4. Evaluated Approaches (recommended approach + alternatives)
- ## 5. User Requirements & Testing (with `[sw/module]` tags)
- ## 6. Functional Requirements (with `[sw/module]` tags + Key Entities)
- ## 7. Success Criteria (keep name — no rename to "Metrics")
- ## 8. Risks & Mitigations
- ## 9. Unresolved Questions
- Edge Cases (from ## 5. User Requirements & Testing subsection)

**From plan.md:**

- Architecture/stack choices
- Data Model references
- `## Phases` table (parsed via shared parser — see Step 4 Pass G)
- Technical constraints

**IMPORTANT — Missing `## Phases` section:** If plan.md does not contain a `## Phases` section, abort immediately with this error message:
> `plan.md missing ## Phases section → run /tdk-plan to migrate legacy spec`

Do not attempt to continue analysis without a valid `## Phases` table.

**From constitution:**

- Load `.specify/memory/constitution.md` for principle validation

### 3. Build Semantic Models

Create internal representations (do not include raw artifacts in output):

- **Requirements inventory**: Each functional requirement (from ## 6. Functional Requirements) with a stable key (derive slug based on imperative phrase; e.g., "User can upload file" → `user-can-upload-file`). Non-functional metrics extracted from ## 7. Success Criteria as secondary inventory.
- **User requirement/action inventory**: Discrete user actions with acceptance criteria
- **Phase coverage mapping**: Map each plan.md phase row to its associated requirements or stories (inference by title keyword / explicit reference patterns)
- **Constitution rule set**: Extract principle names and MUST/SHOULD normative statements
- **Impact Surface inventory**: Parse ## 3. Impact Surface table → `{subworkspace, module, impactType, description}[]`
- **Scope boundary inventory**: Parse ## 2. Scope Boundary → `{item, type: "in"|"out", rationale}[]`
- **Subworkspace tag map**: From ## 5. User Requirements & Testing + ## 6. Functional Requirements, collect all `[sw/module]` tags → `{tag: string, usedInUR: boolean, usedInFR: boolean}`

### 4. Detection Passes (Token-Efficient Analysis)

Focus on high-signal findings. Limit to 50 findings total; aggregate remainder in overflow summary.

Apply sequential thinking across all detection passes. For each pass:
- State the detection goal explicitly before scanning
- Process artifacts in consistent order: spec.md -> plan.md
- Record findings with location references as you scan
- Cross-reference with constitution after each pass

#### A. Duplication Detection

- Identify near-duplicate requirements
- Mark lower-quality phrasing for consolidation

#### B. Ambiguity Detection

- Flag vague adjectives (fast, scalable, secure, intuitive, robust) lacking measurable criteria
- Flag unresolved placeholders (TODO, TKTK, ???, `<placeholder>`, etc.)

#### C. Underspecification

- Requirements with verbs but missing object or measurable outcome
- User stories missing acceptance criteria alignment
- Plan phases referencing files or components not defined in spec/plan

#### D. Constitution Alignment

- Any requirement or plan element conflicting with a MUST principle
- Missing mandated sections or quality gates from constitution

#### E. Coverage Gaps

- Requirements with zero associated plan phases
- Plan phases with no mapped requirement/story
- Success criteria (## 7. Success Criteria) not reflected in any phase (e.g., performance, security metrics) → missing success criteria coverage in plan phases
- `[sw/module]` tags in spec not represented in any plan phase's `## Related Code Files` paths → MEDIUM (spec claims subworkspace involvement but plan doesn't address it)

#### F. Inconsistency

- Terminology drift (same concept named differently across files)
- Data entities referenced in plan but absent in spec (or vice versa)
- Phase ordering contradictions (e.g., integration phases before foundational setup phases without dependency note)
- Conflicting requirements (e.g., one requires Next.js while other specifies Vue)

#### G. Phase Artifact Consistency

**Scope:** file-row existence only; does NOT validate Status/BlockedBy coherence.

Parse the `## Phases` table from plan.md using the CLI wrapper:

1. **Parse plan.md `## Phases` table**: Run `cd $CLAUDE_PROJECT_DIR/.specify/scripts/ts && bun src/commands/util/parse-phases-table.ts "{planPath}" --json`. If exit code 1, report each error as a CRITICAL finding. Parse JSON output → record all phases from `result.phases`.
2. **Scan existing phase files**: Glob `FEATURE_DIR/phase-*.md` to list all existing phase artifact files.
3. **File-row existence check**: For each `PhaseRow`, check whether `FEATURE_DIR/{row.file}` exists on disk.
   - If the file does **not** exist → flag as **HIGH** (plan.md references phase file that does not exist on disk).
   - If the file **does** exist → OK.
4. **Store gap data** for the report:
   - `MISSING_PHASE_FILES`: rows where the referenced `phase-NN-*.md` file is absent

**Note:** Pass G performs file-row existence only; does NOT validate Status/BlockedBy coherence. No semantic cross-check between status values and dependency graph is performed.

#### H. Scope Boundary Completeness

**Skip if legacy format detected (missing ## 1. Problem Statement / ## 2. Scope Boundary / ## 3. Impact Surface headings).**

- ## 2. Scope Boundary missing entirely → CRITICAL
- Zero in-scope items → HIGH
- Zero out-of-scope items → MEDIUM (feature may be unbounded)
- In-scope item not covered by any FR → HIGH (scope promise without requirement). Matching algorithm: **semantic keyword matching** — extract key nouns/verbs from in-scope items and match against FR descriptions (same inference approach as existing phase coverage mapping).
- Out-of-scope item contradicted by an FR → CRITICAL (scope says "out" but FR says "must")

#### I. Impact Surface Coverage

**Skip if legacy format detected (missing ## 1. Problem Statement / ## 2. Scope Boundary / ## 3. Impact Surface headings).**

- Impact Surface row with no matching `[sw/module]` tag on any FR → HIGH (claimed impact with no requirement). Matching: **exact `[sw/module]` tag matching, case-insensitive**. `[backend/api]` matches `[backend/api]` only — no fuzzy matching.
- FR with `[sw/module]` tag not in Impact Surface table → MEDIUM (undeclared impact area)
- Impact Surface row with [TBD] impact type → MEDIUM (unresolved detection)
- Impact Surface empty but project has subWorkspaces → HIGH (multi-SW project with no impact analysis)

### 5. Severity Assignment

Use this heuristic to prioritize findings:

- **CRITICAL**: Violates constitution MUST, missing core spec artifact, requirement with zero coverage that blocks baseline functionality, scope boundary contradicted by FR (Pass H), ## 2. Scope Boundary missing entirely (Pass H)
- **HIGH**: Duplicate or conflicting requirement, ambiguous security/performance attribute, untestable acceptance criterion, plan phase file missing from disk, Impact Surface row with no FR coverage (Pass I), in-scope item with no FR (Pass H)
- **MEDIUM**: Terminology drift, missing success criteria coverage in plan phases, underspecified edge case, missing out-of-scope declaration (Pass H), undeclared impact area (Pass I), [TBD] impact type (Pass I)
- **LOW**: Style/wording improvements, minor redundancy not affecting execution order

### 6. Produce Compact Analysis Report

Output a Markdown report (no file writes) with the following structure:

## Specification Analysis Report

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| A1 | Duplication | HIGH | spec.md:L120-134 | Two similar requirements ... | Merge phrasing; keep clearer version |

(Add one row per finding; generate stable IDs prefixed by category initial.)

**Coverage Summary Table:**

| Requirement Key | Has Phase? | Phase IDs | Notes |
|-----------------|------------|-----------|-------|

**Constitution Alignment Issues:** (if any)

**Unmapped Plan Phases:** (if any)

**Phase Artifact Consistency:**

| # | Phase (plan.md) | Status | phase-*.md File? | Result |
|---|-----------------|--------|------------------|--------|
| 01 | Phase 1: ... | todo | ✅ phase-01-*.md | OK |
| 06 | Phase 6: ... | todo | ❌ Missing | NEEDS FIX |

(One row per plan.md `## Phases` table entry. Mark ✅/❌ for file existence.)

**Metrics:**

- Total Requirements
- Total Plan Phases
- Coverage % (requirements with >=1 associated phase)
- Ambiguity Count
- Duplication Count
- Critical Issues Count
- Phase Gaps Count (from Pass G — missing phase files)
- Scope Boundary: N in-scope, M out-of-scope items
- Impact Surface: N subworkspaces, M modules declared
- Tag Coverage: N% of Impact Surface rows have matching FR tags

### 7. Provide Next Actions

At end of report, output a concise Next Actions block:

- If CRITICAL issues exist: Recommend resolving before `/tdk-implement-from-plan`
- If only LOW/MEDIUM: User may proceed, but provide improvement suggestions
- Provide explicit command suggestions: e.g., "Run /tdk-specify with refinement", "Run /tdk-plan to adjust architecture", "Manually create missing phase file phase-NN-*.md"
- If Pass G found missing phase files: suggest running `/tdk-plan` to regenerate missing phase file stubs

### 8. Offer Remediation

Ask the user: "Would you like me to suggest concrete remediation edits for the top N issues?" (Do NOT apply them automatically.)

## Operating Principles

### Context Efficiency

- **Minimal high-signal tokens**: Focus on actionable findings, not exhaustive documentation
- **Progressive disclosure**: Load artifacts incrementally; don't dump all content into analysis
- **Token-efficient output**: Limit findings table to 50 rows; summarize overflow
- **Deterministic results**: Rerunning without changes should produce consistent IDs and counts

### Analysis Guidelines

- **NEVER modify files** during analysis passes (Steps 1-8 are read-only)
- **NEVER hallucinate missing sections** (if absent, report them accurately)
- **Prioritize constitution violations** (these are always CRITICAL)
- **Use examples over exhaustive rules** (cite specific instances, not generic patterns)
- **Report zero issues gracefully** (emit success report with coverage statistics)

## Context

$ARGUMENTS

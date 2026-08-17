---
name: tdk-consistency-check
description: "Perform a non-destructive cross-artifact consistency check across spec.md, plan.md, and constitution. Read-only and advisory; does not scout source code in default mode. `--deep` verifies plan claims against source with bounded, targeted checks."
argument-hint: "[task-id] [--deep]"
compatibility: "Requires successful completion of /tdk-plan with a valid plan.md. Should be run before /tdk-implement."
user-invocable: true
license: MIT
metadata:
  version: "13.0.1"
  category: "Analysis & Review"
  requires:
    - tdk-plan (for prerequisite plan.md with ## Phases table)
    - Optional: tdk-memory-agent (for enhanced context during analysis)
  input_format: "[task-id] [--deep]"
  output_format: "Markdown report with findings table, coverage summary, and next actions."
  examples:
    - input: "/tdk-consistency-check pref-001"
      output: "Consistency Check Report (default mode) with findings and next steps"
    - input: "/tdk-consistency-check pref-001 --deep"
      output: "Consistency Check Report including bounded source claim verification"

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
- Run passes A-J in order (each pass may inform the next); run Pass K last and only in `--deep` mode
- Duplication detection (A) informs Inconsistency detection (F)
- Coverage gaps (E) cross-references with Underspecification (C)
- Phase artifact consistency (G) cross-references with Coverage gaps (E) and Inconsistency (F)
- Scope Boundary (H) and Impact Surface (I) run after G; skip both if legacy format detected
- Plan path existence (J) runs after I on the phase files globbed in G; it runs in both modes
- Source claim verification (K) runs after J and consumes the Impact Surface inventory from I

## Goal

Identify inconsistencies, duplications, ambiguities, and underspecified items across the two core artifacts (`spec.md`, `plan.md`) before implementation. This command MUST run only after `/tdk-plan` has successfully produced a `plan.md` with a `## Phases` table.

## Operating Constraints

**STRICTLY READ-ONLY**: Do **not** modify any files during analysis. Output a structured analysis report. Offer an optional remediation plan (user must explicitly approve before any follow-up editing commands would be invoked manually).

**Constitution Authority**: The project constitution (`.specify/memory/constitution.md`) is **non-negotiable** within this analysis scope. Constitution conflicts are automatically CRITICAL and require adjustment of the spec or plan—not dilution, reinterpretation, or silent ignoring of the principle. If a principle itself needs to change, that must occur in a separate, explicit constitution update outside `/tdk-consistency-check`.

## Execution Steps
### Step 0 — Validate Task ID
Invoke `tdk-validate-task-id` with `$ARGUMENTS` and host skill name `/tdk-consistency-check`.
If STOP → halt execution.
Store: `TASK_ID`, `TASK_ID_SOURCE`.

### Step 0.1 — Load Project Context
Invoke `tdk-load-project-context` with validated `TASK_ID`.
Store: `PROJECT_CONTEXT`, `FEATURE_DIR`.

### Step 0.2 — Parse Flags

Scan `$ARGUMENTS` for tokens starting with `--`. The only accepted flag is `--deep`.

- Any other `--` token → STOP per the ⛔ CRITICAL Error Handling block above. Report:
  ```text
  Unknown flag: <flag>. Usage: /tdk-consistency-check {task-id} [--deep]
  ```
  Do not guess the intent, do not continue with partial analysis.
- Store `MODE = deep` when `--deep` is present, otherwise `MODE = default`.

`MODE` gates Pass K only. Every other pass runs identically in both modes.

### Step 0.memory: Memory Validation

**Only if `.specify/memory/memory-index.md` exists** (check silently, non-blocking):

1. Gather the available artifact text for validation:
   - Prefer spec + plan when both `spec.md` and `plan.md` exist.
   - Use spec-only when `plan.md` is absent, and record that fallback in the analysis report.
1.5. Read `memory_validation` from the current feature's `spec.md` frontmatter.
   - `disabled` → skip this step and log one line:
     `Memory validation skipped — disabled for this task at /tdk-specify.`
   - `enabled` → continue to step 2.
   - Field absent, no `spec.md`, or the field holds any other value including an
     unreplaced `[enabled/disabled]` placeholder → treat as absent and fall back
     to the `Binding coverage:` line in `.specify/memory/memory-index.md`; when
     that line is absent or reports `0`, skip with:
     `Memory validation skipped — memory-index reports no binding: true coverage. Run /tdk-memory-update if memory was recently updated.`

   Never ask the user here; `/tdk-specify` Step 1.6 owns that decision. Continue
   the normal analysis flow either way — this is never blocking.
2. Spawn `tdk-memory-agent` agent with `--mode validate` and the gathered artifact text.
3. Map the Guardian Report into a `Memory Validation` section in the analysis output:
   - conflicts -> high-priority findings.
   - warnings -> review findings.
   - clear -> note that no memory contradictions were found.
   - `STATUS: MCP_UNAVAILABLE`, memory not initialized, no relevant memory, or agent failure -> skip memory validation without prompting or failing.
4. Note in analysis report frontmatter:
   - `memory_context_loaded: true` only when a usable Guardian Report was returned.
   - Note in analysis report frontmatter: `memory_context_loaded: false`

**This step MUST NOT block or error.** If `tdk-memory-agent` fails for any reason, skip and continue.

### 1. Initialize Analysis Context

Run the prerequisite command with an agent-resolved project root (pass the validated task_id from Step 0):
```bash
bash -lc '
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR" >&2
  exit 1
fi
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/check-prerequisites.ts {task_id} --json)
' -- "<agent-resolved-project-root>"
```

Ask the user for the project root if `<agent-resolved-project-root>` cannot be identified confidently; do not pass the placeholder literally. Parse JSON for taskId, featureDir, availableDocs.

Derive absolute paths:

- SPEC = FEATURE_DIR/spec.md
- PLAN = FEATURE_DIR/plan.md

Abort with an error message if any required file is missing (instruct the user to run missing prerequisite command).
For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

### 2. Load Artifacts (Progressive Disclosure)

Load only the minimal necessary context from each artifact:

**From spec.md:**

**Legacy format detection**: Check for ALL THREE headings: `## 1. Problem Statement`, `## 2. Scope Boundary`, `## 3. Impact Surface`. If ANY of the three is missing: skip Passes H and I (new passes depend on new sections), emit single advisory finding "Legacy spec format. Re-run /tdk-specify to upgrade.", continue with Passes A-G and J using best-effort semantic reading. Pass K, when requested, degrades to its no-Impact-Surface fallback.

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

1. **Parse plan.md `## Phases` table**: Run:
   ```bash
   bash -lc '
   PROJECT_DIR="$1"
   if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
     echo "Invalid project root: $PROJECT_DIR" >&2
     exit 1
   fi
   (cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/parse-phases-table.ts "{planPath}" --json)
   ' -- "<agent-resolved-project-root>"
   ```
   If exit code 1, report each error as a CRITICAL finding. Parse JSON output → record all phases from `result.phases`.
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

#### J. Plan Path Existence

**Runs in both modes.** Mechanical existence check — stat/glob only. Never read the content of a
referenced path; that is Pass K's job and only in `--deep` mode.

For each phase file globbed in Pass G, read its `## Related Code Files` section and resolve every
bullet path against `PROJECT_CONTEXT.workspaceRoot`:

- `Modify` / `Delete` bullet whose path does **not** exist on disk → **HIGH** (plan targets a file that
  is not there).
- `Create` bullet whose path **already** exists on disk → **MEDIUM** (plan will overwrite an existing
  file, or the phase is already partly done).
- Everything else → OK.

Store `PATH_CHECKS` = `{ok: N, missing: M}` for the report metrics.

A phase file with no `## Related Code Files` section contributes nothing to Pass J — do not flag it
here; Pass G already covers phase artifact presence.

#### K. Source Claim Verification (`--deep` only)

**Skip entirely when `MODE == default`.** This pass verifies named claims against source. It is
**not** exploration: no open scouting, no reading a module to "understand" it.

**Structure resolution chain** — resolve targets from declarations already loaded; do not add a new
discovery step:

1. `PROJECT_CONTEXT` (loaded at Step 0.1): `workspaceRoot`, `subWorkspaces[] {name, path, modules[] {name, path}}`.
2. An Impact Surface row's `Subworkspace` + `Module` cells (the `[sw/module]` pair) resolve to the
   bounded directory `<workspaceRoot>/<sw.path>/<module.path>`. Every `ls`/`grep` for that row **must**
   stay inside this directory.
3. Paths from the phase files' `## Related Code Files` are the file-level anchor.
4. Search terms come from the row's Description column plus interface/entity names the plan states
   (Data Model, Interfaces & Contracts).

**Checks:**

a. For each row in spec `## 3. Impact Surface` whose `Impact Type` is `modify` or `extend` (skip
   `create` rows — their target is not supposed to exist yet): resolve its path via the chain above.
   - Path does not exist → **HIGH**. The finding must state both possible causes: the spec claims an
     impact area that is not there, **or** `.specify.json` has drifted from the source tree.
   - Path exists → run one directed grep derived from the row's description to confirm real code
     backs the claim.
b. For each interface/entity named in plan.md: one targeted symbol grep inside the already-bounded
   directory. Not found → **MEDIUM**, worded as a note: the plan may be naming something new rather
   than describing something existing.

**No-Impact-Surface fallback** — monolith projects (`subWorkspaces` empty, Impact Surface
`N/A — monolith project`) and legacy specs alike: drop chain layer 2, run check (b) only, and anchor
on the `dirname` of the `## Related Code Files` paths. If there is no anchor either, skip Pass K and
say so in the report.

**Cap (do not reinterpret):** at most 1 grep and 1 read of ≤50 lines per claim. No broad globs, no
reading a whole module.

### 5. Severity Assignment

Use this heuristic to prioritize findings:

- **CRITICAL**: Violates constitution MUST, missing core spec artifact, requirement with zero coverage that blocks baseline functionality, scope boundary contradicted by FR (Pass H), ## 2. Scope Boundary missing entirely (Pass H)
- **HIGH**: Duplicate or conflicting requirement, ambiguous security/performance attribute, untestable acceptance criterion, plan phase file missing from disk, Impact Surface row with no FR coverage (Pass I), in-scope item with no FR (Pass H), `Modify`/`Delete` path absent from disk (Pass J), Impact Surface path unresolvable in source (Pass K)
- **MEDIUM**: Terminology drift, missing success criteria coverage in plan phases, underspecified edge case, missing out-of-scope declaration (Pass H), undeclared impact area (Pass I), [TBD] impact type (Pass I), `Create` path already present on disk (Pass J), plan-named symbol not found in the bounded directory (Pass K)
- **LOW**: Style/wording improvements, minor redundancy not affecting execution order

### 6. Produce Compact Analysis Report

Output a Markdown report (no file writes) with the following structure:

## Consistency Check Report

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

- Mode: `default` | `deep`
- Path checks: N ok / M missing (from Pass J)
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

- If CRITICAL issues exist: Recommend resolving before `/tdk-implement`
- If only LOW/MEDIUM: User may proceed, but provide improvement suggestions
- Provide explicit command suggestions: e.g., "Run /tdk-specify with refinement", "Run /tdk-plan to adjust architecture", "Manually create missing phase file phase-NN-*.md"
- If Pass G found missing phase files: suggest running `/tdk-plan` to regenerate missing phase file stubs
- If `MODE == default` and `## 3. Impact Surface` contains at least one `modify` or `extend` row:
  suggest re-running as `/tdk-consistency-check {task-id} --deep` to verify those claims against source

### 8. Offer Remediation

Ask the user: "Would you like me to suggest concrete remediation edits for the top N issues?" (Do NOT apply them automatically.)

## Operating Principles

### Context Efficiency

- **Minimal high-signal tokens**: Focus on actionable findings, not exhaustive documentation
- **Progressive disclosure**: Load artifacts incrementally; don't dump all content into analysis
- **Token-efficient output**: Limit findings table to 50 rows; summarize overflow
- **Deterministic results**: In default mode, rerunning without changes produces consistent IDs and counts. `--deep` adds Pass K, which is best-effort verification against source and may vary with how a claim is worded.

### Analysis Guidelines

- **NEVER modify files** during analysis passes (Steps 1-8 are read-only)
- **NEVER hallucinate missing sections** (if absent, report them accurately)
- **Prioritize constitution violations** (these are always CRITICAL)
- **Use examples over exhaustive rules** (cite specific instances, not generic patterns)
- **Report zero issues gracefully** (emit success report with coverage statistics)

## Context

$ARGUMENTS

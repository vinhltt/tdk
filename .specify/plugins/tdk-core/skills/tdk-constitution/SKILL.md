---
name: tdk-constitution
description: "Create or update the project constitution and constitution-owned project knowledge artifacts from interactive or provided principle inputs"
metadata:
  version: 5.4.0
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

Use an explicit project-init branch when the user passes `--init` or asks to initialize
project docs/knowledge. Accepted init input is either an inline brief or a markdown file
inside the workspace.

## Skill References

> Shared base instructions: `.specify/_shared/skills/brainstorm.md`

### Embedded Brainstorming (Principle Trade-offs)

**Mode:** Embedded -- reasoning technique only.
**DO NOT** call brainstorm.py. **DO NOT** create separate brainstorm files.
Output goes directly into constitution.md.

**When to trigger:** When defining or updating architectural principles:
- Choosing between competing architectural approaches (monolith vs microservice)
- Setting quality attribute priorities (performance vs simplicity)
- Defining governance trade-offs (strict vs flexible)

**Technique per principle:**
1. Identify the principle area (e.g., deployment strategy)
2. Present 2-3 philosophical approaches
3. Evaluate trade-offs for the project context
4. Recommend with explicit rationale
5. Document chosen principle with "Trade-offs acknowledged" note

## Outline

You are creating or updating the project constitution at `.specify/memory/constitution.md`.
In init mode, the constitution file is create-if-missing from the bundled bootstrap source
below. In update mode, load the existing constitution and amend it. Your job is to
(a) collect/derive concrete values, (b) fill the constitution precisely, and (c) propagate
approved amendments across dependent artifacts.

**Note**: This is a PROJECT-LEVEL document that applies to ALL features. It does NOT require a task ID.

### Project Init Contract

When running `/tdk-constitution --init <brief|file>`:

1. Resolve the project root from harness context. Never read secret-like or outside-workspace
   files. Refuse dotenv, key, credential, token, or outside-workspace paths.
2. Establish authority order:
   - existing constitution
   - existing memory files
   - accepted user deltas from the brief/file
   - README and human docs as context only
3. If `.specify/memory/constitution.md` is missing, create it from the bundled bootstrap
   source in `### Constitution Bootstrap Source`, then fill placeholders from project
   context and accepted user deltas.
4. If `.specify/memory/` is missing or memory has no `memory-index.md` and `memory.yaml`,
   bootstrap memory using the `tdk-memory-init` contract. Fresh init must leave these
   files usable for later memory flows.
5. If memory exists, preload it before editing. Use `tdk-memory-update` only after
   `memory-index.md` exists; never use it to create first-time memory.
6. Render project knowledge artifacts from `### Project Knowledge Templates` under
   `memory.path` from `.specify/.specify.json`, falling back to `.specify/memory`:
   - `project-overview-prd.md`
   - `product-context.md`
   - `system-architecture.md`
   - `project-roadmap.md`
7. Write only AUTO-GEN sections in existing artifacts. Markerless files require
   confirmation. Stale legacy targets are reported, not silently overwritten.
8. README conflicts with constitution or memory authority must stop for confirmation.
   Do not silently derive project authority from README when memory/constitution disagree.

### Constitution Bootstrap Source

Use this source only when `.specify/memory/constitution.md` is absent in init mode:

Load: `templates/constitution.md.tpl`

### Project Knowledge Templates

Use these repository templates when init mode creates or updates project knowledge
artifacts. They replace the removed public `tdk-docs` project-docs render path.

| Template | Target under `memory.path` |
|----------|----------------------------|
| `.specify/templates/project-docs/project-overview-prd.md.tpl` | `project-overview-prd.md` |
| `.specify/templates/project-docs/product-context.md.tpl` | `product-context.md` |
| `.specify/templates/project-docs/system-architecture.md.tpl` | `system-architecture.md` |
| `.specify/templates/project-docs/project-roadmap.md.tpl` | `project-roadmap.md` |

Creation/update rules:

- Product-level facts live in `product-context.md` and apply across all epics.
  Epic discovery may surface candidates, but only this constitution flow updates
  product-level authority.
- For a missing target, start from the matching template, then fill AUTO-GEN
  sections from constitution authority, existing memory, and accepted user deltas.
- For an existing target, update only matching AUTO-GEN sections and preserve
  user-edit zones.
- Markerless existing files require confirmation before conversion.
- `.specify/templates/project-docs/README.md.tpl` is not part of the default
  memory authority render; use it only for an explicit human-facing README render.

### Step 0 — Load Project Context (Optional)
Invoke `tdk-load-project-context` with `require_feature_dir: false` and `require_prefix_validation: false` (no task ID needed — project-level document).
Store: `PROJECT_CONTEXT`.

Follow this execution flow:

1. Load or create `.specify/memory/constitution.md`.
   - Identify every placeholder token of the form `[ALL_CAPS_IDENTIFIER]`.
   **IMPORTANT**: The user might require less or more principles than the ones used in the template. If a number is specified, respect that - follow the general template. You will update the doc accordingly.

2. Collect/derive values for placeholders:
   - If user input (conversation) supplies a value, use it.
   - Otherwise infer from existing constitution, memory, README, docs, prior constitution versions if embedded.
   - If README conflicts with constitution or memory, preserve constitution/memory and stop for confirmation.
   - For each principle that involves architectural trade-offs:
     - Apply embedded brainstorming to explore 2-3 approaches
     - Document chosen principle with rationale in the Principle section
     - Include brief "Trade-offs: [acknowledged trade-off]" line under each principle
   - For governance dates: `RATIFICATION_DATE` is the original adoption date (if unknown ask or mark TODO), `LAST_AMENDED_DATE` is today if changes are made, otherwise keep previous.
   - `CONSTITUTION_VERSION` must increment according to semantic versioning rules:
     - MAJOR: Backward incompatible governance/principle removals or redefinitions.
     - MINOR: New principle/section added or materially expanded guidance.
     - PATCH: Clarifications, wording, typo fixes, non-semantic refinements.
   - If version bump type ambiguous, propose reasoning before finalizing.

3. Draft the updated constitution content:
   - Replace every placeholder with concrete text (no bracketed tokens left except intentionally retained template slots that the project has chosen not to define yet—explicitly justify any left).
   - Preserve heading hierarchy and comments can be removed once replaced unless they still add clarifying guidance.
   - Ensure each Principle section: succinct name line, paragraph (or bullet list) capturing non‑negotiable rules, explicit rationale if not obvious.
   - Ensure Governance section lists amendment procedure, versioning policy, and compliance review expectations.

4. Consistency propagation checklist (convert prior checklist into active validations):
   - Read `.specify/templates/plan-template.md.tpl` and ensure any "Constitution Check" or rules align with updated principles.
   - Read `.specify/templates/spec-template.md.tpl` for scope/requirements alignment—update if constitution
     adds/removes mandatory sections or constraints.
     9-section format: Problem Statement, Scope Boundary, Impact Surface, Evaluated Approaches,
     User Requirements & Testing, Functional Requirements, Success Criteria,
     Risks & Mitigations, Unresolved Questions, + Clarifications.
   - Read each command file in `.specify/templates/commands/*.md` (including this one) to verify no outdated references (agent-specific names like CLAUDE only) remain when generic guidance is required.
   - Read any runtime guidance docs (e.g., `README.md`, `docs/quickstart.md`, or agent-specific guidance files if present). Treat them as human-facing context, not as authority over memory.
   - Validate project knowledge artifacts under `memory.path` or `.specify/memory`:
     `project-overview-prd.md`, `product-context.md`, `system-architecture.md`,
     `project-roadmap.md`.

5. Produce a Sync Impact Report (prepend as an HTML comment at top of the constitution file after update):
   - Version change: old → new
   - List of modified principles (old title → new title if renamed)
   - Added sections
   - Removed sections
   - Templates requiring updates (✅ updated / ⚠ pending) with file paths
   - Follow-up TODOs if any placeholders intentionally deferred.

6. Validation before final output:
   - No remaining unexplained bracket tokens.
   - Version line matches report.
   - Dates ISO format YYYY-MM-DD.
   - Principles are declarative, testable, and free of vague language ("should" → replace with MUST/SHOULD rationale where appropriate).

7. Write the completed constitution back to `.specify/memory/constitution.md` (overwrite).
   If init rendered project knowledge artifacts, update only AUTO-GEN sections unless the
   user explicitly confirms markerless conversion.

8. Output a final summary to the user with:
   - New version and bump rationale.
   - Any files flagged for manual follow-up.
   - Suggested commit message (e.g., `docs: amend constitution to vX.Y.Z (principle additions + governance update)`).

Formatting & Style Requirements:

- Use Markdown headings exactly as in the template (do not demote/promote levels).
- Wrap long rationale lines to keep readability (<100 chars ideally) but do not hard enforce with awkward breaks.
- Keep a single blank line between sections.
- Avoid trailing whitespace.

If the user supplies partial updates (e.g., only one principle revision), still perform validation and version decision steps.

If critical info missing (e.g., ratification date truly unknown), insert `TODO(<FIELD_NAME>): explanation` and include in the Sync Impact Report under deferred items.

Do not route project init through public `tdk-docs`; project init is owned here.

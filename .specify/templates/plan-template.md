# Implementation Plan: [FEATURE]

**Branch**: `feature/aa-###` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `.specify/specs/aa-###/spec.md`

**Note**: This template is filled in by the `/tdk-plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [single/web/mobile - determines source structure]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with [.specify/memory/constitution.md](../.specify/memory/constitution.md) principles:

- [ ] **I. YAGNI-KISS-DRY**: Feature implements only required functionality, uses simplest solution, avoids duplication
- [ ] **II. Coding Standards**: Follows sub-workspace `rules/coding/` conventions (PSR-12/strict types for BE, Composition API/TypeScript for FE, Ant Design Vue prioritized)
- [ ] **III. Structure Integrity**: Files placed in correct directories per established BE/FE patterns
- [ ] **IV. Spec-Driven & MVP**: User stories with Given-When-Then, P1/P2/P3 prioritized, P1 forms viable MVP, contracts defined
- [ ] **V. Evidence-Based Migration**: If refactoring, backup/ investigation completed, business logic preserved
- [ ] **VI. Quality Gates**: lint-fix and lint-check will pass for both BE and FE
- [ ] **VII. Test-Driven**: Test plan covers unit + integration, coverage maintained
- [ ] **VIII. Constants & i18n**: No hardcoded values, i18n keys for messages, multi-env config supported

**Complexity Justification** (only if violations exist):
Document any necessary deviations with rationale in Complexity Tracking section below.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/aa-###/
├── plan.md              # This file (/tdk-plan command output)
├── research.md          # Phase 0 output (/tdk-plan command)
├── data-model.md        # Phase 1 output (/tdk-plan command)
├── quickstart.md        # Phase 1 output (/tdk-plan command)
├── contracts/           # Phase 1 output (/tdk-plan command)
└── tasks.md             # [deprecated legacy] Phase 2 output (/tdk-tasks command - NOT created by /tdk-plan; prefer plan.md ## Phases table)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

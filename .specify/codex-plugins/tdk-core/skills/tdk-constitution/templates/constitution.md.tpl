<!-- AUTO-GEN-START: constitution-title
SOURCES: project brief, accepted user deltas, existing project context
INSTRUCTION: Name the project in the heading. Keep the "Constitution" suffix.
-->
# [PROJECT_NAME] Constitution
<!-- Example: Spec Constitution, TaskFlow Constitution, etc. -->
<!-- AUTO-GEN-END -->

## Core Principles

<!-- AUTO-GEN-START: core-principles
SOURCES: project brief, accepted user deltas, existing constitution, memory authority
INSTRUCTION: Define the core non-negotiable principles. Keep each principle testable, concise, and justified. Add or remove principle blocks when the user explicitly asks for a different count.
-->
### [PRINCIPLE_1_NAME]
<!-- Example: I. Library-First -->
[PRINCIPLE_1_DESCRIPTION]
<!-- Example: Every feature starts as a standalone library; Libraries must be self-contained, independently testable, documented; Clear purpose required - no organizational-only libraries -->

### [PRINCIPLE_2_NAME]
<!-- Example: II. CLI Interface -->
[PRINCIPLE_2_DESCRIPTION]
<!-- Example: Every library exposes functionality via CLI; Text in/out protocol: stdin/args → stdout, errors → stderr; Support JSON + human-readable formats -->

### [PRINCIPLE_3_NAME]
<!-- Example: III. Test-First (NON-NEGOTIABLE) -->
[PRINCIPLE_3_DESCRIPTION]
<!-- Example: TDD mandatory: Tests written → User approved → Tests fail → Then implement; Red-Green-Refactor cycle strictly enforced -->

### [PRINCIPLE_4_NAME]
<!-- Example: IV. Integration Testing -->
[PRINCIPLE_4_DESCRIPTION]
<!-- Example: Focus areas requiring integration tests: New library contract tests, Contract changes, Inter-service communication, Shared schemas -->

### [PRINCIPLE_5_NAME]
<!-- Example: V. Observability, VI. Versioning & Breaking Changes, VII. Simplicity -->
[PRINCIPLE_5_DESCRIPTION]
<!-- Example: Text I/O ensures debuggability; Structured logging required; Or: MAJOR.MINOR.BUILD format; Or: Start simple, YAGNI principles -->
<!-- AUTO-GEN-END -->

<!-- AUTO-GEN-START: additional-constraints
SOURCES: project brief, architecture notes, security/compliance requirements, memory authority
INSTRUCTION: Capture durable project constraints that every future feature must respect. Use a concrete section title and avoid generic advice.
-->
## [SECTION_2_NAME]
<!-- Example: Additional Constraints, Security Requirements, Performance Standards, etc. -->

[SECTION_2_CONTENT]
<!-- Example: Technology stack requirements, compliance standards, deployment policies, etc. -->
<!-- AUTO-GEN-END -->

<!-- AUTO-GEN-START: development-workflow
SOURCES: project brief, team workflow notes, quality gates, memory authority
INSTRUCTION: Capture the required development, review, testing, and release workflow. Make obligations observable.
-->
## [SECTION_3_NAME]
<!-- Example: Development Workflow, Review Process, Quality Gates, etc. -->

[SECTION_3_CONTENT]
<!-- Example: Code review requirements, testing gates, deployment approval process, etc. -->
<!-- AUTO-GEN-END -->

<!-- AUTO-GEN-START: project-knowledge-authority
SOURCES: existing constitution, memory authority, accepted governance decisions
INSTRUCTION: State the project knowledge authority order. Keep README and ad hoc notes as context unless explicitly accepted into memory.
-->
## Project Knowledge Authority

The constitution and `.specify/memory/` are the project authority. Briefs, files,
README, and review notes are deltas or context until explicitly accepted.
<!-- AUTO-GEN-END -->

<!-- AUTO-GEN-START: governance
SOURCES: existing constitution, project brief, accepted governance decisions, release policy
INSTRUCTION: Define amendment, review, versioning, and propagation rules. Keep dates in ISO format and bump the version according to semantic impact.
-->
## Governance
<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

[GOVERNANCE_RULES]
<!-- Example: All PRs/reviews must verify compliance; Complexity must be justified; Use [GUIDANCE_FILE] for runtime development guidance -->

Amendments require a documented rationale, semantic version bump, and propagation
check across dependent templates and project knowledge artifacts.

**Version**: [CONSTITUTION_VERSION] | **Ratified**: [RATIFICATION_DATE] | **Last Amended**: [LAST_AMENDED_DATE]
<!-- Example: Version: 2.1.1 | Ratified: 2025-06-13 | Last Amended: 2025-07-16 -->
<!-- AUTO-GEN-END -->

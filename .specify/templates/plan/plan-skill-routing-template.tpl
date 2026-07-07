# Plan Skill Routing

Per-project skill mappings for `/tdk-plan` phase generation.
Sections = sub-workspace names (from `.specify.json`). `## global` = fallback/monolith default.
Line format: `- {domain}: {skill-name} [, {skill-name}]`
Auto-detected domains: `research`, `implement`, `test`, `database`, `design`. Other domains (e.g. `clarify`, `styling`) require manual assignment in phase files.

<!-- Test implementation is handled by the consumer skill mapped to the test domain.
     /tdk-plan --tdd / --ut-backfill reads this same file and injects that skill into generated phase files. -->

## global

- research: (default - no special skill)
- implement: (default - no special skill)
- test: /your-consumer-unit-test-skill

<!-- ## backend -->
<!-- - research: /your-research-skill -->
<!-- - implement: /your-backend-skill -->
<!-- - database: /your-database-skill -->
<!-- - test: /your-backend-unit-test-skill -->

<!-- ## frontend -->
<!-- - clarify: /your-clarify-skill -->
<!-- - design: /your-design-skill -->
<!-- - implement: /your-frontend-skill -->
<!-- - styling: /your-styling-skill -->
<!-- - test: /your-frontend-unit-test-skill -->

<!-- Add more sub-workspaces matching your .specify.json subWorkspaces[].name -->

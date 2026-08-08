# Delegate Routing

Per-project delegate mappings for `/tdk-plan` phase generation. A delegate is a skill (`/skill-name`) or an agent (`@agent-name`).
Sections = sub-workspace names (from `.specify.json`). `## global` = fallback/monolith default.
Line format: `- {domain}: {/skill-name | @agent-name} [, {/skill-name | @agent-name}]`
Auto-detected domains: `research`, `implement`, `test`, `database`, `design`. Other domains (e.g. `clarify`, `styling`) require manual assignment in phase files.

<!-- Test implementation is handled by the consumer delegate mapped to the test domain.
     /tdk-plan --tdd / --ut-backfill reads this same file and injects that delegate into generated phase files. -->

## global

- research: (default - no delegate)
- implement: (default - no delegate)
- test: /your-consumer-unit-test-skill

<!-- ## backend -->
<!-- - research: /your-research-skill -->
<!-- - implement: /your-backend-skill, @your-backend-agent -->
<!-- - database: /your-database-skill -->
<!-- - test: /your-backend-unit-test-skill -->

<!-- ## frontend -->
<!-- - clarify: /your-clarify-skill -->
<!-- - design: @your-design-agent -->
<!-- - implement: /your-frontend-skill -->
<!-- - styling: /your-styling-skill -->
<!-- - test: /your-frontend-unit-test-skill -->

<!-- Add more sub-workspaces matching your .specify.json subWorkspaces[].name -->

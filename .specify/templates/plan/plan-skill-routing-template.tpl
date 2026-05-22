# Plan Skill Routing

Per-project skill mappings for `/tdk-plan` phase generation.
Sections = sub-workspace names (from `.specify.json`). `## global` = fallback/monolith default.
Line format: `- {domain}: {skill-name} [, {skill-name}]`
Auto-detected domains: `research`, `implement`, `test`, `database`, `design`. Other domains (e.g. `clarify`, `styling`) require manual assignment in phase files.

<!-- UT conventions are defined as consumer skills in .claude/skills/.
     The skill name referenced here is loaded by /tdk-ut-backfill-auto at runtime. -->

## global

- research: (default - no special skill)
- implement: (default - no special skill)
- test: /tdk-ut-backfill-auto

<!-- ## backend -->
<!-- - research: /your-research-skill -->
<!-- - implement: /your-backend-skill -->
<!-- - database: /your-database-skill -->
<!-- - test: /tdk-ut-backfill-auto -->

<!-- ## frontend -->
<!-- - clarify: /your-clarify-skill -->
<!-- - design: /your-design-skill -->
<!-- - implement: /your-frontend-skill -->
<!-- - styling: /your-styling-skill -->
<!-- - test: /your-test-skill -->

<!-- Add more sub-workspaces matching your .specify.json subWorkspaces[].name -->

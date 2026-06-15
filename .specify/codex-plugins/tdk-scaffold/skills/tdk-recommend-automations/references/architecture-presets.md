# Architecture Presets

Preset recommendations keyed by architecture category. The skill maps `.specify/.specify.json` `architecture.type` values to one of these presets:

- `monolith`, `modular-monolith` → **monolith** preset
- `microservices`, `layered-application` → **distributed** preset

## monolith

| Type | Name | Purpose | Priority |
|------|------|---------|----------|
| Skill | coupling-detector | Detect tight coupling between logical modules via import/dependency analysis | must-have |
| Skill | module-boundary-check | Enforce module boundaries — detect cross-module direct imports | must-have |
| Skill | module-extract-guide | Guide refactoring modules into cleaner boundaries | nice-to-have |
| Agent | monolith-health-reviewer | Review PRs for monolith anti-patterns (god classes, circular deps, shared mutable state, leaking domain logic) | must-have |

## distributed

| Type | Name | Purpose | Priority |
|------|------|---------|----------|
| Skill | service-contract-validate | Validate API contracts between services/layers | must-have |
| Skill | dependency-map | Generate service/layer dependency graph | nice-to-have |
| Agent | boundary-reviewer | Review PRs for cross-service/cross-layer coupling | must-have |
| Agent | resilience-checker | Check for circuit breakers, retries, timeouts, fallbacks | nice-to-have |

## Enrichment Fields

For each recommendation in the output file, populate:

| Field | Source |
|-------|--------|
| Purpose | From preset table |
| Why | Project-specific justification from docs (tech stack, components, integrations) |
| Input signals | Inferred from codebase-summary (file patterns, dependency types) |
| Trigger condition | When this skill/agent should activate |
| Inspired by | Community skill reference, if any (from `vercel-labs:find-skills`) |

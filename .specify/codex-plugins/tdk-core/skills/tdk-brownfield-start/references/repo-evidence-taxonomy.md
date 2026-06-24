# Repo Evidence Taxonomy

Use this taxonomy to collect bounded evidence before writing
`brownfield-onboarding.md`. Separate observed evidence from inference.

## Evidence Categories

| Category | Evidence To Capture |
|---|---|
| Repo shape | Top-level layout, workspaces, packages, services, apps, libraries, docs roots. |
| Language/framework/package manager | Lockfiles, manifest files, config files, framework markers, dependency names. |
| Scripts/commands | Package scripts, Makefile targets, task runner configs, test/compile commands. |
| Docs/tests/CI | README, docs folders, test folders, test configs, CI workflow files, coverage hints. |
| Deployment/runtime hints | Dockerfiles, compose files, Procfile, platform configs, infra folders, env example keys. |
| Data/API boundaries | API route markers, schema/migration folders, ORM configs, OpenAPI/GraphQL files, service clients. |
| Current `.specify` state | Existing config, templates, feature folders, generated docs, topology proposals, install state. |
| Topology candidates | Candidate sub-workspaces/modules with evidence and confidence. |
| Confidence/conflicts | Evidence strength, contradictions, stale files, unresolved repo questions. |

## Confidence Labels

- `High`: direct file/config evidence.
- `Medium`: dependency, script, or command inference.
- `Low`: naming/layout inference that needs human confirmation.

## Clarification Rules

- Ask only for repo-onboarding decisions, evidence conflicts, missing safe context, or confirmation of low-confidence topology candidates.
- Do not ask product-scope discovery questions by default.
- Recommend product discovery later only when product intent is missing and the user wants that route.
- Redact secret values before using evidence in notes or reports.

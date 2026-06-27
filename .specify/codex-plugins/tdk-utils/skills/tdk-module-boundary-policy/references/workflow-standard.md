# Standard Workflow

Use standard mode to write the main policy proposal.

1. Read topology and runtime config evidence.
2. Build a boundary inventory from named sub-workspaces/modules only.
3. Derive dependency intent from report-only fields, current imports/packages, and
   architecture notes.
4. Classify edges as allowed, forbidden, unresolved, or not enough evidence.
5. Detect stack support for Nx, Turborepo, ESLint, TypeScript ESLint,
   dependency-cruiser, or manual docs only.
6. Write `module-boundary-policy.md`.
7. Write `enforcement-snippets.md` only when evidence supports at least one stack
   or the user requested snippet guidance.

Standard mode may recommend `/tdk-workspace-topology-apply --dry-run` when
topology is not yet applied, or `/tdk-module-boundary-policy --audit` after a
human applies snippets.

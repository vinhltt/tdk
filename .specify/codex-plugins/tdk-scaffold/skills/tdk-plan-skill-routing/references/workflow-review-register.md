# Review And Register Workflow

Use when `tdk-scaffold-from-recommendation` produced `plan-skill-routing-proposal.json`.

Steps:

1. Inspect current routing:

   ```bash
   bun src/index.ts routing plan-skill inspect --project-root <root>
   bun src/index.ts routing plan-skill check --project-root <root>
   ```

2. Diff the proposal:

   ```bash
   bun src/index.ts routing plan-skill diff --project-root <root> --proposal <proposal>
   ```

3. Review operations and warnings. New sub-workspace sections require name verification.
4. Register only after approval:

   ```bash
   bun src/index.ts routing plan-skill register --project-root <root> --proposal <proposal> --yes
   ```

5. Verify:

   ```bash
   bun src/index.ts routing plan-skill verify --project-root <root> --proposal <proposal>
   ```

If the route file is missing, stop and run the init workflow first.

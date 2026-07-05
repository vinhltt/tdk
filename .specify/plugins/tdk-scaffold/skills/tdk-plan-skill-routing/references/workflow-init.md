# Init Workflow

Use when the project has no route file and the user wants custom routing.

Steps:

1. Resolve the exact route path from `.specify/.specify.json`.
2. Run:

   ```bash
   bun src/index.ts routing plan-skill init --project-root <root>
   ```

3. Tell the user to edit the created file or review a scaffold proposal before registering entries.

Do not create the route file during `register`. Missing file means the user has not opted in yet.

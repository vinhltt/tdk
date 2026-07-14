# Suggest Workflow

Use suggest mode to emphasize stack-specific snippet blocks.

1. Read layout and runtime config evidence first.
2. Detect supported stacks from existing repo evidence.
3. Use `references/enforcement-snippet-catalog.md` to draft snippet blocks.
4. Include a manual docs only fallback when no supported stack is detected.
5. Write or update `enforcement-snippets.md`.
6. Write `workspace-dependency-policy.md` when no current policy report exists or when
   the snippet rationale needs a policy summary.

Every snippet must state:

- detected evidence
- boundary or edge it represents
- limitation
- manual validation command or review action when known
- copy after human review gate

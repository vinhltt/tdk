# Apply Flow - Technical Targets

Technical entries target T1 through T6.

## Steps

1. Read current `target_path`.
2. Build a minimal diff preview from current content to proposed content.
3. Ask the user to approve, reject, or skip, with the preview and prior block in the question text (see `SKILL.md` Step 3).
4. If approved, apply the edit with the smallest safe change.
5. Re-read the target path and verify the proposed content is present.
6. Mark the entry `applied` and add `decided_at`.

## Guards

- Never edit files outside the current project.
- Never edit the memory root in this flow.
- Do not apply entries without explicit user approval.
- If the path does not exist and operation is not `add`, mark blocked with `blocked_reason`.
- After applying a target under `.claude/`, check for its OMP twin under the project root. For a target under `.claude/skills/<name>/`, the twin is the directory `.omp/skills/<name>/`. For any other `.claude/<path>`, the twin is `.omp/<path>`, for example `.omp/agents/<name>.md`. When the twin exists, the report gets the line `OMP projection may be stale; re-run convert-flat from your TDK source checkout`. Print no path with it and never run convert-flat. Judge only by the twin on disk; harness install state files are not evidence either way.

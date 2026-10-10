# Phase Execution

Use this reference for `/tdk-implement` Step 7 and Step 8.

## Row-Order Execution

Execution pseudo-code, ascending `row.number`:

```text
1. Run `parse-phases-table.ts "{FEATURE_DIR}/plan.md" --json` -> parse phases array from JSON output
2. If exit code 1 -> report errors -> STOP
3. PRE-LOOP: scan rows for any in_progress -> run F3 recovery gate, reparse, and restart scan
4. Build `phaseByNumber = new Map(rows.map(row => [row.number, row]))`
5. Resolve `TARGET_ROWS = PHASE_FILTER_PRESENT ? rows.filter(row => row.number === PHASE_FILTER) : rows`
6. If selected mode has no runnable row -> report why and STOP without mutation
7. For each row in TARGET_ROWS ascending # order:
   phasePath = join(FEATURE_DIR, row.file)
   a. Status === 'skipped' -> continue (bypass silently)
   b. Status === 'done' -> continue (already complete)
   c. Status !== 'todo' -> continue unless F3 gate already handled it
   d. BlockedBy check: for each id in row.blockedBy, phaseByNumber.get(id)?.status must be done or skipped
      Error: "phase NN blocked by MM which is status='X' — run phase MM first or mark phase NN skipped"
      skipped blocker satisfies dependency
   d1. Run `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/validate-phase-file.ts "{phasePath}" --plan "{FEATURE_DIR}/plan.md" --phase-number {row.number} --json)`.
      Validation failure STOPs before status mutation.
   d2. Apply `## Sub-Workspace Branch Context` below when `GIT_MAP` exists.
   e0. Run routing preflight from 7A, then Tier 1 of `### Delegate Skill Loading Requirement` for every actual routed agent.
       Run readiness even when current routing is empty; cancellation or a readiness failure STOPs before status mutation.
   e. Run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" in_progress)` -> phase file FIRST
      Run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} in_progress)` -> plan.md SECOND
   f. Execute phase per phase-NN-*.md instructions
   g. For normal phases, run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" done)` -> phase file FIRST
      Run: `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} done)` -> plan.md SECOND
      Spike phases follow `## Spike Phase Execution` instead.
```

This is the default/selected serial path. Parallel mode also lands here: every phase the checker reports in
`conflicts` or `rejected`, plus every `parallel_safe: never`, legacy, or spike phase, runs through this same
behavior synchronously, one phase at a time. The only difference is the status write — a phase deferred from
a parallel wave writes both surfaces with a single `transition-phase-status` call per transition, as defined
in `parallel-phase-orchestration.md`, instead of the two legacy status CLIs above. Nothing is retained
between phases and no ownership is asserted; each phase runs, then writes its status, then the next begins.

For each phase:

1. Read the phase file referenced in `row.file` relative to `FEATURE_DIR`.
2. If the phase file contains `## Delegate Agents`, run `## Delegate Agents Phase` first — the routed agent executes the phase and the `## Delegate Skills` list is that agent's toolset. Otherwise, if the phase file contains `## Delegate Skills`, execute those delegates first.
3. If the phase appears to be a unit-test phase and has **neither** a usable `## Delegate Skills` entry **nor** a routed `## Delegate Agents` entry, STOP with the unit-test guard message below. A test-like phase routed to an `@agent` and no skills is valid — step 2 already dispatched that executor, so never STOP on the missing `## Delegate Skills` section alone.
4. If the phase is TDD/backfill-shaped, validate `## Test Quality Gate` after delegates and before any phase `done` write.
5. If validation returns `phaseType: spike`, follow `## Spike Phase Execution`.
6. Otherwise execute as a generic implementation phase.
7. Log: `"✓ Phase {N}: {name} — complete"`

## Sub-Workspace Branch Context

**When no `GIT_MAP` exists — preflight skipped, single-repository project, or `--no-branch` — skip this
section entirely.** This reference loads on every run, so an unconditional check here would compare against a
record that was never created and stop a perfectly valid run.

When `GIT_MAP` does exist, inject its content into the execution context for each phase that touches a
sub-workspace repository: per repository, its milestone, branch, base commit and worktree path. The
artifact host's own branch is **not** injected as milestone context — a milestone belongs to a code
repository, and the artifact host is not one of them.

Before the phase writes anything, re-verify that the repository still stands where the record says:

```bash
git -C "$PROJECT_DIR/$SUB_PATH" rev-parse --abbrev-ref HEAD
```

A mismatch STOPs with the F3-style recovery reminder — another task may have moved `HEAD` in the meantime.
Paths in `GIT_MAP` are workspace-relative, so join `PROJECT_DIR` at execution time.

### Working-Root Override

When a repository's `Worktree path` column holds a value, that path is the **replacement working root** for
that sub-workspace — not a second declared path. Take the value verbatim from the column; do not derive it
from the branch name, because deriving is owned by the preflight and worktree skills and the branch name is
editable.

Paths declared under `## Related Code Files` stay workspace-logical. A phase declaring `apps/web/src/foo.ts`
against a worktree at `_worktrees/web/feature-sample-001` reads and writes
`_worktrees/web/feature-sample-001/src/foo.ts`.

Phase files never declare `_worktrees/...` themselves: `/tdk-plan` runs the write-disjointness check in
validate-only mode, that mode includes the gitignore step, and `_worktrees/` must be gitignored — so such a
path is rejected as an ignored write path. A phase file is also written at plan time, while whether a
repository is busy is implementation-time state.

Both the re-verify command above and the final `git diff` review point at the **translated** root, not at the
declared one.

The write-disjointness checker validates declared paths, not the paths actually written. It is a cooperative
policy backed by report review rather than a filesystem sandbox, so this override depends on agent
compliance.

## Spike Phase Execution

A spike is an executable exception, not a research-note phase.

1. Run the phase's reproducible `## Experiment`, obeying the same destructive,
   network-install, and secrets safety boundary as Test Quality Gate commands.
2. Produce every `## Deliverables` item and replace the heading-bounded
   `## Spike Result` body with:

   ```markdown
   | Field | Value |
   |---|---|
   | Status | proposed |
   | Decision | approve or replan |
   | Evidence | concise paths, commands, and observed results |
   | Recommendation | one concrete recommendation |
   ```
3. Run `validate-phase-file.ts` again with `--require-result`. Failure leaves
   the spike `in_progress` and STOPs.
4. AskUserQuestion with `Approve result`, `Replan`, and `Cancel`:
   - Approve: run `resolve-spike-decision.ts "{FEATURE_DIR}/plan.md"
     --phase-number {row.number} --decision approve --json`. Change result
     `Status` to `approved`. Change only phase numbers returned in `unblock`
     from `blocked` to `todo`, updating each dependent's phase frontmatter
     first and plan table second. Keep `remainBlocked` unchanged and reparse
     `plan.md` after each update. Only after every returned dependent is
     reflected in both files, mark the spike `done` using phase frontmatter
     first and plan table second. This keeps the spike `in_progress` as an F3
     recovery anchor until the multi-file transition is complete; retrying the
     same approved transition is idempotent because the helper reports prior
     `todo` transitions in `alreadyUnblocked`. Refresh `phaseByNumber` and
     remaining `TARGET_ROWS` before continuing.
   - Replan: run the same helper with `--decision replan`; it must return no
     unblocks. Change result `Status` to `replan-required`, mark the spike
     `blocked`, leave every dependent blocked, STOP, and recommend
     `/tdk-plan {TASK_ID}` to update the graph from recorded evidence.
   - Cancel: leave the spike `in_progress` and every dependent blocked.

Never mark a spike done from delegate completion, generic success criteria, or
F3 recovery. Never unblock a dependent from an unapproved result. A replan may
unblock or replace dependents only by rewriting and revalidating the phase graph.

## Delegate Skills Phase - Auto-continue

`## Delegate Skills` is **context-dependent**. When the phase also has `## Delegate Agents`, those skills
are the routed agent's toolset and the main session does **not** invoke them itself — `## Delegate Agents
Phase` owns execution. When no agent is routed, the main session runs the skills exactly as described in
this section. Read the phase for `## Delegate Agents` before applying anything below.

If the phase file contains a `## Delegate Skills` section and no `## Delegate Agents` section, execute it before generic implementation.

Parsing uses the shared resolver's line-based, fence-aware `parsePhaseDelegates` scan, not a full CommonMark parser. It masks examples inside its recognized fences. With an opener indented one to three spaces and mismatched closing indentation or no closer, it can disagree with a CommonMark reader about later delegate headings; an unclosed list-item fence may hide a real section from this scan. That read-only/no-op limitation remains. Routing preflight refuses otherwise admitted byte changes as `fence_container_ambiguous` until the user aligns/closes the fence manually; true byte no-ops and matching-indent fences remain supported. Reading a section never authorizes rewriting non-clean body content.

1. Find heading `^## Delegate Skills$` outside fences identified by the line-based scan.
2. Read prose bullet lines until the next recognized unindented ATX boundary (`^# ` or `^## `) outside fenced code, or EOF, skipping fenced content. Indented/tab-separated ATX and setext headings are not recognized boundaries.
3. For each bullet, extract the first backticked slash-prefixed token, e.g. `` `/my-test-skill` ``.
4. If no backticked token exists, extract the first raw slash-prefixed token, e.g. `/my-test-skill`.
5. Ignore placeholder bullets containing `{`, `}`, `your-`, or `(default`.
6. Preserve bullet order and deduplicate exact skill names.

Execution context for each delegate:

```text
/{skill-name} {TASK_ID}

Context:
- FEATURE_DIR: {FEATURE_DIR}
- phasePath: {phasePath}
- phaseNumber: {row.number}
- phaseFile: {row.file}
- phaseTitle: {row.fileLabel}
- subWorkspace: {detected from PROJECT_CONTEXT if unambiguous, otherwise empty}
```

Required behavior:
- Run delegates in listed order.
- Do not invent, auto-discover, or replace missing delegate skills.
- If a listed skill is unavailable, STOP with:

```text
Delegate skill not found: /{skill-name}
Phase NN left in_progress. Add/fix the skill in delegate-routing.md or edit this phase's ## Delegate Skills, then rerun /tdk-implement {TASK_ID}.
```

- If a delegate fails, STOP and report the delegate's error. Leave the phase `in_progress` and emit the F3 recovery reminder.
- If every delegate completes for a non-test-mode phase, validate the phase success criteria if present, then mark the phase done.
- Delegate completion alone cannot mark a TDD or backfill phase done. Test-mode phases must continue through `## Test Quality Gate` enforcement first.

Unit-test guard: if the phase appears to be a unit-test phase and has **neither** a usable `## Delegate Skills` entry **nor** a routed `## Delegate Agents` entry, do not write tests inline. STOP with:

```text
Unit-test phase has no usable delegate. Add a test entry to delegate-routing.md — either a /skill or an @agent — then rerun /tdk-plan <TASK_ID> --ut-backfill or edit this phase's ## Delegate Skills / ## Delegate Agents manually.
```

The guard is delegate-aware, not skill-aware: a routed `@agent` alone satisfies it. A test-like phase whose `## Delegate Agents` names an executor and whose `## Delegate Skills` is absent — the shape `delegate-routing-injection.md` produces for an agent-only `test` route — is valid, runs through `## Delegate Agents Phase`, and must never hit this STOP.

## Delegate Agents Phase

A routed agent is the **executor** of its domain; routed skills are the **toolset** that agent may call.
This section runs instead of `## Delegate Skills Phase - Auto-continue` whenever the phase file contains a
`## Delegate Agents` section.

Restating the boundary, because it is the one thing that changes for existing consumers: `## Delegate
Skills` is context-dependent. With `## Delegate Agents` present, the skills are the agent's toolset and the
main session does not invoke them itself. With no agent routed, the main session runs the skills exactly as
it does today. A phase with only `/skill` delegates therefore behaves identically to before this section
existed.

Parsing uses the shared resolver's line-based, fence-aware `parsePhaseDelegates` scan, not a full CommonMark parser. It masks examples inside its recognized fences. With an opener indented one to three spaces and mismatched closing indentation or no closer, it can disagree with a CommonMark reader about later delegate headings; an unclosed list-item fence may hide a real section from this scan. That read-only/no-op limitation remains. Routing preflight refuses otherwise admitted byte changes as `fence_container_ambiguous` until the user aligns/closes the fence manually; true byte no-ops and matching-indent fences remain supported. Reading a section never authorizes rewriting non-clean body content.

1. Find heading `^## Delegate Agents$` outside fences identified by the line-based scan.
2. Read prose bullet lines until the next recognized unindented ATX boundary (`^# ` or `^## `) outside fenced code, or EOF, skipping fenced content. Indented/tab-separated ATX and setext headings are not recognized boundaries.
3. For each bullet, extract the first backticked at-prefixed token, e.g. `` `@my-backend-agent` ``.
4. If no backticked token exists, extract the first raw at-prefixed token, e.g. `@my-backend-agent`.
5. Ignore placeholder bullets containing `{`, `}`, `your-`, or `(default`.
6. Preserve bullet order and deduplicate exact agent names.

### Delegate Skill Loading Requirement

**Tier 1 — static readiness.** Run in Step 7A after resolving delegate drift and before the first
`in_progress` status transition. Check every actual routed agent, including manually declared delegates
when the routing file is missing/empty. This is a read-only gate, not executor dispatch. An agent-only route
still needs a resolved agent binding, but an empty parsed `## Delegate Skills` toolset needs no skill-loader
check and adds no implicit `read` or `Skill` requirement.

Select rules from the exact subagent-dispatch primitive the controller is about to call:
OMP `task`; Claude `Agent` or `Task`. Phase-7 G3 retry (Claude CLI, `claude-sonnet-5-5`) emitted
`tool_use` name `Agent` with `subagent_type` while `init.tools` listed `Task`, so both names select the
Claude rule set. Different capitalization and any other/unobserved primitive are `unverified`; never infer
a harness from environment, paths, installation metadata, or canary output.
Claude dispatch exposure is not proof of successful Claude preload or inherited-`Skill` behavior.

Resolve bindings and skill availability under that rule set:

| Dispatch primitive | Supported agent scopes, in precedence order | Delegate skill locator |
|---|---|---|
| `task` | Project `.omp/agents/*.md`, then the OMP user agent directory (normally `~/.omp/agent/agents/*.md`) | `skill://{skill-name}` |
| `Agent` / `Task` | Project `.claude/agents/*.md`, then `~/.claude/agents/*.md` | `.claude/skills/{skill-name}/SKILL.md` or the resolved plugin skill |

Scan agent definitions in each scope, matching exact frontmatter `name`, **not the filename**; the first
matching name wins, project before user (OMP uses lexicographic filename order within a directory).
Use the dispatcher's effective user directory if configured; an unresolved directory or unreadable/
unparsable definition that prevents establishing the winning binding is `unverified`, not permission to
guess or choose a lower-precedence agent. Missing directories are empty scopes. No match in the supported
scopes is `agent-not-found`; list the scanned scopes and explain that managed, CLI, plugin, extension, and
bundled agent scopes are unsupported for routed executors in this version. Do not auto-discover a replacement.

For a non-empty toolset, resolve **each** skill in listed order. Read the Claude skill definition at its
resolved local/plugin locator; for OMP, read each exact `skill://{skill-name}` from the main session.
A missing skill is `skill-not-found`; unreadable or ambiguous evidence is `unverified`. Main-session
readability proves availability only, not that a custom child can load it. Skill metadata and loader/tool
semantics that cannot be parsed or established also remain `unverified`, never "incompatible".

Apply the capability table only after binding and availability checks pass:

| Dispatch primitive | Capability evidence for the routed toolset | Tier 1 verdict |
|---|---|---|
| `task` / `Agent` / `Task` | Empty toolset; agent binding resolved | `ready` without a loader check |
| `task` | Proven G5 custom-child URI loading, with effective `read` explicitly listed or inherited by omitted `tools` per G2 | `ready` |
| `task` | G5 failed, not run, or otherwise unproven | `unverified` even if the main session can read every URI |
| `task` | G5 proven, but an explicit effective tool list has no `read` | `no-loader`, even with full `autoloadSkills` coverage |
| `Agent` / `Task` | Explicit effective `Skill` grant, not denied by `disallowedTools` | `ready` under the existing explicit-tool contract |
| `Agent` / `Task` | `tools` omitted (inherits the session toolset), `Skill` not denied by `disallowedTools`, no delegate has `disable-model-invocation: true` | `ready` (G3 P7: child called `Skill` and returned the body) |
| `Agent` / `Task` | Every delegate in the agent's `skills:` preload, none has `disable-model-invocation: true` | `ready` without an effective `Skill` grant (G3 P5: full body loaded, 0 child tool calls) |
| `Agent` / `Task` | Explicit tools without an effective `Skill` (absent or denied), and a delegate is not fully preloaded: missing from `skills:` or `disable-model-invocation: true` | `no-loader` (P6: a disabled skill is not preloaded; no `Skill` path exists to load it) |
| `Agent` / `Task` | Omitted or wildcard/unknown `tools` and a delegate has `disable-model-invocation: true` | `unverified` (child `Skill` access to a disabled skill was not exercised) |
| Any other primitive, or unresolved effective-tool semantics | No applicable proven rule | `unverified` |

Evidence boundary: G1, G2, and G5 were exercised on OMP 18.8.5: `skills` conversion preserves
`autoloadSkills`, omitted `tools` includes `read`, and a custom child actually read `skill://`.
Record matching `autoloadSkills` coverage as G1 evidence only; it never replaces the G5 + `read` contract.
Honor explicit tool restrictions; omission is not an empty toolset, and unknown wildcard/restriction
semantics are not a grant. Do not silently add tools or build a generic capability-analysis subsystem.

G3 was exercised on the Claude CLI (`claude-sonnet-5-5`, dispatch `tool_use` name `Agent`): P5 explicit
`Read,Edit,Write` plus `skills:` preload returned the full body with no child tool call; P6 a
`disable-model-invocation: true` skill was **not** preloaded and an unknown `skills:` name was silently
ignored, so Tier 1 itself must catch missing skills; P7 omitted `tools` with no preload reached the body
through the child `Skill` tool. These results hold only for the tested settings; effective grants must still
respect `disallowedTools` and known session restrictions, and cases outside the table stay `unverified`.
Never mark preload `ready` from documentation alone, and never accept a partial preload as complete.

Keep the per-agent result as `delegateReadiness`: dispatch primitive, resolved agent path, ordered skill
locators, effective-loader evidence (and G1 autoload coverage where applicable), verdict, and failing
delegates/reason codes. In parallel mode this belongs to the immutable admission snapshot. Before dispatch,
changed agent/skill definitions or a changed dispatch primitive invalidate readiness; recheck before any
status transition rather than dispatching against stale evidence.

If any routed agent fails, STOP without dispatch or status writes and report every failing delegate:

```text
STOP BLOCKED: delegate readiness for phase NN
Dispatch primitive / rule set: {task | Agent | Task | unverified primitive}
Agent: @{agent-name}; resolved definition: {path, or not resolved}
Scanned agent scopes: {project scope, user scope}
Failing delegates: {agent/skill names with agent-not-found, skill-not-found, no-loader, or unverified}
Evidence: {missing loader/definition/skill or unverified capability, with the relevant path}
Phase NN remains todo; no status mutation. Fix readiness and rerun /tdk-implement {TASK_ID}.
```

Tier 1 failure emits **no F3 recovery reminder**: execution never started. Never fall back to invoking the
routed skills in the main session, silently remove the agent route, or ask to add Claude `Skill` to OMP tools.

### Execution Context

Dispatch one agent at a time, in listed order, through the primitive selected by Tier 1:
Claude `Agent`/`Task` uses `subagent_type: {agent-name}`; OMP `task` uses `agent: {agent-name}`.
Carry the same resolved agent binding and `delegateReadiness`, not a filename-derived replacement.

```text
Agent dispatch parameter: {subagent_type for Agent/Task, agent for task}: {agent-name}

Context:
- FEATURE_DIR: {FEATURE_DIR}
- phasePath: {phasePath}
- phaseNumber: {row.number}
- phaseFile: {row.file}
- phaseTitle: {row.fileLabel}
- subWorkspace: {detected from PROJECT_CONTEXT if unambiguous, otherwise empty}
- Toolset: the skills listed in this phase's `## Delegate Skills`, in listed order
- Write targets: this phase's `## Related Code Files` Modify/Create/Delete bullets
- Success criteria: this phase's `## Success Criteria`
- delegateReadiness: {the passing Tier 1 result for this agent}

Load before writing:
- /{skill-name}: {skill://{skill-name} for task; Skill invocation or proven full-body preload with resolved locator for Agent/Task}
  Repeat one entry for every delegated skill in listed order; an empty toolset is "none — no skill load required".
  Load every listed skill's full instructions before your first write. Autoload/preload presence alone is not a load receipt.
  Report each loaded skill, its locator/loading method, and its nonce-free first heading.
  On any load failure, name the failing skill and error, do not write, and end with exactly Status: BLOCKED.

End your report with exactly one line:
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```

The pipe-separated `Status:` values above are alternatives, **not** a line to emit. Select exactly one
literal final line: `Status: DONE`, `Status: DONE_WITH_CONCERNS`, `Status: BLOCKED`, or `Status: NEEDS_CONTEXT`.
For OMP, use `read` on each supplied skill URI even when `autoloadSkills` covers it. For Claude, use the
effective `Skill` tool or verify the proven full-body preload in the executor's own context. The controller
does not load on the executor's behalf. Empty toolsets require no load or load receipt.

**Tier 2 — dispatch-time load.** A failed load ends `Status: BLOCKED`; because the controller already
transitioned before dispatch, leave the phase `in_progress` and emit the F3 recovery reminder with the
failing skill and executor report. This is distinct from the Tier 1 `todo` STOP. Serial and wave workers
receive this identical `Load before writing:` block.

### Status Protocol

An agent returns a **report**; it does not throw. The report's final `Status:` line is what decides the
phase, and it is decided by literal string comparison — never by judging the prose:

| Status value | Main session behavior |
|---|---|
| `DONE` | Treat as delegate success; continue the normal completion path |
| `DONE_WITH_CONCERNS` | STOP; leave the phase `in_progress`; emit the F3 recovery reminder |
| `BLOCKED` | STOP; leave the phase `in_progress`; emit the F3 recovery reminder |
| `NEEDS_CONTEXT` | STOP; leave the phase `in_progress`; emit the F3 recovery reminder |

Any value other than the literal `DONE` — including a missing, malformed, or duplicated `Status:` line —
STOPs, leaves the phase `in_progress`, and emits the F3 recovery reminder with the agent's report attached.
Do not infer success from a confident-sounding report, and do not downgrade a non-`DONE` status because the
report reads complete.
For a non-empty toolset, also require the per-skill load receipts from the execution context. A report with
missing receipts is not delegate success even if its final line is `Status: DONE`: STOP, leave the phase
`in_progress`, and emit the F3 recovery reminder. Static readiness alone never proves a dispatched load.

Required behavior:
- Run agents in listed order; do not invent, auto-discover, or replace a missing routed agent.
- If binding/availability fails before the transition, use the Tier 1 STOP above and keep `todo`.
- If dispatch itself fails after the transition (including an agent becoming unavailable), attach the
  dispatch error, STOP, leave `in_progress`, and emit the F3 recovery reminder. Never substitute an agent or
  run its delegated skills in the main session.

- After every agent reports `DONE` for a non-test-mode phase, validate the phase success criteria if present, then mark the phase done.
- Agent completion alone cannot mark a TDD or backfill phase done. Test-mode phases must continue through `## Test Quality Gate` enforcement first.

## Test Quality Gate Enforcement

Apply this section to every TDD/backfill-shaped phase before marking the phase
done.

Old-shape TDD/backfill phase missing `## Test Quality Gate`:

```text
Old-shape TDD/backfill phase missing `## Test Quality Gate`. Phase NN left in_progress. Rerun `/tdk-plan` with the same test-mode flag or manually add `## Test Quality Gate` before rerunning `/tdk-implement`.
```

If repairing by regeneration, rerun `/tdk-plan` with the same test-mode flag.
If repairing manually, manually add `## Test Quality Gate` before rerunning
`/tdk-implement`. do not fall through to delegate completion or generic done
when this STOP condition is hit.

Run every safe runnable `Command` in `## Test Quality Gate`. A gate row can pass only when structural target evidence is satisfied and any runnable command exits 0. Do not parse coverage percentages; TDK core validates the declared command/status/evidence contract, not coverage math.

Safe command boundary:
- A runnable command must come from the committed phase file, delegate output,
  or committed project docs and run from an explicit project-relative cwd.
- STOP before execution on an unsafe command: destructive command,
  network-installing command, secrets-exposing command, shell metacharacters,
  pipes, redirection, or control operators without explicit project
  documentation or user approval.
- A non-applicable row must use `Command: -` and `Status: N/A: <reason>`.
- Bare `Command: N/A` is invalid.

Block phase completion and leave the phase `in_progress` with the F3 recovery
reminder when any required gate row is `pending` or `fail`, a command exits
non-zero, an unsafe command appears, there is missing structural evidence, a
required command is missing, invalid N/A encoding is present, or a row claims
`pass` without evidence.

Structural evidence checks:
- TDD ID reuse: every `## Tests Before` ID appears in `## Tests After`.
- TDD rubric dimensions by test ID or `N/A: <reason>`: Happy, EP, BVA,
  Branch, Error, Deps, State, and Regression are covered or explicitly
  non-applicable.
- backfill matrix rows: every non-N/A `## Test Matrix` row has `Impl` evidence.
- branch traceability: every non-trivial branch maps to a row or
  `N/A: <reason>`.
- dependency traceability: every listed dependency maps to a row or
  `N/A: <reason>`.

## TDD Phase Execution

**Detect TDD markers:** a phase is TDD-shaped when its file contains all five headings `## Tests Before`, `## Refactor / Implementation`, `## Tests After`, `## Test Quality Gate`, `## Regression Gate` (written by `/tdk-plan <TASK_ID> --tdd`, see `plan-output-contract.md` Test Mode Sections). If the phase has the old four-heading shape without `## Test Quality Gate`, STOP with the old-shape message above.

For a TDD-shaped phase:

1. Run the routed `test` delegate first, covering the `## Tests Before` step (tests capturing current behavior) — the routed executor from `## Delegate Agents` when one is present (see `## Delegate Agents Phase`), otherwise the routed skill from `## Delegate Skills`.
2. If no usable `test` delegate exists in either section, STOP with the unit-test guard message above — do not write tests inline.
3. After the test delegate completes, continue to the routed implementation delegate (if listed after the `test` skill in `## Delegate Skills`) or generic implementation, covering `## Refactor / Implementation`.
4. Re-run the `## Tests After` step (re-run `## Tests Before` tests, plus any new tests for new behavior).
5. Run and validate `## Test Quality Gate`.
6. Run the `## Regression Gate` command(s); all must pass.
7. **Test delegate success alone never marks a TDD phase done.** Mark done only after steps 3–6 all complete successfully.

If the implementation step or regression gate fails, leave the phase `in_progress`, report the failure, and emit the F3 recovery reminder — do not mark done on partial completion.

## UT Backfill Phase Execution

**Detect UT backfill markers:** a phase is backfill-shaped when its file contains all four headings `## Code Summary`, `## Mocks & Fixtures Required`, `## Test Matrix`, and `## Test Quality Gate` (written by `/tdk-plan <TASK_ID> --ut-backfill`, see `plan-output-contract.md` Test Mode Sections). If the phase has the old three-heading shape without `## Test Quality Gate`, STOP with the old-shape message above.

For a backfill-shaped phase:

1. Run the routed `test` delegate first — the routed executor from `## Delegate Agents` when one is present (see `## Delegate Agents Phase`), otherwise the routed skill from `## Delegate Skills`. If no usable `test` delegate exists in either section, STOP with the unit-test guard message above — do not write tests inline.
2. The test delegate must implement each non-N/A `## Test Matrix` row or explicitly defer it with `N/A: <reason>` in the row.
3. Before marking the phase done, verify every non-N/A `## Test Matrix` row has the `Impl` column filled with a test file path, test name, or stable test identifier.
4. Run and validate `## Test Quality Gate`.
5. Run the phase's test command(s) from `## Success Criteria`, `## Next Steps`, or delegate output; all must pass.
6. If any required matrix row lacks `Impl`, any test command fails, any quality gate row blocks, or the delegate cannot map a row to code, leave the phase `in_progress`, report the missing ID(s), and emit the F3 recovery reminder — do not mark the phase done.

Backfill phases are test implementation work only. Do not create production source changes unless the phase explicitly states a testability seam is required and the change is covered by the phase success criteria.

## Generic Implementation Phase - Auto-continue

CRITICAL: You MUST actually implement the code - not just read and summarize the plan.

Before generic implementation:
- Read `./docs/code-standards.md or the project equivalent`.
- Scout adjacent file patterns and follow local imports, logging, and error style.
- Check existing helpers before creating utilities.
- Verify public or interface contracts remain compatible unless the phase explicitly changes them.
- Re-check phase requirements and Validate phase success criteria.

For each implementation phase:

1. Read the phase file referenced in `row.file` relative to `FEATURE_DIR`.
2. Implement every step described in the phase with actual production code; no mocks, placeholders, or TODOs.
3. After each file change, run compile/lint check to verify no errors.
4. Validate against Success Criteria listed in the phase, if any.
5. Mark phase done by running `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-frontmatter-status.ts "{phasePath}" done)` then `(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-status.ts "{FEATURE_DIR}/plan.md" {row.number} done)`.
6. Log progress: `"✓ Phase {N}: {name} — complete"`

DO NOT just read the plan and report what it says - you must write code, edit files, and produce working implementation.

## Counsel Before Escalating a Failed Phase

Every failure path above ends by leaving the phase `in_progress` and emitting the
F3 recovery reminder, which hands the decision back to the user. Before emitting
that reminder, consult the `tdk-counsel` agent **once** for the failed phase, and
fold its recommendation into the failure report.

This applies only to work that failed during execution. A stale `in_progress` row
found by the Step 4 preflight scan is an interrupted session, not a stuck phase —
recover it normally without consulting.

Pass the agent: the phase number and its goal, the exact error or failing gate,
what was attempted, and the relevant `file:line` evidence. Fence the material as
`=== CALLER CONTEXT ===` so the agent treats it as data.

Consult at most once per failed phase per run. If the consult itself fails or is
unavailable, emit the F3 recovery reminder unchanged — counsel is an enrichment,
never a blocker, and never a substitute for the user's recovery decision.

`tdk-counsel` writes no files and asks no questions. It returns a diagnosis and a
recommended recovery action; the user still chooses among Retry, Mark done, Mark
skipped, and Cancel at the F3 gate.

## Completion Summary

After all phases:

```text
✅ Implementation complete: {task_id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phases executed: {N}
Phases skipped: {skipped_count}

Next steps:
→ /tdk-status {task_id}   — check artifact status
```

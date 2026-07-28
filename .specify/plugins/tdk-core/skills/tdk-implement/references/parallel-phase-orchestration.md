# Parallel Phase Orchestration

Use only for the `/tdk-implement <TASK_ID> --parallel` branch after shared read-only parsing and
confirmation. Scheduling is prompt-driven: you select each wave from `plan.md` yourself. Two helpers stay
authoritative and must not be reimplemented in prose — `check-phase-write-disjointness.ts` is the sole
write-safety authority, and `transition-phase-status.ts` is the sole status write path.

## Capability Proof Before Dispatch

In one concurrent dispatch, start two no-tool/no-file canaries with unique nonces you generate. Each complete
trimmed output must be exactly one JSON object:

```json
{ "schemaVersion": 1, "probe": "A|B", "nonce": "<expected>", "status": "READY" }
```

Probe A uses `"probe": "A"`; probe B uses `"probe": "B"`. Dispatch both in a single message and join both
through the harness-provided synchronous primitive. Missing results, extra prose, malformed JSON, wrong
nonce/probe, dispatch errors, or unavailable concurrency -> STOP with the serial rerun command. Do not try a
smaller wave or infer harness identity from canary success.

## Main Agent Contract

Six steps, in order, once per wave.

### 1. Read the graph

Read the `## Phases` table from `plan.md` and the `parallel_safe` frontmatter key of every phase file that is
not already `done` or `skipped`. `plan.md` stays status source of truth. Phase frontmatter keeps its existing
schema unchanged: `parallel_safe` is exactly `auto` or `never`, with `parallel_reason` explaining the value.

### 2. Build the candidate set

A phase is a candidate when `parallel_safe: auto` **and** every `BlockedBy` entry is `done` or `skipped`.
`parallel_safe: never`, legacy phases without the key, and spike phases are never candidates; run them
serially per `phase-execution.md`.

### 3. Infer each candidate's access set

For each candidate, read its `## Related Code Files` section and map the `Read:`, `Modify:`, `Create:`, and
`Delete:` bullets to one JSON element:

```json
{ "phase": 3, "read": ["docs/sample-notes.md"], "modify": ["src/sample-service.ts"], "create": [], "delete": [] }
```

Infer the access set directly from the bullets; do not shell out to a markdown parser. Malformed-bullet
detection is not your job — `validate-phase-file.ts --mode parallel` already reported it earlier in
`phase-execution.md`, and a phase that failed it never reaches this step.

### 4. Call the checker once per wave

Pass the complete candidate array on stdin in exactly one call, never once per phase:

```bash
printf '%s' "$ACCESS_SETS_JSON" | bun src/commands/util/check-phase-write-disjointness.ts --project-root "$PROJECT_DIR"
```

Scheduling mode is the default and the only mode this path uses; the host-independent plan-time gate mode
belongs to `/tdk-plan`. Output is `{ "safe": [...], "conflicts": [...], "rejected": [...] }`. Exit `0` means
the check ran, with or without conflicts; exit `2` means at least one phase hit a write-policy rejection;
exit `1` is an unexpected failure and STOPs the invocation.

### 5. Dispatch the safe set

Spawn one subagent per phase in `safe`, **at most four workers per wave**. This cap is a hard prompt
constraint, not a suggestion; `transition-phase-status` enforces the same one-to-four bound on the completion
batch. When `safe` holds more than four phases, take the four lowest phase numbers and leave the rest for the
next wave. Every phase named in `conflicts` or `rejected` runs serially per `phase-execution.md`; never widen
a wave to admit one.

Mark each dispatched phase `in_progress` with one status call per phase before spawning it, then dispatch the
wave as one synchronous concurrent batch in a single message, one invocation per phase, and join every
started worker before continuing. A failed dispatch returns its own error result while siblings still return.

### 6. Read reports and persist status

Each worker returns a prose report, not a strict JSON result; there is no result schema to validate. Read
each report and judge it against that phase's success criteria. A report that claims completion without
satisfying those criteria, or that asks for an undeclared path, is not a completion.

Write status only through the one status CLI. Statuses are exactly `todo`, `in_progress`, `done`, `skipped`,
`blocked`, and `cancelled`:

```bash
bun src/commands/util/transition-phase-status.ts --project-root "$PROJECT_DIR" \
  --plan "$FEATURE_DIR/plan.md" --feature-dir "$FEATURE_DIR" --phase 3 --to in_progress
```

A fully successful wave persists in one batch with `--wave-id`, repeating `--phase`/`--to` in matching
ascending pairs, one to four phases, every pair `in_progress` -> `done`:

```bash
bun src/commands/util/transition-phase-status.ts --project-root "$PROJECT_DIR" \
  --plan "$FEATURE_DIR/plan.md" --feature-dir "$FEATURE_DIR" --wave-id "$WAVE_ID" \
  --phase 3 --to done --phase 4 --to done
```

If any worker in the wave fails, blocks, or asks for context, mark no sibling `done`: leave the whole wave
`in_progress` and STOP. The F3 recovery gate in `project-and-phase-contract.md` handles those rows on the
next run.

After a fully successful wave, reparse `plan.md` and restart at step 1. Stop when no candidate remains.

## Worker Boundary

Each worker receives its phase file path, work context, declared reads, its own `Modify`/`Create`/`Delete`
targets, delegates, and success criteria. Workers may read only declared reads plus their own write targets,
and may read back a `Create` target after creating it. Before touching any undeclared path, delegate, or
command, a worker reports `NEEDS_CONTEXT` instead of widening its own scope.

Workers never write `plan.md`, phase frontmatter, routing or configuration authorities, or another phase's
targets; never run Git index/ref commands, commit, stash, reset, checkout, or clean; and never spawn agents
of their own. This is cooperative policy plus your review of each report, not a filesystem sandbox: ignored
writes, undeclared reads, and external side effects stay residual risks — review them with `git diff`.

## Concurrency Boundaries

No polling, sleeping, retry loop, background dispatch, worker timeout, or wait-state machine. Concurrency
comes only from the harness synchronous batch primitive. Nothing fences two concurrent invocations against
each other, so do not run two commands on the same `TASK_ID` at the same time.

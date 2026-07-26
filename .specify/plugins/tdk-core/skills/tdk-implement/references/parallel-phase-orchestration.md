# Parallel Phase Orchestration

Use only for the Claude source `/tdk-implement <TASK_ID> --parallel` branch after shared read-only parsing
and confirmation. Phase 2 `resolve-parallel-phase-wave.ts` is the sole scheduling, platform, path, and
ownership authority. `parallel-controller.ts` is the sole agent-facing controller lifecycle entrypoint.
Do not reproduce either helper's parsing or state transforms in prose.

## Capability Proof Before Lease

In one concurrent dispatch, start two no-tool/no-file canaries with controller-generated unique nonces.
Each complete trimmed output must be exactly one JSON object:

```json
{ "schemaVersion": 1, "probe": "A|B", "nonce": "<expected>", "status": "READY" }
```

Probe A uses `"probe": "A"`; probe B uses `"probe": "B"`. Dispatch both in a single controller message
and join both through the harness-provided synchronous primitive. Missing results, extra prose, malformed
JSON, wrong nonce/probe, dispatch errors, or unavailable concurrency -> STOP with the serial rerun command.
Do not try a smaller wave or infer harness identity from canary success.

## Exact Controller Order

1. Parse arguments; validate task/project; collect prerequisites/status/table read-only; confirm.
2. Run and join both canaries as above.
3. `parallel-controller acquire` with explicit absolute project/feature paths and task/controller IDs.
4. Require its root platform/case probe and rename-disabled Git preflight payload. Require Git,
   stable HEAD/ref, non-DrvFS case-sensitive POSIX/WSL semantics, successful probe cleanup, and no staged,
   unstaged, untracked, unmerged, type-change, or submodule state before worker admission.
5. `inspect-status`. Split or stale state enters recovery-only; clean consistent state enters resolution.
6. Call `resolve-parallel-phase-wave.ts`. Never reimplement or override its cap-four decision.
7. Execute `complete`, `blocked`, `serial-barrier`, or `wave` exactly as defined below.

Before every spawn, routing/status/spike mutation, audit, and release, call `assert-owner`. Any fencing
failure STOPs before further mutation. There is no lease TTL, automatic takeover, polling, sleeping,
retry loop, background dispatch, worker registry, or controller wait-state machine.

`acquire` releases its just-created lease before returning any root capability, case-probe cleanup, or Git
HEAD failure. Its status inventory may be dirty only for the recovery-only decision. A consistent non-recovery
run requires an empty `entries` array before resolver admission. The resolver rechecks Phase 2 filesystem
capability across every canonical scheduled access path before any status write.

## Lease, Recovery, and Exact WAL

The repo-wide lease is `<git-common-dir>/tdk/parallel-controller.lock/`; it owns `owner.json`, transient
`transition.json`, and `wave-baseline.json`. Collision defaults to Cancel and shows owner metadata/age.
Explicit recovery requires user attestation that the old invocation ended plus its exact controller ID.
Recovery atomically tombstones the old directory, acquires a new owner, retains the tombstone through
inspection/reconciliation, reads any `transition.json` from that old tombstone
under the old controller ID, then removes it only after stable verification.
Never substitute the new empty lease journal for the old recovery evidence.

`plan.md` is status SoT. `transition-status` precomputes exact before/after bytes and SHA-256 values.
A single transition persists `prepared`, writes phase frontmatter, persists `frontmatter-written`, writes
the plan, persists `plan-written`, verifies both parses/statuses, then removes the journal. Journal, phase,
and plan writes use same-directory temp files, file flush, atomic rename, and parent-directory flush. At every stage,
only its frozen before/after hash pair is accepted; same-status edits or unrelated drift leave the journal.

A successful wave completion uses one `wave-completion` intent: sorted one-to-four phase hashes, one all-row
plan result, and a durable completed-frontmatter prefix count. Phase files write in numeric order, then the
plan table writes once. Recovery accepts only the exact recorded prefix or one-write-ahead crash window.
The current plan hash chooses all-before or all-after for every sibling; partial sibling completion is never
stable. Any reconciliation mutation is recovery-only: start no worker, verify consistency, release, and STOP.
An unjournaled mismatch requires explicit plan-SoT confirmation before `reconcile-status --plan-source`.
Before any status mutation, `transition-status` persists `mutation-state.json`.
Cancel before the journal/baseline/marker or any project mutation releases immediately.
Cancel or interruption after mutation retains the lease and evidence for this
recovery-only path; TTL, PID absence, and mtime never clear it.

## Resolver Decisions

- `complete`: verify stable status, release, report complete.
- `blocked`: release without status mutation and report exact resolver diagnostics.
- `serial-barrier`: revalidate its selected phase/routing, then run existing synchronous selected behavior
  under the retained lease. It bypasses worker snapshot/audit and does not re-enter the serial advisory lease
  check. Assert ownership before each mutation; release only after verified status or pre-status STOP; end.
- `wave`: continue through whole-wave snapshot, admission, synchronous dispatch, audit, gates, persistence.

Spikes and `parallel_safe: never`/legacy phases are serial barriers. Never manufacture ownership from prose.

## Whole-Wave Snapshot and Admission

For every candidate before the first status write, freeze routing checksum, phase/context hashes, exact
delegates or approved non-test generic override, test-like restrictions, exact success criteria, complete
canonical reads, canonical `Modify|Create|Delete` ownership, and authorized command boundaries. A routing
refresh writes, verifies, releases, and STOPs. Any pre-admission hash drift discards the whole snapshot.

Admit the complete unique one-to-four `auto` wave in numeric order. For each member, assert owner and call
`transition-status` for `todo -> in_progress`; verify both locations before the next. Admission failure starts
no workers and leaves the journal/admitted rows for recovery. After all admissions, call `snapshot-wave`.
Protected state includes plan.md, every phase file, routing/configuration/fixed-deny authorities, declared
reads/writes, and dirty paths accepted from earlier successful waves.

## Worker Dispatch and Boundary

Dispatch every phase as one synchronous concurrent batch in a single controller message, one invocation per
phase. The primitive returns every sibling result before the controller continues. A failed dispatch returns
its own error result while siblings still return, so join every started worker without controller-side waits.

Each worker receives immutable controller/wave/worker/phase identity, routing and phase hashes, delegates,
criteria, complete declared reads, exact ownership, command boundaries, work context, and reports context.
Reports context is not write authority. Workers may read only declared reads plus their own Modify/Delete
targets and Create targets after creation. Before any undeclared path, delegate, command, or ownership need,
return `NEEDS_CONTEXT`; never broaden scope while the wave runs.

Workers never mutate plan/phase/routing/lease/shared/generated authorities or Git index/refs, never commit,
stash, reset, checkout, clean, or orchestrate agents. This is cooperative policy plus detective audit, not a
filesystem sandbox: ignored/reverted writes, undeclared invisible reads, external side effects, and malicious
falsification remain residual risks.

## Strict Worker Result

Copy bounded output under the owned lease only after validation. Parse the complete trimmed output, maximum
64 KiB, as exactly one strict JSON object. Reject Markdown/prose, duplicate keys, unknown fields, noncanonical
paths, wrong identity, unsorted/duplicate changes or requests, and invariant violations.

Required root fields are `schemaVersion`, `controllerId`, `waveId`, `workerId`, `phase`, `status`, `changes`,
`delegates`, `criteria`, `tests`, `concerns`, `request`, and `error`. Status is exactly `DONE`,
`DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`. Changes are sorted by path then operation and operation
is exactly `modify|create|delete`; a rename is `delete` old plus `create` new. Criteria text exactly mirrors
the snapshot. DONE variants require all criteria/evidence, delegates, and tests to pass. `DONE` has no concern;
`DONE_WITH_CONCERNS` has at least one. `BLOCKED` requires nonempty error. `NEEDS_CONTEXT` requires a strict
sorted request and null error. Manifests are attribution claims; Git and controller gates remain authority.

## Two-Stage Rename-Disabled Audit

Git rename detection disabled is a controller invariant, not a user-configurable preference.
Every inventory pins:

```text
git status --no-renames --porcelain=v2 -z --untracked-files=all --ignore-submodules=none
```

After join, assert owner and call `audit-wave --stage post-worker`. HEAD/ref must match. Any staged/index,
unmerged, unknown, type-change, or submodule delta fails integrity. Protected paths and declared reads must
match baseline bytes/type/mode/hash unless that phase owns the write. Tracked changes require `Modify`, new
or untracked paths require `Create`, and deletion requires `Delete`. Every residual operation maps to exactly
one active phase and exactly equals that worker manifest. Missing, extra, multi-owner, protected, or
out-of-scope changes fail. On success the helper persists exact post-worker Git entries and path hashes.

Run controller success criteria, TDD/backfill Test Quality Gate, regression, and spike boundaries sequentially.
These gates have no write allowance and must be documented as producing no persistent output. After every
attempted gate set, even failure, assert owner and call `audit-wave --stage final` with no worker JSON. It must
equal the post-worker attestation byte-for-byte and operation-for-operation; any post-gate delta is integrity
failure.

## Aggregation and Full-Wave Persistence

Join and strictly parse the full started set, finish post-worker audit, run all gates, then finish final audit.
No phase becomes `done` before every worker, criterion, gate, and both audits pass. `DONE_WITH_CONCERNS` may
surface concerns but remains a candidate success. A well-formed `BLOCKED`/`NEEDS_CONTEXT`, spawn failure, gate
failure, malformed output, audit mismatch, or fencing/status failure prevents the next wave.

For every ordinary or integrity failure, mark no sibling done and keep the complete admitted wave `in_progress`;
STOP. For controller/status failure, leave the exact journal for recovery and STOP. Only total
success finishes final audit, calls one matching wave-completion `transition-status`, consumes the finalized
baseline/marker, verifies all siblings, reparses, and asks the Phase 2
resolver for the next decision under the same lease. No phase becomes `done` based on its worker result alone.

## Deterministic CLI Contract

Supported operations are exactly `acquire`, `reserve`, `recover`, `assert-owner`, `inspect-status`, `reconcile-status`,
`snapshot-plan`, `finalize-plan`, `recover-plan`, `transition-status`, `snapshot-wave`, `audit-wave`, and `release`. Every call supplies absolute
`--project-root` and `--feature-dir`; ownership calls include controller ID. Complex input is one explicit JSON
file under the current lease, never the worktree or shell interpolation. `transition-status` alone owns status
journaling/writes. `snapshot-wave` alone writes `wave-baseline.json`. `post-worker` accepts strict worker files;
`final` accepts no worker JSON and durably marks the matching baseline finalized.
Status operations accept parallel/serial purposes; wave operations accept only
parallel purpose; planner snapshot/finalize/recovery accept only planner purpose.

The CLI is noninteractive. It emits exactly one compact agent-JSON line with one trailing newline and sends
diagnostics to stderr. exit `0` means success, exit `2` means expected capability/policy/ownership/recovery/
audit rejection, and exit `1` means unexpected I/O/runtime failure. Expected rejection never enables a
fallback implementation. `reserve` is the same atomic repo mutex without
parallel-only clean-tree/filesystem admission; serial uses `--purpose serial-implement`
and planner uses `--purpose planner`, retaining the controller ID through stable release.

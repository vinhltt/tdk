# Handoff artifact contract

Construct one minimized packet for one purpose. The skill-local bundled exporter owns
validation, rendering and the create-new write; this reference defines its input
and the content the sender must preserve. A packet is a dated observation, not
execution authority, an assignment, or a transfer of uncommitted code.

## JSON input

Send one JSON object through stdin to `scripts/handoff-export.js` relative to the
loaded skill directory, using Bun with `--no-install`, `--capture-root` and
`--slug`. Resolve the capture host from conversation focus and workspace topology,
never from the skill location, recipient metadata or environment hints.
Bun and the bundled helper must already be provisioned; no consumer shared
scripts or npm dependencies are required. Capture never installs, builds,
bootstraps, runs a new check/reproduction, or acquires network access.

This complete base supplies shared unavailable fields for the examples below:

```json
{
  "kind": "continuation",
  "title": "Uncaptured context",
  "focus": null,
  "source_task": null,
  "source_issue": null,
  "intended_recipient": null,
  "target_project": null,
  "sections": {
    "mission": "Not captured in this session",
    "scope": "Focus, source task, source issue, intended recipient and target project: Not captured in this session",
    "current_state": "Not captured in this session",
    "decisions": "Not captured in this session",
    "work_performed": "Not captured in this session",
    "verification": "Not captured in this session",
    "risks": "Not captured in this session",
    "next_actions": "1. **First safe step**: Reverify the intended project, live state and missing evidence before deciding the next action.",
    "sources": "Not captured in this session"
  }
}
```

- Require every displayed key. Both objects are strict: no additional keys.
- `kind` is exactly `continuation`, `spec`, `investigation`, `feature` or
  `upstream-bug`; explicit user choice wins over inference.
- `title` is a nonempty single-line string without control/format characters.
  The helper sanitizes and trims it, and escapes Markdown punctuation in the H1.
- `focus` and the four provenance/destination fields are strings or JSON `null`.
  Unknown means `null`, not an empty string, a fabricated ID or the string `"null"`.
  Explain each unknown in the body with `Not captured in this session`.
- `focus` is a safety input, not emitted frontmatter. Put a minimized safe focus
  summary in `mission`; credential-bearing focus must stop before any write.
- `sections` contains nine nonempty Markdown strings, not arrays or nested
  objects. Encode line breaks as `\n` in JSON. H3 subsections are allowed; do not
  inject H1/H2 headings (including setext/HTML forms). Close code fences and
  avoid raw HTML or hidden content.
- Do not submit `handoff_version`, `generated_at`, workspace paths, session
  records, `parent_spec`, slug or output path as packet fields.
- Read destination defaults from intent: clear consumer destination for
  feature/spec/investigation, explicitly named destination when provided.
  Recipient metadata never selects the capture host or assigns work.

## Renderer-owned output

The helper emits exactly these frontmatter keys in order:
`handoff_version`, `generated_at`, `kind`, `title`, `source_task`, `source_issue`,
`intended_recipient`, `target_project`. Version is `1`; `generated_at` uses the
helper's local clock with milliseconds and an explicit numeric timezone offset.
Unknown provenance remains YAML `null`. The title line is `# HANDOFF: <title>`.

The nine H2 headings below are mandatory, exact, ordered and exclusive. Do not
add another H2; organize kind details with H3s or labeled lists instead.

| Input key | Exact H2 | Content to retain |
|---|---|---|
| `mission` | Mission and current status | Outcome, minimized focus, Done/Remaining, phase/blocker and urgency/priority if known. |
| `scope` | Scope and guardrails | Source project alias versus destination/recipient; in scope, non-goals, constraints, safety boundaries and null-field explanations. |
| `current_state` | Current state | Each relevant code repo's alias/project-relative path, branch, HEAD, worktree/dirty state, bounded changed/untracked files, intentional local modifications and observation time. |
| `decisions` | Decisions and rationale | Decision, rationale, rejected alternative and actual supporting reference; mark unavailable parts explicitly. |
| `work_performed` | Work performed | Actual prior changes at file granularity and commands with outcomes. The helper appends `Redactions applied: N.`; do not invent a count. |
| `verification` | Verification | Check, actual command, outcome and when; include checks not run and why. Never manufacture a run during capture. |
| `risks` | Open risks and blockers | Type (risk/question/blocker), owner if known, impact, assumptions and readiness gates. |
| `next_actions` | Exact next actions | Ordered actions starting literally `1. **First safe step**`; instruct the recipient to reverify live state/assumptions before acting. |
| `sources` | Source pointers | Verified project-relative pointers and safe URLs; label unread/inaccessible pointers and missing summaries. |

Use `Not captured in this session` literally for unknown evidence, including
individual missing fields. Do not omit a required section. Label live-observed
facts with capture time, user-reported facts as unverified, and existing command
results with their actual time. Unknown time uses the same missing-evidence
literal. An unread link is provenance, not proof that its content was captured.

Keep artifact-host, source code repositories and recipient distinct. Never copy
the host's branch into all repository rows or promise those worktrees/paths exist
on the recipient's machine. Relevant Git probes must use
`git --no-optional-locks ...`; snapshots do not transport outstanding local edits.
Minimize/redact evidence and proposed commands using
[redaction-patterns.md](redaction-patterns.md) before serialization.

Output is `.specify/handoffs/yyyyMMdd-slug.md` relative to the confirmed host;
the helper owns the local date, sanitization/count and no-clobber policy. It
returns JSON `{ "ok": true, "path": "...", "kind": "...", "redactions": 0 }`
or `{ "ok": false, "error": "..." }`. A collision requires another explicit
slug, never automatic numbering, another directory or replacement.

## Kind-specific preservation

Retain every source-known value below in the shared sections; use the exact
missing-evidence literal for unknowns. Do not create acceptance thresholds,
workarounds, stopping conditions, approvals or a root cause to fill a field.

| Kind | Required details and destination boundary |
|---|---|
| `continuation` | Current goal, phase/blocker, Done/Remaining per relevant repo, decisions, distinct bounded repo state and outstanding local changes not bundled. Recipient first verifies actual worktrees and missing modifications, then continues the named work. |
| `spec` | Meaningful self-contained seed: outcome, scope/non-goals, measurable acceptance, source-work boundary, dependencies/interfaces, recipient if known, source summary/pointers, assumptions, risks, clarifications and readiness conditions. Recipient first verifies project and readiness; only later may they choose a new ID and run `/tdk-specify <new-id> "<seed>"`. No existing-ID reuse, `--source`, automatic `parent_spec` or implied readiness from a title/link. |
| `investigation` | Question; expected versus actual behavior, observed versus user-reported; hypotheses separate from conclusions; prior experiments/outcomes; impact; unknowns; stopping/exit conditions. Recipient revalidates evidence and chooses the next safe observation; specify is not a default transition. |
| `feature` | Who needs it, problem, expected value, use case, scope, acceptance, constraints/rationale and unknowns. Proposal is not approved scope. Default to the clear consumer destination; recipient confirms need/constraints before selecting that project's normal feature workflow. |
| `upstream-bug` | Sanitized expected/actual, known minimal reproduction, failing command, impact, confirmed workaround if any, OS/runtime/harness and TDK component. Distinguish source-plugin and installed-harness version/hash and their evidence classes. Read canonical destination, suggested tracker and release repository from [upstream-owner.txt](upstream-owner.txt), never branded Markdown or the consumer. Recipient rechecks source-versus-installed state/behavior; maintainer decides triage/issue creation manually. Capture remains in the consumer host. |

For an existing seed, preserve “blocked until X” and unconfirmed assumptions
explicitly. An unavailable source summary is `Not captured in this session`;
readiness is unverified, not ready. Keep known acceptance and interface obligations
even when the link is unread. Sources cannot replace these conditions.

## Sanitized examples

These are illustrative inputs, not claims about a real session. For each example,
copy the complete base JSON above, replace its supplied top-level values, and
replace only the supplied `sections` strings, retaining all other base section
strings. Do not submit an overlay by itself or replace the whole `sections`
object. This is packet authoring, not a new merge tool or runtime dependency.
The resulting packet has all required keys and nine sections. Each scope explains
remaining null provenance; no new verification is implied.

### Continuation — two code repositories

```json
{
  "kind": "continuation",
  "title": "Continue pagination integration",
  "focus": "Continue pagination integration",
  "target_project": "consumer-app",
  "sections": {
    "mission": "Goal: finish pagination integration. Phase: implementation. Blocker: local changes are not bundled. User-reported, unverified: apps/api Done: handler draft; Remaining: review and tests. apps/web Done: design review; Remaining: integration. Urgency: Not captured in this session.",
    "scope": "Source/destination: consumer-app; relevant repo aliases: apps/api and apps/web. In scope: pagination; out of scope: authentication. Constraint: preserve response fields. Safety: do not discard local edits. Source task, source issue and intended recipient: Not captured in this session.",
    "current_state": "User-reported, unverified; observation time: Not captured in this session. apps/api: branch feature/paging-api; dirty with local handler edits. apps/web: branch feature/paging-web; worktree state: Not captured in this session. For each repo, HEAD, exact changed/untracked files and intentional-local-modification confirmation: Not captured in this session. These local changes are not transported by this packet.",
    "work_performed": "User-reported, unverified: API handler draft and web design review. Exact files, commands and when: Not captured in this session.",
    "risks": "Type: blocker; owner: Not captured in this session; impact: recipient may not have the outstanding API edits.",
    "next_actions": "1. **First safe step**: Reverify the recipient's actual API/web worktrees, branch/HEAD and missing local edits against this reported snapshot before continuing pagination.\n2. Resolve how the outstanding edits will reach the recipient before implementation."
  }
}
```

### Spec — conditional seed, unread source

```json
{
  "kind": "spec",
  "title": "Conditional CSV export seed",
  "focus": "Prepare a separate CSV export seed",
  "source_issue": "https://example.com/issues/42",
  "target_project": "consumer-app",
  "sections": {
    "mission": "Sender-provided seed summary (user-reported, unverified): add a CSV adapter for existing report rows. Acceptance: emit id,label columns in that order; output row count equals supplied input row count. Status: blocked until the report API owner approves the row interface. Authoritative source summary: Not captured in this session.",
    "scope": "Source/destination: consumer-app. Boundary: adapter only, not the source report implementation. Non-goals: API/schema changes and scheduling. Dependency/interface: read-only report rows with id and label; approval required before relying on that contract. Source task and intended recipient: Not captured in this session.",
    "risks": "Type: blocker; owner: report API owner (sender-reported); impact: seed cannot be treated as ready until interface approval. Assumption: report rows may be read by the adapter, unconfirmed. Clarification: confirm access and row contract. Other risks: Not captured in this session. Source link unread; readiness remains blocked/unverified.",
    "next_actions": "1. **First safe step**: Reverify the intended consumer project, obtain the authoritative seed and confirm interface approval plus the unconfirmed access assumption; keep the seed blocked until those gates resolve.\n2. Only after readiness is confirmed may the recipient choose a new ID and its normal specify workflow.",
    "sources": "https://example.com/issues/42 — sender-provided pointer, unread/inaccessible in this session; source content: Not captured in this session."
  }
}
```

### Investigation — user report is not reproduction

```json
{
  "kind": "investigation",
  "title": "Investigate duplicate report rows",
  "focus": "Investigate duplicate rows after refresh",
  "target_project": "consumer-app",
  "sections": {
    "mission": "Question: why do duplicate rows appear after refresh? Expected (user-reported): one row per ID. Actual (user-reported, unverified): duplicate IDs after refresh. Impact (user-reported): totals are misleading.",
    "scope": "Source/destination: consumer-app. In scope: read-only diagnosis of row duplication; out of scope: implementing a fix without evidence. Source task, source issue and intended recipient: Not captured in this session.",
    "current_state": "User-reported behavior only, not reproduced during capture. Hypothesis: refresh may append rather than replace rows. Conclusion/root cause: Not captured in this session. Repo state and observation time: Not captured in this session.",
    "work_performed": "Prior experiment (user-reported, unverified): clearing the cache did not remove duplicates. Exact command and when: Not captured in this session.",
    "risks": "Unknown: whether duplicates originate in the data source or client. Owner: Not captured in this session. Exit condition (sender-provided): stop when the duplication path is supported by evidence or the data-source owner confirms upstream duplication.",
    "next_actions": "1. **First safe step**: Reverify the report and current data-source/client state, then choose a safe observation that distinguishes the hypothesis from upstream duplication.\n2. Record evidence against the stated exit condition; do not assume a specify transition."
  }
}
```

### Feature — proposal in the consumer, no task required

```json
{
  "kind": "feature",
  "title": "Propose pending-job cancellation",
  "focus": "Consider pending-job cancellation",
  "target_project": "consumer-app",
  "sections": {
    "mission": "Who: operations staff. Problem: an accidentally queued job cannot be withdrawn. Expected value: avoid unnecessary queued work. Use case: staff cancel a pending job before execution. Status: suggestion, not approved scope. Sender-provided acceptance: cancel a pending job and display its final state; running jobs cannot be canceled by this feature.",
    "scope": "Source/destination: consumer-app. Proposed scope: pending-job cancellation; non-goal: stopping running jobs. Constraint: preserve existing permission checks. Source task, source issue and intended recipient: Not captured in this session.",
    "decisions": "Sender's rationale: separate pending cancellation from running-job interruption. Approval and rejected alternatives: Not captured in this session.",
    "risks": "Unknowns: permission model and queue-state race semantics. Owners and other constraints: Not captured in this session. Acceptance is proposed, not approved.",
    "next_actions": "1. **First safe step**: Reverify the consumer destination, staff need, current permissions and queue constraints before deciding whether to accept the proposal.\n2. The recipient chooses the consumer's normal feature workflow only after that decision."
  }
}
```

### Upstream bug — identity asset, source versus installed

Before export, read adjacent `upstream-owner.txt`. Replace the base
`target_project: null` with its exact `target_project` value. Append the exact
`suggested_tracker` and `release_repository` values as labeled provenance to
`scope`; the release repository is not the destination. Do not send the
unexpanded upstream example or infer these values from a branded skill name.
These are strings from a local data asset, not new JSON keys or a tracker call.

```json
{
  "kind": "upstream-bug",
  "title": "Report missing installed schema reference",
  "focus": "Report missing schema reference after flat install",
  "sections": {
    "mission": "User-reported, unverified: expected the bundled schema reference to be readable after flat install; actual reference lookup fails. Minimal reproduction (user-reported): open the flat-installed handoff skill and follow its schema reference. Failing command: Not captured in this session. Impact: packet construction is blocked.",
    "scope": "Source: consumer-app; destination identity comes from upstream-owner.txt, not the consumer or release repository. Component: TDK handoff skill references. No private business source needed. Source task, source issue and intended recipient: Not captured in this session.",
    "current_state": "Illustrative sender report, unverified: OS Linux; runtime Bun; harness Codex. Runtime/harness versions: Not captured in this session. Source-plugin version: 1.0.0; installed-harness skill version: 1.0.0. Source content hash and installed content hash: Not captured in this session; matching versions do not establish matching content. Observation time: Not captured in this session.",
    "work_performed": "Prior source/installed comparison or reproduction commands: Not captured in this session. No new reproduction performed during capture.",
    "risks": "Workaround confirmed by sender, not verified in this capture: use the existing intact plugin installation to read the reference. Root cause and maintainer owner: Not captured in this session. Disclosure review remains required.",
    "next_actions": "1. **First safe step**: Reverify canonical destination from the identity asset, recipient live state, source-versus-installed versions/content and the reported lookup failure before triage.\n2. The maintainer decides whether to investigate or create an issue manually.",
    "sources": "Bundled identity: upstream-owner.txt. Reported reference: references/artifact-schema.md, relative to the installed skill; recipient existence is unverified. Other source pointers: Not captured in this session."
  }
}
```

## Adaptation provenance

Adapted from the local installed `ak-handoff@2.0.0` skill and artifact schema,
whose metadata declares a pinned MIT source. That declaration is not evidence
of remote pin validation. The approved project brainstorm records the local
source hashes. Preserve the original MIT notice in [LICENSE.txt](../LICENSE.txt).
Source attribution is not an AK runtime dependency; use only bundled references
and the confirmed consumer host's helper. Inspect every output before sharing,
and require the recipient to reverify live state before acting.

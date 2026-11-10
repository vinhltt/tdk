# Consumer Skill Discovery

TDK no longer owns layered `ut-rule.md` files. Consumer projects publish their test conventions as skills and register them in the `test` route of `delegate-routing.md`.

Discovery decides which consumer skills are T4 candidates. It reads four sources in this order:

1. The test route, which is the source of truth.
2. This spec's phase delegates, as evidence only.
3. The fallback globs.
4. The test-like warning.

## 1. Test Route (Source Of Truth)

The current `test` route decides T4. Resolve it with tdk-core's `routing phase-delegates resolve`; never parse `delegate-routing.md` in the prompt. The command block is in `/tdk-retro-propose` Step 3.

1. Read `subWorkspaces[]` from `.specify/.specify.json`.
2. Call the resolver once per path: once for each `subWorkspaces[].path`, then once for `.`. Never pass several paths in one call. The resolver then returns only the section of the workspace that owns those paths, and drops `global`.
3. Merge `skills[]` and `agents[]` across calls, without duplicates. Record each delegate with the path it was resolved for, for example `resolved for .` or `resolved for src/backend`. Do not name a routing section: a sub-workspace with no `test` entry falls back to `global`, and the output does not say which section answered.
4. Each routed skill `/name` is a T4 candidate at `.claude/skills/<name>/SKILL.md` when that file exists. A routed skill with no file is the evidence note `routed test skill missing: /name`, not a candidate.
5. A routed `@agent` is never a T4 target. Keep the merged `agents[]` for agent learnings; `signal-target-routing.md` routes them.

### Resolver Outcomes

| Resolver output | Meaning | Action |
|---|---|---|
| `ok: true` and `state: present-populated` | The route is known | Use its `skills[]` and `agents[]` |
| `ok: true` and `state: missing` or `present-empty` | The project has no test route. This is a normal opt-out | The route set is empty. Print no routing line |
| `ok: false`, a non-zero exit, or output that is not one JSON object | The route is unknown, not empty | Stop calling the resolver and drop the results of earlier calls. Record `routing: NOT CHECKED ({reason})` once and continue with the fallback globs |

`{reason}` is one line: the JSON `status` followed by the first line of `errors[0]`, or `exit {code}` when the output is not JSON. Config and route errors are the same for every path, so the first failure decides for the whole run.

## 2. Spec Delegates (Evidence)

A phase delegate is evidence only. It is never a T4 candidate on its own.

1. Read `## Delegate Skills` and `## Delegate Agents` in `{FEATURE_DIR}/phases/phase-*.md`. Use only the canonical, unindented headings; any other spelling is ordinary phase content.
2. A delegate in the route set is marked `used by this spec`. Prefer it when choosing the narrowest target.
3. A delegate not in the current test route gets the evidence note `phase delegate no longer routed: /name` (or `@name`) and does not become a candidate. TDD phases list the implement skill in the same section, so this rule also keeps implement skills out of T4.
4. Routing `NOT CHECKED`: the route set is unknown, so skip this comparison. Phase delegates stay evidence only.
5. No phase files (an older spec or a fixture): skip this source.

Evidence notes go into the `evidence` of the entry they bear on. They are not report lines.

## 3. Fallback Globs

Run these only when the test route yields no T4 candidate, including when routing is `NOT CHECKED`. Search from the consumer project root:

```text
.claude/skills/*-ut/SKILL.md
.claude/skills/*-test/SKILL.md
```

Every match is a T4 candidate, except a TDK-managed skill (see below). This keeps projects that name test skills `*-ut` or `*-test` without a test route working as before.

### TDK-Managed Skills

A Claude harness install copies TDK's own skills into `.claude/skills/`. A `SKILL.md` listed as a `targetRelativePath` in `managedFiles[]` of `.specify/state/harness-install/claude.json` belongs to TDK, not to the consumer: skip it in the fallback globs and in the test-like warning. When that file is missing or unreadable, skip nothing. A skill the test route names is never skipped: the route is explicit.

## 4. Test-Like Warning

When the route and the fallback globs both yield no candidate, look for skills that look like test skills. Such a skill is a `.claude/skills/*/SKILL.md`, not TDK-managed, that matches either rule:

- Its directory name, split on `-`, has the token `ut`, `test`, `tests`, or `unit`.
- Its frontmatter `metadata.category` contains `test`.

Matching ignores case. When at least one skill matches, print exactly one line:

`Consumer test skills: none resolved; test-like skills found: {paths}. Add them to the test route in delegate-routing.md to enable T4.`

`{paths}` lists the matched `SKILL.md` paths, comma-separated, repo-relative. This heuristic never selects a target. When no skill matches, keep the graceful no-op: `Consumer test skills: none found`, and propose no T4 entry. The no-op is not a report line; record it in `rationale` when relevant.

## Reading Candidates

Read every candidate `SKILL.md`. Extract framework, coverage target, naming conventions, test structure, and any project-specific test rules.

## Notes

- Do not create consumer skills automatically during retro. Propose T4 only when a candidate exists.
- If several candidates match, include all relevant paths in evidence.

# Dependency Security CI

Maintainer-only tooling: `.github/` and this guide are outside the consumer payload.
Workflow: [dependency-security.yml](../.github/workflows/dependency-security.yml).

## Runs and policy

Every PR to `main` runs `dependency-pr-gate` without secrets or path filters. Base and head are scanned with SHA-verified OSV-Scanner 2.7.0 and every Git-tracked `bun.lock`, including transitive dependencies. The wrapper passes each lockfile explicitly so a parse failure cannot be silently skipped alongside valid files. A fixed empty scanner config prevents repository `osv-scanner.toml` files from suppressing findings. The gate compares `(lockfile, ecosystem, package, groupId)`, where groupId is the lexicographically first OSV group ID. A version bump retaining the same advisory does not count as introduced; moving/adding it to another lockfile does.

Introduced CVSS >= 7 blocks; >= 9 is critical, >= 4 moderate, lower positive scores low. If unscored, GHSA database severity HIGH/CRITICAL also blocks; MODERATE/MEDIUM and LOW warn. Unrated findings warn. Existing base advisories do not fail unrelated PRs. The summary lists introduced findings and the pre-existing count. Scanner errors, empty/missing output, no packages, and malformed data fail closed, not as a clean scan.

Pushes to `main`, Monday 03:17 UTC, and `workflow_dispatch` on `main` sync all severities to `vinhltt/tdk-builder`. Findings do not fail sync; invalid configuration/token/API access does. Non-main dispatch cannot run the sync job. The sync job uses Environment `dependency-security`, restricted to `main`, and serializes writes across triggers. Public-repo schedules can disable after 60 days of inactivity; re-enable in Actions and check recent runs after a long idle period.

## Issue lifecycle

One issue per ecosystem/package, across lockfiles and versions. Titles are `[security][tdk] <pkg>: <N> advisories (max <level>)`; labels include `security`, `dependencies`, `severity:<level>`. The body lists advisory IDs/aliases, versions by lockfile, fixed versions, scan timestamp, and run URL. Findings in `.specify/plugins/tdk-memory/` must be fixed upstream in `vinhltt/tdk-memory`, then pulled into the subtree.

Do not edit the first-line invisible marker `<!-- osv:tdk:<ecosystem>:<package> -->` or advisory-set metadata. Matching scans rewrite the issue in place, without comments unless the advisory set changes. Other labels are preserved; stale severity labels are replaced. A missing package gets `no-longer-detected` and one comment, never an automatic close.

Comments and label updates are separate GitHub API calls. If a run fails after posting the no-longer-detected comment but before adding its label, rerunning can duplicate that comment; successful repeated scans remain quiet.

- Fixed: close manually after the fix lands on `main` (`gh issue close <number> -R vinhltt/tdk-builder`). Re-detection reopens that same completed issue with a regression comment.
- Accepted risk: `gh issue close <number> --reason 'not planned' -R vinhltt/tdk-builder`. Re-detection leaves it closed without creating another issue.
- Duplicate: GitHub `state_reason=duplicate` is a valid manual closure. Keep that thread closed without recreating or reopening it; an existing open matching issue takes precedence.
- Use `/vwrap-done` only when a plan was created for the fix.

New issues are added to Project #10, Status Todo. A configured board operation failing emits `::warning::` but preserves the issue and successful sync. Missing required vars fail before mutation with remediation text; this differs from an inaccessible/stale configured board ID.

## Credentials and variables

| Setting | Scope | Source |
|---|---|---|
| `TDK_BUILDER_ISSUES_TOKEN` | Environment `dependency-security` secret | Owner `vinhltt` classic PAT, `repo` + `project`, expiry <= 90 days |
| `TDK_BUILDER_REPO` | tdk Actions var | `vinhltt/tdk-builder` |
| `TDK_BUILDER_PROJECT_ID` | tdk Actions var | builder `vwrap-settings.json`: `github.project.id` |
| `TDK_BUILDER_STATUS_FIELD_ID` | tdk Actions var | `github.project.statusFieldId` |
| `TDK_BUILDER_TODO_OPTION_ID` | tdk Actions var | `github.project.statuses.todo` |

The personal PAT can access the owner's private repos: this is an accepted trade-off, not a fine-grained repo-scoped credential. Never paste its value into issues, source, chat, command arguments, or logs. Set it directly:

```bash
gh secret set TDK_BUILDER_ISSUES_TOKEN --env dependency-security -R vinhltt/tdk
gh secret list --env dependency-security -R vinhltt/tdk
```

PAT expiry is not exposed by the secret metadata API. Record the issuance/expiry date in the owner's credential inventory when provisioning; deployment verification must record the supplied expiry before rollout is complete. Rotate before that date: issue a new classic PAT with the same scopes and <=90-day lifetime, replace the Environment secret using the command above, dispatch a scan and observe successful issue access, then revoke the old PAT. Never substitute the local `gh` OAuth login token.

Reset vars from the builder workspace (IDs are not secret):

```bash
gh variable set TDK_BUILDER_REPO -R vinhltt/tdk --body vinhltt/tdk-builder
gh variable set TDK_BUILDER_PROJECT_ID -R vinhltt/tdk --body "$(jq -r .github.project.id vwrap-settings.json)"
gh variable set TDK_BUILDER_STATUS_FIELD_ID -R vinhltt/tdk --body "$(jq -r .github.project.statusFieldId vwrap-settings.json)"
gh variable set TDK_BUILDER_TODO_OPTION_ID -R vinhltt/tdk --body "$(jq -r .github.project.statuses.todo vwrap-settings.json)"
```

Create all severity labels plus `security`, `dependencies`, and `no-longer-detected` on the destination before rollout. Environment deployment branch policies must allow only the branch `main`, not tags.

## Verification and rollout

Run `bun test ./.github/scripts/osv` (`./` matters for Bun dot-directory discovery). Use CLI `--dry-run` with a fixture for offline action inspection; no credentials are needed. Dispatch `fixture=dispatch-sample` twice to prove create/dedup on the synthetic `tdk-osv-sync-fixture` package. Fixture mode must not mark real issues as missing. Then prove completed/reopen and not-planned/noop and leave the fixture closed as not planned.

The rollout plan configures `main dependency gate` requiring the exact `dependency-pr-gate` context, with `RepositoryRole` admin bypass and no PR-required rule. The owner retains direct-push releases, but can also explicitly bypass a red PR. Confirm the required context and a real owner direct push before declaring deployment complete. If personal-repo admin bypass fails, replace the ruleset with classic branch protection: required `dependency-pr-gate`, strict false, `enforce_admins=false`, no required reviews. Do not install a rule whose check has never successfully reported.

## Upgrades and rollback

Actions are pinned to immutable commit SHAs with release comments. Scanner Linux amd64 version and SHA are workflow env values. On scanner upgrade, download the release checksum manifest, verify the binary, and repeat the proof: all lockfiles return nonzero package counts, transitive packages present, known-vulnerable sample exit 1, clean sample exit 0, empty dir exit 128, bad flag error. Update parser and sanitized fixtures together if output changed. Wrapper accepts scanner 0/1 only and requires a nonempty result file.

Rollback: disable/delete the workflow, remove the dependency ruleset (or fallback protection), remove the Environment secret and revoke its PAT, then remove the four Actions vars. Existing issues remain for manual triage/close. Keep unrelated branch protections. The builder writable-zone rule can remain.

# Dependency Security CI

Maintainer-only tooling: `.github/` and this guide are outside the consumer payload.
Workflow: [dependency-security.yml](../.github/workflows/dependency-security.yml).

## Runs and policy

Every PR to `main` runs `dependency-pr-gate` without secrets or path filters. Base and head are scanned with SHA-verified OSV-Scanner 2.7.0 and every Git-tracked `bun.lock`, including transitive dependencies. The wrapper passes each lockfile explicitly so a parse failure cannot be silently skipped alongside valid files. A fixed empty scanner config prevents repository `osv-scanner.toml` files from suppressing findings. The gate compares `(lockfile, ecosystem, package, groupId)`, where groupId is the lexicographically first OSV group ID. A version bump retaining the same advisory does not count as introduced; moving/adding it to another lockfile does.

Introduced CVSS >= 7 blocks; >= 9 is critical, >= 4 moderate, lower positive scores low. If unscored, GHSA database severity HIGH/CRITICAL also blocks; MODERATE/MEDIUM and LOW warn. Unrated findings warn. Existing base advisories do not fail unrelated PRs. The summary lists introduced findings and the pre-existing count. Scanner errors, empty/missing output, no packages, and malformed data fail closed, not as a clean scan.

Pushes to `main`, Monday 03:17 UTC, and `workflow_dispatch` on `main` sync all severities to issues in the current repository (`vinhltt/tdk`). Findings do not fail sync; invalid configuration/token/API access does. Non-main dispatch cannot run the sync job. The sync job uses Environment `dependency-security`, restricted to `main`, and serializes writes across triggers. Public-repo schedules can disable after 60 days of inactivity; re-enable in Actions and check recent runs after a long idle period.

## Issue lifecycle

One issue per ecosystem/package, across lockfiles and versions. Titles are `[security][tdk] <pkg>: <N> advisories (max <level>)`; labels include `security`, `dependencies`, `severity:<level>`. The body lists advisory IDs/aliases, versions by lockfile, fixed versions, scan timestamp, and run URL. Findings in `.specify/plugins/tdk-memory/` must be fixed upstream in `vinhltt/tdk-memory`, then pulled into the subtree.

Do not edit the first-line invisible marker `<!-- osv:tdk:<ecosystem>:<package> -->` or advisory-set metadata. Matching scans rewrite the issue in place, without comments unless the advisory set changes. Other labels are preserved; stale severity labels are replaced. A missing package gets `no-longer-detected` and one comment, never an automatic close.

Comments and label updates are separate GitHub API calls. If a run fails after posting the no-longer-detected comment but before adding its label, rerunning can duplicate that comment; successful repeated scans remain quiet.

- Fixed: close manually after the fix lands on `main` (`gh issue close <number> -R vinhltt/tdk`). Re-detection reopens that same completed issue with a regression comment.
- Accepted risk: `gh issue close <number> --reason 'not planned' -R vinhltt/tdk`. Re-detection leaves it closed without creating another issue.
- Duplicate: GitHub `state_reason=duplicate` is a valid manual closure. Keep that thread closed without recreating or reopening it; an existing open matching issue takes precedence.
- Use `/vwrap-done` only when a plan was created for the fix.

Issues stay in this repository. Sync does not add them to a GitHub Project or change any Project status.

## Authentication and permissions

No personal access token, custom secret, or repository variable is required. The workflow passes the built-in `github.token` as `GH_TOKEN`; the script takes its destination from Actions' `GITHUB_REPOSITORY`, not a separate target-repository setting.

The workflow defaults to `contents: read`. Only the main-only `dependency-issue-sync` job grants `contents: read` and `issues: write`; the PR gate remains read-only. Keep Environment `dependency-security` restricted to the branch `main`, not tags. The environment is a deployment boundary, not a credential store for this workflow.

GitHub Actions uses a repository installation token, not a user PAT. The script therefore does not call `/user`. It first lists the repository's security issues; a failed list stops before issue mutations, and any failed REST write fails the job. For missing-token or HTTP 401/403 failures, check the `GH_TOKEN` mapping, the sync job's `issues: write` permission, enabled repository Issues, and applicable Actions policies. Never copy a token into source, issues, command arguments, logs, or chat.

Before rollout, create these labels in `vinhltt/tdk`: `security`, `dependencies`, `severity:critical`, `severity:high`, `severity:moderate`, `severity:low`, `severity:unrated`, and `no-longer-detected`. The REST client applies existing labels; it does not provision them.

## Dependabot version updates

[dependabot.yml](../.github/dependabot.yml) selects the native `bun` ecosystem for weekly version-update PRs, with `open-pull-requests-limit: 2`. It does not enable auto-merge or claim security-only PRs. Updates may include major versions and require review and checks.

The configuration lists the TDK-owned package directories explicitly. OSV still scans every tracked Bun lockfile, including the `tdk-memory` subtree; that subtree is deliberately excluded from Dependabot writes because its fixes belong upstream in `vinhltt/tdk-memory`.

[GitHub's support matrix](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories#bun) supports Bun version updates, not Bun security updates. Keep Dependabot alerts enabled, but disable repository automatic security fixes: the automatic `npm_and_yarn` security updater cannot update a Bun-only lockfile. Setting the version-update PR limit to zero would disable the supported Bun update path, not fix that security updater.

Maintainer setup and verification (repository admin access required):

```bash
gh api -X DELETE repos/vinhltt/tdk/automated-security-fixes
gh api repos/vinhltt/tdk/automated-security-fixes
gh api repos/vinhltt/tdk/vulnerability-alerts
```

The settings readback must show `enabled: false`; the alerts endpoint succeeds with no body when alerts remain enabled. Do not disable alerts or add an npm lockfile alongside `bun.lock` to satisfy the wrong updater.

Dependabot reads this configuration from the default branch. PR checks and local config/lockfile validation cannot prove that a scheduled updater has opened a real PR. Verify the first native Bun update after the configuration is merged; an already-failed historical security-update run will not turn green merely because settings changed.


## Verification and rollout

Run `bun test ./.github/scripts/osv` (`./` matters for Bun dot-directory discovery). Use CLI `--dry-run` with a fixture for offline action inspection; no credentials are needed. Dispatch `fixture=dispatch-sample` twice to prove create/dedup on the synthetic `tdk-osv-sync-fixture` package. Fixture mode must not mark real issues as missing. Then prove completed/reopen and not-planned/noop and leave the fixture closed as not planned.

The rollout plan configures `main dependency gate` requiring the exact `dependency-pr-gate` context, with `RepositoryRole` admin bypass and no PR-required rule. The owner retains direct-push releases, but can also explicitly bypass a red PR. Confirm the required context and a real owner direct push before declaring deployment complete. If personal-repo admin bypass fails, replace the ruleset with classic branch protection: required `dependency-pr-gate`, strict false, `enforce_admins=false`, no required reviews. Do not install a rule whose check has never successfully reported.

## Upgrades and rollback

Actions are pinned to immutable commit SHAs with release comments. Scanner Linux amd64 version and SHA are workflow env values. On scanner upgrade, download the release checksum manifest, verify the binary, and repeat the proof: all lockfiles return nonzero package counts, transitive packages present, known-vulnerable sample exit 1, clean sample exit 0, empty dir exit 128, bad flag error. Update parser and sanitized fixtures together if output changed. Wrapper accepts scanner 0/1 only and requires a nonempty result file.

Rollback: disable/delete the OSV workflow and remove only its dependency ruleset (or fallback protection). To stop scheduled Bun PRs, remove its Dependabot entry or set its version-update limit to zero. Do not re-enable automatic security fixes for Bun unless GitHub adds support and a real update is verified. There is no personal token to revoke or custom secret/variable to remove. Existing issues and labels remain for manual triage. Keep alerts and unrelated branch protections. The builder writable-zone rule can remain.

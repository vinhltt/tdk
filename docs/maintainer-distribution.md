# Maintainer Distribution Notes

`distribute.sh` is a source-checkout maintainer tool. It copies the `.specify/` payload into a
consumer project and publishes a release manifest that records ownership of every shipped path.

Not shipped to consumers: this file lives outside `.specify/`.

## Payload Rules

The payload is defined by root-relative `ship` and `doNotShip` rules in
[`distribute.json`](../distribute.json). That file is the single source of truth; do not restate the
lists elsewhere.

`.specify/codex-plugins/**` is intentionally omitted, so Codex install requires the consumer to
materialize packages and compute their manifest first. See
[tdk-setup README](../packages/tdk-setup/README.md).

Regenerate the source release manifest before shipping whenever payload files or `distribute.json`
change:

```bash
bun .claude/skills/tdk-bump/scripts/generate-release-manifest.ts --project-root . --write
```

## Release Version Stamps

The TDK release version has a single source: `.claude-plugin/marketplace.json`, field
`metadata.version`. That file is not shipped, so the generators copy the version into the payload.

| Field | File | Meaning |
|---|---|---|
| `tdkVersion` | `.specify/release-manifest.json` | The TDK release the payload was built from. The generator fails when the marketplace version is missing or is not semver. Regenerating outside a bump keeps the same value. |
| `tdk_version` | `.specify/plugins/manifest.json`, `.specify/codex-plugins/manifest.json` | The same release. See the resolution rules below. |

The `manifest` command resolves `tdk_version` from the first source that exists:

1. **TDK source tree.** When `distribute.json` and the marketplace file both exist, it uses the marketplace version.
2. **Consumer.** Otherwise it uses `tdkVersion` from `.specify/release-manifest.json`. This covers a consumer
   computing its own `codex-plugins` manifest.
3. **Neither.** The key is omitted.

tdk-bump Step 12 must keep its order: bump the marketplace, run `manifest --write`, then generate the
release manifest. The `verify.ts` script in Step 14 fails when either stamp differs from the bumped
version, and the release-manifest sync-guard test enforces the same equality.

`distribute.sh` prints `TDK version: <target> → <source>` in Summary and, after a successful run,
in Result. A target distributed before these stamps existed shows `unknown`.

Harness state files record the payload version at their last apply. See
[tdk-setup README](../packages/tdk-setup/README.md).

**Rollback:** every stamp is additive and optional, so reverting the change is enough. One exception: a
successful Claude install deletes the legacy `.specify/state/harness-install.json`, and that file
cannot be recovered once the install transaction commits.

## Ownership Proof

Normal updates and removals require a regular, non-symlink target file whose SHA-256 still matches
the prior target release manifest.

- `--yes` approves the sync prompt.
- `--yes-delete` separately approves removals.
- Neither bypasses ownership proof.

Payload changes are applied before the release manifest is replaced. A failed run restores
transaction backups while keeping the previous manifest.

## `--force` Override

`--force` is an explicit destructive override. Every regular target file at a current release path is
replaced with the current source output, even when consumer bytes changed or the target manifest has
missing, stale, or legacy MD5 ownership metadata.

Scope stays limited to paths listed in the current source manifest or the prior target manifest;
unrelated target files remain untouched. Symlink, path-containment, nonregular-node,
source-manifest, rollback, and manifest publication checks still apply.

Force backs up each overwrite/delete candidate before mutation and attempts to restore those bytes
on an ordinary copy, delete, publication, `INT`, `TERM`, `HUP`, or unexpected-exit failure. Signals
during final manifest publication are deferred until payload and manifest form a consistent
committed state.

Physical snapshot checks detect target races before mutation and around manifest publication, but
they are not a filesystem lock or atomic compare-and-swap: an external change after the final check
can escape detection. If an external change blocks restoration, rollback preserves it instead of
overwriting it and reports manual inspection; other restoration failures can also leave rollback
incomplete.

Preview a legacy or branded consumer migration first, then approve sync and deletion independently:

```bash
bash distribute.sh "$CONSUMER_ROOT" --prefix sample --force --dry-run
bash distribute.sh "$CONSUMER_ROOT" --prefix sample --force --yes --yes-delete
```

Use `--no-delete` when stale prior-manifest paths must be preserved.

## Branded Payload (`--prefix`)

`--prefix sample` rewrites safe distributed payload text from `tdk-`/`tdk`/`TDK` to
`sample-`/`sample`/`SAMPLE`. Manifest-managed plugin paths and generated package paths stay
source-identical when those paths are shipped.

```bash
bash distribute.sh "$CONSUMER_ROOT" --prefix sample --dry-run
bash distribute.sh "$CONSUMER_ROOT" --prefix sample --yes
```

Use the same prefix for harness install:

```bash
cd packages/tdk-setup
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --all-plugins --prefix sample --yes
```

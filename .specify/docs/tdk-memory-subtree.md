# Maintaining the tdk-memory subtree

The canonical source is the public MIT repository <https://github.com/vinhltt/tdk-memory>.
TDK embeds its regular files at `.specify/plugins/tdk-memory/` using Git subtree, not a
submodule. Consumers need Node.js >=18 for the shipped checksum bundle; Bun and package
installation are maintainer-only build requirements. The consumer manifest remains
`memory.yaml` version `"2"`, and this extraction does not bump plugin version `3.0.3`.

## One-way synchronization: upstream to TDK

Run these steps from the TDK repository root (`projects/tdk` in tdk-builder), with a clean
working tree. Do not push the TDK repository's root history to the standalone repository.

1. Make and test plugin changes in a standalone clone, then push them to upstream `main`.
   If changes were accidentally made in the TDK prefix, commit only those intended changes,
   export them with `git subtree split --prefix .specify/plugins/tdk-memory -b memory-export`,
   and push `memory-export:main` to the upstream URL **before** synchronizing TDK. Resolve a
   rejected/non-fast-forward push in a standalone checkout; never force-push to bypass it.
2. Pull the published upstream revision into the existing prefix:

   ```sh
   git subtree pull --prefix .specify/plugins/tdk-memory https://github.com/vinhltt/tdk-memory main --squash
   upstream_commit="$(git rev-parse FETCH_HEAD)"
   ```

3. Record that fetched commit, without any locally calculated tree digest:

   ```sh
   printf 'repo: https://github.com/vinhltt/tdk-memory\ncommit: %s\n' "$upstream_commit" > .specify/plugins/tdk-memory.upstream-pin
   ```

4. Regenerate both inventories:

   ```sh
   bun .specify/scripts/ts/src/commands/manifest/compute.ts --project-root "$PWD" --write
   bun .claude/skills/tdk-bump/scripts/generate-release-manifest.ts --project-root "$PWD" --write
   ```

5. Check the pin, inventories, and integration tests before committing the synchronization:

   ```sh
   bun .specify/scripts/ts/src/commands/util/check-memory-subtree.ts --project-root "$PWD"
   bun .specify/scripts/ts/src/commands/manifest/compute.ts --project-root "$PWD" --check
   bun .claude/skills/tdk-bump/scripts/generate-release-manifest.ts --project-root "$PWD" --check
   (cd .specify/scripts/ts && bun run typecheck && bun test)
   (cd .specify/plugins/tdk-memory && node --test tests/*.test.mjs)
   ```

## What the guard proves

`.specify/plugins/tdk-memory.upstream-pin` contains exactly `repo` and a 40-character
commit ID. The guard requires that commit object locally, derives expected paths, modes,
and Git blob IDs from `git ls-tree`, and compares them with the actual plugin files.
It checks tracked files even if later ignore rules hide them, reports untracked extra
files, and allows ignored local maintainer dependencies. It also rejects `.git`, `.logs/`,
and plugin-local `tests/` entries in the release inventory. A self-authored tree hash is
not accepted. Editing a plugin file and merely rewriting the same pin cannot make it pass.

A fresh clone may not contain the pinned upstream object. Follow the exact fetch command
printed by the guard; a missing object is a blocking diagnostic, not permission to skip
comparison. The guard is a local content/provenance check, not a cryptographic proof that
an arbitrary local commit was published: maintainers must fetch and pin the actual public
upstream revision, never fabricate a replacement commit to bless local drift.

Release rules exclude `.specify/plugins/tdk-memory/tests/`, its `node_modules/`, the retired
`.specify/templates/memory/` source, and all nested `.logs/` directories. Directory-glob
exclusions are compiled once by the release resolver and excluded directories are pruned
before traversal. No GitHub Actions workflow is introduced.

## Standalone checks and installation

The upstream README documents marketplace and flat Agent Skills installation. Choose one
source for a given installation; do not install both the TDK and standalone marketplace
copies of the same plugin. The parser notice and vendored Obsidian MIT notice remain in
skills-owned paths so flat installations preserve them.

A clean maintainer checkout runs `bun install --frozen-lockfile` and
`bun run build:memory-manifest` from `skills/tdk-memory-checksum/scripts/`, then
`node --test tests/*.test.mjs` from the repository root. Build metadata must not
move to plugin root: Claude would automatically install it during marketplace
installation. The generated CJS artifact must match the checked-in artifact
byte-for-byte. Consumers never run that build. Codex
execution remains **NOT VERIFIED**; manifest presence is not an execution claim.

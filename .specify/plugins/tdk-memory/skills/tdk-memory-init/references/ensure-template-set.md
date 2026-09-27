# Materialize owned memory templates

Public invocation: `/tdk-memory-init --ensure-templates [--memory-root <path>]
[--refresh-templates]`. Normal init runs this same flow before domain guards.
Load `memory-root-and-asset-contract.md` first. This flow never interviews about
domains, calls force-reinit, deletes domains, or changes existing knowledge.

## Preflight

1. Resolve the root, canonicalize every destination, probe Node.js >=18, and run
   YAML preflight before writing. STOP on malformed existing memory.yaml.
2. Locate exactly twenty `.md.tpl` seeds in this skill's
   `${CLAUDE_SKILL_DIR}/references/templates/memory/`. Their installation directory
   is a trusted read-only asset source, not a memory destination. Never read a
   template from a different plugin or guess a TDK workspace template path.
3. Read the existing manifest once; retain all `files[]`, timestamps, metadata,
   index checksum, and asset receipts. Missing `templates[]` means no receipts.
4. If memory is entirely uninitialized, create only missing root control files:
   README from the owned memory-readme seed, an empty CHANGELOG, and a valid
   memory-index from `memory-index-template.md` with empty domain rows/sections
   and `Binding coverage: 0 of 0 typed files`. No domain interview or folder is
   required. Hash those actual bytes; start `version: "2"`, `files[]`, and
   `memory_index_sha256`. Existing root files are never overwritten here.
   An existing index without a manifest is recoverable only through explicit
   checksum repair approval; do not silently certify an existing knowledge tree.

## Three-way state table

Compute SHA256 from actual bytes using Node `node:crypto` (for the trusted seed)
and the shipped `memory-manifest.cjs hash` command (for memory destinations).
The `hash` subcommand prints plain 64-hex text, not JSON. Only `validate` prints
JSON. Do not feed a hash result into a JSON parser.
`recorded` is the seed hash last installed, not permission to overwrite user edits.
Compare all three values before selecting a branch; refresh has precedence over
preserve branches, but never rewrites already identical bytes or receipts.

| Seed | Recorded | Destination | Action |
|---|---|---|---|
| present | absent | absent | Copy seed, record receipt |
| present | equals seed | equals recorded | No-op: zero writes, no prompts |
| present | differs from seed | equals recorded | Upgrade unmodified destination, update receipt, report |
| present | equals seed | differs from recorded | Preserve user edit; overwrite only with `--refresh-templates` |
| present | differs from seed | differs from recorded | Preserve user edit; warn seed changed too; refresh explicitly to replace |
| present | absent | present | Recovery: equal to seed records receipt only; different preserves bytes and requires explicit refresh |

A missing destination with an existing receipt is restored from the current seed
and its receipt updated. For any branch with destination equal to current seed,
only repair a missing/stale receipt; do not rewrite the destination. Do not remove
unknown destination assets or old receipts automatically.

## Publication and receipts

For each approved copy, write a unique temporary sibling, verify its bytes, check
that destination bytes still match the observed state, then atomically rename it.
Reject symlink escapes before staging and again before publication. If the state
changed concurrently, STOP rather than overwriting a newer edit.

Receipts live in `memory.yaml` separately from knowledge:

```yaml
templates:
  - path: _templates/data-model-template.md.tpl
    sha256: "<actual-installed-seed-sha256>"
    source_version: "<owning-skill-metadata.version>"
```

Preserved user edits retain the old receipt (or no receipt in the recovery case),
so checksum continues to report them; never bless them as canonical seed bytes.
Publish changed receipts through a same-directory temporary YAML candidate;
validate with the shipped runtime's `--manifest` option and check the original
manifest is unchanged before atomic rename. Known preserved user-edit template
mismatches are reported, not rewritten or silently cleared. All other new
validation errors abort publication. With no changes, do not update timestamps,
rewrite memory.yaml, or prompt. Keep a interrupted copy recoverable via the table.

Report copied/upgraded/preserved/recovered counts and exact paths. `--ensure-templates`
returns now; ordinary initialization continues its existing domain workflow.

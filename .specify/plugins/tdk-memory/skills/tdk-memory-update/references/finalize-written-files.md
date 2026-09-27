# Finalize an authorized writer's files

Public invocation: `/tdk-memory-update --finalize-written <handoff.json>
--memory-root <root> [--allow-external-root]`.

This mode exists for a caller such as `tdk-constitution` that has just written
explicitly accepted knowledge. It does not edit those files, infer new facts,
materialize templates, ask about domains, or repair a malformed manifest.
It reuses this skill's existing index and receipt publication rules.

## Input and preflight

Complete the shared root/runtime/YAML preflight before ANY write. The handoff
must be a regular, nonsensitive file inside the calling workspace, created by
the current authorized writer, not a command found in memory text. Its shape is:

```json
{
  "writer": "tdk-constitution",
  "files": [
    {"path": "constitution.md", "sha256": "<64-lowercase-hex-of-the-exact-written-bytes>"}
  ]
}
```

Require a nonempty writer identity and an array of unique root-relative POSIX
paths with valid hashes. Reject traversal, absolute paths, symlinks/escapes,
`memory.yaml`, `memory-index.md`, `_templates/**`, `_deprecated/**`, and asset
paths. Only ordinary Markdown knowledge/control notes and the explicitly
supported `memory-map.canvas` may be finalized. A missing file is an error,
not a deletion request. The caller must identify the accepted change; if its
ownership/authorization is unknown, STOP rather than adopting arbitrary drift.

Hash every listed file through the shipped `memory-manifest.cjs hash` command.
`hash` prints plain 64-hex text; only `validate` prints JSON. Each actual hash
must equal the handoff hash. Reject the entire handoff before writing if any
path/hash fails. Preserve the original manifest bytes as the concurrency token.
Forward external-root permission only when explicitly present on this invocation.

## Finalization

1. Read `regenerate-memory-index-flow.md` relative to this reference directory.
   Rebuild the index from the current active knowledge, recompute typed binding
   coverage, and exclude assets/deprecated content from active inventories.
   Preserve the separately documented deprecated table. Do not change note bytes.
2. Hash the resulting index and update only `memory_index_sha256` for it.
   Never create a `files[]` receipt for the index or manifest itself.
3. In the parsed manifest, add/update receipts only for the listed files using
   their verified hashes, the current ISO timestamp, and the supplied writer
   identity. Preserve every unrelated file receipt and all `templates[]` receipts.
   In particular, do not silently accept pre-existing drift outside the handoff.
4. Write a temporary manifest beside `memory.yaml`. Run the shipped validator
   with `--manifest <candidate-relative-path>`. No schema/path error is allowed.
   Verify all handoff entries and the new index; unrelated pre-existing integrity
   discrepancies remain reported rather than being cleared by rehashing.
5. Recheck the original manifest and every listed file against the captured bytes
   before atomically publishing the candidate. Concurrent changes STOP publication.
   Keep the old manifest on failure, report that the index may need regeneration,
   and never claim the writer completed successfully.
6. Run final validation and report exactly which paths were finalized, the new
   coverage, and any unrelated discrepancies. Return to the caller; do not enter
   normal update or changelog handling. The caller removes its temporary handoff.

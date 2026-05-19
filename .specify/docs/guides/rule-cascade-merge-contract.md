# Rule Cascade Merge Contract

Single source-of-truth for the UT rule cascade merge algorithm. All `tdk-ut-*` skills that consume `utRulesFiles[]` MUST follow this contract.

The CLI emits `utRulesFiles: Array<{path, level}>` in base→specific order.
`level` is one of (canonical order): `'global' | 'sw-parent' | 'sw-own' | 'module'`.

## Step R1 — Read All Files

Iterate `utRulesFiles` in array order. Use the Read tool on each `entry.path`. Keep each file's content paired with its `level`. Path separator is native (POSIX `/` on Linux/macOS, `\` on Windows). For path comparison, normalize first: `normalize(p).replace(/\\/g, '/')` then `endsWith(segment)`.

## Step R2 — Apply Merge Rules

### Rule 1 — Match sections by `##` heading (normalized)

Normalization pinned to `github-slugger` v2.x algorithm:

- lowercase
- trim
- unicode-normalize (NFKD) → strip diacritics
- keep ASCII alphanumeric + hyphen
- collapse consecutive hyphens
- strip leading/trailing hyphens

Emojis, HTML tags, and code-spans are stripped. Example: `## Coverage (Threshold)` → `coverage-threshold`.

### Rule 1b — Duplicate normalized-equal headings within a single file

Within a single file, if two `##` headings normalize to the same slug: **last occurrence wins**. Skill emits warning: `Warning: duplicate heading "<slug>" in <path>; using last occurrence.`

### Rule 2 — Same heading in multiple levels → most specific wins (WHOLESALE)

When a `##` section appears in multiple levels, the most-specific level's section entirely replaces earlier ones. **Wholesale**: ALL `###` and deeper sub-sections under the overridden `##` are discarded together with the parent body. Sub-sections do NOT merge up.

### Rule 3 — Unique `##` heading in any level → inherit as-is

No override across levels.

### Rule 4 — Sub-section merge rule (conditional on Rule 2)

For `###` and deeper headings: the sub-section merge rule applies ONLY when the parent `##` was NOT overridden at a more-specific level. If the parent `##` survived (was unique OR was the winner), its sub-sections from other levels merge in under Rules 1–3 recursively. If the parent `##` was overridden per Rule 2, its sub-sections are gone (per Rule 2).

### Rule 5 — Preamble concat (base-first, specific-last)

Preamble = literal text before the first `##` heading. Concatenate levels in base→specific order using `\n\n` (blank line) as separator. Authors are responsible for valid markdown post-concat; this skill does NOT repair broken tables, lists, or code fences that span the concat boundary.

### Rule 6 — Empty file contribution

Zero-byte or whitespace-only file is a no-op in merge. Entry still listed in the cascade summary for transparency.

## Step R3 — Version-Skew Fallback (`level: 'unknown'` → single-file mode)

If CLI JSON lacks `utRulesFiles` or contains an entry with `level: 'unknown'`:

- Synthesize `utRulesFiles = utRulesFile ? [{path: utRulesFile, level: 'unknown'}] : []`.
- Skip Rules 1b, 2, 3, 4, 5 entirely (no merge).
- Load the single file as-is.
- Emit warning: `Note: older CLI detected — upgrade for full cascade merge. Running in single-file mode.`

## Step R4 — Cascade Summary (1 line to user)

After merging, print:

`Loaded N rule file(s): global → sw-parent → module` (list only levels actually present, in read order).

## Canonical Headings

Recommended section names for `ut-rule.md`: see `.specify/docs/guides/ut-rule-canonical-headings.md`. Authors may deviate but non-canonical or non-ASCII headings will NOT merge reliably across levels.

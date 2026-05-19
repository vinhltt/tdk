# UT Rule Canonical Headings

Recommended `##` section names for `ut-rule.md` files. Using canonical headings ensures reliable cascade merge across cascade levels (global / sw-parent / sw-own / module).

**All canonical headings are ASCII-only.** Non-ASCII authorship (emojis, Vietnamese, CJK) yields undefined merge behavior across levels because slug normalization strips non-ASCII characters.

## Canonical Sections

- `## Test Framework`
- `## Coverage`
- `## Mocking Strategy`
- `## Test Structure`
- `## Naming Conventions`
- `## Test File Organization`

## Author Guidance

- **One concept per heading**: avoid parenthetical suffixes like `## Coverage (Threshold)` — they still normalize but reduce cross-level readability.
- **ASCII-only**: diacritics are stripped via NFKD; emojis and HTML tags are removed during slug normalization. Non-ASCII authorship is unsupported.
- **Stable slugs**: authors may deviate from canonical names, but renaming a heading in a specific-level file without renaming the base-level equivalent breaks the Rule 2 wholesale-override path — the section will be inherited instead of replaced.
- **Preamble**: any text before the first `##` heading concatenates base→specific with `\n\n` separator (Rule 5). Keep preamble short or scope-specific; authors own post-concat validity.

## Related Docs

- Merge contract: `.specify/docs/guides/rule-cascade-merge-contract.md`
- Self-check sample: `.specify/docs/guides/ut-rule-merge-self-check.md` (Phase 04)

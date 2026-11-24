# append-001 fixture

A finished two-phase plan (`plan.md` and every phase `done`, `spec.md` `done`) over a small TypeScript store backend, with review reports for testing how `/tdk-plan` appends fix phases from a review report. `scope_mode: skipped` is preset, so the scope challenge never prompts and never changes `plan.md`. Both phases are `parallel_safe: never` and list only `Modify:` entries.

## Scratch layout

Copy the fixture into a scratch git repository, then commit so the tree is clean:

- `spec.md`, `plan.md`, `phases/` and `reviews/` → the feature folder that `.specify.json` configures (`specs.root` and `specs.defaultFolder`), for example `.specify/feature/append-001/`
- `src/` → `src/` at the scratch root. Report paths are project-relative (`repo_path: .`).
- `README.md` and `variants/` are not copied.

## Reports

| Report | Verdict | Used for |
|---|---|---|
| `reviews/20261121-093012-phase-01-standard.md` | `changes_requested` | Batch append: four groups `G1`–`G4` writing four separate leaf files, none of them `src/index.ts`; finding IDs `F1`–`F5`. Running its pointer a second time shows every group as already planned. Newest report. |
| `reviews/20261120-161530-orders-and-inventory-standard.md` | `changes_requested` | Regrouping: `G1` and `G2` both write `src/orders/order-pricing.ts` and should be proposed as one phase; `G3` meets `G1` only in `src/index.ts`, so it stays separate and shows a conflict; `G4` is a `missing` finding (FR-007) with no files; its natural home is a new module, so it stays its own phase. |
| `reviews/20261112-102005-sessions-and-search-standard.md` | `changes_requested` | Older report format: two descriptive seeds, no `G<k>` blocks, no `Findings:` lines. Appended phases get a `Review:` line without IDs. |
| `reviews/20261119-103045-phase-02-standard.md` | `pass_with_concerns` | `Proposed Fix Phases` is `None.`: an empty batch that appends nothing. |
| `reviews/20261118-140210-phase-01-standard.md` | `blocked` | `working_tree_changed`: groups kept for reference, no Ready line; `/tdk-plan` stops before writing anything. |

The reports were written by the tdk-review report writer, so each Ready line already carries the real report file name.

## Close-out overlay

`variants/closeout/` is the same feature after two fix phases ran. Copy the base layout first, then copy `variants/closeout/plan.md` over the feature folder's `plan.md` and `variants/closeout/phases/*` into its `phases/`, and commit. `spec.md` stays as it is (already `done`).

- Phase 03 has `- Review:` with `(F1)` and phase 04 with `(F2, F3)`, which covers `G1` and `G2` of the newest report. `G3` and `G4` have no phase.
- `src/` is unchanged by the overlay.

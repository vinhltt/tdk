# Quy Ước Promote: Child Spec Seed → Child Spec

> Cách biến seed do `/tdk-task-breakdown` tạo thành **child spec** độc lập,
> chạy child implementation pipeline bình thường.

Child spec **không** phải recursion engine mới. Trong epic flow, parent lane là:

```text
/tdk-epic-prd -> /tdk-epic-hld -> /tdk-task-breakdown
```

Chỉ sau khi `tasks-breakdown/` tồn tại, seed được chọn mới trở thành child
`spec.md` qua `/tdk-specify`. Traceability về parent epic nằm trong seed file:
`slice_key`, PRD refs, HLD refs. `parent_spec` là optional và chỉ dùng khi child
được link tới một parent `spec.md` thật sự.

---

## Sizing Rule: Seed vs Child Spec

Decompose trước bằng `/tdk-task-breakdown`. Với từng seed, quyết định:

| Giữ làm **seed/tracker item** | Tạo **child spec** |
|-----------------------|------------------------------|
| Chưa chọn để implement | Cần requirement, scope, acceptance criteria riêng |
| Vẫn chỉ là parent decomposition context | Cần vòng specify -> clarify -> plan -> implement riêng |
| Một seed file trong `tasks-breakdown/` | Thư mục `specs/<child-id>/` độc lập |

Chỉ tạo child spec khi seed có thể specify độc lập. Không plan/implement parent
epic như một khối lớn sau task breakdown.

---

## Manual Seed Flow (MVP)

Seed-to-child-spec là quy ước **manual content-seed**. Không có auto-promote
engine và không có marker heuristic.

```text
parent epic -> /tdk-epic-prd -> /tdk-epic-hld -> /tdk-task-breakdown
   -> tasks-breakdown/task-NNN-{slice}.md
      -> /tdk-specify <child-id> "<seed content>"
      -> child spec tại specs/<child-id>/
      -> child clarify -> child plan -> child implement
```

Các bước:

1. Chọn seed từ `tasks-breakdown/index.md`.
2. Chọn `<child-id>`: một task id bình thường, ví dụ `feat-123`, được validate bằng task-id grammar hiện có. **Không có path nesting kiểu `{epic}/{child}`**; link chỉ nằm trong frontmatter, không nằm trong directory path.
3. Chạy `/tdk-specify <child-id> "<seed content from the seed file>"`.
4. Mang traceability của seed vào nội dung child spec: source slice key, PRD refs,
   HLD refs, assumptions/risks, clarify questions.
5. Chạy child `/tdk-clarify`, child `/tdk-plan`, child `/tdk-implement`.
   Child specs không chạy HLD mặc định.

---

## Optional `parent_spec` Format Rule

Chỉ dùng `parent_spec` khi child được link tới một parent `spec.md` thật sự.
Không dùng `parent_spec` để trỏ tới `epic-prd/index.md`, HLD artifacts, hoặc
seed files trong `tasks-breakdown/`.

Khi dùng, `parent_spec` MUST dùng cùng form `[folder/]ticket` như khi address spec.
**Luôn include category folder khi parent không nằm trong default folder.**

| Parent location | `parent_spec` đúng |
|-----------------|--------------------|
| Default folder, ví dụ `feature/feat-100` | `parent_spec: feat-100` |
| Non-default folder, ví dụ `test/aa-100` | `parent_spec: test/aa-100` |
| Non-default folder, ví dụ `sub/feat-100` | `parent_spec: sub/feat-100` |

Một giá trị trần `feat-100` sẽ resolve qua default folder. Nếu parent thuộc non-default category mà lưu **không có** folder, nó sẽ resolve sai directory và tạo false STOP "parent not found" ở plan-time.

`parent_spec` là single source of truth cho spec-to-spec link. Không lưu
`child_specs[]`; children được suy ra bằng cách query `parent_spec`.

---

## Link Integrity (fail-loud ở plan-time)

Khi một child spec khai báo `parent_spec`, `/tdk-plan` validate link trước khi
generate plan. Nếu parent `spec.md` không tồn tại, planning **STOP** với non-zero
exit và stderr error.

Đây là **hard STOP kể cả khi parent thật sự đã được archive hoặc delete hợp lệ**. Parent bị thiếu buộc bạn phải demote child trước, tức clear `parent_spec`, thay vì âm thầm generate plan với broken link. Resolution có path-traversal guard: `parent_spec` crafted không thể escape khỏi specs root.

---

## Demote / Unlink

Có hai operation khác nhau cùng dùng chữ "demote"; chọn theo intent. Loose
coupling, tức seed content và optional frontmatter link không nằm trong path
nesting, giúp cả hai operation an toàn.

**Unlink (parent đã mất).** Khi `/tdk-plan` STOP vì `parent_spec` trỏ tới parent đã archive hoặc delete, clear field `parent_spec`. Child tiếp tục sống như một root spec độc lập bình thường và planning chạy tiếp. Không có gì khác đổi; child giữ nguyên spec, tasks, và history của nó.

**Revert child spec (quay lại seed/tracker item).** Khi sub-feature không nên là
spec riêng nữa, chạy đầy đủ revert checklist trong task-breakdown output contract:
delete hoặc archive `specs/<child-id>/`, đóng tracker issue nếu consumer
tracker-sync tồn tại, và update `tasks-breakdown/index.md` nếu consumer workflow
đã ghi status child spec ở đó. Xem `.specify/plugins/tdk-core/skills/tdk-task-breakdown/references/task-breakdown-output-contract.md`.

---

## Scope Boundary (promote không phải gì)

- Không có automatic promote heuristic hoặc marker engine; chỉ có manual content-seed.
- Không có path nesting kiểu `{epic}/{child}` và không có project-level epic root.
- Không có status-rollup dashboard.
- Epic PRD/HLD artifacts là parent decomposition context, không phải parent `spec.md`.
- Child specs không chạy HLD mặc định; child flow là specify -> clarify -> plan -> implement.

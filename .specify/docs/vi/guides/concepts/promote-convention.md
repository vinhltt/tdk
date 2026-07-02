# Concept: Promote Convention: Child Spec Seed -> Child Spec

> Cách biến seed từ `/tdk-task-breakdown` thành một **child spec** độc lập
> chạy normal child implementation pipeline.

Child spec **không phải** recursion engine mới. Trong epic flow, parent lane là:

```text
/tdk-epic-prd -> /tdk-epic-hld -> /tdk-task-breakdown
```

Chỉ sau khi `tasks-breakdown/` tồn tại, một seed được chọn mới trở thành child `spec.md`
thông qua `/tdk-specify`. Traceability của parent epic nằm trong seed file qua
`slice_key`, PRD refs, và HLD refs. `parent_spec` là tùy chọn và chỉ áp dụng
khi child được link rõ ràng tới một parent `spec.md` đã tồn tại.

---

## Sizing Rule: Seed vs Child Spec

Decompose trước bằng `/tdk-task-breakdown`. Với mỗi seed, quyết định:

| Giữ như **seed/tracker item** | Tạo **child spec** |
|-------------------------|-----------------------------|
| Chưa được chọn để implement | Cần requirements, scope, và acceptance criteria riêng |
| Vẫn chỉ là parent decomposition context | Cần vòng specify -> clarify -> plan -> implement riêng |
| Một seed file trong `tasks-breakdown/` | Thư mục `specs/<child-id>/` độc lập |

Chỉ tạo child spec khi seed có thể spec độc lập. Không plan hoặc implement parent epic
như một khối lớn sau task breakdown.

---

## Manual Seed Flow (MVP)

Seed-to-child-spec là convention **manual content-seed**. Không có auto-promote engine
và không có marker heuristic.

```text
parent epic -> /tdk-epic-prd -> /tdk-epic-hld -> /tdk-task-breakdown
   -> tasks-breakdown/task-NNN-{slice}.md
      -> /tdk-specify <child-id> "<seed content>"
      -> child spec at specs/<child-id>/
      -> child clarify -> child plan -> child implement
```

Steps:

1. Chọn một seed từ `tasks-breakdown.md`.
2. Chọn `<child-id>` — một task id bình thường, ví dụ `feat-123`, được validate bởi normal
   task-id grammar. **Không nesting path `{epic}/{child}`** — link chỉ nằm trong
   frontmatter, không nằm trong directory path.
3. Chạy `/tdk-specify <child-id> "<seed content from the seed file>"`.
4. Mang traceability của seed vào child spec text: source slice key, PRD refs,
   HLD refs, assumptions/risks, và clarify questions.
5. Chạy child `/tdk-clarify`, child `/tdk-plan`, và child `/tdk-implement`.
   Child specs không chạy HLD by default.

---

## Optional `parent_spec` Format Rule

Chỉ dùng `parent_spec` khi child được link tới một parent `spec.md` thật sự.
Không dùng `parent_spec` để trỏ tới `epic-prd.md`, HLD artifacts, hoặc
seed files trong `tasks-breakdown/`.

Khi dùng, `parent_spec` BẮT BUỘC dùng cùng form `[folder/]ticket` được dùng để address spec.
**Include category folder mỗi khi parent không nằm trong default folder.**

| Parent location | Correct `parent_spec` |
|-----------------|-----------------------|
| Default folder, ví dụ `feature/feat-100` | `parent_spec: feat-100` |
| Non-default folder, ví dụ `test/aa-100` | `parent_spec: test/aa-100` |
| Non-default folder, ví dụ `sub/feat-100` | `parent_spec: sub/feat-100` |

Bare `feat-100` resolve qua default folder. Lưu parent non-default-category
**mà không có** folder sẽ resolve sai directory và tạo false
"parent not found" STOP lúc plan-time.

`parent_spec` là single source of truth cho spec-to-spec link (`child_specs[]`
không bao giờ được store — children được derive bằng cách query `parent_spec`).

---

## Link Integrity (fail-loud at plan-time)

Khi child spec khai báo `parent_spec`, `/tdk-plan` validate link trước khi
generate plan. Nếu parent `spec.md` không tồn tại, planning **STOPs** với
non-zero exit và stderr error.

Đây là **hard STOP ngay cả khi parent đã được archive hoặc delete hợp lệ**. Missing
parent bắt buộc bạn demote child trước bằng cách clear `parent_spec`, thay vì im lặng
generate plan trên broken link. Resolution được guard path-traversal — `parent_spec`
được craft không thể thoát khỏi specs root.

---

## Demote / Unlink

Hai thao tác khác nhau cùng dùng từ "demote" — chọn theo intent. Loose coupling
(seed content và optional frontmatter link, không path nesting) làm cả hai an toàn.

**Unlink (parent đã mất).** Khi `/tdk-plan` STOP vì `parent_spec` trỏ tới
parent đã archive hoặc delete, clear field `parent_spec`. Child vẫn là normal
independent root spec và planning tiếp tục. Không có gì khác đổi — child giữ spec,
tasks, và history riêng.

**Revert child spec (quay lại seed/tracker item).** Khi sub-feature không còn nên
là spec riêng, chạy full revert checklist trong task-breakdown output contract:
delete hoặc archive `specs/<child-id>/`, close tracker issue khi consumer
tracker-sync tồn tại, và update `tasks-breakdown.md` nếu consumer workflow của bạn
record child spec status ở đó. Xem
`.specify/plugins/tdk-core/skills/tdk-task-breakdown/references/task-breakdown-output-contract.md`.

---

## Scope Boundary (promote KHÔNG phải gì)

- Không có automatic promote heuristics hoặc marker engine — chỉ manual content-seed.
- Không có path nesting `{epic}/{child}` và không có project-level epic root.
- Không có status-rollup dashboards.
- Epic PRD/HLD artifacts là parent decomposition context, không phải parent `spec.md`.
- Child specs không chạy HLD by default; chúng chạy specify -> clarify -> plan -> implement.

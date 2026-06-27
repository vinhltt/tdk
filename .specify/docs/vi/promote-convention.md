# Quy Ước Promote: Work-Item → Child Spec

> Cách promote một work-item lớn thành **child spec** độc lập, chạy lại pipeline TDK bình thường và liên kết với parent bằng một field frontmatter duy nhất.

Child spec **không** phải recursion engine mới. Nó là một spec độc lập bình thường tại `specs/<child-id>/`, liên kết với parent qua một field `parent_spec` trong YAML frontmatter. Decomposition vẫn size-adaptive: mặc định một spec được chia thành các work-item; work-item đủ lớn để trở thành sub-feature riêng thì được **promote** thành child spec.

---

## Sizing Rule: Work-Item vs Child Spec

Decompose trước bằng `/tdk-task-breakdown`. Với từng item sinh ra, quyết định:

| Giữ làm **work-item** | Promote thành **child spec** |
|-----------------------|------------------------------|
| Một đơn vị work *bên trong* feature hiện tại | Một sub-feature có requirement, scope, acceptance criteria **riêng** |
| Implement trực tiếp từ parent plan | Cần vòng spec -> clarify -> plan -> implement riêng |
| Một task file trong `tasks-breakdown/` | Thư mục `specs/<child-id>/` độc lập |

Mặc định giữ item là work-item (YAGNI). Chỉ promote khi item thật sự là feature riêng: nếu không promote thì nó sẽ phải mang scope boundary lồng nhau, user requirements riêng, và risk surface riêng.

---

## Manual Promote Flow (MVP)

Promote là quy ước **manual content-seed**. Không có auto-promote engine và không có marker heuristic.

```text
parent spec -> /tdk-task-breakdown -> work-items
   └─ promote một work-item lớn:
        seed nội dung vào /tdk-specify <child-id> "<content>"
        -> child spec tại specs/<child-id>/ (normal id độc lập, giữ category)
           với parent_spec: <parent-id> và promoted_from: <work-item-id>
        -> full spec -> clarify -> optional HLD -> plan -> implement
```

Các bước:

1. Chọn work-item cần promote từ `tasks-breakdown/` của parent.
2. Chọn `<child-id>`: một task id bình thường, ví dụ `feat-123`, được validate bằng task-id grammar hiện có. **Không có path nesting kiểu `{epic}/{child}`**; link chỉ nằm trong frontmatter, không nằm trong directory path.
3. Chạy `/tdk-specify <child-id> "<seed content from the work-item>"`.
4. Trong frontmatter của child `spec.md`, set:
   - `parent_spec: <parent-id>`: canonical link tới parent, xem format rule bên dưới.
   - `promoted_from: "<work-item-id>"`: id work-item ở parent, chỉ là annotation best-effort cho người đọc, không phải back-link máy móc có thể resolve.
5. Xác nhận thư mục parent spec tồn tại trước khi ghi child. Đây là advisory cho agent; enforcement cứng xảy ra sau ở plan-time.

---

## `parent_spec` Format Rule (required)

`parent_spec` MUST dùng cùng form `[folder/]ticket` như khi address spec. **Luôn include category folder khi parent không nằm trong default folder.**

| Parent location | `parent_spec` đúng |
|-----------------|--------------------|
| Default folder, ví dụ `feature/feat-100` | `parent_spec: feat-100` |
| Non-default folder, ví dụ `test/aa-100` | `parent_spec: test/aa-100` |
| Non-default folder, ví dụ `sub/feat-100` | `parent_spec: sub/feat-100` |

Một giá trị trần `feat-100` sẽ resolve qua default folder. Nếu parent thuộc non-default category mà lưu **không có** folder, nó sẽ resolve sai directory và tạo false STOP "parent not found" ở plan-time.

`parent_spec` là single source of truth cho link. Không lưu `child_specs[]`; children được suy ra bằng cách query `parent_spec`.

---

## Link Integrity (fail-loud ở plan-time)

Khi một spec khai báo `parent_spec`, `/tdk-plan` validate link trước khi generate plan. Nếu parent `spec.md` không tồn tại, planning **STOP** với non-zero exit và stderr error.

Đây là **hard STOP kể cả khi parent thật sự đã được archive hoặc delete hợp lệ**. Parent bị thiếu buộc bạn phải demote child trước, tức clear `parent_spec`, thay vì âm thầm generate plan với broken link. Resolution có path-traversal guard: `parent_spec` crafted không thể escape khỏi specs root.

---

## Demote

Có hai operation khác nhau cùng dùng chữ "demote"; chọn theo intent. Loose coupling, tức link nằm trong frontmatter chứ không nằm trong path, giúp cả hai operation an toàn.

**Unlink (parent đã mất).** Khi `/tdk-plan` STOP vì `parent_spec` trỏ tới parent đã archive hoặc delete, clear field `parent_spec`. Child tiếp tục sống như một root spec độc lập bình thường và planning chạy tiếp. Không có gì khác đổi; child giữ nguyên spec, tasks, và history của nó.

**Revert promotion (quay lại work-item).** Khi sub-feature không nên là spec riêng nữa, chạy đầy đủ revert checklist trong task-breakdown output contract: delete hoặc archive `specs/<child-id>/`, đóng tracker issue của nó nếu consumer tracker-sync tồn tại, và clear marker `promoted → <child-id>` trong row tương ứng của parent `tasks-breakdown/index.md` để nó quay lại thành work-item bình thường. Xem `.specify/plugins/tdk-core/skills/tdk-task-breakdown/references/task-breakdown-output-contract.md`.

---

## Scope Boundary (promote không phải gì)

- Không có automatic promote heuristic hoặc marker engine; chỉ có manual content-seed.
- Không có path nesting kiểu `{epic}/{child}` và không có project-level epic root.
- Không có status-rollup dashboard.
- Epic chỉ là một parent spec lớn bình thường; per-feature HLD áp dụng cho nó như mọi spec khác.

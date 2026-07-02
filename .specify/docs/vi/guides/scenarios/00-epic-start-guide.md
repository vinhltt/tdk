# Workflow: Bắt Đầu Một Epic Và Tạo Child Specs

> Dùng khi: Công việc lớn, còn mơ hồ, hoặc có khả năng tách thành nhiều child feature có thể spec độc lập.
> Reader level: fresher-safe
> Main path: `/tdk-discovery -> /tdk-epic-prd -> /tdk-epic-hld -> /tdk-task-breakdown -> child /tdk-specify -> /tdk-clarify -> /tdk-plan -> /tdk-implement`

## Fast Path

Gõ các command này trong Claude Code chat, không phải terminal:

```text
/tdk-discovery epic-001 "Broad epic brief"
/tdk-epic-prd epic-001 --interview
/tdk-epic-hld epic-001
/tdk-task-breakdown epic-001

# Sau đó chọn một seed và implement một child:
/tdk-specify feat-001 "Seed from tasks-breakdown/task-001-slice.md"
/tdk-clarify feat-001
/tdk-plan feat-001
/tdk-implement feat-001
```

Nếu công việc đã là một feature nhỏ và rõ, dùng [Child Feature Implementation](01-child-feature-implementation.md) thay vì workflow này.

## Trước Khi Bắt Đầu

- TDK setup đã hoàn tất. Nếu chưa, bắt đầu với [Setup Guide](../setup/setup-guide.md).
- Claude Code đang mở tại consumer project root.
- Brief quá rộng để viết concrete requirements ngay lập tức.
- Bạn sẵn sàng tạo child specs sau khi parent epic được decompose.

Đừng dùng workflow này chỉ để thêm detail cho một feature nhỏ. Bắt đầu tại `/tdk-specify` khi scope, users, acceptance criteria, và edge cases đã rõ.

## Bạn Sẽ Tạo Ra Gì

| Step | Command | Main artifact | Gate |
|---|---|---|---|
| 1 | `/tdk-discovery` | `discovery.md` + `discovery/` | Problem, personas, và MVP cut đủ rõ để product alignment |
| 2 | `/tdk-epic-prd` | `epic-prd.md` + `epic-prd/` | Blocking questions trống và `slice-map.md` không có catch-all slice |
| 3 | `/tdk-epic-hld` | `high-level-design.md` + `high-level-design/` | Parent design boundaries, dependencies, risks, và assumptions đã được ghi lại |
| 4 | `/tdk-task-breakdown` | `tasks-breakdown.md` + `tasks-breakdown/` | Mỗi seed cite source slice và có thể spec độc lập |
| 5 | Child `/tdk-specify` | child `spec.md` | Một child scope sở hữu concrete requirements và success criteria |
| 6 | Child `/tdk-clarify` | updated child `spec.md` | `## 9. Unresolved Questions` là `None` |
| 7 | Child `/tdk-plan` -> `/tdk-implement` | child `plan.md` và source changes | Plan phases khớp accepted child spec |

## Step 1: Capture Epic Discovery

Run:

```text
/tdk-discovery epic-001 "Broad epic brief" --interview
```

Kết quả mong đợi:

- `discovery.md` tồn tại.
- `discovery/problem.md`, `discovery/personas.md`, và `discovery/mvp-scope.md` tồn tại.
- Discovery chỉ frame context; nó không tạo `spec.md` hoặc requirement IDs.

Chỉ tiếp tục nếu:

- Problem, affected users, và MVP boundary đủ tốt để product alignment.

Nếu chưa:

- Chạy lại `/tdk-discovery epic-001 --interview` để challenge current discovery artifacts mà không regenerate chúng.

## Step 2: Align Product Slices

Run:

```text
/tdk-epic-prd epic-001 --interview
```

Kết quả mong đợi:

- `epic-prd.md` tồn tại.
- `epic-prd/prd.md`, `epic-prd/slice-map.md`, và `epic-prd/open-questions.md` tồn tại.
- Epic PRD vẫn là product alignment; nó không tạo child requirements hoặc tracker issues.

Chỉ tiếp tục nếu:

- Blocking questions trống.
- `slice-map.md` không giấu unrelated work trong catch-all slice.

Nếu chưa:

- Resolve blocking questions hoặc chạy lại epic PRD interview trước HLD.

## Step 3: Add Parent Design Context

Run:

```text
/tdk-epic-hld epic-001
```

Kết quả mong đợi:

- `high-level-design.md` tồn tại.
- HLD detail files capture slice boundaries, dependencies, data flow, screen flow, decisions, risks, và assumptions.

Chỉ tiếp tục nếu:

- HLD trace về epic PRD slices mà không mint `UR-*`, `FR-*`, `SC-*`, hoặc child implementation phases.

Nếu chưa:

- Fix epic PRD hoặc HLD readiness issues trước task breakdown.

## Step 4: Generate Child Spec Seeds

Run:

```text
/tdk-task-breakdown epic-001
```

Kết quả mong đợi:

- `tasks-breakdown.md` tồn tại.
- Seed files `tasks-breakdown/task-NNN-*.md` tồn tại.
- Mỗi seed mô tả một child feature có thể spec độc lập.

Chỉ tiếp tục nếu:

- Bạn có thể chọn một seed mà không implement toàn bộ parent epic.

Nếu chưa:

- Split seed quá lớn hoặc fix missing PRD/HLD traceability trước child specification.

## Step 5: Promote One Seed Into A Child Spec

Chọn một seed, rồi run:

```text
/tdk-specify feat-001 "Seed from tasks-breakdown/task-001-slice.md"
```

Kết quả mong đợi:

- `.specify/specs/feat-001/spec.md` tồn tại.
- `.specify/specs/feat-001/checklists/requirements.md` tồn tại.
- Child spec sở hữu `UR-*`, `FR-*`, và `SC-*` IDs riêng.

Chỉ tiếp tục nếu:

- Child spec cover một seed, không cover toàn bộ parent epic.

Nếu chưa:

- Re-scope child spec trước clarify hoặc planning.

## Step 6: Clarify The Child Spec

Run:

```text
/tdk-clarify feat-001
```

Kết quả mong đợi:

- Accepted answers được ghi vào `spec.md`.
- `## Clarifications` ghi decision history.
- `## 9. Unresolved Questions` trở thành `None` trước planning.

Chỉ tiếp tục nếu:

- Child spec đã đủ rõ để plan.

Nếu chưa:

- Tiếp tục clarify hoặc revise child scope.

## Step 7: Plan And Implement The Child

Run:

```text
/tdk-plan feat-001
/tdk-implement feat-001
```

Kết quả mong đợi:

- `plan.md` có `## Phases` table actionable.
- Implementation đi theo child plan.
- Tests hoặc focused verification chạy khi plan yêu cầu.

Chỉ tiếp tục nếu:

- Plan không thêm unrelated parent-epic work.

Nếu chưa:

- Yêu cầu Claude Code revise `plan.md` trước implementation.

## Lỗi Thường Gặp

| Mistake | Fix |
|---|---|
| Chạy discovery cho mọi small feature | Dùng [Child Feature Implementation](01-child-feature-implementation.md) cho feature-sized work. |
| Xem discovery như requirements | Xem child `spec.md` là requirement authority. |
| Chạy HLD trước khi epic PRD ready | Resolve PRD blocking questions và catch-all slices trước. |
| Plan parent epic ngay sau task breakdown | Tạo child specs từ seeds, rồi plan từng child. |
| Kỳ vọng TDK core tạo tracker issues | Task breakdown tracker-neutral; tracker sync thuộc consumer. |
| Gõ `/tdk-*` trong terminal | Gõ workflow commands trong Claude Code chat. |

## Khắc Phục Sự Cố

| Symptom | Likely cause | Fix |
|---|---|---|
| HLD dừng trước khi ghi files | Epic PRD có blocking questions hoặc catch-all slices | Update hoặc interview epic PRD. |
| Task breakdown dừng trước khi ghi files | Epic HLD thiếu hoặc parent readiness gates fail | Run `/tdk-epic-hld <id>` và resolve readiness issues. |
| Seed cảm giác quá lớn | Parent slice vẫn gồm nhiều children | Split seed trước child `/tdk-specify`. |
| Child plan gồm parent-wide work | Child spec scope quá rộng | Re-scope child spec và run planning lại. |

## Go Deeper

- Concept: [Promote Convention](../concepts/promote-convention.md)
- Concept/reference: [Workflow Map](../workflow-map.md)
- Related workflow: [Child Feature Implementation](01-child-feature-implementation.md)
- Related catalog: [Scenario Catalog](scenario-catalog.md)
- Reference: [TDK Skills Guide](../skills-guide.md)

## Maintainer Notes

- Source of truth cho command syntax và flags: [TDK Skills Guide](../skills-guide.md).
- Source of truth cho file inputs/outputs: [Workflow Map](../workflow-map.md).
- Giữ page này là runnable epic workflow. Không duplicate full command reference hoặc artifact matrix tại đây.

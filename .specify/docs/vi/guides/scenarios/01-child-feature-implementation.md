# Scenario: Child Feature Implementation

> **Dùng khi**: Bạn có một child spec seed từ task breakdown, hoặc một feature nhỏ đã rõ để bỏ qua parent epic flow.

Dùng sau khi epic flow tạo child seed files:

```text
/tdk-discovery -> /tdk-epic-prd -> /tdk-epic-hld -> /tdk-task-breakdown
```

Sau đó implement một child feature:

```text
/tdk-specify -> /tdk-clarify -> /tdk-plan -> /tdk-implement
```

## Trước Khi Bắt Đầu

Dùng scenario này khi:

- TDK setup đã chạy thành công.
- Claude Code đang mở tại consumer project root.
- Bạn có một child spec seed từ `tasks-breakdown/`, hoặc một feature/fix nhỏ rõ ràng.
- Bạn sẵn sàng tạo một `spec.md` và implement child scope đó.

Nếu setup chưa xong, bắt đầu với [Setup Guide](../setup/setup-guide.md). Nếu work vẫn còn rộng hoặc mơ hồ, bắt đầu với [Epic Start Guide](00-epic-start-guide.md).

## Chọn Một Child Feature

Input tốt:

- Một seed từ `tasks-breakdown/task-NNN-*.md`.
- Một validation rule.
- Một display label fix.
- Một endpoint field nhỏ.
- Một error message đơn giản.

Tránh dùng child loop cho:

- Toàn bộ authentication systems.
- Multi-service rewrites.
- Broad product ideas với nhiều possible MVP cuts.
- Work mà chưa ai biết acceptance criteria.

## Step 1: Specify

Gõ trong Claude Code chat:

```text
/tdk-specify feat-001 "Seed from tasks-breakdown/task-001-slice.md"
```

Kết quả nên có:

- TDK tạo `.specify/specs/feat-001/spec.md`.
- TDK tạo `.specify/specs/feat-001/checklists/requirements.md`.
- Claude có thể hỏi clarifying questions nếu seed chưa concrete.

Đọc `spec.md` trước khi tiếp tục. Kiểm tra:

- Problem statement đúng.
- In scope và out of scope rõ.
- User requirements khớp child feature.
- Functional requirements mô tả behavior, không phải implementation guesses.
- `## 9. Unresolved Questions` là `None` hoặc có real questions.

## Step 2: Clarify

Run clarify khi `spec.md` vẫn có gap:

```text
/tdk-clarify feat-001
```

Kết quả nên có:

- Claude hỏi targeted questions.
- Accepted answers được ghi lại vào `spec.md`.
- `## Clarifications` ghi decision history.
- `## 9. Unresolved Questions` nên trở thành `None` trước planning.

Không bỏ qua bước này khi feature scope vẫn còn fuzzy.

## Step 3: Plan

Sau khi spec ready:

```text
/tdk-plan feat-001
```

Kết quả nên có:

- TDK tạo `.specify/specs/feat-001/plan.md`.
- Plan có phases mô tả implementation order.
- Có thể có thêm files như `research/`, `data-model.md`, `contracts/`, hoặc `quickstart.md`.

Đọc `plan.md` trước implementation. Kiểm tra:

- Phases khớp spec.
- Phase order hợp lý.
- Có test hoặc verification steps.
- Plan không thêm unrelated work.

## Step 4: Implement

Run tất cả runnable phases:

```text
/tdk-implement feat-001
```

Hoặc run một phase:

```text
/tdk-implement feat-001 --phase 01
```

Kết quả nên có:

- Claude implement từ `plan.md`.
- Tests hoặc verification chạy khi plan yêu cầu.
- Status artifacts update khi phases complete.

## Kiểm Tra Kết Quả

Sau implementation, yêu cầu Claude Code status snapshot:

```text
/tdk-status feat-001
```

Sau đó verify:

- Code changes khớp spec.
- Tests hoặc focused checks passed.
- Không còn unresolved questions.
- Không đổi unrelated files.

## Lỗi Thường Gặp

| Mistake | Fix |
|---|---|
| Gõ `/tdk-*` trong terminal | Gõ commands trong Claude Code chat. |
| Bắt đầu loop này với broad epic | Dùng [Epic Start Guide](00-epic-start-guide.md). |
| Bỏ qua clarify khi có open questions | Run `/tdk-clarify` đến khi blockers resolved. |
| Xem discovery như requirements | Xem `spec.md` là requirement authority. |
| Để plan thêm extra scope | Yêu cầu Claude revise `plan.md` trước implementation. |

## Tài Liệu Liên Quan

- [Epic Start Guide](00-epic-start-guide.md)
- [Glossary](../concepts/glossary.md)
- [TDK Skills Guide](../skills-guide.md)
- [Workflow Map](../workflow-map.md)

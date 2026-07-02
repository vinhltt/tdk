# Scenario: Progress Tracking

> **Dùng khi**: Bạn muốn kiểm tra trạng thái hiện tại của một feature — phần nào đã xong, phần nào còn lại, và bước tiếp theo là gì.

## Chuỗi Command

```text
/tdk-status
```

## Từng Bước

### 1. Check feature status

```text
/tdk-status feat-001
```

**Điều xảy ra**: Claude chạy read-only status check và hiển thị:

- **Artifact checklist** — file nào đang tồn tại, ví dụ `spec.md`, `plan.md`, kèm last modified dates
- **Progress bar** — thanh 22 ký tự thể hiện completion percentage, derive từ `plan.md ## Phases`
- **Phase breakdown** — completed vs. remaining phases từ `plan.md ## Phases` table
- **Recommendations** — command nên chạy tiếp dựa trên current state
- **Warnings** — stale artifacts, trên 7 ngày không đổi, hoặc outdated artifacts, trên 14 ngày

### 2. Interpret the output

Example output:

```text
Feature: feat-001
Status: In Progress

Artifacts:
  ✓ spec.md      (2026-02-10)
  ✓ plan.md      (2026-02-10)

Progress: [████████████░░░░░░░░░░] 55% (19/35 items)

Phases (from plan.md ## Phases):
  ✓ Phase 1: Setup (3/3)
  ✓ Phase 2: Core Models (8/8)
  → Phase 3: API Endpoints (8/12)    ← current
  · Phase 4: Integration (0/7)
  · Phase 5: Polish (0/5)

Next: Continue with /tdk-implement feat-001
```

## Gợi Ý

- `status` là read-only — an toàn để chạy bất cứ lúc nào và không có side effect.
- Chạy sau khi nghỉ hoặc đổi context để nhanh chóng nhớ bạn đã dừng ở đâu.
- Stale warnings trên 7 ngày gợi ý feature có thể cần attention hoặc cleanup.
- Không có task ID? Claude sẽ thử infer từ conversation context.

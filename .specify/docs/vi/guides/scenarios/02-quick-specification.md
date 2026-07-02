# Scenario: Quick Specification

> **Dùng khi**: Bạn cần spec nhanh cho feature nhỏ, đã hiểu rõ, và muốn tiết kiệm token bằng cách bỏ qua brainstorm phase.

## Chuỗi Command

```text
/tdk-specify --fast -> /tdk-plan -> /tdk-implement
```

## Khi Nào Chọn `--fast` vs Default

| Criteria | Default (full brainstorm) | `--fast` |
|----------|--------------------------|----------|
| Feature scope | Chưa rõ, cần explore | Đã định nghĩa rõ, nhỏ |
| Cần brainstorm? | Có — explore trade-offs | Không — approach đã obvious |
| Token budget | Không phải vấn đề | Muốn giảm usage |
| Output quality | Giống nhau | Giống nhau, chỉ skip brainstorm |

**Note:** Nếu không có `--fast`, `/tdk-specify` auto-detect mode dựa trên description complexity và Impact Surface.

## Từng Bước

### 1. Tạo spec nhanh

```text
/tdk-specify bug-042 Fix pagination offset error on company list API --fast
```

**Điều xảy ra**: Giống `/tdk-specify` nhưng skip embedded brainstorming step. Claude tạo `spec.md` trực tiếp từ description của bạn mà không explore scope boundary options.

**Output**: `spec.md`, `checklists/requirements.md`

### 2. Generate plan

```text
/tdk-plan bug-042
```

**Điều xảy ra**: Claude đọc spec và generate plan với `## Phases` table định nghĩa implementation phases.

### 3. Implement từ plan

```text
/tdk-implement bug-042
```

**Điều xảy ra**: Claude execute phases được định nghĩa trong `plan.md`, dùng phases table làm source-of-truth.
Dùng `/tdk-implement bug-042 --phase NN` để execute một phase duy nhất.

## Gợi Ý

- Khác biệt duy nhất là brainstorm enrichment bị skip. Mọi step khác giống nhau.
- Nếu sau khi dùng `--fast` bạn nhận ra spec cần thêm depth, run `/tdk-clarify` để bổ sung gaps.
- Cả `--fast` và default modes đều tạo cùng artifact structure — downstream commands hoạt động giống nhau.
- Dùng `/tdk-implement` để execute tất cả runnable phases từ `## Phases` table của plan, hoặc thêm `--phase NN` cho một phase.

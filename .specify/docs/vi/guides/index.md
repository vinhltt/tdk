# TDK Guides

> Chọn guide khớp với tình huống của bạn.
> Command `/tdk-*` được gõ trong Claude Code chat, không phải terminal.

## Bắt Đầu

| Tình huống | Mở | Lý do |
|---|---|---|
| Máy mới hoặc repo consumer vừa clone | [Setup Guide](setup/setup-guide.md) | Cài TDK và xác nhận command `/tdk-*` hiển thị trong Claude Code |
| Project mới, feature lớn, hoặc ý tưởng còn mơ hồ | [Epic Start Guide](scenarios/00-epic-start-guide.md) | Biến một epic thành các child feature spec |
| Một child feature hoặc seed đã rõ để build | [Child Feature Implementation](scenarios/01-child-feature-implementation.md) | Đi thẳng vào spec, plan, implement |
| Chưa chắc workflow nào phù hợp | [Scenario Catalog](scenarios/scenario-catalog.md) | So sánh các scenario phổ biến trước khi chọn |
| Mới với thuật ngữ TDK | [Glossary](concepts/glossary.md) | Hiểu các thuật ngữ được dùng trong guides |
| Cần tra cứu một command | [Skills Guide](skills-guide.md) | Cú pháp, mode, input, và output |

## Default Project Flow

```text
/tdk-discovery
-> /tdk-epic-prd
-> /tdk-epic-hld
-> /tdk-task-breakdown
-> child /tdk-specify
-> /tdk-clarify
-> /tdk-plan
-> /tdk-implement
```

Nếu công việc đã là một feature nhỏ và rõ, bỏ qua epic commands và bắt đầu tại `/tdk-specify`.

## Chọn Đường Đi

| Tôi cần... | Đi tới |
|---|---|
| Cài đặt và verify TDK | [Setup Guide](setup/setup-guide.md) |
| Bắt đầu một epic và chia thành child work | [Epic Start Guide](scenarios/00-epic-start-guide.md) |
| Implement một child feature | [Child Feature Implementation](scenarios/01-child-feature-implementation.md) |
| Làm theo recipe thực tế | [Scenario Catalog](scenarios/scenario-catalog.md) |
| Hiểu khi nào biến child seed thành spec | [Promote Convention](concepts/promote-convention.md) |
| Tra cứu thuật ngữ TDK | [Glossary](concepts/glossary.md) |
| Tra cứu command, mode, và option | [Skills Guide](skills-guide.md) |
| Xem mỗi command đọc/ghi file nào | [Workflow Map](workflow-map.md) |

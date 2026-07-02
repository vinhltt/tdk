# Glossary

Dùng glossary này khi TDK docs hoặc generated files có thuật ngữ mới với bạn.

| Term | Meaning |
|---|---|
| TDK | Prefix của workflow toolkit cho Claude Code. |
| Slash command | Command `/tdk-*` được gõ trong Claude Code chat. Bên trong, command là plugin skill. |
| Spec file | `.specify/specs/<id>/spec.md`, source of truth cho một feature hoặc child slice. |
| Requirement authority | File sở hữu accepted requirements. Với feature work, file này là `spec.md`. |
| Clarify | Bước hỏi và ghi lại các decision còn thiếu vào `spec.md`. |
| Plan file | `.specify/specs/<id>/plan.md`, implementation sequence cho accepted spec. |
| Phase | Một implementation chunk được liệt kê trong `plan.md`. |
| Implement | Bước execute một hoặc nhiều phase từ `plan.md`. |
| Artifact | File được generate hoặc maintain trong TDK workflow. |
| Gate | Check cần pass trước khi đi sang command tiếp theo. |
| Epic | Một nhóm công việc lớn nên được chia thành các child spec nhỏ hơn. |
| Child spec | Feature spec được tạo từ một slice của epic lớn. |
| Discovery | Context tùy chọn cho epic lớn. Discovery không sở hữu requirements. |
| Epic PRD | Product alignment và slice-map context cho epic. |
| HLD | High-level design context, thường dùng cho parent epic decomposition. |
| Task breakdown | Các child spec seed file được tạo từ epic PRD và HLD context. |

## Short Mental Model

```text
epic -> discovery -> epic-prd -> epic-hld -> task-breakdown -> child specs
```

Cho mỗi child feature:

```text
specify -> clarify -> plan -> implement -> verify
```

## Source Of Truth Rules

- `spec.md` sở hữu feature requirements.
- `plan.md` sở hữu implementation order.
- Discovery và epic PRD cung cấp context, không phải final requirements.
- HLD hướng dẫn design và decomposition, không tự nó tạo implementation tasks.
- Generated files nên được đọc thông qua manifest hoặc index của chúng trước.

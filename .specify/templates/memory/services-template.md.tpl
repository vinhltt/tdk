---
title: "{Domain} Services"
aliases:
  - "{Domain} API"
  - "{domain} service layer"
type: services
id: "services.{domain}"
domain: "{domain}"
status: active
authority: memory
binding: true
related:
  - path: domains/{domain}/business-rules.md
    rel: constraints
tags:
  - memory/services
  - domain/{domain}
created_at: "{YYYY-MM-DD}"
updated_at: "{YYYY-MM-DD}"
updated_by: tdk-memory-update
---

# {Domain} Services

<!-- section: services -->
## {ServiceName}.{method}()

### Overview

Brief description of what this service method does.

### Endpoint

| Method | URL |
|--------|-----|
| `{METHOD}` | `/api/{path}` |

### Request

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `{param}` | `{type}` | Yes/No | {description} |

### Response

```json
{
  "{field}": "{type}"
}
```

### Affected Tables

- [[data-model/{table-name}]]

### Error Cases

| Code | Condition |
|------|-----------|
| `{code}` | {condition} |

<!-- /section: services -->

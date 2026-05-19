---
title: "{TableName} Data Model"
aliases:
  - "{TableName}"
  - "{table-name} table"
type: data-model
tags:
  - memory/data-model
  - data-model/{table-name}
created_at: "{YYYY-MM-DD}"
updated_at: "{YYYY-MM-DD}"
updated_by: tdk-memory-update
---

# {TableName}

<!-- section: fields -->
## Fields

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `created_at` | timestamp | No | |
| `updated_at` | timestamp | No | |

<!-- /section: fields -->

<!-- section: relations -->
## Relations

| Relation | Type | Target | Key |
|----------|------|--------|-----|
| `{relation}` | hasMany/belongsTo | [[data-model/{table}]] | `{foreign_key}` |

<!-- /section: relations -->

<!-- section: indexes -->
## Indexes

| Index | Columns | Type |
|-------|---------|------|
| `PRIMARY` | `id` | primary |

<!-- /section: indexes -->

<!-- section: used-by -->
## Used by

- [[domains/{domain}/services]]

<!-- /section: used-by -->

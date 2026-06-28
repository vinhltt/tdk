---
title: "{FlowName} Flow"
aliases:
  - "{FlowName}"
  - "{flow-name} journey"
type: flow
id: "flow.{domain}.{flow-name}"
domain: "{domain}"
status: active
authority: memory
binding: true
related:
  - path: domains/{domain}/services.md
    rel: implementation
tags:
  - memory/flow
  - domain/{domain}
created_at: "{YYYY-MM-DD}"
updated_at: "{YYYY-MM-DD}"
updated_by: tdk-memory-update
---

# {FlowName}

<!-- section: overview -->
## Overview

| Property | Value |
|----------|-------|
| Trigger | {what initiates this flow} |
| Actor | {service/user/system} |
| Type | {API flow / business flow / cross-domain} |

<!-- /section: overview -->

<!-- section: steps -->
## Steps

| Step | Action | Component | Notes |
|------|--------|-----------|-------|
| 1 | {action} | {service/class} | {notes} |

<!-- /section: steps -->

<!-- section: error-handling -->
## Error Handling

| Error | Condition | Response |
|-------|-----------|----------|
| `{ErrorName}` | {condition} | {response} |

<!-- /section: error-handling -->

<!-- section: external-dependencies -->
## External Dependencies

| Dependency | Purpose | Timeout |
|------------|---------|---------|
| {service/API} | {purpose} | {timeout} |

<!-- /section: external-dependencies -->

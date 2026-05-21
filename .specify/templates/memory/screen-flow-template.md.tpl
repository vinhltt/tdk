---
title: "{FlowName} Flow"
aliases:
  - "{FlowName}"
  - "{flow-name} journey"
type: screen-flow
actor: "{actor}"
trigger: "{trigger}"
outcome: "{outcome}"
tags:
  - memory/screen-flow
created_at: "{YYYY-MM-DD}"
updated_at: "{YYYY-MM-DD}"
updated_by: tdk-memory-update
---

# {FlowName}

<!-- section: overview -->
## Overview

{Brief description of the multi-screen journey, actor, and goal}

<!-- /section: overview -->

<!-- section: steps -->
## Steps

| Step | Screen | Action | Next |
|------|--------|--------|------|
| 1 | [[screens/{module}/{screen}]] | {action} | Step 2 |

<!-- /section: steps -->

<!-- section: branch-conditions -->
## Branch Conditions

| Condition | Branch To |
|-----------|-----------|
| {condition} | [[screens/{module}/{screen}]] |

<!-- /section: branch-conditions -->

<!-- section: related-screens -->
## Related Screens

- [[screens/{module}/{screen}]]

<!-- /section: related-screens -->

<!-- section: related-api-calls -->
## Related API Calls

| Screen | API | Purpose |
|--------|-----|---------|
| {screen} | `{METHOD} /api/{path}` | {purpose} |

<!-- /section: related-api-calls -->

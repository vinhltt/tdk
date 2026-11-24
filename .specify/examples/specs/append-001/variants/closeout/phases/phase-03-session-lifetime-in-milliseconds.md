---
task_id: append-001
phase: 3
title: "Session lifetime in milliseconds"
status: done
priority: P2
effort: "1h"
dependencies: []
parallel_safe: auto
---

# Phase 03: Session lifetime in milliseconds

## Context Links

- Plan: `../plan.md`
- Spec: `../spec.md`
- Review: `../reviews/20261121-093012-phase-01-standard.md` (F1)

## Overview

Make session expiry compare milliseconds with milliseconds, so a session lasts one hour after it is issued (FR-001).

## Key Insights

- The issue time is stored in milliseconds; the lifetime constant is in seconds.

## Requirements

- Functional: a session expires one hour after it is issued.
- Non-functional: the public signature of the expiry check does not change.

## Architecture

The change stays inside the session module; no other module reads its lifetime.

## Related Code Files

- Modify: `src/auth/session-token.ts`

## Implementation Steps

1. Convert the lifetime to milliseconds before comparing it with the token age.

## Todo List

- [x] Compare token age and lifetime in the same unit

## Success Criteria

- [x] A token issued 59 minutes ago is valid and one issued 61 minutes ago is expired.

## Risk Assessment

Sessions issued before the fix were expiring early; none outlive the new lifetime.

## Security Considerations

Sessions no longer expire early; the lifetime still ends after one hour.

## Next Steps

None.

## Unresolved Questions

None.

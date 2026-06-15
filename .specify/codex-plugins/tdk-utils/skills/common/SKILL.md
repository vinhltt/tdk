---
name: common
description: Shared principles and standards for MRR commands
user-invocable: false
---

# Common Skill

## Purpose

Foundational principles, error handling, and standards for all MRR commands.

## When to Load

- Always load as base for other skills
- Reference: #file:references/principles.md

## Core Rules

1. STOP on any script error, report to user
2. No workarounds without user approval
3. Validate inputs before processing
4. Use absolute paths always

## References

- `principles.md` - YAGNI/KISS/DRY enforcement
- `error-handling.md` - Standard error protocol

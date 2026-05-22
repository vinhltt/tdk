# Migration Guide: ut-rule.md → Consumer UT Skill

**Date**: 2026-05-22
**Applies to**: TDK v2.0+ (breaking change from v1.x)

## What Changed

The 4-layer `ut-rule.md` cascade has been replaced by consumer-owned skills.

| Removed | Replacement |
|---------|-------------|
| `rules/test/ut-rule.md` files (4 levels: global, sw-parent, sw-own, module) | Single `.claude/skills/{name}/SKILL.md` per project |
| `/tdk-ut-backfill-create-rules` skill | Manual skill creation (one-time) |
| `/tdk-ut-backfill-check-rules` skill | Skill resolution built into `/tdk-ut-backfill-auto` |
| `resolveRulesCascade()` 4-level resolver | Glob-based skill discovery at runtime |
| CLI output fields: `rulesFile`, `utRulesFiles`, `framework`, `coverageTarget`, `hasUtRules` | Read directly from UT skill SKILL.md |

## Migration Steps

### 1. Create skill directory

```bash
mkdir -p .claude/skills/{your-skill-name}/
```

Name convention: include `-ut` or `-test` in the name for auto-discovery. Examples: `dotnet-ut`, `vitest-conventions`, `python-test`.

### 2. Create SKILL.md

```markdown
---
name: {your-skill-name}
description: "Unit test conventions for {project/framework}"
domain: unit-test
---

# {Your Skill Name}

## Framework
{framework name and version, e.g., xUnit 2.9 with .NET 8}

## Coverage Target
| Priority | Target |
|----------|--------|
| P1 (critical) | 90% |
| P2 (important) | 80% |
| P3 (nice-to-have) | 60% |

## Test File Organization
{describe where test files live relative to source}

## Naming Conventions
{describe test class/method naming patterns}

## Mocking Strategy
{describe mocking approach, libraries used}

## Test Structure
{describe test structure: AAA, GWT, etc.}

## Framework Syntax
{describe imports, matchers, lifecycle hooks}

## Edge Cases
{describe common edge cases to always test}
```

### 3. Copy content from existing ut-rule.md

Map sections from your `ut-rule.md` to the SKILL.md format:

| ut-rule.md Section | SKILL.md Section |
|--------------------|------------------|
| `Framework: {name}` (line 1) | `## Framework` — full prose, not just name |
| `Coverage Requirements` table | `## Coverage Target` — same P1/P2/P3 tiers |
| `Test File Organization` | `## Test File Organization` |
| `Naming Conventions` | `## Naming Conventions` |
| `Mocking Strategy` | `## Mocking Strategy` |
| `Test Structure` (AAA/GWT) | `## Test Structure` |
| `Framework Syntax` (imports, matchers) | `## Framework Syntax` |
| `Edge Cases` | `## Edge Cases` |

Additional sections not in the template → copy as-is into SKILL.md under appropriate headings.

### 4. Update plan-skill-routing-template.tpl (optional)

If your project uses skill routing, update the `test` domain:

```
- test: /tdk-ut-backfill-auto  # UT skill: {your-skill-name} in .claude/skills/
```

### 5. Delete old ut-rule.md files

After confirming the migration works:

```bash
find . -path "*/rules/test/ut-rule.md" -delete
```

### 6. Test

Run `/tdk-ut-backfill-auto` on a feature to verify the new skill is discovered and used.

## Per-Module Overrides (Removed)

The 4-layer cascade (global → sw-parent → sw-own → module) is gone. Options:

| Approach | When to use |
|----------|-------------|
| **Single UT skill** (recommended) | Most projects — one set of conventions |
| **Multiple skills** | Large monorepos with different frameworks per sub-workspace (e.g., `dotnet-ut-api`, `vitest-ut-frontend`) — reference different skills in different phase files |

Per-module specificity within a sub-workspace is no longer supported. If different modules need different conventions, create separate skills and reference them explicitly.

## CI/Script Consumers

If you parse `tdk ut check-rules` JSON output in CI scripts or automation:

### Removed fields

| Field | Status |
|-------|--------|
| `rulesFile` | **Removed** |
| `framework` | **Removed** |
| `coverageTarget` | **Removed** |
| `utRulesFiles` | **Removed** |
| `hasUtRules` | **Removed** |
| `mirrorValidation` | **Removed** (check-rules CLI deleted) |

### Still available

`outputRoot`, `subWorkspaces` — available via `tdk ut backfill auto` or `tdk ut backfill plan` CLI output.

### Alternative

Extract framework/coverage from your `.claude/skills/{name}/SKILL.md` using grep:

```bash
grep -A1 "## Framework" .claude/skills/your-skill/SKILL.md
grep -A5 "## Coverage Target" .claude/skills/your-skill/SKILL.md
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No UT skill found" from `/tdk-ut-backfill-auto` | Create skill per steps above |
| "Framework not detected" | Add `## Framework` section to SKILL.md |
| "Coverage not detected" | Add `## Coverage Target` section to SKILL.md |
| Old `ut-rule.md` still on disk | Safe to delete — TDK no longer reads it |
| CI using `tdk ut check-rules` | Command removed — extract from SKILL.md directly |

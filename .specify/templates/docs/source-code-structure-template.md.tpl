# Source Code Structure

> Project-wide source layout. SOT cho `### Source Code` section của plan.md.
> **Scope:** describe source code that THIS project's plans will modify
> (not monorepo root, not host repo). Each project (tdk, commondragon, etc.)
> maintains own `source-code-structure.md` in own `{docs.path}/`.
> Update khi: thêm module/sub-workspace, refactor lớn, đổi architecture type.

## Project Type

[single | web | mobile | monorepo | hybrid]

**Description**: [1-2 câu mô tả high-level type]

## Top-Level Layout

```text
{project-root}/
├── {dir-1}/                  # purpose
├── {dir-2}/                  # purpose
└── tests/                    # purpose
```

## Modules / Sub-Workspaces

| Name | Path | Purpose | Notes |
|------|------|---------|-------|
| [name] | [path] | [1 dòng] | [notes] |

## Test Layout

**Strategy**: [colocated | separate-folder | separate-project]

```text
tests/
├── unit/
├── integration/
└── e2e/
```

## Conventions

- **File naming**: [kebab-case | snake_case | PascalCase — explain]
- **Module boundaries**: [1-2 dòng]
- **Import patterns**: [relative vs absolute, barrel files — nếu relevant]

## Notes

[Project-specific decisions, exceptions, context đáng biết]

# Unit Test Rules - [PROJECT_NAME]

**Framework**: [FRAMEWORK_NAME] [VERSION]
**Language**: [LANGUAGE]
**Created**: [DATE]
**Status**: Active

---

## Test File Organization

**Pattern**: [PATTERN_TYPE]
- `directory-root`: `/tests/` at project root
- `directory-subdirs`: `__tests__/` next to source
- `co-located`: Same dir as source (`.test.*` / `.spec.*`)
- `separate-project`: Separate test project

**Structure**:
```
[EXAMPLE_STRUCTURE]
```

**Rationale**: [WHY_THIS_PATTERN]

---

## Naming Conventions

### Test Files
- **Pattern**: [FILE_PATTERN]
- **Examples**: [FILE_EXAMPLES]

### Test Cases
- **Pattern**: [TEST_CASE_PATTERN]
- **Examples**:
  - ✅ `[GOOD_EXAMPLE_1]`
  - ✅ `[GOOD_EXAMPLE_2]`
  - ❌ `[BAD_EXAMPLE]`

---

## Test Structure

**Pattern**: [STRUCTURE_PATTERN] (AAA, Given-When-Then, etc.)

**Template**:
```[LANGUAGE_EXT]
[TEST_TEMPLATE]
```

**Comments**: [COMMENT_POLICY]

---

## Framework Syntax

### Imports
```[LANGUAGE_EXT]
[IMPORT_STATEMENT]
```

### Matchers

| Type | Matcher | Example |
|------|---------|---------|
| Equality (primitives) | [MATCHER] | [EXAMPLE] |
| Equality (objects) | [MATCHER] | [EXAMPLE] |
| Decimals | [MATCHER] | [EXAMPLE] |
| Errors | [MATCHER] | [EXAMPLE] |
| Async | [MATCHER] | [EXAMPLE] |
| Contains | [MATCHER] | [EXAMPLE] |

### Lifecycle Hooks
```[LANGUAGE_EXT]
[LIFECYCLE_EXAMPLE]
```

---

## Mocking Strategy

### External APIs
- **Method**: [MOCK_METHOD]
- **Example**:
```[LANGUAGE_EXT]
[API_MOCK_EXAMPLE]
```

### Database
- **Strategy**: [DB_STRATEGY]

### Time/Date
- **Strategy**: [TIME_STRATEGY]

---

## Edge Cases (Priority Order)

1. **Null/Empty**: null, undefined, empty string, empty array
2. **Boundaries**: zero, negative, max values
3. **Types**: NaN, Infinity, wrong types
4. **Errors**: invalid input, network failures

---

## Coverage Requirements

| Priority | Target | Scope |
|----------|--------|-------|
| P1 (Critical) | [P1_TARGET] | Core business logic |
| P2 (Important) | [P2_TARGET] | Main feature |
| P3 (Supporting) | [P3_TARGET] | Utilities |

**Overall Target**: [OVERALL_TARGET]

---

## Examples

### Basic Test
```[LANGUAGE_EXT]
[BASIC_TEST_EXAMPLE]
```

### Error Handling
```[LANGUAGE_EXT]
[ERROR_TEST_EXAMPLE]
```

### Async with Mock
```[LANGUAGE_EXT]
[ASYNC_MOCK_EXAMPLE]
```

---

## Quality Checklist

- [ ] Test file follows naming convention
- [ ] Test cases use defined pattern
- [ ] Structure pattern followed (AAA, etc.)
- [ ] No weak assertions (toBeDefined, toBeTruthy)
- [ ] Edge cases tested
- [ ] Mocks cleared in teardown
- [ ] Coverage meets threshold

---

**Version**: 1.0
**Last Updated**: [DATE]

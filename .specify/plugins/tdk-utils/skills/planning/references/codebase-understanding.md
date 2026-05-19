# Codebase Understanding Phase

**Skip if:** User provides scout reports or codebase documentation.

## Core Activities

### Essential Documentation Review

ALWAYS read these files first (if they exist):

1. **`./.specify/memory/development-rules.md`** (IMPORTANT)
   - File naming conventions
   - File size management
   - Development rules and best practices
   - Code quality standards

2. **`./.specify/memory/codebase-summary.md`**
   - Project structure and current status
   - High-level architecture overview
   - Component relationships

3. **`./.specify/memory/code-standards.md`**
   - Coding conventions and standards
   - Language-specific patterns
   - Naming conventions

4. **`./.specify/memory/design-guidelines.md`** (if exists)
   - Design system guidelines
   - UI/UX conventions

### Codebase Search

Use `@workspace` to search codebase:
- Find relevant files for the task
- Identify existing patterns
- Locate similar implementations

**Search patterns:**
```
@workspace find authentication files
@workspace how is error handling done
@workspace what patterns are used for API calls
```

### Scout Delegation Pattern

For complex codebase exploration:

1. **Delegate to scout subagent:**
   ```
   Scout: Find all files related to [feature]
   Output: .specify/specs/{task-id}/reports/scout-{area}.md
   ```

2. **User continues manually** when scout completes

3. **Main agent reads** scout output and continues planning

### Pattern Recognition

Study existing patterns in codebase:
- Architectural decisions
- Error handling patterns
- State management approach
- API design conventions
- Test organization

### Environment Analysis

Review development setup:
- Package.json / requirements.txt dependencies
- Configuration files
- Environment variables
- Build and deployment scripts

## Output Format

Document findings in scout report:

```markdown
# Scout Report: [area]

## Files Found
- `path/to/file.ts` - [purpose]
- `path/to/file2.ts` - [purpose]

## Patterns Identified
- [Pattern 1]: Used in [files]
- [Pattern 2]: Used in [files]

## Relevant Code Snippets
[Include key code blocks]

## Integration Points
- [How new code should integrate]

## Recommendations
- [Suggestions based on findings]
```

## Best Practices

- Start with documentation before diving into code
- Document patterns found for consistency
- Note any inconsistencies or technical debt
- Consider impact on existing features
- Map dependencies between components

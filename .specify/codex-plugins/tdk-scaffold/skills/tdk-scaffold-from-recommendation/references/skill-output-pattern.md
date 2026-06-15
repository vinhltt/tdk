# Skill Output Pattern

Structural pattern for generating SKILL.md files. Extracted from existing TDK plugin conventions.

## Required Frontmatter Fields

```yaml
---
name: <kebab-case, tdk-prefixed>
description: "<one-line purpose>"
user-invocable: true
argument-hint: "<args synopsis>"
metadata:
  version: "0.1.0"
  author: "VinhLTT"
  category: "<from recommendation architecture>"
---
```

## Required Sections (in order)

1. **Title** — `# <name>` followed by 1-2 sentence description
2. **When to use** — Bullet list of trigger conditions
3. **Prerequisites** — What must exist before running this skill
4. **Args** — Table: Flag | Notes
5. **Steps** — Numbered `### N. <step-name>` blocks, each with:
   - What to read/check
   - What to produce
   - Error conditions and messages
6. **Error UX** — Table: Condition | Message
7. **Notes** — Constraints, limitations, scope boundaries

## Content Guidelines

- Imperative tone ("Read the file", not "The file is read")
- Steps should be concrete enough for an LLM to execute without ambiguity
- Each step should have a clear input → output
- Error messages should be actionable (tell user what to do, not just what failed)
- Keep under 150 lines total — split complex logic into references/

## Anti-Patterns

- Don't include implementation code in SKILL.md — it's instructions, not code
- Don't reference plan artifacts (phase numbers, finding codes)
- Don't add speculative features ("future: ...")
- Don't duplicate content between steps — reference earlier steps instead

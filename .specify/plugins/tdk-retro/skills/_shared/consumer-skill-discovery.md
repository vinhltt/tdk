# Consumer Skill Discovery

TDK no longer owns layered `ut-rule.md` files. Consumer projects publish their test conventions as skills.

## Discovery Globs

Search from the consumer project root:

```text
.claude/skills/*-ut/SKILL.md
.claude/skills/*-test/SKILL.md
```

## Behavior

1. Use `Glob` with both patterns.
2. Read every matching `SKILL.md`.
3. Extract framework, coverage target, naming conventions, test structure, and any project-specific test rules.
4. If no files match, record a graceful no-op:
   - `Consumer test skills: none found`
   - Do not propose T4 entries unless a concrete skill exists.

## Notes

- The suffix convention comes from `docs/guides/migration-ut-rule-to-skill.md`.
- Do not create consumer skills automatically during retro. Propose T4 only when a target skill is discoverable.
- If multiple skills match, include all relevant paths in evidence.

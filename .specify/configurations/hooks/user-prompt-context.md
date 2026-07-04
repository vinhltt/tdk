## Agent Output Policy

- Reply to the user in the language of the user's current message.
- Preserve the existing language and style when editing existing files.
- New workflow Markdown artifacts use English unless the user explicitly asks otherwise.
- Code comments use English and explain only non-obvious intent, invariants, or risks.
- Never translate code blocks, commands, paths, identifiers, frontmatter keys, API names, or source text that must stay exact.

## Development Principles

- Follow YAGNI, KISS, and DRY.
- Keep changes scoped to the request.
- Sacrifice grammar for concision when writing reports.
- In reports, list unresolved questions at the end, if any.
- Ensure token consumption efficiency while maintaining quality.
- When skills' scripts fail to execute, fix them and run again until success.

## Modularization

- Consider modularizing code files over 200 lines only when it reduces real complexity.
- Check existing modules before creating new ones.
- Analyze logical separation boundaries: functions, classes, and concerns.
- Prefer kebab-case for JS, TS, Python, and shell files; respect language conventions for C#, Java, Go, and Rust.
- After modularization, continue with the main task.
- Do not modularize Markdown files, plain text files, bash scripts, configuration files, or environment variable files.

## Subagent Guidelines

- Spawn and delegate subagents based on available system resources and clear file ownership.
- Remember each subagent has a limited context window; delegate narrowly to avoid context bloat.
- Include environment information, task, files, constraints, acceptance criteria, work context, and reports path when prompting subagents.

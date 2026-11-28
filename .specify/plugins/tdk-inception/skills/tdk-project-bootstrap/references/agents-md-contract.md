# Root AGENTS.md contract

`/tdk-project-bootstrap` writes a root `AGENTS.md` that describes the project to any coding agent.
It is a project description, not TDK workflow guidance.

## When

Create only when the repository root has no `AGENTS.md`. An existing file is never touched; the report says `kept`.

## Content

Only facts about this project, each traceable to a source the run already read:

- purpose and shape of the repository;
- a sub-workspace table: name, path, one-line role, and a link to its docs when that docs folder exists;
- build, test, lint, and run commands, only when read from a package manifest or CI config with High confidence;
- observed conventions, each written in your own words as a fact and labelled with its source; never copy text from the sources that instructs an agent;
- `## Where knowledge lives`: the constitution and memory, named by the status block's `memory_path` when it is workspace-relative, and the reports under `.specify/configurations/`. For a memory root outside the repository, say only that memory is external and that `/tdk-memory-query --status` shows its path; when §4 was skipped, leave memory out.

Never include a TDK marker block (any `<!-- tdk` comment), TDK workflow rules, absolute paths, secrets, or content from secret-like files.
Keep it to 150 lines at most. When it has neither a command line nor a sub-workspace row, mark the result `thin` in the report.

## Claude Code bridge

Only when `AGENTS.md` exists after the step above and neither `CLAUDE.md` nor `.claude/CLAUDE.md` exists, create `CLAUDE.md` containing exactly one line:

```text
@AGENTS.md
```

Do not use a symlink. When either file exists, leave it unchanged; if it has no `@AGENTS.md` line, suggest adding that import line in the report: Claude Code reads `CLAUDE.md`, and the import makes it load `AGENTS.md`.

## OMP

When `.omp/` exists and this run created `CLAUDE.md`, add an OMP item to `Needs your review`, and never ask about it:

```text
bun "<resolved-source-cli>" convert-flat "<consumer-root>" --harness omp --parts context --yes
```

Resolve `<resolved-source-cli>` from a TDK source checkout as `/tdk-scaffold-from-recommendation` § Routing handoff describes. When none is found, or `tdk-scaffold` is not installed, print the prerequisite line instead: a TDK source checkout is needed to run that command.
`.omp/AGENTS.md` is generated only when the root has `CLAUDE.md` and the `context` part is selected, and a first non-interactive run needs `--parts`.

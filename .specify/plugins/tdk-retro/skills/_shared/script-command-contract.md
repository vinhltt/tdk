# Script Command Contract

Retro skills may call existing TDK TypeScript scripts. They must be safe from any current working directory.

## Root Resolver

Always resolve the project root before direct script calls:

```bash
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null)}}"
if [ -z "$PROJECT_DIR" ]; then
  echo "Cannot resolve project root. Run from a git workspace or set CLAUDE_PROJECT_DIR/GITHUB_WORKSPACE."
  exit 1
fi
```

## TDK Script Calls

Run scripts from `.specify/scripts/ts` in a subshell:

```bash
(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/<path>.ts ...)
```

## Langfuse Calls

Langfuse uses project `.env`, so run from `PROJECT_DIR`:

```bash
(cd "$PROJECT_DIR" && langfuse --env .env api traces list --session-id "{session-id}")
```

## Rules

- Do not use `cd .specify/scripts/ts`.
- Do not assume `CLAUDE_PROJECT_DIR` exists outside Claude Code.
- Do not mutate the parent terminal working directory.
- If a script exits non-zero, stop the current skill step and report the exact error.

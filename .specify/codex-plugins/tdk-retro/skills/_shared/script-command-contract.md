# Script Command Contract

Retro skills may call existing TDK TypeScript scripts. They must be safe from any current working directory.

## Root Resolver

Always pass the agent-resolved project root as the first shell argument before direct script calls:

```bash
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR"
  echo 'Ask the user for the project root and re-run with: -- "<agent-resolved-project-root>"'
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
- Do not discover project root from shell environment variables or git state.
- Do not mutate the parent terminal working directory.
- If a script exits non-zero, stop the current skill step and report the exact error.

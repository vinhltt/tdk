# Langfuse Trace Analysis

Langfuse is optional. Never block retro collection when trace data is unavailable.

## Required Inputs

- `langfuse` CLI on PATH
- Project `.env` with:
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - `LANGFUSE_BASE_URL`
- `{FEATURE_DIR}/sessions.jsonl` (current) and/or `{FEATURE_DIR}/sessions.txt` (legacy, read-only)

## Fetch Commands

```bash
PROJECT_DIR="$1"
if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]; then
  echo "Invalid project root: $PROJECT_DIR"
  echo 'Ask the user for the project root and re-run with: -- "<agent-resolved-project-root>"'
  exit 1
fi
(cd "$PROJECT_DIR" && langfuse --env .env api traces list --session-id "{session_id}")
(cd "$PROJECT_DIR" && langfuse --env .env api traces get "{trace_id}")
```

`{session_id}` is an extracted `.session` value, never a raw JSONL line. Build
the list as the union of both files — JSONL records in file order, then legacy
IDs in file order, deduped by ID, then the first 10.

## Reverse-Trace Recipes

Every recipe tolerates a corrupt line: `fromjson? // empty` drops it instead of
aborting the run, which a bare `jq -r` over a truncated file would not.
`host` and `user` are absent under `TDK_SESSION_IDENTITY=hashed`, hence the
`// "-"` guards.

```bash
# session ids only (feeds langfuse), tolerant of corrupt lines
jq -rR 'fromjson? // empty | select(type == "object") | select(.v == 1)
        | select(.session | type == "string") | .session' \
  .specify/specs/<ticket>/sessions.jsonl | head -10

# harness + machine per ticket
jq -rR 'fromjson? // empty | select(type == "object") | select(.v == 1)
        | [.firstSeen, .harness, .host // "-", .os, .branch // "-", .session] | @tsv' \
  .specify/specs/<ticket>/sessions.jsonl

# every session that ran on native Windows
jq -rR 'fromjson? // empty | select(type == "object") | select(.os? // "" | startswith("win32"))
        | .session' .specify/specs/*/sessions.jsonl
```

## Analysis Dimensions

| Dimension | Look For |
|---|---|
| Recurring errors | Same tool, command, or exception across sessions. |
| Token waste | Retry loops, repeated reads of same large files, bloated prompts. |
| Tool misuse | Failing tool pattern, wrong shell cwd, missing guards, bad command form. |

## Skip Reasons

Use one of these exact reason shapes:

- `langfuse CLI not installed`
- `no session file (sessions.jsonl or sessions.txt) for {FEATURE_DIR}`
- `session file present but no usable session id`
- `.env missing`
- `Langfuse fetch failed: {short error}`

Do not fabricate trace findings when skipped.

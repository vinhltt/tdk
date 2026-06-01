# Langfuse Trace Analysis

Langfuse is optional. Never block retro collection when trace data is unavailable.

## Required Inputs

- `langfuse` CLI on PATH
- Project `.env` with:
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - `LANGFUSE_BASE_URL`
- `{FEATURE_DIR}/sessions.txt`

## Fetch Commands

```bash
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null)}}"
(cd "$PROJECT_DIR" && langfuse --env .env api traces list --session-id "{session_id}")
(cd "$PROJECT_DIR" && langfuse --env .env api traces get "{trace_id}")
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
- `sessions.txt missing`
- `sessions.txt empty`
- `.env missing`
- `Langfuse fetch failed: {short error}`

Do not fabricate trace findings when skipped.

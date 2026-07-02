# Workflow Guide Format

Use this reference when creating or updating TDK route maps and runnable workflow pages.

## Guide Route Map

`projects/tdk/.specify/docs/en/guides/index.md` is the canonical guide route map for the guide area.

Rules:

- Read and update this page before rewriting routed subfiles.
- Keep it route-only and short.
- Answer "which guide should I open next?"
- Show the default epic-first flow once.
- Link every table row to a real next page.
- Do not duplicate command flags, artifact tables, or scenario details.
- Treat links from this page as the first set of subfiles to read, classify, and update.

Recommended sections:

````markdown
# TDK Guides

> One-line purpose.
> `/tdk-*` commands run in Claude Code chat, not terminal.

## Start Here

| Situation | Open | Why |
|---|---|---|

## Default Project Flow

```text
/tdk-discovery
-> /tdk-epic-prd
-> /tdk-epic-hld
-> /tdk-task-breakdown
-> child /tdk-specify
-> /tdk-clarify
-> /tdk-plan
-> /tdk-implement
```

## Choose Your Path

| I need to... | Go to |
|---|---|
````

## Progressive Workflow Guide

Use for runnable workflow pages under `guides/scenarios/` or equivalent workflow guides.

````markdown
# Workflow: <Verb + Outcome>

> Use this when: <one sentence>
> Reader level: fresher-safe | junior+ | maintainer
> Main path: <command chain>

## Fast Path

<3-8 lines showing the command sequence. No deep detail.>

## Before You Start

- <Prerequisite>
- <Wrong-place redirect>

## What You Will Produce

| Step | Command | Main artifact | Gate |
|---|---|---|---|
| 1 | `/tdk-*` | `file.md` | Check before next step |

## Step 1: <Action>

Run:

```text
/tdk-command example
```

Expected result:

- `artifact.md` exists.
- Important section says `<ready condition>`.

Continue only if:

- <gate>

If not:

- <repair command or doc link>

## Common Mistakes

| Mistake | Fix |
|---|---|

## Go Deeper

- Concept: <link>
- Reference: <link>
- Related workflow: <link>

## Maintainer Notes

- Source of truth for command flags: <link>
- Do not duplicate: <what belongs elsewhere>
````

## Named Landing Pages

Prefer self-describing names inside guide subfolders:

- `guides/setup/setup-guide.md`
- `guides/scenarios/scenario-catalog.md`
- `guides/concepts/promote-convention.md`
- `guides/concepts/glossary.md`

If a renderer or local links still require `index.md`, keep a short compatibility shim.

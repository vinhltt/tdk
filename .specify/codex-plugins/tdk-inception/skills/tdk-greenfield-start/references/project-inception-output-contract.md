# Project Inception Output Contract

Write exactly one artifact:

```text
.specify/configurations/inception/project-inception.md
```

Use `templates/project-inception.md.tpl` as the report skeleton.

## Required Fields

- selected mode: `full`, `quick`, or `unknown`
- readiness status: `ready`, `ready-with-assumptions`, or `not-ready`
- recommendation confidence: `high`, `medium`, or `low`
- project shape classification with evidence
- interview summary by taxonomy category
- assumptions separated from known facts
- unresolved questions with owner or next action when possible
- recommended next route and do-not-proceed guidance

## Recommendation Confidence

- `high`: direct brief/context evidence supports the route and critical gaps are closed.
- `medium`: route is plausible but depends on listed assumptions.
- `low`: route is only triage; more answers or a fuller inception pass are needed.

## Do-Not-Proceed Guidance

Include this guidance when readiness is `not-ready`:

- what facts are missing;
- why downstream command output would be unreliable;
- whether rerunning with `--full`, answering listed questions, or using product discovery is the safest next move.

## Completion Check

Before reporting completion, verify:

- no source code, tracker issue, spec, plan, task, topology file, or runtime config was created;
- unresolved critical gaps are not hidden in prose;
- recommendations are phrased as follow-up commands, not completed work;
- product discovery and feature clarification remain separate routes.

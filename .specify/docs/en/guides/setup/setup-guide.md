# Setup Guide

Use this when TDK commands are not visible yet, dependencies are missing, or a newly cloned consumer project needs local setup.

## Fast Path

Run from the consumer project root:

```bash
bash .specify/setup.sh
```

The script checks prerequisites, installs Bun when missing, installs TypeScript setup dependencies, creates or verifies the Python venv, checks config detection, and registers available command metadata.

## Options

```bash
bash .specify/setup.sh --help
bash .specify/setup.sh --force
bash .specify/setup.sh --skip-venv
bash .specify/setup.sh --skip-config
```

## After Setup

Follow the manual steps printed by the script. At minimum:

- Install Claude Code if the script reports that it is missing.
- Enable Context7 integration when docs-seeker support is needed.
- Open Claude Code at the consumer project root.
- Verify `/tdk-` commands are visible in Claude Code chat.

For selective harness installs, choose the command set that matches the workflow
you need: child feature, parent epic, or both. After install, verify the `/tdk-`
commands for that workflow are visible in Claude Code chat.

## Troubleshooting

| Problem | What to do |
|---|---|
| Bun install failed | Re-run `bash .specify/setup.sh`; if it still fails, install Bun manually from `https://bun.sh`. |
| Python venv failed | Re-run without `--skip-venv`; make sure Python 3.8+ is available. |
| Command registration failed | Install Claude Code, then re-run setup. |
| `/tdk-` commands are not visible | Restart Claude Code from the project root after setup completes. |

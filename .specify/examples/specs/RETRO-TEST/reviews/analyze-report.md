# Analyze Report

## Findings

1. High: Script commands should not rely on the caller's current working directory.
   - Evidence: repeated failures can happen when a persistent terminal is already inside `.specify/scripts/ts`.

2. Medium: Memory updates must go through `/tdk-memory-update`.
   - Evidence: direct edits risk checksum drift in `memory.yaml`.

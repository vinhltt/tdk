# RETRO-TEST Spec

## Overview

Fixture spec for validating the TDK retro self-learning flow.

## Requirements

- Collect review signals from `reviews/analyze-report.md`.
- Detect one intentional phase drift in `phases/phase-02-implement.md`.
- Read UT signals from `ut/plan.md`.
- Record Langfuse trace behavior as fetched or skipped.

## Acceptance Criteria

- `/tdk-retro-collect RETRO-TEST` can create `retro-feedback.md`.
- `/tdk-retro-propose RETRO-TEST` can create `learning-delta.md`.
- `/tdk-retro-apply RETRO-TEST` can review and apply approved entries.

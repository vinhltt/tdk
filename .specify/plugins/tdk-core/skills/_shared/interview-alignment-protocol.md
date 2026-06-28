# Interview Alignment Protocol

Use this reference for opt-in `--interview` gates that check artifact alignment
before a command reports completion. The interview confirms that the generated
artifact says what the user intended; it is not user research, usability testing,
or a replacement for `/tdk-clarify`.

## Question Budget

Ask 3-6 questions, one at a time. Each question must point at a concrete claim
already written in the artifact set.

Use a mix of:

- teach-back: ask the user to restate the artifact's main claim in their words.
- challenge: ask what claim, omission, or priority feels wrong.
- forced boundary: ask the user to choose which side of a documented boundary is
  correct.
- contradiction probe: ask about a likely conflict between two artifact claims.

## Claim Map

Before asking, build a short internal claim map from the artifact sections the
command owns. Prefer claims that would materially affect scope, requirements,
success criteria, risk, or readiness.

## Answer States

Classify every answer as:

- `aligned`: the artifact matches intent.
- `mismatch`: the artifact says the wrong thing, misses a needed boundary, or
  includes something the user rejects.
- `unclear`: the user cannot decide yet or the answer reveals a still-open
  decision.

Critical mismatch means the current artifact would mislead the next workflow
step if left unchanged.

## Completion Rule

Critical mismatch must be integrated into the artifact or explicitly accepted as
unresolved before command completion. Do not move on with a known mismatch hidden
in chat.

## Persistence Rule

Persist only durable artifact changes, concise accepted decisions, and
unresolved/open questions in the command's existing output files. Do not persist a full raw transcript.

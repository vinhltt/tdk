# L4 (global) - docs/rules/test/ut-rule.md
Base UT conventions for all projects.

## Test Framework
- Jest 29
- ts-jest transformer

## Coverage
- Minimum: 80%
- Report: lcov

## Mocking Strategy
- Use jest.fn() for unit-level mocks
- No network calls in unit tests

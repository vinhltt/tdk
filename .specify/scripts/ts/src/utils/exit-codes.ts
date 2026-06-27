export const EXIT_SUCCESS = 0;
export const EXIT_VALIDATION = 1;
export const EXIT_STALE_PLAN = 2;
export const EXIT_FAIL_CLOSED = 3;

export type CliExitCode =
  | typeof EXIT_SUCCESS
  | typeof EXIT_VALIDATION
  | typeof EXIT_STALE_PLAN
  | typeof EXIT_FAIL_CLOSED;

export class CliExitError extends Error {
  readonly exitCode: CliExitCode;
  readonly failureGate?: string;

  constructor(message: string, exitCode: CliExitCode = EXIT_VALIDATION, failureGate?: string) {
    super(message);
    this.name = 'CliExitError';
    this.exitCode = exitCode;
    this.failureGate = failureGate;
  }
}

export function getExitCode(error: unknown): CliExitCode {
  if (error instanceof CliExitError) {
    return error.exitCode;
  }
  return EXIT_VALIDATION;
}

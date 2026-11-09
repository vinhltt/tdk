// Shared inputs for the file-pointer rule. The handoff sanitizer suite and the review parity suite both
// import these lists, so the two sanitizers are checked against the same cases. Keep this a plain module,
// not a `.test.ts` file: importing a test file would re-run its `describe` blocks in the importing suite.

/** Pointers whose file names contain a credential word; each must pass through unchanged. */
export const KEPT_FILE_POINTERS: readonly string[] = [
  'x-auth-y.md:177, kept?',
  'hooks/session-tracker.cjs:12 trailing',
  'src/api-gateway.ts:10 trailing',
  'token-service.cs:45 trailing',
  'See `x-auth-y.md:177` here',
  'auth.ts:42 trailing',
  'auth.ts:12-15 trailing',
  'auth.ts:12:5 trailing',
  'src/api-gateway.ts:10: error TS2322',
  'See auth.ts:177.',
  '(session.py:45)',
  'auth.ts:12 and session.py:45 both',
  '**x-auth-y.md:177**',
  '**session-tracker.cjs:12**: foo',
  '~~auth.ts:12~~',
  '|auth.ts:12|',
  '(see auth.ts:12.)',
  '[auth.ts:12](auth.ts#L12) x',
  'auth.mts:12 trailing',
  'token-types.cts:7 trailing',
  '- See x-auth-y.md:177\n  - nested one\n  - nested two\n- next item',
];

export const POINTER_FOCUS = 'fix session-tracker.cjs:12 regression';

export interface LeakCase {
  /** Full sanitizer input. */
  input: string;
  /** Substring of `input` that must not survive sanitization. */
  value: string;
}

function leak(before: string, value: string, after = ''): LeakCase {
  return { input: `${before}${value}${after}`, value };
}

/** Real assignments, values glued to a pointer, long digit runs and indented `grep -n` lines. */
export const LEAK_CASES: readonly LeakCase[] = [
  leak('DB_PASSWORD=', '123456', ' tail'),
  leak('db.password: ', '123456'),
  leak('db.password:', '123456'),
  leak('db.password:', '123abc'),
  leak('app.secret:', '42'),
  leak('api.key:', '12345'),
  leak('auth.token:', '123456'),
  leak('auth.code:', '123456'),
  leak('auth.pin:', '1234'),
  leak('session.id:', '1234567'),
  leak('token.value:', '99'),
  leak('credential.pin:', '1234'),
  leak('server.key:', '42'),
  leak('auth.ts:', '123abc'),
  leak('auth.ts:12:', 'hunter2'),
  leak('auth.ts:', 'hunter2'),
  leak('auth.ts:12-', 'fake-secret'),
  leak('auth.ts:12,', 'fake-secret'),
  leak('auth.ts:12.', 'fake-secret'),
  leak('auth.ts:12 password=', 'hunter2'),
  leak('auth.ts:12: password=', 'hunter2'),
  leak('auth.ts:12 api_key: ', 'fake-key'),
  leak('auth.ts:12)', 'hunter2'),
  leak("auth.ts:12'", 'hunter2'),
  leak('auth.ts:12`', 'hunter2'),
  leak('auth.ts:12]', 'hunter2'),
  leak('auth.ts:12}', 'hunter2'),
  leak('auth.ts:12>', 'hunter2'),
  leak('credentials.json:123"', '456', '"'),
  leak('session.go:12)', 'fake-secret-tail', ',and,more'),
  leak('session.json:', '12345678901234567890'),
  leak('auth.cc:', '1234567890123456'),
  leak('auth.sh:', '123456'),
  leak('credentials.json:12:  "value": "', 'fake-literal-value', '"'),
  leak('auth.ts:12:\tconst fallback = "', 'fake-literal-value', '";'),
  leak('session.py:44:    return "', 'fake-literal-value', '"'),
];

/**
 * Accepted fail-open: a bare value right after an allowlisted pointer, a digit value split into groups,
 * and a value on the next indented line all read exactly like a real pointer, so they pass unchanged.
 */
export const ACCEPTED_FAIL_OPEN: readonly string[] = [
  'credentials.json:1234',
  'auth.sh:12345',
  'auth.ts:12: hunter2',
  'auth.ts:12](hunter2',
  'auth.ts:12** hunter2',
  'auth.ts:12\n  hunter2',
  'DB_PASSWORD.sh:1234',
  'credentials.json:12345-67890:12345',
  'credentials.json:4111-1111',
];

/**
 * Accepted over-redaction: extensions outside the allowlist, `grep -n` output, comma ranges, long digit
 * groups, pointers followed by more JSON, and names with no line number are still redacted. The last case
 * also loses its nested line, which is a separate, known defect of the indentation rule.
 */
export const ACCEPTED_OVER_REDACTION: readonly string[] = [
  'session-notes.txt:12 x',
  'auth.conf:3 x',
  'huge-auth.js:123456',
  'session-tracker.cjs:12:const x = 1',
  'auth.ts:12,15',
  '{"path":"auth.ts:12","mode":"x"}',
  'auth.ts:12:5:  error',
  '- auth.ts: handles login\n  - nested one',
];

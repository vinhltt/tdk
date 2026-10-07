import { describe, expect, it } from 'bun:test';
import {
  containsSensitiveHandoffText,
  sanitizeHandoffText,
} from '../../../plugins/tdk-utils/skills/tdk-handoff/scripts/handoff-redaction';

const awsId = `AKIA${'Q'.repeat(16)}`;
const awsSecret = 'fabricatedAWSsecretMaterial0123456789abcd/';
const githubToken = `ghp_${'T'.repeat(36)}`;
const githubFineGrained = `github_pat_${'F'.repeat(30)}`;
const slackToken = 'xoxb-1234567890-fabricated-slack-material';
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.ZmFicmljYXRlZFNpZ25hdHVyZQ';

function expectSecretAbsent(text: string, ...secrets: string[]): void {
  for (const secret of secrets) expect(text).not.toContain(secret);
}

describe('sanitizeHandoffText', () => {
  it('preserves prose, relative pointers, public URLs and ordinary identifiers', () => {
    const input = [
      'Review src/commands/util/example.ts:25 and ./tests/example.test.ts.',
      'See ../reports/decision.md and .specify/handoffs/20261004-review.md.',
      'Keep I/O, and/or, 80/20, application/json and --dry-run unchanged.',
      'https://example.com/api/docs?q=handoff&page=2#overview',
      'https://example.com/a(b) and https://example.com/a%20b.',
      'git://github.com/example/project.git and mailto:sender@example.com',
      '//example.com/docs?q=public and \"//example.com/docs\"',
      'key: keyboard shortcut; monkey: animal; session notes are not assignments.',
      'source_task: task-171; PUBLIC_PORT=8080; VERSION=1.2.3',
      'Not captured in this session',
    ].join('\n');
    expect(sanitizeHandoffText(input)).toEqual({ text: input, redactions: 0 });
    expect(containsSensitiveHandoffText(input)).toBe(false);
  });

  it('removes whole PEM blocks rather than exposing their lines or labels', () => {
    const input = [
      'Before',
      '-----BEGIN RSA PRIVATE KEY-----',
      'fake-private-key-line-one',
      'fake-private-key-line-two',
      '-----END RSA PRIVATE KEY-----',
      'After',
    ].join('\n');
    expect(sanitizeHandoffText(input)).toEqual({
      text: 'Before\n[REDACTED:private-key-block]\nAfter',
      redactions: 1,
    });
  });

  it('removes an incomplete private-key block through the end of the input', () => {
    const result = sanitizeHandoffText('-----BEGIN OPENSSH PRIVATE KEY-----\nfake-unclosed-private-material');
    expect(result).toEqual({ text: '[REDACTED:private-key-block]', redactions: 1 });
  });

  it('redacts AWS credentials in both token and assignment contexts', () => {
    const input = [
      `Observed ${awsId}.`,
      `AWS_SECRET_ACCESS_KEY=${awsSecret}`,
      'aws_secret_access_key: "short-fake-secret"',
      'AWS_SESSION_TOKEN="fake-session-credential"',
    ].join('\n');
    const result = sanitizeHandoffText(input);
    expect(result.redactions).toBe(4);
    expect(result.text).toContain('[REDACTED:aws-key-id]');
    expect(result.text).toContain('AWS_SECRET_ACCESS_KEY=[REDACTED:aws-key]');
    expect(result.text).toContain('AWS_SESSION_TOKEN="[REDACTED:env-value]"');
    expectSecretAbsent(result.text, awsId, awsSecret, 'short-fake-secret', 'fake-session-credential');
  });

  it('uses specific markers for GitHub, Slack and JWT credentials', () => {
    const input = `${githubToken}\n${githubFineGrained}\n${slackToken}\n${jwt}`;
    expect(sanitizeHandoffText(input)).toEqual({
      text: '[REDACTED:github-token]\n[REDACTED:github-token]\n[REDACTED:slack-token]\n[REDACTED:jwt]',
      redactions: 4,
    });
  });

  it('redacts Bearer and Basic headers without retaining credential fragments', () => {
    const result = sanitizeHandoffText([
      'Authorization: Bearer fakeBearerMaterial12345',
      'Proxy-Authorization: Basic ZmFrZTpmYWtlcGFzc3dvcmQ=',
      `Authorization: Bearer ${jwt}`,
    ].join('\n'));
    expect(result.redactions).toBe(3);
    expect(result.text).toContain('Authorization: [REDACTED:bearer]');
    expect(result.text).toContain('Proxy-Authorization: [REDACTED:basic-auth]');
    expect(result.text).toContain('Authorization: [REDACTED:jwt]');
    expectSecretAbsent(result.text, 'fakeBearerMaterial12345', 'ZmFrZTpmYWtlcGFzc3dvcmQ=', jwt);
  });

  it('redacts generic API and credential-like environment assignments', () => {
    const input = [
      'api_key: tiny-fake',
      'access-token = "fake spaced value"',
      'export DATABASE_PASSWORD=another-fake-value',
      'CLIENT_CREDENTIAL=credential-value',
      'SESSION_COOKIE=session-value',
      'PRIVATE_KEY=private-value',
      'secret: secret-value',
      '"client_secret": "json-fake-secret", "safe": "kept"',
    ].join('\n');
    const result = sanitizeHandoffText(input);
    expect(result.redactions).toBe(8);
    expect(result.text).toContain('[REDACTED:api-key]');
    expect(result.text).toContain('[REDACTED:env-value]');
    expect(result.text).toContain('"safe": "kept"');
    expectSecretAbsent(result.text, 'tiny-fake', 'fake spaced value', 'another-fake-value',
      'credential-value', 'session-value', 'private-value', 'secret-value', 'json-fake-secret');
  });

  it('does not expose punctuation-delimited fragments or new secrets after a marker', () => {
    const result = sanitizeHandoffText('API_KEY=fake-head,fake-middle;fake-tail]\nsecret: [REDACTED:api-key] fake-new-secret');
    expect(result).toEqual({
      text: 'API_KEY=[REDACTED:api-key]\nsecret: [REDACTED:api-key]',
      redactions: 2,
    });
    expectSecretAbsent(result.text, 'fake-head', 'fake-middle', 'fake-tail', 'fake-new-secret');
  });

  it('consumes adjacent shell quote segments while preserving following assignments', () => {
    const input = [
      'API_KEY="fake-head"fake-tail PUBLIC_PORT=8080',
      'TOKEN="fake-double-head"\'fake-single-middle\'fake-end VERSION=1.2.3',
      'PASSWORD=fake-unquoted-head"fake quoted middle"\'fake-final-tail\' SAFE=kept',
      'API_KEY="fake-first"fake-last AUTH_TOKEN="fake-next"next-tail PUBLIC=kept',
      String.raw`SECRET='fake-backslash\'fake-quote-tail KEEP=unchanged`,
      'API_KEY="fake-semicolon-head"fake-semicolon-tail;PUBLIC_MODE=release',
      'SECRET=fake-and-head"fake-and-tail"&&SAFE_MODE=release',
      'TOKEN="fake-or-head"fake-or-tail||SAFE_FALLBACK=kept',
    ].join('\n');
    const result = sanitizeHandoffText(input);
    expect(result.redactions).toBe(9);
    for (const safe of ['PUBLIC_PORT=8080', 'VERSION=1.2.3', 'SAFE=kept', 'PUBLIC=kept',
      'KEEP=unchanged', 'PUBLIC_MODE=release', 'SAFE_MODE=release', 'SAFE_FALLBACK=kept']) {
      expect(result.text).toContain(safe);
    }
    expectSecretAbsent(result.text, 'fake-head', 'fake-tail', 'fake-double-head',
      'fake-single-middle', 'fake-end', 'fake-unquoted-head', 'fake quoted middle',
      'fake-final-tail', 'fake-first', 'fake-last', 'fake-next', 'next-tail',
      'fake-backslash', 'fake-quote-tail', 'fake-semicolon-head', 'fake-semicolon-tail',
      'fake-and-head', 'fake-and-tail', 'fake-or-head', 'fake-or-tail');
    expect(sanitizeHandoffText(result.text)).toEqual({ text: result.text, redactions: 0 });
  });

  it('consumes authorization assignment schemes together with their credential words', () => {
    const input = [
      'Authorization=Bearer fake-equals-bearer PUBLIC_PORT=8080',
      'Proxy_Authorization=Basic fake-equals-basic SAFE=kept',
      `Authorization=Bearer ${jwt} VERSION=1.2.3`,
    ].join('\n');
    expect(sanitizeHandoffText(input)).toEqual({
      text: [
        'Authorization=[REDACTED:bearer] PUBLIC_PORT=8080',
        'Proxy_Authorization=[REDACTED:basic-auth] SAFE=kept',
        'Authorization=[REDACTED:jwt] VERSION=1.2.3',
      ].join('\n'),
      redactions: 3,
    });
  });

  it('recognizes either order of YAML indentation and chomping indicators', () => {
    const indicators = ['|2-', '|2+', '>2-', '>2+', '|-2', '|+2', '>-2', '>+2'];
    for (const indicator of indicators) {
      const input = [
        `api_key: ${indicator} # fabricated credential`,
        '  fake-first-line',
        '  fake-second-line',
        'safe: kept',
      ].join('\n');
      const result = sanitizeHandoffText(input);
      expect(result).toEqual({
        text: 'api_key: [REDACTED:api-key]\nsafe: kept',
        redactions: 1,
      });
      expectSecretAbsent(result.text, 'fake-first-line', 'fake-second-line');
    }
  });

  it('consumes multiline quoted, triple-quoted, folded and continued assignments', () => {
    const input = [
      'API_KEY="fake-first-line',
      'fake-second-line"',
      "PASSWORD='''fake-triple-first",
      "fake-triple-second'''",
      'client_secret: |',
      '  fake-folded-first',
      '  fake-folded-second',
      'safe: kept',
      'AUTH_TOKEN=fake-continuation-one\\',
      'fake-continuation-two',
      'END=kept',
    ].join('\n');
    const result = sanitizeHandoffText(input);
    expect(result.redactions).toBe(4);
    expect(result.text).toContain('safe: kept');
    expect(result.text).toContain('END=kept');
    expectSecretAbsent(result.text, 'fake-first-line', 'fake-second-line', 'fake-triple-first',
      'fake-triple-second', 'fake-folded-first', 'fake-folded-second',
      'fake-continuation-one', 'fake-continuation-two');
  });

  it('redacts assignment values on indented following lines and unterminated quotes', () => {
    const result = sanitizeHandoffText('api_key=\r\n  fake-next-line\r\nsafe: kept\r\nTOKEN="fake-unclosed\r\nfake-tail');
    expect(result.redactions).toBe(2);
    expect(result.text).toContain('safe: kept');
    expectSecretAbsent(result.text, 'fake-next-line', 'fake-unclosed', 'fake-tail');
  });

  it('redacts a next-line API value even when capture omitted indentation', () => {
    expect(sanitizeHandoffText('api_key:\nfake-unindented-value\nsafe: kept')).toEqual({
      text: 'api_key:[REDACTED:api-key]\nsafe: kept',
      redactions: 1,
    });
  });

  it('counts a specific credential in a sensitive assignment only once', () => {
    const result = sanitizeHandoffText(`api_key=${jwt}\nTOKEN=${githubToken}\nSECRET=${slackToken}`);
    expect(result).toEqual({
      text: 'api_key=[REDACTED:jwt]\nTOKEN=[REDACTED:github-token]\nSECRET=[REDACTED:slack-token]',
      redactions: 3,
    });
  });

  it('counts URL credentials inside sensitive assignments only once', () => {
    const result = sanitizeHandoffText([
      'TOKEN=https://example.com/private?token=fake-query-secret;comment',
      'PASSWORD="https://fake-user:fake-pass@example.com/private"',
    ].join('\n'));
    expect(result).toEqual({
      text: 'TOKEN=[REDACTED:signed-url]\nPASSWORD="[REDACTED:basic-auth-url]"',
      redactions: 2,
    });
    expectSecretAbsent(result.text, 'fake-query-secret', 'fake-user', 'fake-pass');
  });

  it('removes whole credential URLs, including username-only credentials', () => {
    const urls = [
      'https://fake-user:fake-password@example.com/private',
      'postgresql://fake-db-user:fake-db-pass@db.example.com/database',
      'mongodb+srv://fake-mongo:fake-pass@db.example.com/data',
      'ssh://fake-user:fake-password@example.com/repo',
      'https://fake-user@example.com/private',
    ];
    const result = sanitizeHandoffText(urls.join('\n'));
    expect(result.redactions).toBe(urls.length);
    expect(result.text).toContain('[REDACTED:basic-auth-url]');
    expect(result.text).toContain('[REDACTED:db-url]');
    expect(result.text).toContain('[REDACTED:credential-url]');
    expectSecretAbsent(result.text, ...urls, 'fake-user', 'fake-password', 'fake-db-user', 'fake-db-pass');
  });

  it('removes entire signed URLs with encoded and case-insensitive query names', () => {
    const urls = [
      'https://example.com/file?token=fake-token&download=1',
      'https://example.com/file?sig=fake-signature',
      'https://example.com/file?signature=fake-signature',
      'https://example.com/file?X-Amz-Signature=fake-aws-signature',
      'https://example.com/file?X-Goog-Signature=fake-google-signature',
      'https://example.com/file?Goog-Signature=fake-google-signature',
      'https://example.com/file?sv=2026&sig=fake-sas-signature',
      'https://example.com/file?%74%6f%6b%65%6e=fake-encoded-token',
      'https://example.com/file?ACCESS_TOKEN=fake-access-token',
    ];
    expect(sanitizeHandoffText(urls.join('\n'))).toEqual({
      text: urls.map(() => '[REDACTED:signed-url]').join('\n'),
      redactions: urls.length,
    });
  });

  it('redacts legal apostrophes throughout credential and signed URLs', () => {
    const urls = [
      "https://fake-user:pa'ss@example.com/private",
      "https://fake'user:fake-password@example.com/private",
      "//fake-user:pa'ss@example.com/private",
      "postgresql://fake-user:pa'ss@db.example.com/database",
      "https://example.com/file?token=fake-head'fake-tail&download=1",
      "https://example.com/file?sig=fake-head'fake-tail",
      "//example.com/file?signature=fake-head'fake-tail",
    ];
    const result = sanitizeHandoffText(urls.join('\n'));
    expect(result.redactions).toBe(urls.length);
    expectSecretAbsent(result.text, ...urls, 'fake-user', "fake'user", "pa'ss",
      'fake-password', 'fake-head', 'fake-tail');
    for (const url of urls) expect(containsSensitiveHandoffText(url)).toBe(true);
    expect(sanitizeHandoffText(result.text)).toEqual({ text: result.text, redactions: 0 });
  });

  it('preserves Markdown and string delimiters around apostrophe-bearing URLs', () => {
    const result = sanitizeHandoffText([
      "'https://fake-user:pa'ss@example.com/private',",
      '`https://example.com/file?sig=fake-head\'fake-tail`',
      '[private](https://fake-user:pa\'ss@example.com/private).',
      '[signed](\'https://example.com/file?token=fake-head\'fake-tail\')',
      '"https://example.com/file?token=fake-head\'fake-tail"',
      "https://example.com/docs?q=reader's-guide",
      "'https://example.com/docs?q=reader's-guide'",
    ].join('\n'));
    expect(result).toEqual({
      text: [
        "'[REDACTED:basic-auth-url]',",
        '`[REDACTED:signed-url]`',
        '[private]([REDACTED:basic-auth-url]).',
        "[signed]('[REDACTED:signed-url]')",
        '"[REDACTED:signed-url]"',
        "https://example.com/docs?q=reader's-guide",
        "'https://example.com/docs?q=reader's-guide'",
      ].join('\n'),
      redactions: 5,
    });
    expectSecretAbsent(result.text, 'fake-user', "pa'ss", 'fake-head', 'fake-tail');
  });

  it('keeps Markdown delimiters around redacted URLs and leaves safe URLs alone', () => {
    const result = sanitizeHandoffText('See [private](https://example.com/file?sig=fake-sig), then https://example.com/docs?q=1.');
    expect(result).toEqual({
      text: 'See [private]([REDACTED:signed-url]), then https://example.com/docs?q=1.',
      redactions: 1,
    });
  });

  it('redacts known credentials embedded in otherwise public URLs', () => {
    const result = sanitizeHandoffText([
      `https://example.com/token/${githubToken}`,
      `https://example.com/${jwt}`,
      `https://example.com/private/prefix-${githubToken}`,
    ].join('\n'));
    expect(result).toEqual({
      text: '[REDACTED:github-token]\n[REDACTED:jwt]\n[REDACTED:github-token]',
      redactions: 3,
    });
  });

  it('removes internal hosts and private CIDRs but not public IPs or lookalike words', () => {
    const sensitive = [
      'https://api.internal/private',
      'http://db.corp:8080/query',
      'https://api.staging.example.com/status',
      'http://10.4.3.2/path',
      'http://172.16.0.8/path',
      'http://192.168.3.9/path',
      'http://[fd00::123]/path',
      'worker.internal',
      'build.corp',
      'api.staging.example.com',
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
    ];
    const safe = 'https://172.32.0.1/public https://8.8.8.8/docs internal architecture corporate staging notes';
    const result = sanitizeHandoffText(`${sensitive.join('\n')}\n${safe}`);
    expect(result.redactions).toBe(sensitive.length);
    expectSecretAbsent(result.text, ...sensitive);
    expect(result.text).toContain(safe);
    expect(result.text).toContain('[REDACTED:internal-host]');
  });

  it('redacts sentence-ending internal names without matching public suffix lookalikes', () => {
    expect(sanitizeHandoffText('Use worker.internal. Keep worker.internal.example.com public.')).toEqual({
      text: 'Use [REDACTED:internal-host]. Keep worker.internal.example.com public.',
      redactions: 1,
    });
  });

  it('redacts absolute Windows, UNC, POSIX and file URLs without exposing machine names', () => {
    const paths = [
      String.raw`C:\Users\FakePerson\project\file.ts`,
      'D:/work/private/file.ts:42',
      String.raw`\\fake-server\private-share\project\file.ts`,
      '//fake-server/private-share/file.ts',
      '/home/fake-person/private/file.ts',
      '/tmp/fake-project/output',
      'file:///home/fake-person/private/file.ts',
      'file:///C:/Users/FakePerson/private/file.ts',
      String.raw`"C:\Users\Fake Person\project\file.ts"`,
      '"/home/Fake Person/private/file.ts"',
      'C://Users/FakePerson/private/file.ts',
      String.raw`/home/Fake\ Person/private/file.ts`,
    ];
    const result = sanitizeHandoffText(paths.join('\n'));
    expect(result.redactions).toBe(paths.length);
    expectSecretAbsent(result.text, ...paths, 'FakePerson', 'Fake Person', 'fake-person', 'fake-server', 'private-share');
    expect(result.text).toContain('[REDACTED:absolute-path]');
  });

  it('preserves the public specify command without exempting other absolute paths', () => {
    const input = [
      'Run /tdk-specify 172 seed after verifying live state.',
      'Run `/tdk-specify 172 seed` after verifying live state.',
      'Run "/tdk-specify 172 seed" after verifying live state.',
      '/tdk-specify',
      '`/tdk-specify`',
      '/tdk-specify 172 seed /home/fake-person/project',
      '`/tdk-specify 172 seed /home/fake-person/project`',
      String.raw`/tdk-specify 172 seed C:\Users\FakePerson\project`,
      '/private /tdk-private /tdk-specify/private /tdk-specify.exe /unknown-specify',
      '"/private path" `/tdk-specify/private path`',
    ].join('\n');
    const result = sanitizeHandoffText(input);
    expect(result).toEqual({
      text: [
        'Run /tdk-specify 172 seed after verifying live state.',
        'Run `/tdk-specify 172 seed` after verifying live state.',
        'Run "/tdk-specify 172 seed" after verifying live state.',
        '/tdk-specify',
        '`/tdk-specify`',
        '/tdk-specify 172 seed [REDACTED:absolute-path]',
        '`/tdk-specify 172 seed [REDACTED:absolute-path]`',
        '/tdk-specify 172 seed [REDACTED:absolute-path]',
        Array(5).fill('[REDACTED:absolute-path]').join(' '),
        '"[REDACTED:absolute-path]" `[REDACTED:absolute-path]`',
      ].join('\n'),
      redactions: 10,
    });
    expectSecretAbsent(result.text, 'fake-person', 'FakePerson', '/private', '/tdk-private',
      '/tdk-specify/private', '/tdk-specify.exe', '/unknown-specify');
    expect(sanitizeHandoffText(result.text)).toEqual({ text: result.text, redactions: 0 });
  });

  it('is idempotent and counts occurrences rather than unique values', () => {
    const existing = '[REDACTED:api-key] [REDACTED:jwt] [REDACTED:absolute-path]';
    const result = sanitizeHandoffText(`${existing}\napi_key=${githubToken}\n${githubToken}\n${githubToken}`);
    expect(result.redactions).toBe(3);
    expect(result.text).toContain(existing);
    expect(sanitizeHandoffText(result.text)).toEqual({ text: result.text, redactions: 0 });
    expect(containsSensitiveHandoffText(result.text)).toBe(false);
  });

  it('does not re-redact markers inside sensitive assignments or quotes', () => {
    const input = 'API_KEY=[REDACTED:api-key]\nTOKEN="[REDACTED:github-token]"\nsecret: [REDACTED:private-key-block]';
    expect(sanitizeHandoffText(input)).toEqual({ text: input, redactions: 0 });
  });

  it('applies all categories together without overlapping counts or raw residues', () => {
    const input = [
      `AWS_SECRET_ACCESS_KEY=${awsSecret}`,
      `Authorization: Bearer ${jwt}`,
      `api_key=${githubToken}`,
      slackToken,
      'https://fake-user:fake-password@private.internal/file?token=fake-query',
      'https://example.com/file?sig=fake-signed-query',
      '/home/fake-person/project',
      'worker.internal',
      '-----BEGIN PRIVATE KEY-----',
      'fake-private-block',
      '-----END PRIVATE KEY-----',
      'DATABASE_PASSWORD="fake-password-line-one',
      'fake-password-line-two"',
    ].join('\n');
    const result = sanitizeHandoffText(input);
    expect(result.redactions).toBe(10);
    expectSecretAbsent(result.text, awsSecret, jwt, githubToken, slackToken, 'fake-user',
      'fake-password', 'private.internal', 'fake-query', 'fake-signed-query',
      'fake-person', 'worker.internal', 'fake-private-block', 'fake-password-line-one', 'fake-password-line-two');
    expect(sanitizeHandoffText(result.text)).toEqual({ text: result.text, redactions: 0 });
  });

  it('sanitizes sensitive protocol-relative URLs while retaining public endpoints', () => {
    expect(sanitizeHandoffText('//example.com/file?sig=fake-signature //api.internal/private //fake-user:fake-pass@example.com/private')).toEqual({
      text: '[REDACTED:signed-url] [REDACTED:internal-host] [REDACTED:basic-auth-url]',
      redactions: 3,
    });
  });
  it('redacts doubled-quote and continued YAML scalar credentials without consuming the next key', () => {
    for (const value of ["api_key: 'fake-head''fake-tail'", "api_key: '''fake-head''''fake-tail'", 'api_key: fake-head\n  fake-tail']) {
      const input = `${value}\npublic_note: keep-this-evidence`;
      const result = sanitizeHandoffText(input);
      expectSecretAbsent(result.text, 'fake-head', 'fake-tail');
      expect(result.text).toContain('public_note: keep-this-evidence');
      expect(sanitizeHandoffText(result.text)).toEqual({ text: result.text, redactions: 0 });
    }
  });

  it('redacts Unicode absolute paths from their first component and preserves relative Unicode paths', () => {
    const result = sanitizeHandoffText('/秘密/fake-person/project and 秘密/relative.ts and /tdk-specify 172 seed');
    expectSecretAbsent(result.text, '/秘密', 'fake-person', '/project');
    expect(result.text).toContain('秘密/relative.ts');
    expect(result.text).toContain('/tdk-specify 172 seed');
    expect(sanitizeHandoffText(result.text)).toEqual({ text: result.text, redactions: 0 });
    expect(sanitizeHandoffText('cafe\u0301/relative.ts')).toEqual({ text: 'cafe\u0301/relative.ts', redactions: 0 });
  });
});

describe('containsSensitiveHandoffText', () => {
  it('accepts a safe public command focus but refuses sensitive command arguments', () => {
    for (const focus of ['/tdk-specify 172 seed', '`/tdk-specify 172 seed`']) {
      expect(containsSensitiveHandoffText(focus)).toBe(false);
    }
    for (const focus of [
      '/tdk-specify 172 /home/fake-person/project',
      '`/tdk-specify 172 /home/fake-person/project`',
      String.raw`/tdk-specify 172 C:\Users\FakePerson\project`,
      "/tdk-specify 172 https://fake-user:pa'ss@example.com/private",
      '/tdk-specify 172 https://example.com/file?token=fake-head\'fake-tail',
    ]) {
      expect(containsSensitiveHandoffText(focus)).toBe(true);
    }
  });

  it('uses exactly the sanitizer boundary for focus and slug refusal', () => {
    const values = ['', 'plain-focus', githubToken, slackToken, jwt, awsId,
      'api_key=fake', '/home/fake-person/project', 'https://example.com/file?token=fake',
      '[REDACTED:api-key]', 'src/file.ts', 'https://example.com/docs'];
    for (const value of values) {
      expect(containsSensitiveHandoffText(value)).toBe(sanitizeHandoffText(value).text !== value);
    }
  });
});

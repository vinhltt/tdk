import { describe, expect, it } from 'bun:test';
import { sanitizeReviewText } from '../scripts/review-redaction';

const awsId = `AKIA${'Q'.repeat(16)}`;
const awsSecret = 'fabricatedAWSsecretMaterial0123456789abcd/';
const githubToken = `ghp_${'T'.repeat(36)}`;
const githubFineGrained = `github_pat_${'F'.repeat(30)}`;
const slackToken = 'xoxb-1234567890-fabricated-slack-material';
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.ZmFicmljYXRlZFNpZ25hdHVyZQ';
const marker = '[REDACTED:absolute-path]';

describe('sanitizeReviewText', () => {
  it('keeps slash commands, skill locators, routes and closing tags', () => {
    const keep = [
      '/tdk-plan sample-001 "x"',
      'skill: /backend-checks',
      'GET /health',
      '/api/items/count',
      '<span>a</span>',
      '`/tdk-plan sample-001 "x"`',
      '"/api/items count"',
      '[/backend-checks]',
      '/api/v1.home/x',
      '/api/my-home/x',
      '/docs/home',
      '/api/users/home',
      '/home-page',
      '/tmpl/x',
      '/api/a:/b',
      '/v1/items:batch',
      '/api//x',
      '/redirect?to=https://example.com/x',
      '`/a` and `/b`',
      '/api/c/Users/x',
      '/api/c/home',
      '/p/homepage',
      '/v/users/1',
      '/cygdrives/x',
      '/search?q=sig',
      '/items?page=2&sort=name',
      '/files/x',
      '/api/profile:x',
    ];
    for (const input of keep) expect(sanitizeReviewText(input)).toEqual({ text: input, redactions: 0 });
  });

  it('redacts paths that disclose machine state', () => {
    const cases: Array<[string, string]> = [
      ['/home/fake-person/x', marker],
      ['/Users/FakePerson/x', marker],
      ['/tmp/x', marker],
      ['/tmp', marker],
      ['/private', marker],
      ['/var/folders/x.', `${marker}.`],
      ['/workspaces/x', marker],
      ['/proc/self/environ', marker],
      ['"/home/Fake Person/x"', `"${marker}"`],
      ['/x:/home/fake-person/bin', marker],
      ['/a,/home/x', `/a,${marker}`],
      [String.raw`C:\Users\FakePerson\x`, marker],
      [String.raw`\\fake-server\share\x`, marker],
      ['//fake-server/share/x', marker],
      ['file:///home/fake-person/x', marker],
      [String.raw`/C:\Users\fake-person\x`, marker],
      [String.raw`"/C:\Users\Fake Person\x"`, `"${marker}"`],
      ['/c:/dev/fake-person/x', marker],
      [String.raw`/x/C:\Users\fake-person\secret`, marker],
      [String.raw`/x-C:\Users\fake-person\x`, marker],
      ['/c/Users/fake-person/project/x.ts', marker],
      ['/cygdrive/c/Users/fake-person/x', marker],
      ['/cygdrive/d/work/fake-client/src/x.ts', marker],
      ['/cygdrive/c', marker],
      ['/d/home/fake-person/x', marker],
      ['"/api /c/Users/fake-person/x"', `"${marker}"`],
      ['/api/items+file:///fake-data/x', marker],
      ['/api/items.file:///fake-data/x', marker],
      ['/api/items-file:///fake-data/x', marker],
      ['/container/blob?sv=2026&sig=fake-sas', marker],
      ['/download?signature=fake-signature', marker],
      ['/b/o?X-Amz-Signature=fake-aws-signature', marker],
      ['/b/o?X-Goog-Signature=fake-google-signature', marker],
    ];
    for (const [input, text] of cases) {
      expect(sanitizeReviewText(input)).toEqual({ text, redactions: 1 });
      expect(sanitizeReviewText(text).redactions).toBe(0);
    }
  });

  it('treats every listed root as a machine root and only as a whole segment', () => {
    const roots = ['home', 'Users', 'root', 'tmp', 'var', 'etc', 'opt', 'mnt', 'private', 'srv', 'workspace', 'usr',
      'Volumes', 'media', 'run', 'workspaces', 'github', 'builds', 'proc', 'nix'];
    for (const root of roots) {
      expect(sanitizeReviewText(`/${root}/fake-person/x`)).toEqual({ text: marker, redactions: 1 });
      expect(sanitizeReviewText(`/${root}-page`)).toEqual({ text: `/${root}-page`, redactions: 0 });
    }
  });

  it('redacts a quoted span or joined token that hides a machine path anywhere', () => {
    const cases: Array<[string, string]> = [
      ['`/api /Users/fake-person/x`', `\`${marker}\``],
      ['"/api/items /home/fake-person/x"', `"${marker}"`],
      [String.raw`'/x C:\Users\FakePerson\y'`, `'${marker}'`],
      ['`/api \\\\fake-server\\share\\x`', `\`${marker}\``],
      ['`/x //fake-server/share/y`', `\`${marker}\``],
      ['`/x /tmp. more`', `\`${marker}\``],
      ['/x|/home/fake-person/x', marker],
      ['/x&/home/fake-person/x', marker],
      ['/api#/home/fake-person/x', marker],
      ['/x+/home/fake-person/x', marker],
      [String.raw`/x:C:\Users\Fake\y`, marker],
      ['/x|//fake-server/share/y', marker],
    ];
    for (const [input, text] of cases) {
      expect(sanitizeReviewText(input)).toEqual({ text, redactions: 1 });
      expect(sanitizeReviewText(text).redactions).toBe(0);
    }
  });

  it('redacts only the machine path inside a kept slash command', () => {
    expect(sanitizeReviewText('/tdk-plan sample-001 "fix /home/fake-person/x"')).toEqual({
      text: `/tdk-plan sample-001 "fix ${marker}"`,
      redactions: 1,
    });
  });

  it('redacts every secret category and leaves the surrounding routes intact', () => {
    const secrets: Array<[string, string]> = [
      [awsId, awsId],
      [`AWS_SECRET_ACCESS_KEY=${awsSecret}`, awsSecret],
      [githubToken, githubToken],
      [githubFineGrained, githubFineGrained],
      [slackToken, slackToken],
      [jwt, jwt],
      [`Authorization: Bearer ${jwt}`, jwt],
      ['Authorization: Bearer fakeBearerMaterial12345', 'fakeBearerMaterial12345'],
      ['Proxy-Authorization: Basic ZmFrZTpmYWtlcGFzc3dvcmQ=', 'ZmFrZTpmYWtlcGFzc3dvcmQ='],
      ['api_key: tiny-fake', 'tiny-fake'],
      ['export DATABASE_PASSWORD=another-fake-value', 'another-fake-value'],
      ['-----BEGIN RSA PRIVATE KEY-----\nfake-private-key-line\n-----END RSA PRIVATE KEY-----', 'fake-private-key-line'],
      ['https://fake-user:fake-pass@example.com/private', 'fake-pass'],
      ['postgres://fake-user:fake-pass@db.example.com/app', 'fake-pass'],
      ['https://example.com/file?sig=fake-signature', 'fake-signature'],
      ['https://api.internal/private', 'api.internal'],
      ['//api.internal/private', 'api.internal'],
      ['staging.example.com:8443 and 10.0.0.0/8', 'staging.example.com'],
      ['http://192.168.1.10/status', '192.168.1.10'],
    ];
    for (const [input, secret] of secrets) {
      const result = sanitizeReviewText(input);
      expect(result.redactions).toBeGreaterThan(0);
      expect(result.text).not.toContain(secret);
      expect(sanitizeReviewText(result.text)).toEqual({ text: result.text, redactions: 0 });
    }
    const mixed = `GET /health ${githubToken} /api/items`;
    expect(sanitizeReviewText(mixed)).toEqual({ text: 'GET /health [REDACTED:github-token] /api/items', redactions: 1 });
  });
});

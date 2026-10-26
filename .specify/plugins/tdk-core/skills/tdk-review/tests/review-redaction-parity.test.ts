import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sanitizeReviewText } from '../scripts/review-redaction';
import { sanitizeHandoffText } from '../../../../tdk-utils/skills/tdk-handoff/scripts/handoff-redaction';

// The review sanitizer copies the handoff detectors; only its kept-path rule may differ. The source comparison
// is the drift guard: sample inputs alone miss a detector edited in one copy only.
const PLUGINS = resolve(import.meta.dir, '../../../..');
const REVIEW_SOURCE = resolve(PLUGINS, 'tdk-core/skills/tdk-review/scripts/review-redaction.ts');
const HANDOFF_SOURCE = resolve(PLUGINS, 'tdk-utils/skills/tdk-handoff/scripts/handoff-redaction.ts');

function sanitizerBody(path: string): string {
  const source = readFileSync(path, 'utf8');
  return source.slice(source.indexOf('const MARKER_SOURCE'), source.indexOf('\n  return { text, redactions };\n}') + 1);
}

const awsId = `AKIA${'Q'.repeat(16)}`;
const githubToken = `ghp_${'T'.repeat(36)}`;
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.ZmFicmljYXRlZFNpZ25hdHVyZQ';

describe('review and handoff sanitizer parity', () => {
  it('keeps every detector and pass verbatim; only the kept-path rule and the export name differ', () => {
    const review = sanitizerBody(REVIEW_SOURCE)
      .replace(/^const MACHINE_ROOTS[\s\S]*?\n}\n/m, '')
      .replace(/^ *if \(keepsRepoPath\((?:quoted|path)\)\) return path;\n/gm, '')
      .replace('export function sanitizeReviewText(', 'export function sanitizeHandoffText(');
    expect(review).not.toContain('keepsRepoPath');
    expect(review).not.toContain('MACHINE_ROOT');
    expect(review).toBe(sanitizerBody(HANDOFF_SOURCE));
  });

  it('redacts every path-free secret input identically', () => {
    const secrets = [
      awsId,
      'AWS_SECRET_ACCESS_KEY=fabricatedAWSsecretMaterial0123456789abcd',
      githubToken,
      `github_pat_${'F'.repeat(30)}`,
      'xoxb-1234567890-fabricated-slack-material',
      jwt,
      `Authorization: Bearer ${jwt}`,
      'Authorization: Bearer fakeBearerMaterial12345',
      'Proxy-Authorization: Basic ZmFrZTpmYWtlcGFzc3dvcmQ=',
      'api_key: tiny-fake',
      'export DATABASE_PASSWORD=another-fake-value',
      'password: "fake value" and token=\'fake-head\'"fake-tail"',
      'client_secret: |\n  fake-multiline-secret\n  second-line\nnext: keep',
      '-----BEGIN RSA PRIVATE KEY-----\nfake-private-key-line\n-----END RSA PRIVATE KEY-----',
      'https://fake-user:fake-pass@example.com/private',
      'postgres://fake-user:fake-pass@db.example.com/app',
      'https://example.com/file?sig=fake-signature',
      "https://example.com/file?token=fake-head'fake-tail",
      'https://api.internal/private',
      '//api.internal/private',
      'staging.example.com:8443 and 10.0.0.0/8',
      'http://192.168.1.10/status',
      '[REDACTED:api-key] already redacted',
    ];
    for (const input of secrets) expect(sanitizeReviewText(input)).toEqual(sanitizeHandoffText(input));
  });

  it('never redacts more than the handoff sanitizer', () => {
    const inputs = [
      '/tdk-plan sample-001 "fix /home/fake-person/x"',
      `GET /health ${githubToken} /api/items`,
      '<span>a</span> /api/users/home `/x /tmp. more`',
      String.raw`/x/C:\Users\fake-person\secret and /container/blob?sv=2026&sig=fake-sas`,
    ];
    for (const input of inputs) {
      expect(sanitizeReviewText(input).redactions).toBeLessThanOrEqual(sanitizeHandoffText(input).redactions);
    }
  });
});

import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const SETUP_SH = resolve(import.meta.dir, '../../../../setup.sh');

describe('setup.sh thin bootstrap validation', () => {
  const content = readFileSync(SETUP_SH, 'utf-8');

  it('bash syntax is valid', () => {
    const result = Bun.spawnSync(['bash', '-n', SETUP_SH]);
    expect(result.exitCode).toBe(0);
  });

  it('contains exec bun handoff line', () => {
    expect(content).toContain('exec bun');
    expect(content).toContain('setup.ts');
  });

  it('does NOT contain step 2-5 logic (moved to TS)', () => {
    expect(content).not.toContain('Python virtual environment');
    expect(content).not.toContain('Config detection');
    expect(content).not.toContain('Python imports verification');
    expect(content).not.toContain('Plugin marketplace registration');
    expect(content).not.toContain('_detect_venv_python');
    expect(content).not.toContain('_venv_imports_ok');
  });

  it('is under 80 lines', () => {
    const lines = content.split('\n').length;
    expect(lines).toBeLessThanOrEqual(80);
  });

  it('does NOT have --skip-prereq flag (removed per design)', () => {
    expect(content).not.toContain('--skip-prereq');
    expect(content).not.toContain('skip-prereq');
  });

  it('passes through --skip-venv, --skip-config, --skip-plugins, --force via $@', () => {
    expect(content).toContain('"$@"');
  });

  it('retains auto-install functions for jq, yq, bun', () => {
    expect(content).toContain('auto_install_jq');
    expect(content).toContain('auto_install_yq');
    expect(content).toContain('auto_install_bun');
  });

  it('handles --help before prereq installs (pre-bun safety)', () => {
    const result = Bun.spawnSync(['bash', SETUP_SH, '--help']);
    expect(result.exitCode).toBe(0);
    const stdout = new TextDecoder().decode(result.stdout);
    expect(stdout).toContain('Usage:');
  });
});

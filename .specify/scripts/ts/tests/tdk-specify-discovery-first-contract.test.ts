import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SPECIFY_SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-specify/SKILL.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('tdk-specify discovery-first contract', () => {
  const skill = read(SPECIFY_SKILL_PATH);

  it('guards duplicate specs by spec.md instead of any feature directory content', () => {
    expect(skill).toContain('SPEC_FILE="$FEATURE_DIR/spec.md"');
    expect(skill).toContain('test -f "$SPEC_FILE"');
    expect(skill).toContain('ERROR: Ticket spec already exists');
    expect(skill).not.toContain('ls "$FEATURE_DIR" 2>/dev/null && echo "ERROR: Ticket already exists"');
  });

  it('allows discovery-first feature directories as optional context', () => {
    expect(skill).toContain('DISCOVERY_INDEX="$FEATURE_DIR/discovery/index.md"');
    expect(skill).toContain('test -f "$DISCOVERY_INDEX"');
    expect(skill).toContain('read it as optional context before spec generation');
    expect(skill).toContain('Do not require discovery for normal specify flow');
  });

  it('keeps requirement identifiers owned by specify', () => {
    expect(skill).toContain('Only `tdk-specify` mints `UR-*`, `FR-*`, and `SC-*`');
    expect(skill).not.toContain('discovery_ref');
  });
});

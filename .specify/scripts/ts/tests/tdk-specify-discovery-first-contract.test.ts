import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SPECIFY_SKILL_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-specify/SKILL.md',
);
const SPECIFY_INPUT_ROUTING_REF_PATH = resolve(
  import.meta.dir,
  '../../../plugins/tdk-core/skills/tdk-specify/references/input-routing-and-mode-workflow.md',
);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('tdk-specify discovery boundary contract', () => {
  const skill = read(SPECIFY_SKILL_PATH);
  const inputRoutingRef = read(SPECIFY_INPUT_ROUTING_REF_PATH);
  const contract = `${skill}\n${inputRoutingRef}`;

  it('guards duplicate specs by spec.md instead of any feature directory content', () => {
    expect(contract).toContain('SPEC_FILE="$FEATURE_DIR/spec.md"');
    expect(contract).toContain('test -f "$SPEC_FILE"');
    expect(contract).toContain('ERROR: Ticket spec already exists');
    expect(contract).not.toContain('ls "$FEATURE_DIR" 2>/dev/null && echo "ERROR: Ticket already exists"');
  });

  it('rejects direct discovery-to-specify routing', () => {
    expect(contract).toContain('DISCOVERY_MANIFEST="$FEATURE_DIR/discovery.md"');
    expect(contract).toContain('PARENT_DISCOVERY_CONTEXT=$DISCOVERY_MANIFEST');
    expect(contract).toContain('Discovery is parent epic context, not a direct predecessor for /tdk-specify');
    expect(contract).toContain('Continue with /tdk-epic-prd <id>');
    expect(contract).toContain('Child epic work starts from a');
    expect(contract).not.toContain('read it as optional context before spec generation');
  });

  it('keeps requirement identifiers owned by specify', () => {
    expect(contract).toContain('Only `tdk-specify` mints `UR-*`, `FR-*`, and `SC-*`');
    expect(contract).not.toContain('discovery_ref');
  });
});

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SKILL_DOC = resolve(
  __dirname,
  '../../../plugins/tdk-core/skills/tdk-plan/references/handle-existing-plan.md'
);

describe('handle-existing-plan.md path conventions', () => {
  const content = readFileSync(SKILL_DOC, 'utf-8');

  it('uses phases/ prefix for generated file paths', () => {
    expect(content).toMatch(/phases\/phase-\$\{NN\}/);
  });

  it('uses phases/ prefix for collision check', () => {
    expect(content).toMatch(/phases\/phase-\$\{NN\}.*already exists/);
  });

  it('phases table links point to phases/ subdir', () => {
    expect(content).toMatch(/\(phases\/phase-\$\{NN\}/);
  });
});

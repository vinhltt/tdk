// Contract: retro resolves consumer test skills from the current test route, not from name suffixes.
// These checks pin wording only; behavior is proven by live acceptance runs.
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SKILLS_DIR = resolve(import.meta.dir, '../skills');
const read = (...segments: string[]): string => {
  const path = resolve(SKILLS_DIR, ...segments);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

const discovery = read('_shared/consumer-skill-discovery.md');
const routing = read('_shared/signal-target-routing.md');
const propose = read('tdk-retro-propose/SKILL.md');

const section = (text: string, heading: string): string => {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const next = text.indexOf('\n## ', start + heading.length);
  return text.slice(start, next < 0 ? undefined : next);
};

const expectAll = (text: string, phrases: string[]): void => {
  for (const phrase of phrases) expect(text).toContain(phrase);
};

const WARNING_LINE =
  '`Consumer test skills: none resolved; test-like skills found: {paths}. Add them to the test route in delegate-routing.md to enable T4.`';
const RESOLVE_COMMAND =
  '(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/index.ts routing phase-delegates resolve --project-root "$PROJECT_DIR" --domain test --path "$ROUTE_PATH")';

describe('consumer skill discovery order', () => {
  it('makes the test route the first source and resolves it through the tdk-core resolver', () => {
    const route = discovery.indexOf('## 1. Test Route (Source Of Truth)');
    const delegates = discovery.indexOf('## 2. Spec Delegates (Evidence)');
    const fallback = discovery.indexOf('## 3. Fallback Globs');
    const warning = discovery.indexOf('## 4. Test-Like Warning');
    expect(route).toBeGreaterThan(-1);
    expect(route).toBeLessThan(delegates);
    expect(delegates).toBeLessThan(fallback);
    expect(fallback).toBeLessThan(warning);
    expectAll(discovery, ['`routing phase-delegates resolve`', 'never parse `delegate-routing.md` in the prompt']);
  });

  it('calls the resolver once per path so the global section is never dropped', () => {
    expectAll(section(discovery, '## 1. Test Route (Source Of Truth)'), [
      'Call the resolver once per path: once for each `subWorkspaces[].path`, then once for `.`',
      'Never pass several paths in one call',
      'drops `global`',
      'Do not name a routing section',
    ]);
  });

  it('treats a missing or empty route as an opt-out and a failed resolver as unknown', () => {
    expectAll(section(discovery, '### Resolver Outcomes'), [
      '`state: missing` or `present-empty`',
      'normal opt-out',
      'The route is unknown, not empty',
      'Record `routing: NOT CHECKED ({reason})` once and continue with the fallback globs',
    ]);
  });

  it('keeps the suffix globs only as a fallback when the route yields no candidate', () => {
    const fallback = section(discovery, '## 3. Fallback Globs');
    expectAll(fallback, [
      'only when the test route yields no T4 candidate',
      '.claude/skills/*-ut/SKILL.md',
      '.claude/skills/*-test/SKILL.md',
      'working as before',
    ]);
    expect(discovery.indexOf('.claude/skills/*-ut/SKILL.md')).toBeGreaterThan(discovery.indexOf('## 3. Fallback Globs'));
  });
});

describe('phase delegates as evidence', () => {
  it('never makes a phase delegate a candidate on its own', () => {
    expectAll(section(discovery, '## 2. Spec Delegates (Evidence)'), [
      'A phase delegate is evidence only',
      '`## Delegate Skills` and `## Delegate Agents`',
      '`used by this spec`',
      '`phase delegate no longer routed: /name`',
      'not in the current test route',
      'keeps implement skills out of T4',
    ]);
  });
});

describe('test-like warning', () => {
  it('prints one exact warning line for skills that look like test skills', () => {
    const warning = section(discovery, '## 4. Test-Like Warning');
    expectAll(warning, [
      'the token `ut`, `test`, `tests`, or `unit`',
      '`metadata.category` contains `test`',
      'print exactly one line',
      WARNING_LINE,
      'This heuristic never selects a target',
      '`Consumer test skills: none found`',
    ]);
  });
});

describe('tdk-retro-propose discovery step', () => {
  it('runs the resolver per path with the agent-provided project root', () => {
    const step = section(propose, '## Step 3: Discover Consumer Test Skills');
    expectAll(step, [
      '../_shared/consumer-skill-discovery.md',
      'PROJECT_DIR="$1"',
      'ROUTE_PATH="${2:-.}"',
      '[ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR/.specify/scripts/ts" ]',
      RESOLVE_COMMAND,
      'Never put several paths in one call',
      'record `routing: NOT CHECKED ({reason})`',
    ]);
    expect(step).not.toContain('```text\n.claude/skills/*-ut/SKILL.md');
  });

  it('prints the routing and warning lines after the status block, outside it', () => {
    const completion = section(propose, '## Completion');
    const blockOpen = completion.indexOf('~~~text');
    const blockClose = completion.indexOf('~~~', blockOpen + '~~~text'.length);
    const reportList = completion.indexOf('After the block, report:');
    expect(blockOpen).toBeGreaterThan(-1);
    expect(blockClose).toBeGreaterThan(blockOpen);
    const block = completion.slice(blockOpen, blockClose);
    for (const line of ['routing: NOT CHECKED ({reason})', WARNING_LINE]) {
      const position = completion.indexOf(line);
      expect(position).toBeGreaterThan(blockClose);
      expect(position).toBeLessThan(reportList);
    }
    expect(block).not.toContain('routing:');
    expect(block).not.toContain('Consumer test skills');
    expect(completion).toContain('holds only these lines');
  });
});

describe('signal target routing for T4', () => {
  it('points T4 at the discovered consumer test skill instead of a fixed suffix', () => {
    const t4 = routing.split('\n').find((line) => line.startsWith('| T4 |')) ?? '';
    expect(t4).toContain('`consumer-skill-discovery.md`');
    expect(t4).not.toContain('*-ut/SKILL.md');
    expect(t4).not.toContain('*-test/SKILL.md');
  });
});

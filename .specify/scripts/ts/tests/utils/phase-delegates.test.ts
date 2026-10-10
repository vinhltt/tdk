import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRoute, findSection, parseDelegateRouting } from '../../src/utils/delegate-routing';
import { containerFenceRepros, containerFenceVariants, delegateRewriteCases, renderRewriteEndings } from '../fixtures/phase-delegate-rewrite-cases';
import {
  classifyRouteFile,
  detectDomains,
  extractPhaseRoutingInput,
  parsePhaseDelegates,
  phaseSnapshotDigest,
  PhaseDelegatesError,
  resolveExpected,
  rewriteDelegateSections,
  sha256,
} from '../../src/utils/phase-delegates';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const STANDARD = `---
phase: 1
status: todo
parallel_safe: never
parallel_reason: preserve me
---
# Phase 01: API service

## Overview
Unicode stays byte-identical: tiếng Việt.

## Key Insights
Keep this insight exactly.  

## Delegate Skills
- \`/shared\` - Existing useful purpose.  
- \`/obsolete\`

## Delegate Agents
- \`@old-agent\`

## Requirements
Do not rewrite dependencies, prose or indentation.

## Related Code Files
- Modify: \`src/backend/service.ts\`
`;

function withoutDelegates(markdown: string): string {
  return markdown.replace(/^## Delegate (?:Skills|Agents)(?:\r?\n|$)[\s\S]*?(?=^## |(?![\s\S]))/gm, '');
}

describe('phase delegates route states and detection', () => {
  it('classifies missing, readable-empty, populated and unreadable files without swallowing IO errors', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-route-state-'));
    roots.push(root);
    const path = join(root, 'routes.md');
    expect(classifyRouteFile(path).state).toBe('missing');
    writeFileSync(path, '## global\n- implement: (default - no delegate)\n- test: none\n');
    expect(classifyRouteFile(path).state).toBe('present-empty');
    writeFileSync(path, '## global\n- implement: @executor\n');
    expect(classifyRouteFile(path)).toMatchObject({ state: 'present-populated', sha: sha256(Buffer.from('## global\n- implement: @executor\n')) });
    const directory = join(root, 'directory');
    mkdirSync(directory);
    expect(classifyRouteFile(directory).state).toBe('unreadable');
    const broken = join(root, 'broken.md');
    symlinkSync(join(root, 'absent.md'), broken);
    expect(classifyRouteFile(broken).state).toBe('unreadable');
  });

  it('emits all matched rows in table order, with UI design then implement and no duplicate domains', () => {
    expect(detectDomains('Research API UI schema specs')).toEqual(['test', 'database', 'design', 'implement', 'research']);
    expect(detectDomains('No special category')).toEqual(['implement']);
    expect(detectDomains('Output specificationish', '', ['.specify/scripts/utility.ts'])).toEqual(['implement']);
    expect(detectDomains('Refactor', 'UT migration', ['src/components/screen.ts'])).toEqual(['test', 'database', 'design', 'implement']);
  });

  it('takes only the title, Overview body and Related Code Files paths as domain inputs', () => {
    const input = extractPhaseRoutingInput(STANDARD.replace('## Requirements\n', '## Requirements\nResearch schema test UI should not affect domain detection.\n'));
    expect(input.title).toBe('Phase 01: API service');
    expect(input.overview).toContain('tiếng Việt');
    expect(input.paths).toEqual(['src/backend/service.ts']);
    expect(detectDomains(input.title, input.overview, input.paths)).toEqual(['implement']);
  });
});

describe('phase delegates expected routes', () => {
  const document = parseDelegateRouting(`## global
- test: /global-test, @test-executor
- implement: /global-impl, @global-executor
- database: /global-db

## WEB
- implement: /web-impl, /shared, @web-executor
- design: /web-design

## BACKEND
- implement: /backend-impl, /shared, @backend-executor
- database: (default - no delegate)
`);
  const subWorkspaces = [{ name: 'backend', path: 'src/backend' }, { name: 'web', path: 'src/web' }];

  it('matches path boundaries and case-insensitive workspace names, merges in route order and deduplicates', () => {
    expect(resolveExpected(document, subWorkspaces, ['src/backend/service.ts', 'src/web/component.ts'], ['implement'], 'none')).toEqual({
      skills: ['/web-impl', '/shared', '/backend-impl'], agents: ['@web-executor', '@backend-executor'],
    });
    expect(resolveExpected(document, subWorkspaces, ['src/backend-extra/api.ts'], ['implement'], 'none')).toEqual({
      skills: ['/global-impl'], agents: ['@global-executor'],
    });
    expect(resolveExpected(document, subWorkspaces, ['.\\src\\backend\\api.ts'], ['database'], 'none')).toEqual({ skills: ['/global-db'], agents: [] });
  });

  it('uses global fallback per missing or placeholder domain, including a workspace without a section', () => {
    expect(resolveExpected(document, subWorkspaces, ['src/backend/api.ts'], ['database', 'design'], 'none')).toEqual({ skills: ['/global-db'], agents: [] });
    expect(resolveExpected(document, [...subWorkspaces, { name: 'worker', path: 'src/worker' }], ['src/web/api.ts', 'src/worker/task.ts'], ['implement'], 'none')).toEqual({
      skills: ['/web-impl', '/shared', '/global-impl'], agents: ['@web-executor', '@global-executor'],
    });
    expect(resolveExpected(document, [], [], ['test'], 'none')).toEqual({ skills: ['/global-test'], agents: ['@test-executor'] });
  });

  it('deduplicates workspace sections by name without suppressing a missing workspace global fallback', () => {
    const duplicated = parseDelegateRouting('## global\n- implement: @global\n\n## core\n- implement: @local\n\n## CORE\n- implement: @local\n');
    expect(resolveExpected(duplicated, [{ name: 'core', path: 'src/core' }, { name: 'worker', path: 'src/worker' }],
      ['src/core/service.ts', 'src/worker/task.ts'], ['implement'], 'none')).toEqual({ skills: [], agents: ['@local', '@global'] });
  });

  it('uses the first workspace section even when only a later section supplies the requested domain', () => {
    const duplicated = parseDelegateRouting('## global\n- implement: @global\n\n## CORE\n- test: @tester\n\n## core\n- implement: @later\n');
    expect(findRoute(findSection(duplicated, 'core'), 'implement')).toBeUndefined();
    expect(resolveExpected(duplicated, [{ name: 'core', path: 'src/core' }], ['src/core/service.ts'], ['implement'], 'none'))
      .toEqual({ skills: [], agents: ['@global'] });
  });

  it('prepends test routes for TDD, but backfill remains test-only', () => {
    expect(resolveExpected(document, subWorkspaces, ['src/backend/api.ts'], ['implement'], 'tdd')).toEqual({
      skills: ['/global-test', '/backend-impl', '/shared'], agents: ['@test-executor', '@backend-executor'],
    });
    expect(resolveExpected(document, subWorkspaces, ['src/backend/api.ts'], ['implement', 'database'], 'ut_backfill')).toEqual({
      skills: ['/global-test'], agents: ['@test-executor'],
    });
  });
});

describe('phase delegate parser and byte-preserving rewrite', () => {
  it('parses first quoted tokens, raw tokens, placeholders and unfamiliar bullets without losing their visibility', () => {
    expect(parsePhaseDelegates(`## Delegate Skills
- Purpose with \`/first\` and \`/second\`.
- /raw - purpose
- \`/first\` duplicate
- /your-skill
- /{placeholder}
- (default - no delegate)
- malformed delegate

## Delegate Agents
- \`@agent\` - purpose
- @raw-agent
- @your-agent

## Requirements
- /not-a-delegate
`)).toEqual({ skills: ['/first', '/raw', 'malformed delegate'], agents: ['@agent', '@raw-agent'] });
  });

  for (const newline of ['\n', '\r\n']) {
    it(`preserves non-delegate byte hashes and survivor purpose text with ${newline === '\n' ? 'LF' : 'CRLF'}`, () => {
      const original = STANDARD.replace(/\n/g, newline);
      const expected = { skills: ['/shared', '/new-skill'], agents: ['@executor'] };
      const rewritten = rewriteDelegateSections(original, expected, 'key-insights');
      expect(sha256(withoutDelegates(rewritten))).toBe(sha256(withoutDelegates(original)));
      expect(rewritten).toContain(`- \`/shared\` - Existing useful purpose.  ${newline}`);
      expect(parsePhaseDelegates(rewritten)).toEqual(expected);
      expect(rewritten.indexOf('## Delegate Skills')).toBeLessThan(rewritten.indexOf('## Delegate Agents'));
      expect(rewriteDelegateSections(rewritten, expected, 'key-insights')).toBe(rewritten);
      if (newline === '\r\n') expect(rewritten.replace(/\r\n/g, '')).not.toContain('\n');
    });
  }

  for (const newline of ['\n', '\r\n']) {
    for (const fence of ['```', '~~~']) {
      for (const anchor of ['key-insights', 'test-quality-gate'] as const) {
        it(`ignores fenced delegate/input/anchor headings and preserves exact slices on deletion and rewrite (${fence}, ${anchor}, ${newline === '\n' ? 'LF' : 'CRLF'})`, () => {
          const sample = `${fence}markdown\n# Fake schema UI title\n## Overview\nResearch database example.\n## Related Code Files\n- Modify: \`src/fake/schema.ts\`\n## Key Insights\n## Test Quality Gate\n## Delegate Skills\n- \`/documented-example\`\n## Delegate Agents\n- \`@documented-agent\`\n${fence}\n`;
          const heading = anchor === 'key-insights' ? '## Key Insights' : '## Test Quality Gate';
          const prefix = `# Phase 01: API service\n## Implementation Steps\n${sample}Keep the instruction immediately after the fence.\n## Overview\nActual service overview.\n## Related Code Files\n- Modify: \`src/core/service.ts\`\n${heading}\nKeep the actual anchor.\n${fence}markdown\n## Requirements\n- \`/not-a-delegate\`\n${fence}\n`.replace(/\n/g, newline);
          const suffix = `## Requirements\nKeep requirements.\n## Implementation Steps\n${sample}Keep the final instruction.\n`.replace(/\n/g, newline);
          const old = '## Delegate Skills\n- `/old`\n\n## Delegate Agents\n- `@old`\n\n'.replace(/\n/g, newline);
          const original = prefix + old + suffix;
          expect(parsePhaseDelegates(original)).toEqual({ skills: ['/old'], agents: ['@old'] });
          expect(extractPhaseRoutingInput(original)).toEqual({
            title: 'Phase 01: API service', overview: 'Actual service overview.', paths: ['src/core/service.ts'],
          });
          expect(rewriteDelegateSections(original, { skills: [], agents: [] }, anchor)).toBe(prefix + suffix);
          const expected = { skills: ['/new'], agents: ['@new'] };
          const rendered = '## Delegate Skills\n- `/new`\n\n## Delegate Agents\n- `@new`\n\n'.replace(/\n/g, newline);
          const rewritten = rewriteDelegateSections(original, expected, anchor);
          expect(rewritten).toBe(prefix + rendered + suffix);
          expect(parsePhaseDelegates(rewritten)).toEqual(expected);
          expect(rewriteDelegateSections(rewritten, expected, anchor)).toBe(rewritten);
        });
      }
    }
  }

  for (const fence of ['`', '~']) {
    it(`requires a same-character closing fence at least as long as its opener with whitespace-only suffix (${fence})`, () => {
      const marker = fence.repeat(4);
      const other = fence === '`' ? '~' : '`';
      const example = [
        `${marker}markdown`, '## Delegate Skills', '- `/example-one`', fence.repeat(3),
        '## Delegate Agents', '- `@example-two`', other.repeat(5), '## Key Insights',
        `${marker} trailing text`, '## Related Code Files', '- Modify: `src/fake.ts`',
        `    ${marker}`, '## Overview', 'Fake database overview.', `   ${fence.repeat(5)}\t `,
      ].join('\n') + '\n';
      const prefix = `# Actual API phase\n## Implementation Steps\n${example}Keep this instruction.\n## Key Insights\nKeep actual insights.\n`;
      const suffix = '## Requirements\nKeep requirements.\n';
      const original = prefix + '## Delegate Skills\n- `/old`\n\n' + suffix;
      expect(parsePhaseDelegates(original)).toEqual({ skills: ['/old'], agents: [] });
      expect(extractPhaseRoutingInput(original)).toEqual({ title: 'Actual API phase', overview: '', paths: [] });
      expect(rewriteDelegateSections(original, { skills: ['/new'], agents: [] }, 'key-insights'))
        .toBe(prefix + '## Delegate Skills\n- `/new`\n\n' + suffix);
    });
  }

  it('does not open a backtick fence whose info string contains a backtick', () => {
    const original = '# Phase\n```invalid`info\n## Key Insights\nActual insight.\n## Requirements\nKeep requirements.\n';
    expect(rewriteDelegateSections(original, { skills: ['/new'], agents: [] }, 'key-insights'))
      .toBe(original.replace('## Requirements', '## Delegate Skills\n- `/new`\n\n## Requirements'));
  });

  it('ignores fenced bullets within real delegate/input sections and an unclosed fence through EOF', () => {
    const original = '# API phase\n## Overview\nActual overview.\n```markdown\nResearch schema example.\n```\n## Related Code Files\n- Modify: `src/actual.ts`\n~~~markdown\n- Modify: `src/fake.ts`\n~~~\n## Key Insights\nActual insight.\n## Delegate Skills\n- `/actual`\n```markdown\n- `/example`\n```\n## Requirements\nKeep requirements.\n~~~markdown\n## Delegate Agents\n- `@fake-at-eof`\n';
    expect(parsePhaseDelegates(original)).toEqual({ skills: ['/actual'], agents: [] });
    expect(extractPhaseRoutingInput(original)).toEqual({ title: 'API phase', overview: 'Actual overview.', paths: ['src/actual.ts'] });
  });

  for (const endings of ['LF', 'CRLF', 'mixed'] as const) {
    for (const fence of ['```', '~~~']) {
      for (const anchor of ['key-insights', 'test-quality-gate'] as const) {
        it(`refuses insertion inside an unclosed anchor fence but accepts the same fence outside the anchor (${anchor}, ${fence}, ${endings})`, () => {
          const heading = anchor === 'key-insights' ? '## Key Insights' : '## Test Quality Gate';
          const lines = ['# API phase', heading, 'Keep the anchor insight.', `${fence}markdown`,
            '## Delegate Skills', '- `/fenced-example`', 'Keep the unclosed example through EOF.'];
          const original = lines.map((line, i) => line + (endings === 'CRLF' || endings === 'mixed' && i % 2 === 1 ? '\r\n' : '\n')).join('');
          const expected = { skills: ['/new-tool'], agents: ['@new-executor'] };
          expect(() => rewriteDelegateSections(original, expected, anchor)).toThrow('anchor ends inside an unclosed');
          expect(parsePhaseDelegates(original)).toEqual({ skills: [], agents: [] });
          expect(rewriteDelegateSections(original, { skills: [], agents: [] }, anchor)).toBe(original);
          const newline = endings === 'CRLF' ? '\r\n' : '\n';
          const outside = original.replace(`${fence}markdown`, `## Requirements${newline}${fence}markdown`);
          const boundary = outside.indexOf('## Requirements');
          const rendered = '## Delegate Skills\n- `/new-tool`\n\n## Delegate Agents\n- `@new-executor`\n\n'.replace(/\n/g, newline);
          const rewritten = rewriteDelegateSections(outside, expected, anchor);
          expect(rewritten).toBe(outside.slice(0, boundary) + rendered + outside.slice(boundary));
          expect(parsePhaseDelegates(rewritten)).toEqual(expected);
          expect(rewriteDelegateSections(rewritten, expected, anchor)).toBe(rewritten);
        });
      }
    }
  }

  for (const endings of ['LF', 'CRLF', 'mixed'] as const) {
    for (const character of ['`', '~'] as const) {
      for (const routing of ['empty', 'unchanged', 'changed'] as const) {
        it(`whitelist refuses every nonmanaged delegate-body repro (${character}, ${endings}, ${routing} routing)`, () => {
          for (const probe of delegateRewriteCases(character)) {
            const original = renderRewriteEndings(probe.markdown, endings);
            const actual = parsePhaseDelegates(original);
            const expected = routing === 'empty' ? { skills: [], agents: [] } : routing === 'unchanged' ? {
              skills: actual.skills.filter((token) => token.startsWith('/')),
              agents: actual.agents.filter((token) => token.startsWith('@')),
            } : { skills: ['/api-tools'], agents: ['@new-executor'] };
            let rewritten: string | undefined;
            let refusal: unknown;
            try { rewritten = rewriteDelegateSections(original, expected, 'key-insights'); }
            catch (error) { refusal = error; }
            expect(rewritten, probe.name).toBeUndefined();
            expect(refusal, probe.name).toBeInstanceOf(PhaseDelegatesError);
            expect((refusal as PhaseDelegatesError).status, probe.name).toBe(probe.refusal);
          }
        });
      }
    }
    it(`preserves unchanged-routing bytes with an untouched unclosed fence outside clean delegate ranges (${endings})`, () => {
      const original = renderRewriteEndings('# Phase\n## Key Insights\nInsight.\n## Delegate Skills\n- `/api-tools`\n\n## Delegate Agents\n- `@api-executor`\n\n## Requirements\nREQ-1 must stay.\n````text\nAn unfinished example.\n```\n## Implementation Steps\nSTEP-1 must stay.\n## Success Criteria\n- CRIT-1 must stay.\n', endings);
      expect(rewriteDelegateSections(original, { skills: ['/api-tools'], agents: ['@api-executor'] }, 'key-insights')).toBe(original);
    });
    it(`retains an unchanged clean skills slice when only agents change (${endings})`, () => {
      const original = renderRewriteEndings(STANDARD, endings);
      const newline = endings === 'CRLF' ? '\r\n' : '\n';
      const expected = { skills: ['/shared', '/obsolete'], agents: ['@new-executor'] };
      const rewritten = rewriteDelegateSections(original, expected, 'key-insights');
      expect(rewritten).toBe(original.slice(0, original.indexOf('## Delegate Agents')) +
        `## Delegate Agents${newline}- \`@new-executor\`${newline}${newline}` + original.slice(original.indexOf('## Requirements')));
      expect(parsePhaseDelegates(rewritten)).toEqual(expected);
      expect(rewriteDelegateSections(rewritten, expected, 'key-insights')).toBe(rewritten);
    });
  }

  it('retains clean parser-recognized inline purposes and raw tokens verbatim', () => {
    const original = '# Phase\n## Key Insights\nInsight.\n## Delegate Skills\n- Purpose with `/first` and `/second`.\n- /raw - purpose\n\n## Delegate Agents\n- @raw-agent - purpose\n\n## Requirements\nREQ-1 must stay.\n';
    expect(rewriteDelegateSections(original, { skills: ['/first', '/raw'], agents: ['@raw-agent'] }, 'key-insights')).toBe(original);
  });

  it('separates a reused EOF delegate slice without a final newline from a newly added group', () => {
    const original = '# Phase\n## Key Insights\nInsight.\n## Delegate Skills\n- `/shared`';
    const expected = { skills: ['/shared'], agents: ['@new'] };
    const rewritten = rewriteDelegateSections(original, expected, 'key-insights');
    expect(rewritten).toBe(original + '\n## Delegate Agents\n- `@new`\n\n');
    expect(parsePhaseDelegates(rewritten)).toEqual(expected);
    expect(rewriteDelegateSections(rewritten, expected, 'key-insights')).toBe(rewritten);
  });

  it('omits empty sections, deletes stale sections and emits agent-only and skill-only sections', () => {
    const empty = rewriteDelegateSections(STANDARD, { skills: [], agents: [] }, 'key-insights');
    expect(empty).toBe(withoutDelegates(STANDARD));
    const agentOnly = rewriteDelegateSections(STANDARD, { skills: [], agents: ['@executor'] }, 'key-insights');
    expect(agentOnly).not.toContain('## Delegate Skills');
    expect(agentOnly).toContain('## Delegate Agents');
    const skillOnly = rewriteDelegateSections(STANDARD, { skills: ['/toolset'], agents: [] }, 'key-insights');
    expect(skillOnly).toContain('## Delegate Skills');
    expect(skillOnly).not.toContain('## Delegate Agents');
  });

  it('places test-mode sections after Test Quality Gate and before Regression Gate', () => {
    const original = STANDARD.replace('## Key Insights', '## Test Quality Gate').replace('## Requirements', '## Regression Gate');
    const rewritten = rewriteDelegateSections(original, { skills: ['/test'], agents: ['@tester'] }, 'test-quality-gate');
    expect(rewritten.indexOf('## Test Quality Gate')).toBeLessThan(rewritten.indexOf('## Delegate Skills'));
    expect(rewritten.indexOf('## Delegate Agents')).toBeLessThan(rewritten.indexOf('## Regression Gate'));
    expect(sha256(withoutDelegates(rewritten))).toBe(sha256(withoutDelegates(original)));
  });

  it('requires the anchor only when a delegate block must be inserted', () => {
    const unanchored = STANDARD.replace('## Key Insights', '## Different Heading');
    const deleted = rewriteDelegateSections(unanchored, { skills: [], agents: [] }, 'key-insights');
    expect(deleted).toBe(withoutDelegates(unanchored));
    expect(sha256(withoutDelegates(deleted))).toBe(sha256(withoutDelegates(unanchored)));
    expect(rewriteDelegateSections(deleted, { skills: [], agents: [] }, 'key-insights')).toBe(deleted);
    let failure: unknown;
    try { rewriteDelegateSections(unanchored, { skills: ['/shared'], agents: [] }, 'key-insights'); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(PhaseDelegatesError);
    expect((failure as PhaseDelegatesError).status).toBe('anchor_missing');
    expect((failure as PhaseDelegatesError).message).toContain('Missing ## Key Insights');
  });

  it('preserves bytes in an anchor at EOF and remains idempotent without a preexisting final newline', () => {
    const original = '# Phase\n\n## Key Insights\nExact final line';
    const rewritten = rewriteDelegateSections(original, { skills: ['/tool'], agents: [] }, 'key-insights');
    expect(rewritten.startsWith(`${original}\n## Delegate Skills\n`)).toBe(true);
    expect(rewriteDelegateSections(rewritten, { skills: ['/tool'], agents: [] }, 'key-insights')).toBe(rewritten);
  });
});

describe('container-fence conservative write admission', () => {
  for (const endings of ['LF', 'CRLF', 'mixed'] as const) {
    for (const character of ['`', '~'] as const) {
      for (const probe of containerFenceRepros) {
        it(`refuses minimized container repro ${probe.name} without producing replacement bytes (${character}, ${endings})`, () => {
          const original = renderRewriteEndings(probe.markdown.replace(/`{3,}|~{3,}/g, (marker) => character.repeat(marker.length)), endings);
          let rewritten: string | undefined;
          let failure: unknown;
          try { rewritten = rewriteDelegateSections(original, probe.expected, probe.anchor); }
          catch (error) { failure = error; }
          expect(rewritten).toBeUndefined();
          expect(failure).toBeInstanceOf(PhaseDelegatesError);
          expect((failure as PhaseDelegatesError).status).toBe('fence_container_ambiguous');
        });
      }
      it(`refuses changing insertions, relocations and deletions with mismatched or unclosed indented fences (${character}, ${endings})`, () => {
        for (const opener of [1, 2, 3]) {
          for (const closer of [0, 1, 2, 3, undefined]) {
            if (closer === opener) continue;
            for (const anchor of ['key-insights', 'test-quality-gate'] as const) {
              const variants = containerFenceVariants(character, opener, closer, anchor);
              for (const layout of ['insertion', 'relocation'] as const) {
                const original = renderRewriteEndings(variants[layout], endings);
                for (const expected of [{ skills: [], agents: [] }, parsePhaseDelegates(original), { skills: ['/new'], agents: ['@new'] }]) {
                  let failure: unknown;
                  try { rewriteDelegateSections(original, expected, anchor); }
                  catch (error) { failure = error; }
                  expect(failure).toBeInstanceOf(PhaseDelegatesError);
                  expect((failure as PhaseDelegatesError).status).toBe('fence_container_ambiguous');
                }
              }
            }
          }
        }
      });
      it(`accepts exact byte no-ops despite mismatched or unclosed indented fences (${character}, ${endings})`, () => {
        for (const opener of [1, 2, 3]) {
          for (const closer of [0, 1, 2, 3, undefined]) {
            if (closer === opener) continue;
            const original = renderRewriteEndings(containerFenceVariants(character, opener, closer).noop, endings);
            const actual = { skills: ['/api-tools'], agents: ['@api-executor'] };
            expect(parsePhaseDelegates(original)).toEqual(actual);
            expect(rewriteDelegateSections(original, actual, 'key-insights')).toBe(original);
          }
        }
      });
      it(`supports matching-indent fences through deletion, replacement and idempotence (${character}, ${endings})`, () => {
        for (const indentation of [0, 1, 2, 3]) {
          for (const anchor of ['key-insights', 'test-quality-gate'] as const) {
            const original = renderRewriteEndings(containerFenceVariants(character, indentation, indentation, anchor).noop, endings);
            const start = original.indexOf('## Delegate Skills');
            const end = original.indexOf('## Success Criteria');
            const newline = endings === 'CRLF' ? '\r\n' : '\n';
            for (const populated of [false, true]) {
              const expected = populated ? { skills: ['/new'], agents: ['@new'] } : { skills: [], agents: [] };
              const block = populated ? `## Delegate Skills${newline}- \`/new\`${newline}${newline}## Delegate Agents${newline}- \`@new\`${newline}${newline}` : '';
              const rewritten = rewriteDelegateSections(original, expected, anchor);
              expect(rewritten).toBe(original.slice(0, start) + block + original.slice(end));
              expect(parsePhaseDelegates(rewritten)).toEqual(expected);
              expect(rewriteDelegateSections(rewritten, expected, anchor)).toBe(rewritten);
            }
          }
        }
      });
    }
  }
  it('retains the known line-based read limitation but accepts only a byte no-op for an EOF-open indented list fence', () => {
    const original = '# API service\n## Key Insights\n- Keep this context.\n   ```text\n## Delegate Skills\n- `/manual`\n';
    expect(parsePhaseDelegates(original)).toEqual({ skills: [], agents: [] });
    expect(rewriteDelegateSections(original, { skills: [], agents: [] }, 'key-insights')).toBe(original);
    let failure: unknown;
    try { rewriteDelegateSections(original, { skills: ['/manual'], agents: [] }, 'key-insights'); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(PhaseDelegatesError);
    expect((failure as PhaseDelegatesError).status).toBe('fence_container_ambiguous');
  });
});

describe('phase approval snapshot digest', () => {
  it('is sorted, length-framed and sensitive to route absence, every input and the selected phase set', () => {
    const route = Buffer.from('routes');
    const plan = Buffer.from('plan');
    const config = Buffer.from('config');
    const first = { path: 'phases/phase-01-a.md', bytes: Buffer.from('phase-a') };
    const second = { path: 'phase-02-b.md', bytes: Buffer.from('phase-b') };
    const digest = phaseSnapshotDigest(route, plan, config, [second, first]);
    expect(phaseSnapshotDigest(route, plan, config, [first, second])).toBe(digest);
    expect(phaseSnapshotDigest(route, plan, config, [first])).not.toBe(digest);
    expect(phaseSnapshotDigest(undefined, plan, config, [first])).not.toBe(phaseSnapshotDigest(Buffer.alloc(0), plan, config, [first]));
    expect(phaseSnapshotDigest(Buffer.from('changed'), plan, config, [first, second])).not.toBe(digest);
    expect(phaseSnapshotDigest(route, Buffer.from('changed'), config, [first, second])).not.toBe(digest);
    expect(phaseSnapshotDigest(route, plan, Buffer.from('changed'), [first, second])).not.toBe(digest);
    expect(phaseSnapshotDigest(route, plan, config, [{ ...first, bytes: Buffer.from('changed') }, second])).not.toBe(digest);
    expect(phaseSnapshotDigest(route, plan, config, [{ ...first, path: 'phase-03-c.md' }, second])).not.toBe(digest);
  });
});

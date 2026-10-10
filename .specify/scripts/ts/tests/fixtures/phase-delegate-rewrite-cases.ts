import type { DelegateAnchor, DelegateGroups } from '../../src/utils/phase-delegates';

export type RewriteLineEndings = 'LF' | 'CRLF' | 'mixed';
export type RewriteRefusal = 'delegate_section_in_fence' | 'delegate_section_not_clean';

export function renderRewriteEndings(text: string, endings: RewriteLineEndings): string {
  let line = 0;
  return text.replace(/\n/g, () => endings === 'CRLF' || endings === 'mixed' && line++ % 2 === 1 ? '\r\n' : '\n');
}

/** Source-shaped repros, independent of the production heading scanner. */
export function delegateRewriteCases(character: '`' | '~'): { name: string; markdown: string; refusal: RewriteRefusal }[] {
  const head = '# Phase 2: API service\n## Overview\nAPI service implementation.\n## Key Insights\nInsight.\n';
  const skills = '## Delegate Skills\n- `/api-tools`\n\n';
  const agents = '## Delegate Agents\n- `@api-executor` - backend executor\n\n';
  const marker = character.repeat(3);
  const longer = character.repeat(4);
  const other = (character === '`' ? '~' : '`').repeat(3);
  const note = `${marker}text\nNote: executor must use the v2 client.\n`;
  const later = (fence: string) => `${fence}bash\nbun run build\n${fence}\n`;
  const tail = (steps = '') => '## Requirements\nREQ-1 must keep the v1 endpoint.\n## Related Code Files\n- Create: `src/api-1.ts`\n## Implementation Steps\nSTEP-1 build the endpoint.\n' + steps + '## Success Criteria\n- CRIT-1 endpoint returns 200.\n';
  const fenced: [string, string][] = [
    ['P1 EOF-open agents fence', head + skills + agents + note + tail()],
    ['P2a skills opener closed by later longer bare fence', head + skills + note + tail(later(longer))],
    ['P2c wrong-character closer followed by later matching code block', head + skills + note + other + '\n' + tail(later(marker))],
    ['P3c list-item fence followed by later matching code block', head + skills + '## Delegate Agents\n- `@api-executor` usage:\n  ' + marker + 'text\n  run --v2\n' + tail(later(marker))],
    ['P4b skills fence swallows agents before later code block', head + skills + note + agents + tail(later(marker))],
    ['P5b duplicate skills fence followed by later code block', head + skills + agents + '## Delegate Skills\n- `/dup`\n' + note + tail(later(marker))],
    ['P7b closed example then open example before later code block', head + skills + agents + marker + 'text\nFirst example.\n' + marker + '\n' + note + tail(later(marker))],
    ['C3 A forgotten closer closed by later code block', head + skills + agents + note + tail(later(marker))],
    ['C3 B short closer followed by later matching long block', head + skills + agents + longer + 'text\nNote: use v2.\n' + marker + '\n' + tail(later(longer))],
    ['C3 C opener closed by later longer code block', head + skills + agents + note + tail(later(longer))],
    ['closed delegate-body fence without headings', head + skills + agents + marker + 'text\nKeep this example.\n' + marker + '\n' + tail()],
    ['closed delegate-body fence containing headings and short closer', head + skills + longer + 'markdown\n## Requirements\nKeep this example.\n' + marker + '\n' + longer + '\n' + agents + tail()],
    ['short closer leaves skills fence open through EOF', head + skills + longer + 'text\nNote: use v2.\n' + marker + '\n' + tail()],
  ];
  const otherContent: [string, string][] = [
    ['G1 one-space indented ATX boundary', ' ## Requirements\nREQ-1 must remain.\n'],
    ['G1 two-space indented ATX boundary', '  ## Requirements\nREQ-1 must remain.\n'],
    ['G1 three-space indented ATX boundary', '   ## Requirements\nREQ-1 must remain.\n'],
    ['G1 tab-separated ATX boundary', '##\tRequirements\nREQ-1 must remain.\n'],
    ['G1 setext H2 boundary', 'Requirements\n------------\nREQ-1 must remain.\n'],
    ['G1 setext H1 boundary', 'Requirements\n============\nREQ-1 must remain.\n'],
    ['ordinary prose', 'Note: executor must use the v2 client.\n'],
    ['HTML comment', '<!-- Keep this instruction. -->\n'],
    ['nested delegate bullet', '  - `@nested` - Keep the nested instruction.\n'],
    ['unrecognized bullet', '- Keep this instruction rather than treating it as a delegate.\n'],
    ['placeholder bullet', '- @your-agent\n'],
    ['deeper heading', '### Usage\nKeep the usage instructions.\n'],
    ['P3a indented heading and fence lookalikes', 'Example:\n\n    ## Requirements\n    ' + marker + 'text\n'],
  ];
  return [
    ...fenced.map(([name, markdown]) => ({ name, markdown, refusal: 'delegate_section_in_fence' as const })),
    ...otherContent.map(([name, content]) => ({ name, markdown: head + skills + agents + content + tail(), refusal: 'delegate_section_not_clean' as const })),
  ];
}

const containerReproHead = '---\nphase: 1\nstatus: todo\n---\n# Phase 1: API service\n';

/** The seven recorded, minimized list-container data-loss repros; no oracle dependency. */
export const containerFenceRepros: { name: string; markdown: string; anchor: DelegateAnchor; expected: DelegateGroups }[] = [
  { name: '3397 tilde 3-to-0 agents heading', anchor: 'key-insights', expected: { skills: [], agents: ['@t1'] },
    markdown: containerReproHead + '## Key Insights\n## Success Criteria\n- CRIT-419852 keep this instruction.\n   ~~~text\n~~~\n## Delegate Agents\n' },
  { name: '4191 backticks 3-to-0 longer closer', anchor: 'key-insights', expected: { skills: [], agents: [] },
    markdown: containerReproHead + '## Key Insights\n## Success Criteria\n- CRIT-433946 keep this instruction.\n   `````text\n``````\n## Delegate Skills\n' },
  { name: '8425 test-gate backticks 3-to-0', anchor: 'test-quality-gate', expected: { skills: ['/t1'], agents: ['@t1'] },
    markdown: containerReproHead + '## Test Quality Gate\n## Related Code Files\n- Create: `src/core/file-509373.ts`\n   ```text\n```\n## Delegate Agents\n' },
  { name: '11483 backticks 2-to-1 whitespace suffix', anchor: 'key-insights', expected: { skills: ['/t1'], agents: ['@new'] },
    markdown: containerReproHead + '## Key Insights\n## Related Code Files\n- Create: `src/core/file-564254.ts`\n  ````\n ```` \t\n## Delegate Agents\n' },
  { name: '13350 backticks 2-to-1 skills heading', anchor: 'key-insights', expected: { skills: [], agents: ['@t9'] },
    markdown: containerReproHead + '## Key Insights\n## Success Criteria\n- CRIT-597837 keep this instruction.\n  ````\n ````\n## Delegate Skills\n' },
  { name: '13846 tildes 2-to-1 longer closer', anchor: 'key-insights', expected: { skills: ['/t9'], agents: [] },
    markdown: containerReproHead + '## Key Insights\n## Success Criteria\n- CRIT-606861 keep this instruction.\n  ~~~~\n ~~~~~\n## Delegate Skills\n' },
  { name: '14923 tildes 3-to-1 longer closer', anchor: 'key-insights', expected: { skills: [], agents: ['@t9'] },
    markdown: containerReproHead + '## Key Insights\n## Success Criteria\n- CRIT-626115 keep this instruction.\n   ~~~bash\n ~~~~\n## Delegate Agents\n' },
];

export function containerFenceVariants(character: '`' | '~', openerIndent: number, closerIndent: number | undefined, anchor: DelegateAnchor = 'key-insights', length = 4): Record<'insertion' | 'relocation' | 'noop', string> {
  const head = '# Phase 2: API service\n## Overview\nActual API service implementation.\n';
  const heading = anchor === 'key-insights' ? '## Key Insights' : '## Test Quality Gate';
  const insight = heading + '\nINSIGHT-2 must remain.\n';
  const delegates = '## Delegate Skills\n- `/api-tools` - existing purpose\n\n## Delegate Agents\n- `@api-executor` - existing purpose\n\n';
  const marker = character.repeat(length);
  const indent = ' '.repeat(openerIndent);
  const fence = `- CRIT-2 must remain.\n${indent}${marker}text\n${indent}## Delegate Skills\n${indent}- \`/fenced-example\`\n` +
    (closerIndent === undefined ? '' : ' '.repeat(closerIndent) + marker + ' \t\n');
  return {
    insertion: head + '## Delegate Agents\n\n' + insight + fence + '## Delegate Agents\n## Requirements\nREQ-2 must remain.\n',
    relocation: head + delegates + insight + '## Success Criteria\n' + fence + '## Delegate Agents\n## Requirements\nREQ-2 must remain.\n',
    noop: head + insight + delegates + '## Success Criteria\n' + fence + 'Keep the example tail.\n',
  };
}

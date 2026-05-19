const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadHookConfigFile,
  wasRecentlyInjected,
  buildSessionSection,
  buildWorkspaceSection,
  buildRulesSection,
  buildPathsSection,
  buildModularizationSection,
  extractTicketFromBranch,
  buildSpecContextSection,
  buildSpeckitContext,
  DEDUP_MARKER
} = require('../lib/context-builder.cjs');

function makeTempSpeckitRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speckit-context-'));
  fs.mkdirSync(path.join(root, '.specify', 'configurations', 'hooks'), { recursive: true });
  const config = {
    name: 'commondragon',
    architecture: { type: 'modular-monolith' },
    docs: { path: '.specify/configurations' },
    subWorkspaces: [
      { name: 'frontend', path: 'frontend' },
      { name: 'backend', path: 'backend' }
    ],
    git: { mainBranch: 'develop', prefixList: 'CD,tdk' },
    specs: { root: '.specify', defaultFolder: 'specs', ticketFormat: '^([a-zA-Z]+)-([0-9]+)$' },
    logLevel: 'Information'
  };
  fs.writeFileSync(
    path.join(root, '.specify', '.specify.json'),
    JSON.stringify(config, null, 2),
    'utf-8'
  );
  return root;
}

test('loadHookConfigFile returns trimmed content when file exists', () => {
  const root = makeTempSpeckitRoot();
  const filePath = path.join(root, '.specify', 'configurations', 'hooks', 'subagent-guidelines.md');
  fs.writeFileSync(filePath, ' line-1\nline-2 \n', 'utf-8');

  const content = loadHookConfigFile('subagent-guidelines.md', { __workspaceRoot: root }, root);
  assert.equal(content, 'line-1\nline-2');
});

test('loadHookConfigFile returns empty string for missing file', () => {
  const root = makeTempSpeckitRoot();
  assert.equal(loadHookConfigFile('missing.md', { __workspaceRoot: root }, root), '');
});

test('buildSessionSection includes base metrics and optional subagent guidelines', () => {
  const root = makeTempSpeckitRoot();
  fs.writeFileSync(
    path.join(root, '.specify', 'configurations', 'hooks', 'subagent-guidelines.md'),
    '- subagent line',
    'utf-8'
  );

  const lines = buildSessionSection({ __workspaceRoot: root }, {}, root).join('\n');
  assert.match(lines, /## Session/);
  assert.match(lines, /Memory usage:/);
  assert.match(lines, /CPU usage:/);
  assert.match(lines, /subagent line/);
});

test('buildWorkspaceSection renders project and active workspace', () => {
  const lines = buildWorkspaceSection(
    {
      name: 'commondragon',
      architecture: { type: 'modular-monolith' },
      subWorkspaces: [{ name: 'frontend' }, { name: 'backend' }]
    },
    { name: 'backend' }
  ).join('\n');

  assert.match(lines, /Project: commondragon/);
  assert.match(lines, /Active workspace: backend/);
  assert.match(lines, /frontend, backend/);
});

test('buildRulesSection includes workspace-specific rule path and principles content', () => {
  const root = makeTempSpeckitRoot();
  fs.writeFileSync(
    path.join(root, '.specify', 'configurations', 'hooks', 'development-principles.md'),
    '- principle line',
    'utf-8'
  );

  const lines = buildRulesSection(
    {
      docs: { path: '.specify/configurations' },
      specs: { root: '.specify' }
    },
    { name: 'backend', path: 'backend' },
    root
  ).join('\n');

  assert.match(lines, /Workspace rules:/);
  assert.match(lines, /sub-workspaces\/backend\/rules/);
  assert.match(lines, /principle line/);
});

test('buildPathsSection uses speckit conventions', () => {
  const lines = buildPathsSection({
    specs: { root: '.specify', defaultFolder: 'specs' },
    docs: { path: '.specify/configurations' }
  }).join('\n');

  assert.match(lines, /\.specify\/specs\//);
  assert.match(lines, /\.specify\/configurations\//);
  assert.match(lines, /\.specify\/memory\//);
});

test('buildModularizationSection returns empty when file missing', () => {
  const root = makeTempSpeckitRoot();
  const lines = buildModularizationSection({ __workspaceRoot: root }, root);
  assert.equal(lines.length, 0);
});

test('buildModularizationSection loads markdown content when file exists', () => {
  const root = makeTempSpeckitRoot();
  fs.writeFileSync(
    path.join(root, '.specify', 'configurations', 'hooks', 'modularization-guidelines.md'),
    '- Keep files under 200 lines',
    'utf-8'
  );

  const lines = buildModularizationSection({ __workspaceRoot: root }, root).join('\n');  assert.match(lines, /## Modularization/);
  assert.match(lines, /Keep files under 200 lines/);
});

test('wasRecentlyInjected detects explicit dedup marker', () => {
  const transcript = path.join(os.tmpdir(), `speckit-transcript-${Date.now()}.txt`);
  fs.writeFileSync(transcript, `line-a\n${DEDUP_MARKER}\nline-b\n`, 'utf-8');
  assert.equal(wasRecentlyInjected(transcript), true);
});

test('wasRecentlyInjected ignores generic workspace heading', () => {
  const transcript = path.join(os.tmpdir(), `speckit-transcript-${Date.now()}-workspace.txt`);
  fs.writeFileSync(transcript, 'line-a\n## Workspace\nline-b\n', 'utf-8');
  assert.equal(wasRecentlyInjected(transcript), false);
});

test('extractTicketFromBranch extracts ticket from feature branch', () => {
  assert.equal(extractTicketFromBranch('feature/CD-001', '^([a-zA-Z]+)-([0-9]+)$', 'CD,tdk'), 'CD-001');
});

test('extractTicketFromBranch extracts ticket with prefix match', () => {
  assert.equal(extractTicketFromBranch('CD-001-fix-login', '^([a-zA-Z]+)-([0-9]+)$', 'CD,tdk'), 'CD-001');
});

test('extractTicketFromBranch returns null for unrelated branch', () => {
  assert.equal(extractTicketFromBranch('develop', '^([a-zA-Z]+)-([0-9]+)$', 'CD,tdk'), null);
});

test('extractTicketFromBranch returns null when no format configured', () => {
  assert.equal(extractTicketFromBranch('feature/CD-001', '', 'CD'), null);
});

test('buildSpecContextSection renders spec path and branch', () => {
  const lines = buildSpecContextSection({
    specs: { root: '.specify', defaultFolder: 'specs' },
    git: { prefixList: 'CD' }
  }).join('\n');

  assert.match(lines, /## Spec Context/);
  assert.match(lines, /Spec folder: \.specify\/specs\//);
});

test('buildSpeckitContext returns all major sections', () => {
  const root = makeTempSpeckitRoot();
  fs.writeFileSync(
    path.join(root, '.specify', 'configurations', 'hooks', 'modularization-guidelines.md'),
    '- Keep files under 200 lines',
    'utf-8'
  );

  const ctx = buildSpeckitContext({ cwd: root });
  const content = ctx.content;

  assert.match(content, /## Session/);
  assert.match(content, /## Workspace/);
  assert.match(content, /## Rules/);
  assert.match(content, /## Paths/);
  assert.match(content, /## Git/);
  assert.match(content, /## Modularization/);
  assert.match(content, /## Spec Context/);
  assert.match(content, /## Naming/);

  // Verify no duplicate Workspace section (bug fix)
  const workspaceCount = (content.match(/## Workspace/g) || []).length;
  assert.equal(workspaceCount, 1, 'should have exactly one Workspace section');
});

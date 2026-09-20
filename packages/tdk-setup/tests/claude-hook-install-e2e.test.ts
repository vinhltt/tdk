import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyInstallPlan } from '../src/install-writer';
import { buildClaudeInstallPlan } from '../src/install-plan';
import { discoverPluginInventory } from '../src/plugin-discovery';
import { emptyHarnessManifest } from '../src/manifest-store';
import { makeConsumer, type FixtureConsumer } from './fixtures';

const SOURCE_PLUGINS_DIR = path.resolve(import.meta.dir, '../../../.specify/plugins');
const SOURCE_PLUGIN_DIR = path.join(SOURCE_PLUGINS_DIR, 'tdk-core');
const SOURCE_MANIFEST_PATH = path.join(SOURCE_PLUGINS_DIR, 'manifest.json');

let consumerRoot: string | undefined;

afterEach(() => {
  if (consumerRoot && fs.existsSync(consumerRoot)) fs.rmSync(consumerRoot, { recursive: true, force: true });
  consumerRoot = undefined;
});

function prepareConsumer() {
  const consumer = makeConsumer('tdk-claude-hook-e2e-');
  consumerRoot = consumer.root;
  fs.cpSync(SOURCE_PLUGIN_DIR, consumer.pluginRoot, { recursive: true });

  const sourceManifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST_PATH, 'utf8'));
  fs.writeFileSync(
    path.join(consumer.root, '.specify', 'plugins', 'manifest.json'),
    `${JSON.stringify({ ...sourceManifest, plugins: { 'tdk-core': sourceManifest.plugins['tdk-core'] } }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(consumer.root, '.specify', '.specify.json'),
    JSON.stringify({ version: '1.0', name: 'test' }),
    'utf8',
  );

  return consumer;
}

async function installConsumer(consumer: FixtureConsumer, targetPrefix = 'tdk-') {
  const inventory = discoverPluginInventory(consumer.root, ['tdk-core']);
  const plan = buildClaudeInstallPlan({
    consumerRoot: consumer.root,
    selectedPlugins: ['tdk-core'],
    plugins: inventory.plugins,
    previousManifest: emptyHarnessManifest(),
    settings: {},
    sourcePrefix: 'tdk-',
    targetPrefix,
  });

  await applyInstallPlan(plan, { yes: true, interactive: false });

  const hooksRoot = path.join(consumer.root, '.claude', 'hooks', `${targetPrefix}core`);
  return {
    hooksRoot,
    gatewayFile: path.join(hooksRoot, 'hooks', 'hook-gateway.cjs'),
  };
}

function initGitRepo(repoRoot: string, branch: string): void {
  fs.mkdirSync(repoRoot, { recursive: true });
  execFileSync('git', ['init', '-b', branch], {
    cwd: repoRoot,
    stdio: 'pipe',
    timeout: 3000,
  });
}

function writeSessionConfig(root: string, subWorkspaces: Array<{ name: string; path: string }> = []): void {
  fs.writeFileSync(
    path.join(root, '.specify', '.specify.json'),
    `${JSON.stringify({
      version: '1.0',
      name: 'test',
      subWorkspaces,
      git: { mainBranch: 'main', prefixList: 'CD' },
      specs: { root: '.specify', defaultFolder: 'specs', ticketFormat: '^CD-\\d+$' },
    }, null, 2)}\n`,
    'utf8',
  );
}

function runInstalledHook(
  gatewayFile: string,
  cwd: string,
  payload: Record<string, unknown>,
  harness: 'claude' | 'omp' | 'unset' = 'claude',
  projectRoot: string = cwd,
) {
  // The trusted project root is explicit so the fixture never inherits the
  // developer's own CLAUDE_PROJECT_DIR. 'unset' exercises the default harness
  // path, where harnessSource must be "default" rather than "env".
  const env = { ...process.env, TDK_HARNESS: harness, CLAUDE_PROJECT_DIR: projectRoot };
  if (harness === 'unset') delete (env as Record<string, string | undefined>).TDK_HARNESS;
  return Bun.spawnSync({
    cmd: ['node', gatewayFile, 'dev-context-injector'],
    cwd,
    env,
    stdin: Buffer.from(JSON.stringify(payload)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function sessionRecords(file: string): Array<Record<string, unknown>> {
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test('Claude install preserves topology and records installed-hook sessions across harnesses', async () => {
  const consumer = prepareConsumer();
  const { hooksRoot, gatewayFile } = await installConsumer(consumer);
  const installedHooksDir = path.join(hooksRoot, 'hooks');

  expect(fs.existsSync(path.join(installedHooksDir, 'dev-context-injector.cjs'))).toBe(true);
  expect(fs.existsSync(path.join(hooksRoot, 'lib', 'session-tracker.cjs'))).toBe(true);
  expect(fs.existsSync(path.join(hooksRoot, 'lib', 'session-ticket-resolver.cjs'))).toBe(true);
  expect(fs.existsSync(path.join(consumer.root, '.claude', 'lib'))).toBe(false);


  const destructiveResult = Bun.spawnSync({
    cmd: ['node', gatewayFile, 'destructive-command-block'],
    cwd: consumer.root,
    stdin: Buffer.from(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } })),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (destructiveResult.exitCode !== 2) {
    const directHook = path.join(hooksRoot, 'hooks', 'destructive-command-block.cjs');
    const direct = Bun.spawnSync({
      cmd: ['node', directHook],
      cwd: consumer.root,
      stdin: Buffer.from(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } })),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const adapterFile = path.join(hooksRoot, 'lib', 'harness-payload.cjs');
    const adapterProbe = Bun.spawnSync({
      cmd: [
        'node',
        '-e',
        `const a=require(${JSON.stringify(adapterFile)}); console.log(JSON.stringify(a.loadPayloadHarness(${JSON.stringify(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }))})));`,
      ],
      cwd: consumer.root,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    throw new Error(`installed gateway failed: exit=${destructiveResult.exitCode} stdout=${destructiveResult.stdout.toString()} stderr=${destructiveResult.stderr.toString()} direct=${direct.exitCode}/${direct.stdout.toString()}/${direct.stderr.toString()} adapter=${adapterProbe.exitCode}/${adapterProbe.stdout.toString()}/${adapterProbe.stderr.toString()}`);
  }

  initGitRepo(consumer.root, 'main');
  initGitRepo(path.join(consumer.root, 'app'), 'feature/CD-001');
  writeSessionConfig(consumer.root, [{ name: 'app', path: 'app' }]);

  const specDir = path.join(consumer.root, '.specify', 'specs', 'cd-001');
  const sessionsFile = path.join(specDir, 'sessions.jsonl');
  fs.mkdirSync(specDir, { recursive: true });

  const appRoot = path.join(consumer.root, 'app');
  const rootMainSessionId = 'claude-root-main-session-001';
  const rootMainResult = runInstalledHook(gatewayFile, consumer.root, {
    session_id: rootMainSessionId,
    transcript_path: path.join(consumer.root, 'missing-claude-transcript.jsonl'),
    cwd: consumer.root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Continue the current task',
  });
  expect(rootMainResult.exitCode).toBe(0);
  // A root session on main must not inherit the child repository's branch.
  expect(fs.existsSync(sessionsFile)).toBe(false);

  const claudeSessionId = 'claude-polyrepo-session-001';
  const claudeResult = runInstalledHook(gatewayFile, appRoot, {
    session_id: claudeSessionId,
    transcript_path: path.join(consumer.root, 'missing-claude-transcript.jsonl'),
    cwd: appRoot,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Continue the current task',
  }, 'claude', consumer.root);
  expect(claudeResult.exitCode).toBe(0);
  expect(sessionRecords(sessionsFile).map((record) => record.session)).toEqual([claudeSessionId]);
  expect(sessionRecords(sessionsFile)[0]!.harness).toBe('claude');

  const dedupTranscript = path.join(consumer.root, 'dedup-transcript.jsonl');
  fs.writeFileSync(dedupTranscript, '<!-- speckit-dev-context-injected -->\n', 'utf8');
  const repairedSessionId = 'claude-dedup-repair-session-001';
  const repairResult = runInstalledHook(gatewayFile, consumer.root, {
    session_id: repairedSessionId,
    transcript_path: dedupTranscript,
    cwd: consumer.root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'status of CD-001',
  });
  expect(repairResult.exitCode).toBe(0);
  expect(repairResult.stdout.toString().trim()).toBe('');
  expect(sessionRecords(sessionsFile).map((record) => record.session))
    .toEqual([claudeSessionId, repairedSessionId]);

  const ompSessionId = 'omp-polyrepo-session-001';
  const ompResult = runInstalledHook(gatewayFile, appRoot, {
    event: {
      type: 'before_agent_start',
      prompt: 'Continue the current task',
    },
    context: {
      cwd: appRoot,
      sessionId: ompSessionId,
      sessionFile: path.join(consumer.root, 'missing-omp-session.jsonl'),
    },
    eventName: 'UserPromptSubmit',
  }, 'omp', consumer.root);
  expect(ompResult.exitCode).toBe(0);
  const records = sessionRecords(sessionsFile);
  expect(records.map((record) => record.session))
    .toEqual([claudeSessionId, repairedSessionId, ompSessionId]);
  // AC4: the OMP run is labelled from the env, not guessed.
  expect(records.map((record) => record.harness)).toEqual(['claude', 'claude', 'omp']);
  expect(records.map((record) => record.harnessSource)).toEqual(['env', 'env', 'env']);
});

test('a branded install associates every mentioned ticket regardless of command prefix', async () => {
  const consumer = prepareConsumer();
  initGitRepo(consumer.root, 'main');
  writeSessionConfig(consumer.root);

  const firstSpecDir = path.join(consumer.root, '.specify', 'specs', 'cd-001');
  const secondSpecDir = path.join(consumer.root, '.specify', 'specs', 'cd-002');
  const firstSessionsFile = path.join(firstSpecDir, 'sessions.jsonl');
  const secondSessionsFile = path.join(secondSpecDir, 'sessions.jsonl');
  fs.mkdirSync(firstSpecDir, { recursive: true });
  fs.mkdirSync(secondSpecDir, { recursive: true });

  const { gatewayFile } = await installConsumer(consumer, 'sample-');

  const brandedSessionId = 'sample-branded-session-001';
  const brandedResult = runInstalledHook(gatewayFile, consumer.root, {
    session_id: brandedSessionId,
    transcript_path: path.join(consumer.root, 'missing-sample-upper.jsonl'),
    cwd: consumer.root,
    hook_event_name: 'UserPromptSubmit',
    prompt: '/sample-status CD-001 then compare cd-002',
  });
  expect(brandedResult.exitCode).toBe(0);
  expect(sessionRecords(firstSessionsFile).map((record) => record.session)).toEqual([brandedSessionId]);
  expect(sessionRecords(secondSessionsFile).map((record) => record.session)).toEqual([brandedSessionId]);
  expect(fs.readdirSync(path.join(consumer.root, '.specify', 'specs')).filter((name) => name.toLowerCase() === 'cd-001'))
    .toEqual(['cd-001']);

  // The source prefix is not an allowlist: an unbranded command still mentions a ticket.
  const unbrandedSessionId = 'sample-unbranded-session-001';
  const unbrandedResult = runInstalledHook(gatewayFile, consumer.root, {
    session_id: unbrandedSessionId,
    transcript_path: path.join(consumer.root, 'missing-tdk-prefixed.jsonl'),
    cwd: consumer.root,
    hook_event_name: 'UserPromptSubmit',
    prompt: '/tdk-status cd-001',
  });
  expect(unbrandedResult.exitCode).toBe(0);
  expect(sessionRecords(firstSessionsFile).map((record) => record.session))
    .toEqual([brandedSessionId, unbrandedSessionId]);
  expect(sessionRecords(secondSessionsFile).map((record) => record.session)).toEqual([brandedSessionId]);

  // A mention whose spec folder is absent is skipped without blocking the valid one.
  const partialSessionId = 'sample-partial-session-001';
  const partialResult = runInstalledHook(gatewayFile, consumer.root, {
    session_id: partialSessionId,
    transcript_path: path.join(consumer.root, 'missing-sample-partial.jsonl'),
    cwd: consumer.root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'cd-002 and CD-999',
  });
  expect(partialResult.exitCode).toBe(0);
  expect(sessionRecords(secondSessionsFile).map((record) => record.session))
    .toEqual([brandedSessionId, partialSessionId]);
  expect(fs.existsSync(path.join(consumer.root, '.specify', 'specs', 'cd-999'))).toBe(false);

  // T45: without TDK_HARNESS the record must say so instead of asserting a guess.
  const defaultSessionId = 'sample-default-harness-session-001';
  const defaultResult = runInstalledHook(gatewayFile, consumer.root, {
    session_id: defaultSessionId,
    transcript_path: path.join(consumer.root, 'missing-sample-default.jsonl'),
    cwd: consumer.root,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'cd-001 again',
  }, 'unset');
  expect(defaultResult.exitCode).toBe(0);
  const defaultRecord = sessionRecords(firstSessionsFile).at(-1)!;
  expect(defaultRecord.session).toBe(defaultSessionId);
  expect(defaultRecord.harness).toBe('claude');
  expect(defaultRecord.harnessSource).toBe('default');
});

test('converted installed hooks associate sessions through generated OMP modules', async () => {
  const consumer = prepareConsumer();
  initGitRepo(consumer.root, 'main');
  writeSessionConfig(consumer.root);
  await installConsumer(consumer, 'sample-');
  const tickets = ['cd-001', 'cd-002'];
  for (const ticket of tickets) {
    fs.mkdirSync(path.join(consumer.root, '.specify', 'specs', ticket), { recursive: true });
  }
  const convert = () => Bun.spawnSync({
    cmd: [process.execPath, path.resolve(import.meta.dir, '../src/index.ts'), 'convert-flat', consumer.root,
      '--harness', 'omp', '--parts', 'hooks', '--target-platform', process.platform, '--yes'],
    cwd: consumer.root, stdout: 'pipe', stderr: 'pipe',
  });
  const converted = convert();
  if (converted.exitCode !== 0) throw new Error(converted.stderr.toString());
  const generatedRoot = path.join(consumer.root, '.omp', 'hooks', 'pre');
  const filenames = fs.readdirSync(generatedRoot).filter((name) => name.endsWith('.ts')).sort();
  const before = filenames.map((name) => fs.readFileSync(path.join(generatedRoot, name)));
  const handlers = new Map<string, Array<(event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown>>>();
  const warnings: string[] = [];
  for (const filename of filenames) {
    // Installed conversion chooses these module paths at runtime.
    const generated = await import(pathToFileURL(path.join(generatedRoot, filename)).href);
    generated.default({
      on(event: string, handler: (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown>) {
        const entries = handlers.get(event) ?? [];
        entries.push(handler);
        handlers.set(event, entries);
      },
      logger: { warn(message: string) { warnings.push(message); } },
      sendMessage() {},
    });
  }
  const promptHandlers = handlers.get('before_agent_start');
  if (!promptHandlers?.length) throw new Error('No generated prompt bridge');
  for (const handler of promptHandlers) {
    await handler({ type: 'before_agent_start', prompt: 'CD-001' }, { cwd: consumer.root });
  }
  expect(fs.existsSync(path.join(consumer.root, '.specify', 'specs', 'cd-001', 'sessions.jsonl'))).toBe(false);
  const context = {
    cwd: consumer.root,
    sessionManager: {
      getSessionId: () => 'synthetic-generated-omp-session',
      getSessionFile: () => path.join(consumer.root, 'missing-transcript.jsonl'),
    },
  };
  for (const prompt of ['CD-001', 'CD-001 and CD-002', 'CD-999']) {
    for (const handler of promptHandlers) {
      await handler({ type: 'before_agent_start', prompt }, context);
    }
  }
  for (const ticket of tickets) {
    const generatedRecords = sessionRecords(path.join(consumer.root, '.specify', 'specs', ticket, 'sessions.jsonl'));
    expect(generatedRecords.map((record) => record.session)).toEqual(['synthetic-generated-omp-session']);
    expect(generatedRecords[0]!.harness).toBe('omp');
    expect(generatedRecords[0]!.harnessSource).toBe('env');
  }
  expect(fs.existsSync(path.join(consumer.root, '.specify', 'specs', 'cd-999'))).toBe(false);
  const blockers = handlers.get('tool_call');
  if (!blockers?.length) throw new Error('No generated tool bridges');
  const denied = [];
  for (const handler of blockers) {
    denied.push(await handler({ type: 'tool_call', toolName: 'bash', input: { command: 'rm -rf /' } }, context));
    expect(await handler({ type: 'tool_call', toolName: 'bash', input: { command: 'echo safe' } }, context)).toBeUndefined();
  }
  expect(denied.some((value) => value !== null && typeof value === 'object' && 'block' in value && value.block === true)).toBe(true);
  expect(warnings.filter((warning) => /category=(?:spawn-error|nonzero|timeout|bridge-error)/.test(warning))).toEqual([]);
  const repeated = convert();
  if (repeated.exitCode !== 0) throw new Error(repeated.stderr.toString());
  expect(filenames.map((name) => fs.readFileSync(path.join(generatedRoot, name)))).toEqual(before);
}, 30000);

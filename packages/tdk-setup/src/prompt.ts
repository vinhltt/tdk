import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { normalizePrefix } from './install-settings';
import type { RequiredPrompt, HarnessName } from './types';
import { selectFromCheckbox, canUseCheckboxPrompt } from './checkbox-prompt';

function parsePluginSelection(answer: string, pluginNames: string[]): string[] {
  const tokens = answer.split(',').map((token) => token.trim()).filter(Boolean);
  const selected = tokens.map((token) => {
    const index = Number(token);
    if (Number.isInteger(index) && index >= 1 && index <= pluginNames.length) return pluginNames[index - 1]!;
    return token;
  });
  return [...new Set(selected)];
}

async function selectPluginsByQuestion(pluginNames: string[]): Promise<string[]> {
  const rl = readline.createInterface({ input, output });
  try {
    output.write(`Available plugins:\n${pluginNames.map((name, index) => `  ${index + 1}. ${name}`).join('\n')}\n`);
    const answer = await rl.question('Select plugins by number or name (comma-separated): ');
    return parsePluginSelection(answer, pluginNames);
  } finally {
    rl.close();
  }
}

export async function selectPluginsInteractively(pluginNames: string[]): Promise<string[]> {
  if (pluginNames.length === 0) throw new Error('No plugins are available in .specify/plugins/manifest.json.');
  if (!canUseCheckboxPrompt(input, output)) return selectPluginsByQuestion(pluginNames);
  return selectFromCheckbox(pluginNames, {
    title: 'Select plugins to install',
    hint: 'Use Up/Down or j/k to move, Space to toggle, a to select/clear all, Enter to install, Esc to cancel.',
    emptyMsg: 'Select at least one plugin.',
    selectedMsgPrefix: 'Selected plugins: ',
    cancelMsg: 'Plugin selection cancelled.',
  });
}

export async function confirmOverwrite(prompt: RequiredPrompt): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const label = prompt.type === 'managed-drift-overwrite'
      ? 'drifted managed file'
      : prompt.type === 'unmanaged-stale-hooks-json-cleanup'
        ? 'stale generated hook config'
        : 'existing unmanaged file';
    const action = prompt.type === 'unmanaged-stale-hooks-json-cleanup' ? 'Remove' : 'Overwrite';
    const answer = await rl.question(`${action} ${label} ${prompt.targetRelativePath}? Existing file will be backed up. Type yes to continue: `);
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

export async function askPrefixInteractively(defaultPrefix: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`Target prefix (${defaultPrefix}): `);
    return answer.trim() === '' ? defaultPrefix : normalizePrefix(answer);
  } finally {
    rl.close();
  }
}

export async function confirmInstallTarget(details: {
  consumerRoot: string;
  targetDir: string;
  settingsPath: string;
  targetPrefix: string;
  selectedPlugins: string[];
}): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    output.write(`Consumer root: ${details.consumerRoot}\n`);
    output.write(`Target dir: ${details.targetDir}\n`);
    output.write(`Claude settings: ${details.settingsPath}\n`);
    output.write(`Target prefix: ${details.targetPrefix}\n`);
    output.write(`Plugins: ${details.selectedPlugins.join(', ') || '(none)'}\n`);
    const answer = await rl.question('Apply this harness install? Type yes to continue: ');
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

export async function selectHarnessInteractively(names: HarnessName[]): Promise<HarnessName[]> {
  const selected = await selectFromCheckbox(names, {
    title: 'Select harness(es) to install',
    hint: 'Use Up/Down or j/k to move, Space to toggle, a to select/clear all, Enter to install, Esc to cancel.',
    emptyMsg: 'Select at least one harness.',
    selectedMsgPrefix: 'Selected harness: ',
    cancelMsg: 'Harness selection cancelled.',
  });
  // source items are fixed to the two known names; validate/cast on return
  return selected.filter((name): name is HarnessName => name === 'claude' || name === 'codex');
}

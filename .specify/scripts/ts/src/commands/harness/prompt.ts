import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { RequiredPrompt } from './types';

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

function canUseCheckboxPrompt(): boolean {
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === 'function');
}

function renderCheckboxPrompt(pluginNames: string[], selected: Set<number>, cursor: number, message: string): void {
  output.write('\x1b[?25l\x1b[H\x1b[2J');
  output.write('Select plugins to install\n');
  output.write('Use Up/Down or j/k to move, Space to toggle, a to select/clear all, Enter to install, Esc to cancel.\n\n');
  pluginNames.forEach((name, index) => {
    const pointer = index === cursor ? '>' : ' ';
    const mark = selected.has(index) ? '[x]' : '[ ]';
    output.write(`${pointer} ${mark} ${name}\n`);
  });
  if (message) output.write(`\n${message}\n`);
}

async function selectPluginsByCheckbox(pluginNames: string[]): Promise<string[]> {
  const selected = new Set<number>();
  let cursor = 0;
  let message = '';
  const wasRaw = input.isRaw;
  const wasPaused = input.isPaused();

  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let onData: (key: string | Buffer) => void;
    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(Boolean(wasRaw));
      if (wasPaused) input.pause();
      output.write('\x1b[?25h');
    };
    const finish = () => {
      if (selected.size === 0) {
        message = 'Select at least one plugin.';
        renderCheckboxPrompt(pluginNames, selected, cursor, message);
        return;
      }
      const names = pluginNames.filter((_, index) => selected.has(index));
      cleanup();
      output.write(`Selected plugins: ${names.join(', ')}\n`);
      resolve(names);
    };
    const cancel = () => {
      cleanup();
      reject(new Error('Plugin selection cancelled.'));
    };
    onData = (key: string | Buffer) => {
      const value = String(key);
      message = '';
      if (value === '\u0003' || value === '\u001b') return cancel();
      if (value === '\r' || value === '\n') return finish();
      if (value === ' ' || value === '\t') {
        selected.has(cursor) ? selected.delete(cursor) : selected.add(cursor);
      } else if (value === 'a' || value === 'A') {
        if (selected.size === pluginNames.length) selected.clear();
        else pluginNames.forEach((_, index) => selected.add(index));
      } else if (value === '\u001b[A' || value === 'k' || value === 'K') {
        cursor = (cursor - 1 + pluginNames.length) % pluginNames.length;
      } else if (value === '\u001b[B' || value === 'j' || value === 'J') {
        cursor = (cursor + 1) % pluginNames.length;
      }
      renderCheckboxPrompt(pluginNames, selected, cursor, message);
    };

    input.on('data', onData);
    renderCheckboxPrompt(pluginNames, selected, cursor, message);
  });
}

export async function selectPluginsInteractively(pluginNames: string[]): Promise<string[]> {
  if (pluginNames.length === 0) throw new Error('No plugins are available in .specify/plugins/manifest.json.');
  if (!canUseCheckboxPrompt()) return selectPluginsByQuestion(pluginNames);
  return selectPluginsByCheckbox(pluginNames);
}

export async function confirmOverwrite(prompt: RequiredPrompt): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const label = prompt.type === 'managed-drift-overwrite'
      ? 'drifted managed file'
      : 'existing unmanaged file';
    const answer = await rl.question(`Overwrite ${label} ${prompt.targetRelativePath}? Existing file will be backed up. Type yes to continue: `);
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

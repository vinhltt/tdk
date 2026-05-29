import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { RequiredPrompt } from './types';

export async function selectPluginsInteractively(pluginNames: string[]): Promise<string[]> {
  const rl = readline.createInterface({ input, output });
  try {
    output.write(`Available plugins:\n${pluginNames.map((name, index) => `  ${index + 1}. ${name}`).join('\n')}\n`);
    const answer = await rl.question('Select plugins by number or name (comma-separated): ');
    const tokens = answer.split(',').map((token) => token.trim()).filter(Boolean);
    const selected = tokens.map((token) => {
      const index = Number(token);
      if (Number.isInteger(index) && index >= 1 && index <= pluginNames.length) return pluginNames[index - 1]!;
      return token;
    });
    return [...new Set(selected)];
  } finally {
    rl.close();
  }
}

export async function confirmDriftOverwrite(prompt: RequiredPrompt): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`Overwrite drifted managed file ${prompt.targetRelativePath}? Type yes to continue: `);
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';
import { canUseCheckboxPrompt, selectFromCheckbox } from './checkbox-prompt';
import type { CheckboxPromptIo } from './checkbox-prompt';

export const ALL_CONVERT_PARTS = ['agents', 'rules', 'settings', 'hooks', 'skills', 'context'] as const;

export type ConvertPart = typeof ALL_CONVERT_PARTS[number];

export interface ConvertPartSelection {
  selectedParts: ConvertPart[];
  removedParts: ConvertPart[];
  activeParts: ConvertPart[];
}

export interface ResolveConvertPartsInput {
  parts?: string;
  removeParts?: string;
  previousConvertedParts?: ConvertPart[];
  manifestExists: boolean;
  interactive?: boolean;
  io?: CheckboxPromptIo;
}

export function isConvertPart(value: unknown): value is ConvertPart {
  return typeof value === 'string' && ALL_CONVERT_PARTS.some((part) => part === value);
}

function sortParts(parts: Iterable<ConvertPart>): ConvertPart[] {
  const values = new Set(parts);
  return ALL_CONVERT_PARTS.filter((part) => values.has(part));
}

export function resolveActiveConvertParts(
  previousParts: Iterable<ConvertPart>,
  selectedParts: Iterable<ConvertPart>,
  removedParts: Iterable<ConvertPart>,
): ConvertPart[] {
  const active = new Set([...previousParts, ...selectedParts]);
  for (const part of removedParts) active.delete(part);
  return sortParts(active);
}

export function parseConvertPartCsv(value: string, flag: '--parts' | '--remove-parts'): ConvertPart[] {
  const values = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (values.length === 0) throw new Error(`${flag} requires at least one convert part.`);
  const parts: ConvertPart[] = [];
  for (const value of values) {
    if (!isConvertPart(value)) {
      throw new Error(`Unsupported convert part "${value}" in ${flag}. Expected one of: ${ALL_CONVERT_PARTS.join(', ')}.`);
    }
    parts.push(value);
  }
  return sortParts(parts);
}

async function promptForParts(
  previousConvertedParts: ConvertPart[],
  io: CheckboxPromptIo,
): Promise<{ selectedParts: ConvertPart[]; removedParts: ConvertPart[] }> {
  const selectedParts = await selectFromCheckbox([...ALL_CONVERT_PARTS], {
    title: 'Select OMP parts to add or update',
    hint: 'Space toggles; Enter confirms. Unchecked active parts remain installed.',
    emptyMsg: 'No parts selected for add/update.',
    selectedMsgPrefix: 'OMP parts selected: ',
    cancelMsg: 'OMP part selection cancelled.',
    allowEmpty: true,
    initialSelected: previousConvertedParts,
  }, io) as ConvertPart[];
  const removable = sortParts([...previousConvertedParts, ...selectedParts]);
  const removedParts = removable.length === 0
    ? []
    : await selectFromCheckbox(removable, {
      title: 'Select OMP parts to remove',
      hint: 'Removal is explicit. Leave all unchecked to keep every active part.',
      emptyMsg: 'No parts selected for removal.',
      selectedMsgPrefix: 'OMP parts removed: ',
      cancelMsg: 'OMP part removal cancelled.',
      allowEmpty: true,
    }, io) as ConvertPart[];
  return { selectedParts: sortParts(selectedParts), removedParts: sortParts(removedParts) };
}

export async function resolveConvertParts(input: ResolveConvertPartsInput): Promise<ConvertPartSelection> {
  const previousConvertedParts = sortParts(input.previousConvertedParts ?? []);
  const io = input.io ?? { input: defaultInput, output: defaultOutput };
  const interactive = input.interactive ?? canUseCheckboxPrompt(io.input, io.output);
  let selectedParts: ConvertPart[];
  let removedParts: ConvertPart[];

  if (input.parts !== undefined || input.removeParts !== undefined) {
    selectedParts = input.parts === undefined ? [] : parseConvertPartCsv(input.parts, '--parts');
    removedParts = input.removeParts === undefined ? [] : parseConvertPartCsv(input.removeParts, '--remove-parts');
  } else if (interactive) {
    ({ selectedParts, removedParts } = await promptForParts(previousConvertedParts, io));
  } else if (input.manifestExists) {
    selectedParts = previousConvertedParts;
    removedParts = [];
  } else {
    throw new Error(`Non-interactive OMP convert requires --parts <${ALL_CONVERT_PARTS.join('|')}> on the first run.`);
  }

  const overlap = selectedParts.filter((part) => removedParts.includes(part));
  if (overlap.length > 0) {
    throw new Error(`Convert part(s) ${overlap.join(', ')} cannot appear in both --parts and --remove-parts.`);
  }

  return {
    selectedParts: sortParts(selectedParts),
    removedParts: sortParts(removedParts),
    activeParts: resolveActiveConvertParts(previousConvertedParts, selectedParts, removedParts),
  };
}

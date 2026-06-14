import { stdin as input, stdout as output } from 'node:process';

export interface CheckboxOpts {
  title: string;
  hint: string;
  emptyMsg: string;
  selectedMsgPrefix: string;
  cancelMsg: string;
}

export function canUseCheckboxPrompt(
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream,
): boolean {
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === 'function');
}

function renderCheckboxPrompt(
  items: string[],
  selected: Set<number>,
  cursor: number,
  message: string,
  title: string,
  hint: string,
): void {
  output.write('\x1b[?25l\x1b[H\x1b[2J');
  output.write(`${title}\n`);
  output.write(`${hint}\n\n`);
  items.forEach((name, index) => {
    const pointer = index === cursor ? '>' : ' ';
    const mark = selected.has(index) ? '[x]' : '[ ]';
    output.write(`${pointer} ${mark} ${name}\n`);
  });
  if (message) output.write(`\n${message}\n`);
}

export async function selectFromCheckbox(
  items: string[],
  opts: CheckboxOpts,
): Promise<string[]> {
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
        message = opts.emptyMsg;
        renderCheckboxPrompt(items, selected, cursor, message, opts.title, opts.hint);
        return;
      }
      const names = items.filter((_, index) => selected.has(index));
      cleanup();
      output.write(`${opts.selectedMsgPrefix}${names.join(', ')}\n`);
      resolve(names);
    };
    const cancel = () => {
      cleanup();
      reject(new Error(opts.cancelMsg));
    };
    onData = (key: string | Buffer) => {
      const value = String(key);
      message = '';
      if (value === '\u0003' || value === '\u001b') return cancel();
      if (value === '\r' || value === '\n') return finish();
      if (value === ' ' || value === '\t') {
        selected.has(cursor) ? selected.delete(cursor) : selected.add(cursor);
      } else if (value === 'a' || value === 'A') {
        if (selected.size === items.length) selected.clear();
        else items.forEach((_, index) => selected.add(index));
      } else if (value === '\u001b[A' || value === 'k' || value === 'K') {
        cursor = (cursor - 1 + items.length) % items.length;
      } else if (value === '\u001b[B' || value === 'j' || value === 'J') {
        cursor = (cursor + 1) % items.length;
      }
      renderCheckboxPrompt(items, selected, cursor, message, opts.title, opts.hint);
    };

    input.on('data', onData);
    renderCheckboxPrompt(items, selected, cursor, message, opts.title, opts.hint);
  });
}

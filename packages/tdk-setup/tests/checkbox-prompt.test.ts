import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { selectFromCheckbox } from '../src/checkbox-prompt';
import type { CheckboxPromptIo } from '../src/checkbox-prompt';

class FakeInput extends EventEmitter {
  isTTY = true;
  isRaw: boolean;
  private paused: boolean;
  readonly rawModeCalls: boolean[] = [];
  pauseCalls = 0;
  resumeCalls = 0;

  constructor(isRaw = false, isPaused = true) {
    super();
    this.isRaw = isRaw;
    this.paused = isPaused;
  }

  setRawMode(value: boolean): this {
    this.rawModeCalls.push(value);
    this.isRaw = value;
    return this;
  }

  isPaused(): boolean {
    return this.paused;
  }

  pause(): this {
    this.pauseCalls += 1;
    this.paused = true;
    return this;
  }

  resume(): this {
    this.resumeCalls += 1;
    this.paused = false;
    return this;
  }

  setEncoding(_encoding: BufferEncoding): this {
    return this;
  }
}

class FakeOutput {
  readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(String(chunk));
    return true;
  }

  text(): string {
    return this.chunks.join('');
  }
}

function fakeIo(input: FakeInput, output: FakeOutput): CheckboxPromptIo {
  return {
    input: input as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
  };
}

const options = {
  title: 'Select options',
  hint: 'Use Space and Enter',
  emptyMsg: 'Select at least one option.',
  selectedMsgPrefix: 'Selected: ',
  cancelMsg: 'Selection cancelled.',
};

describe('selectFromCheckbox', () => {
  test('resolves an empty selection when allowEmpty is true', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const selection = selectFromCheckbox(['first'], { ...options, allowEmpty: true }, fakeIo(input, output));

    input.emit('data', '\r');

    await expect(selection).resolves.toEqual([]);
    expect(input.rawModeCalls).toEqual([true, false]);
    expect(input.isPaused()).toBe(true);
    expect(input.listenerCount('data')).toBe(0);
    expect(output.text()).toContain('\x1b[?25h');
  });

  test('blocks Enter without a selection until cancellation when empty selections are disallowed', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const selection = selectFromCheckbox(['first'], options, fakeIo(input, output));

    input.emit('data', '\r');

    expect(output.text()).toContain(options.emptyMsg);
    expect(input.listenerCount('data')).toBe(1);
    input.emit('data', '');
    await expect(selection).rejects.toThrow(options.cancelMsg);
  });

  test('restores terminal state, listener, and cursor after cancellation', async () => {
    const input = new FakeInput(true, false);
    const output = new FakeOutput();
    const selection = selectFromCheckbox(['first'], options, fakeIo(input, output));

    input.emit('data', '');

    await expect(selection).rejects.toThrow(options.cancelMsg);
    expect(input.rawModeCalls).toEqual([true, true]);
    expect(input.isPaused()).toBe(false);
    expect(input.pauseCalls).toBe(0);
    expect(input.listenerCount('data')).toBe(0);
    expect(output.text()).toContain('\x1b[?25h');
  });
});

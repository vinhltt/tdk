export function formatAgentJson(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export function writeAgentJson(value: unknown): void {
  process.stdout.write(formatAgentJson(value));
}

export function writeStderrLine(message: string): void {
  process.stderr.write(`${message}\n`);
}

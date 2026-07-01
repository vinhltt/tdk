export interface SafeHookGatewayCommand {
  hookName: string;
}

const SAFE_HOOK_NAME = /^[a-z0-9][a-z0-9-]*$/;

export function parseSafeHookGatewayCommand(command: string, availableHookNames: Set<string>): SafeHookGatewayCommand {
  const match = command.match(/^node\s+"?\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/hook-gateway\.cjs"?\s+([a-zA-Z0-9-]+)$/);
  if (!match) {
    throw new Error(`Unsupported hook command shape: ${command}`);
  }
  const hookName = match[1]!;
  if (!SAFE_HOOK_NAME.test(hookName)) {
    throw new Error(`Unsafe hook gateway argument: ${hookName}`);
  }
  if (!availableHookNames.has(hookName)) {
    throw new Error(`Hook gateway references missing hook file: ${hookName}.cjs`);
  }
  return { hookName };
}

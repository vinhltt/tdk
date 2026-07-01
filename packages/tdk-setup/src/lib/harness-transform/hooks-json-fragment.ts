export interface TdkHookCommand {
	command: string;
	timeout?: number;
	matcher?: string;
}

export interface TdkHooksByEvent {
	[event: string]: TdkHookCommand[];
}

export interface CodexHookCommand {
	command: string;
	timeout?: number;
	matcher?: string;
	_origin: string;
}

export type CodexHooksJsonFragment = Record<string, CodexHookCommand[]>;

export function buildHooksJsonFragment(
	hooksByEvent: TdkHooksByEvent,
	wrapperByCommand: Record<string, string>,
	origin: string,
): CodexHooksJsonFragment {
	const fragment: CodexHooksJsonFragment = {};
	for (const [event, hooks] of Object.entries(hooksByEvent)) {
		fragment[event] = hooks.map((hook) => {
			const wrapper = wrapperByCommand[hook.command];
			if (wrapper === undefined) {
				throw new Error(`Missing Codex hook wrapper mapping for command: ${hook.command}`);
			}
			return {
				command: `node ${JSON.stringify(wrapper)}`,
				...(hook.timeout === undefined ? {} : { timeout: hook.timeout }),
				...(hook.matcher === undefined ? {} : { matcher: hook.matcher }),
				_origin: origin,
			};
		});
	}
	return fragment;
}

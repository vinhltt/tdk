import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CodexHookEvent =
	| "SessionStart"
	| "UserPromptSubmit"
	| "PreToolUse"
	| "PostToolUse"
	| "PermissionRequest"
	| "Stop";

export interface CodexEventCapabilities {
	supported: boolean;
	supportsAdditionalContext: boolean;
	permissionDecisionValues?: string[];
	allowedMatchers?: string[];
}

export interface CodexCapabilities {
	version: string;
	events: Record<string, CodexEventCapabilities>;
	sessionStartMatchersOnly: string[];
	requiresFeatureFlag: boolean;
}

export const CODEX_CAPABILITY_TABLE: CodexCapabilities[] = [
	{
		version: "0.130.0",
		events: {
			SessionStart: {
				supported: true,
				supportsAdditionalContext: true,
				allowedMatchers: ["startup", "resume", "clear"],
			},
			UserPromptSubmit: { supported: true, supportsAdditionalContext: true },
			PreToolUse: {
				supported: true,
				supportsAdditionalContext: true,
				permissionDecisionValues: ["deny", "allow", "block"],
			},
			PostToolUse: { supported: true, supportsAdditionalContext: true },
			PermissionRequest: { supported: true, supportsAdditionalContext: false },
			Stop: { supported: true, supportsAdditionalContext: false },
		},
		sessionStartMatchersOnly: ["startup", "resume", "clear"],
		requiresFeatureFlag: true,
	},
	{
		version: "0.124.0-alpha.3",
		events: {
			SessionStart: {
				supported: true,
				supportsAdditionalContext: true,
				allowedMatchers: ["startup", "resume"],
			},
			UserPromptSubmit: { supported: true, supportsAdditionalContext: true },
			PreToolUse: {
				supported: true,
				supportsAdditionalContext: false,
				permissionDecisionValues: ["deny"],
				allowedMatchers: ["Bash"],
			},
			PostToolUse: {
				supported: true,
				supportsAdditionalContext: true,
				allowedMatchers: ["Bash"],
			},
			PermissionRequest: {
				supported: true,
				supportsAdditionalContext: false,
				permissionDecisionValues: ["deny"],
				allowedMatchers: ["Bash"],
			},
			Stop: { supported: true, supportsAdditionalContext: false },
		},
		sessionStartMatchersOnly: ["startup", "resume"],
		requiresFeatureFlag: true,
	},
];

function versionNumber(version: string): number {
	const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!match) return 0;
	const major = Number(match[1] ?? 0);
	const minor = Number(match[2] ?? 0);
	const patch = Number(match[3] ?? 0);
	return major * 1_000_000 + minor * 1_000 + patch;
}

for (let i = 0; i < CODEX_CAPABILITY_TABLE.length - 1; i += 1) {
	const current = CODEX_CAPABILITY_TABLE[i];
	const next = CODEX_CAPABILITY_TABLE[i + 1];
	if (current === undefined || next === undefined) continue;
	if (versionNumber(current.version) < versionNumber(next.version)) {
		throw new Error(
			`TDK CODEX_CAPABILITY_TABLE ordering violation: ${current.version} must be newer than ${next.version}`,
		);
	}
}

const newestCapabilities = CODEX_CAPABILITY_TABLE[0]!;
const oldestCapabilities = CODEX_CAPABILITY_TABLE[CODEX_CAPABILITY_TABLE.length - 1]!;
if (newestCapabilities === undefined || oldestCapabilities === undefined) {
	throw new Error("TDK CODEX_CAPABILITY_TABLE must contain at least one entry");
}

export interface DetectCodexCapabilitiesOptions {
	runCodexVersion?: () => Promise<string>;
	env?: NodeJS.ProcessEnv;
}

export async function detectCodexCapabilities(
	options: DetectCodexCapabilitiesOptions = {},
): Promise<CodexCapabilities> {
	const env = options.env ?? process.env;
	if (env.TDK_CODEX_COMPAT === "strict") return oldestCapabilities;
	if (env.TDK_CODEX_COMPAT === "optimistic") return newestCapabilities;

	try {
		const raw = options.runCodexVersion
			? await options.runCodexVersion()
			: await probeCodexVersion();
		return findCapabilitiesForVersion(cleanVersion(raw)) ?? oldestCapabilities;
	} catch {
		return oldestCapabilities;
	}
}

async function probeCodexVersion(): Promise<string> {
	const candidates = process.platform === "win32" ? ["codex.exe", "codex"] : ["codex"];
	for (const candidate of candidates) {
		try {
			const { stdout } = await execFileAsync(candidate, ["--version"], {
				timeout: 5000,
				encoding: "utf8",
			});
			return stdout;
		} catch {
			// Try next candidate.
		}
	}
	throw new Error("Unable to detect Codex version");
}

function cleanVersion(raw: string): string {
	return raw.trim().replace(/^(codex\s+)?v?/i, "").trim();
}

export function findCapabilitiesForVersion(version: string): CodexCapabilities | null {
	const exact = CODEX_CAPABILITY_TABLE.find((entry) => entry.version === version);
	if (exact) return exact;

	const detected = versionNumber(version);
	if (detected === 0) return null;
	for (const entry of CODEX_CAPABILITY_TABLE) {
		const entryVersion = versionNumber(entry.version);
		if (detected >= entryVersion) return entry;
	}
	return null;
}

export const CODEX_SUPPORTED_EVENTS = new Set<CodexHookEvent>(
	Object.entries(newestCapabilities.events)
		.filter(([, capabilities]) => capabilities.supported)
		.map(([event]) => event as CodexHookEvent),
);

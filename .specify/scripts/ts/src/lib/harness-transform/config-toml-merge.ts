const SENTINEL_START = "# --- tdk-managed-agents-start ---";
const SENTINEL_END = "# --- tdk-managed-agents-end ---";

export interface MergeConfigTomlResult {
	content: string;
	unmanagedContent: string;
	warnings: string[];
	error?: string;
}

function detectLineEnding(content: string): "\n" | "\r\n" {
	return content.includes("\r\n") ? "\r\n" : "\n";
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripManagedBlocks(content: string): { content: string; removedCount: number; malformed: boolean } {
	const startRegex = new RegExp(`^${escapeRegExp(SENTINEL_START)}\\s*$`, "gm");
	const endRegex = new RegExp(`^${escapeRegExp(SENTINEL_END)}\\s*$`, "gm");
	const startCount = [...content.matchAll(startRegex)].length;
	const endCount = [...content.matchAll(endRegex)].length;
	const blockRegex = new RegExp(
		`^${escapeRegExp(SENTINEL_START)}\\s*\\r?\\n[\\s\\S]*?^${escapeRegExp(SENTINEL_END)}\\s*(?:\\r?\\n)?`,
		"gm",
	);
	const blocks = [...content.matchAll(blockRegex)];
	if (startCount !== blocks.length || endCount !== blocks.length) {
		return { content, removedCount: 0, malformed: true };
	}
	return {
		content: content.replace(blockRegex, ""),
		removedCount: blocks.length,
		malformed: false,
	};
}

export function mergeConfigToml(existing: string, managedBlock: string): string {
	return mergeConfigTomlWithDiagnostics(existing, managedBlock).content;
}

export function mergeConfigTomlWithDiagnostics(
	existing: string,
	managedBlock: string,
): MergeConfigTomlResult {
	const lineEnding = detectLineEnding(existing);
	const stripped = stripManagedBlocks(existing);
	const warnings: string[] = [];
	if (stripped.malformed) {
		return {
			content: existing,
			unmanagedContent: existing,
			warnings,
			error: "Malformed TDK managed agent sentinels in config.toml",
		};
	}
	if (stripped.removedCount > 1) {
		warnings.push(`Found ${stripped.removedCount} TDK-managed agent blocks; collapsing into one`);
	}

	const normalizedManagedBlock = managedBlock.trim();
	if (!normalizedManagedBlock) {
		return {
			content: stripped.content,
			unmanagedContent: stripped.content,
			warnings: [...warnings, "Managed block is empty; config.toml merge skipped"],
		};
	}

	const base = stripped.content.trimEnd();
	const separator = base ? `${lineEnding}${lineEnding}` : "";
	return {
		content: `${base}${separator}${SENTINEL_START}${lineEnding}${normalizedManagedBlock}${lineEnding}${SENTINEL_END}${lineEnding}`,
		unmanagedContent: stripped.content,
		warnings,
	};
}

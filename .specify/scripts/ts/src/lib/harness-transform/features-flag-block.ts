export function buildFeaturesFlagBlock(): string {
	return [
		"# --- tdk-managed-features-start ---",
		"[features]",
		"hooks = true",
		"# --- tdk-managed-features-end ---",
	].join("\n");
}

const SENTINEL_START = "# --- tdk-managed-features-start ---";
const SENTINEL_END = "# --- tdk-managed-features-end ---";
const CURRENT_FEATURE_FLAG = "hooks";
const LEGACY_FEATURE_FLAG = "codex_hooks";

function detectLineEnding(content: string): "\n" | "\r\n" {
	return content.includes("\r\n") ? "\r\n" : "\n";
}

function stripManagedFeatureBlocks(content: string): string {
	const blockRegex = new RegExp(
		`^${SENTINEL_START}\\s*\\r?\\n[\\s\\S]*?^${SENTINEL_END}\\s*(?:\\r?\\n)?`,
		"gm",
	);
	return content.replace(blockRegex, "");
}

function findFeaturesSectionStart(content: string): number {
	const match = /^[ \t]*\[features\][ \t]*(?:#[^\r\n]*)?$/m.exec(content);
	return match ? match.index : -1;
}

function ensureHooksInFeaturesSection(
	content: string,
	headerStartIdx: number,
	lineEnding: "\n" | "\r\n",
): { content: string; changed: boolean } {
	const headerLineEnd = content.indexOf("\n", headerStartIdx);
	const bodyStart = headerLineEnd === -1 ? content.length : headerLineEnd + 1;
	const rest = content.slice(bodyStart);
	const nextHeaderMatch = /\n\[[^\]]+\]/.exec(rest);
	const bodyEnd = nextHeaderMatch ? bodyStart + nextHeaderMatch.index + 1 : content.length;
	const body = content.slice(bodyStart, bodyEnd);
	const legacyFlagRegex = new RegExp(
		`^[ \\t]*${LEGACY_FEATURE_FLAG}[ \\t]*=[ \\t]*(?:true|false)(?:[ \\t]*#[^\\r\\n]*)?[ \\t]*(?:\\r?\\n|$)`,
		"gm",
	);
	const cleanedBody = body.replace(legacyFlagRegex, "");
	const flagRegex = new RegExp(
		`^([ \\t]*${CURRENT_FEATURE_FLAG}[ \\t]*=[ \\t]*)(true|false)([ \\t]*#[^\\r\\n]*)?[ \\t]*$`,
		"m",
	);
	const flagMatch = flagRegex.exec(cleanedBody);

	if (flagMatch) {
		if (flagMatch[2] === "true") {
			return {
				content: content.slice(0, bodyStart) + cleanedBody + content.slice(bodyEnd),
				changed: cleanedBody !== body,
			};
		}
		const newBody = cleanedBody.replace(
			flagRegex,
			(_match, prefix, _value, trailing) => `${prefix}true${trailing ?? ""}`,
		);
		return { content: content.slice(0, bodyStart) + newBody + content.slice(bodyEnd), changed: true };
	}

	const insertion = headerLineEnd === -1
		? `${lineEnding}${CURRENT_FEATURE_FLAG} = true${lineEnding}`
		: cleanedBody.endsWith("\n") || cleanedBody.length === 0
		? `${CURRENT_FEATURE_FLAG} = true${lineEnding}`
		: `${lineEnding}${CURRENT_FEATURE_FLAG} = true${lineEnding}`;
	const newBody = cleanedBody + insertion;
	return {
		content: content.slice(0, bodyStart) + newBody + content.slice(bodyEnd),
		changed: true,
	};
}

export function mergeFeaturesFlagToml(existing: string): string {
	const lineEnding = detectLineEnding(existing);
	const stripped = stripManagedFeatureBlocks(existing);
	const featuresHeaderIdx = findFeaturesSectionStart(stripped);
	if (featuresHeaderIdx !== -1) {
		return ensureHooksInFeaturesSection(stripped, featuresHeaderIdx, lineEnding).content;
	}

	const block = buildFeaturesFlagBlock().replace(/\n/g, lineEnding);
	const base = stripped.trimEnd();
	const separator = base ? `${lineEnding}${lineEnding}` : "";
	return `${base}${separator}${block}${lineEnding}`;
}
